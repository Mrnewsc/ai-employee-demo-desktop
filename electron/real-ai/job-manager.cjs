const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { pathToFileURL } = require('node:url');
const config = require('./config.cjs');
const { normalizeError } = require('./errors.cjs');
const {
  AnalysisJobSnapshotSchema,
  FileIdsRequestSchema,
  JobIdRequestSchema,
  ParsedDocumentSchema,
  validate,
} = require('./runtime-schemas.cjs');
const { ensureDirectory, removeDirectory } = require('./temp-utils.cjs');

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const PARSER_STAGE_MAP = Object.freeze({
  inspect: ['parsing', 'reading-file'],
  read: ['parsing', 'reading-file'],
  parse: ['parsing', 'parsing-document'],
  render: ['parsing', 'rendering-page'],
  ocr: ['ocr', 'recognizing-text'],
  complete: ['normalizing', 'validating-result'],
});

function managerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

class AnalysisJobManager extends EventEmitter {
  constructor({
    jobsRoot,
    workerPath,
    stagingService,
    tessdataPath,
    tesseractWorkerPath,
    tessdataCachePath,
    jobConfig = config.jobs,
  } = {}) {
    super();
    if (!jobsRoot || !workerPath || !stagingService) throw new Error('Job Manager配置不完整');
    this.jobsRoot = path.resolve(jobsRoot);
    this.workerPath = path.resolve(workerPath);
    this.stagingService = stagingService;
    this.tessdataPath = tessdataPath;
    this.tesseractWorkerPath = tesseractWorkerPath;
    this.tessdataCachePath = tessdataCachePath;
    this.jobConfig = jobConfig;
    this.jobs = new Map();
    this.queue = [];
    this.runningCount = 0;
    this.disposed = false;
  }

  async initialize() {
    await ensureDirectory(this.jobsRoot);
    await ensureDirectory(this.tessdataCachePath);
    await fsp.access(this.workerPath);
  }

  start(payload) {
    if (this.disposed) throw managerError('INTERNAL_PARSE_ERROR', '分析服务已关闭');
    const { fileIds } = validate(FileIdsRequestSchema, payload, '开始分析请求');
    const descriptors = fileIds.map((fileId) => this.stagingService.getDescriptor(fileId));
    const now = new Date().toISOString();
    const jobId = `job_${crypto.randomUUID()}`;
    const job = {
      jobId,
      fileIds,
      descriptors,
      status: 'queued',
      stage: 'queued',
      progress: { schemaVersion: config.schemaVersion, completedFiles: 0, totalFiles: fileIds.length },
      startedAt: null,
      finishedAt: null,
      warnings: [],
      error: null,
      documents: undefined,
      resourcesCleaned: false,
      worker: null,
      timer: null,
      retentionTimer: null,
      jobDirectory: null,
      createdAt: now,
      terminalizing: false,
    };
    this.jobs.set(jobId, job);
    this.queue.push(jobId);
    this.emitSnapshot(job);
    queueMicrotask(() => this.pump());
    return this.snapshot(job);
  }

  status(payload) {
    const { jobId } = validate(JobIdRequestSchema, payload, '查询任务请求');
    return this.snapshot(this.requireJob(jobId));
  }

  async cancel(payload) {
    const { jobId } = validate(JobIdRequestSchema, payload, '取消任务请求');
    const job = this.requireJob(jobId);
    if (TERMINAL_STATUSES.has(job.status)) return this.snapshot(job);
    job.terminalizing = true;
    this.queue = this.queue.filter((queuedId) => queuedId !== jobId);
    if (job.worker) {
      const worker = job.worker;
      job.worker = null;
      await worker.terminate().catch(() => undefined);
    }
    await this.finish(job, 'cancelled', {
      error: normalizeError(managerError('JOB_CANCELLED', '分析任务已取消')),
    });
    this.pump();
    return this.snapshot(job);
  }

  async cleanup(payload) {
    const { jobId } = validate(JobIdRequestSchema, payload, '清理任务请求');
    const job = this.requireJob(jobId);
    if (!TERMINAL_STATUSES.has(job.status)) {
      throw managerError('INVALID_REQUEST', '运行中的任务不能清理');
    }
    if (job.retentionTimer) clearTimeout(job.retentionTimer);
    this.jobs.delete(jobId);
    return { schemaVersion: config.schemaVersion, jobId, cleaned: true };
  }

  async pump() {
    while (!this.disposed && this.runningCount < this.jobConfig.maxConcurrent && this.queue.length) {
      const jobId = this.queue.shift();
      const job = this.jobs.get(jobId);
      if (!job || job.status !== 'queued') continue;
      this.runningCount += 1;
      this.run(job).finally(() => {
        this.runningCount = Math.max(0, this.runningCount - 1);
        this.pump();
      });
    }
  }

  async run(job) {
    try {
      job.status = 'staging';
      job.stage = 'copying-files';
      job.startedAt = new Date().toISOString();
      job.jobDirectory = path.join(this.jobsRoot, job.jobId);
      await ensureDirectory(job.jobDirectory);
      this.emitSnapshot(job);

      const workerFiles = [];
      for (const descriptor of job.descriptors) {
        const extension = path.extname(descriptor.stagedPath).toLowerCase();
        const workPath = path.join(job.jobDirectory, `${crypto.randomUUID()}${extension}`);
        await fsp.copyFile(descriptor.stagedPath, workPath);
        workerFiles.push({
          fileId: descriptor.fileId,
          displayName: descriptor.displayName,
          workPath,
          timeoutMs: this.jobConfig.timeoutsMs[descriptor.detectedType],
        });
      }

      if (job.terminalizing) return;
      job.status = 'parsing';
      job.stage = 'reading-file';
      this.emitSnapshot(job);

      const totalTimeoutMs = workerFiles.reduce((sum, file) => sum + file.timeoutMs, 0);
      const worker = new Worker(pathToFileURL(this.workerPath), {
        workerData: {
          tessdataPath: this.tessdataPath,
          tessdataCachePath: this.tessdataCachePath,
          tesseractWorkerPath: this.tesseractWorkerPath,
        },
      });
      job.worker = worker;
      job.timer = setTimeout(() => {
        this.timeoutJob(job).catch(() => undefined);
      }, totalTimeoutMs);

      await new Promise((resolve) => {
        let resolved = false;
        const settle = () => {
          if (resolved) return;
          resolved = true;
          resolve();
        };

        worker.on('message', (message) => {
          this.handleWorkerMessage(job, message, settle).catch(async (error) => {
            await this.fail(job, error);
            settle();
          });
        });
        worker.on('error', async (error) => {
          if (!job.terminalizing && !TERMINAL_STATUSES.has(job.status)) await this.fail(job, error);
          settle();
        });
        worker.on('exit', async (code) => {
          if (!resolved && !job.terminalizing && !TERMINAL_STATUSES.has(job.status)) {
            await this.fail(job, managerError('INTERNAL_PARSE_ERROR', `解析Worker异常退出(${code})`));
          }
          settle();
        });
        worker.postMessage({ type: 'parse', jobId: job.jobId, files: workerFiles });
      });
    } catch (error) {
      if (!job.terminalizing && !TERMINAL_STATUSES.has(job.status)) await this.fail(job, error);
    } finally {
      if (job.worker) {
        const worker = job.worker;
        job.worker = null;
        await worker.terminate().catch(() => undefined);
      }
    }
  }

  async handleWorkerMessage(job, message, settle) {
    if (job.terminalizing || TERMINAL_STATUSES.has(job.status) || message?.jobId !== job.jobId) return;
    if (message.type === 'file-start') {
      job.progress.currentFile = message.displayName;
      job.status = 'parsing';
      job.stage = 'reading-file';
      this.emitSnapshot(job);
      return;
    }
    if (message.type === 'progress') {
      const mapped = PARSER_STAGE_MAP[message.parserStage] ?? ['parsing', 'parsing-document'];
      job.status = mapped[0];
      job.stage = mapped[1];
      job.progress.currentFile = message.displayName;
      this.emitSnapshot(job);
      return;
    }
    if (message.type === 'file-complete') {
      job.progress.completedFiles = message.fileIndex + 1;
      job.progress.currentFile = message.displayName;
      this.emitSnapshot(job);
      return;
    }
    if (message.type === 'failed') {
      await this.fail(job, message.error);
      settle();
      return;
    }
    if (message.type === 'complete') {
      job.status = 'normalizing';
      job.stage = 'validating-result';
      this.emitSnapshot(job);
      const documents = message.documents.map((document) => (
        validate(ParsedDocumentSchema, document, 'Worker解析结果')
      ));
      job.documents = documents;
      job.warnings = documents.flatMap((document) => document.warnings);
      job.progress.completedFiles = job.progress.totalFiles;
      job.progress.currentFile = undefined;
      await this.finish(job, 'completed');
      settle();
    }
  }

  async timeoutJob(job) {
    if (job.terminalizing || TERMINAL_STATUSES.has(job.status)) return;
    job.terminalizing = true;
    if (job.worker) {
      const worker = job.worker;
      job.worker = null;
      await worker.terminate().catch(() => undefined);
    }
    await this.finish(job, 'failed', {
      error: normalizeError(managerError('PARSE_TIMEOUT', '文件解析超时')),
    });
  }

  async fail(job, error) {
    if (job.terminalizing || TERMINAL_STATUSES.has(job.status)) return;
    job.terminalizing = true;
    await this.finish(job, 'failed', { error: normalizeError(error) });
  }

  async finish(job, status, values = {}) {
    if (job.timer) {
      clearTimeout(job.timer);
      job.timer = null;
    }
    job.terminalizing = true;
    Object.assign(job, values);
    job.stage = 'cleaning-up';
    this.emitSnapshot(job);
    await removeDirectory(job.jobDirectory);
    await this.stagingService.cleanup(job.fileIds);
    job.resourcesCleaned = true;
    job.finishedAt = new Date().toISOString();
    job.status = status;
    job.stage = status === 'completed' ? 'complete' : status;
    this.emitSnapshot(job);
    job.retentionTimer = setTimeout(() => this.jobs.delete(job.jobId), this.jobConfig.retentionMs);
    job.retentionTimer.unref?.();
  }

  requireJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) throw managerError('JOB_NOT_FOUND', '分析任务不存在');
    return job;
  }

  snapshot(job) {
    const value = {
      schemaVersion: config.schemaVersion,
      jobId: job.jobId,
      fileIds: job.fileIds,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      warnings: job.warnings,
      error: job.error,
      documents: job.documents,
      resourcesCleaned: job.resourcesCleaned,
    };
    if (!value.documents) delete value.documents;
    return validate(AnalysisJobSnapshotSchema, value, '分析任务');
  }

  emitSnapshot(job) {
    this.emit('progress', this.snapshot(job));
  }

  async waitForTerminal(jobId, timeoutMs = 300_000) {
    const existing = this.requireJob(jobId);
    if (TERMINAL_STATUSES.has(existing.status)) return this.snapshot(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off('progress', listener);
        reject(managerError('PARSE_TIMEOUT', '等待任务完成超时'));
      }, timeoutMs);
      const listener = (snapshot) => {
        if (snapshot.jobId !== jobId || !TERMINAL_STATUSES.has(snapshot.status)) return;
        clearTimeout(timer);
        this.off('progress', listener);
        resolve(snapshot);
      };
      this.on('progress', listener);
    });
  }

  async dispose() {
    this.disposed = true;
    this.queue = [];
    for (const job of this.jobs.values()) {
      if (job.retentionTimer) clearTimeout(job.retentionTimer);
    }
    const running = [...this.jobs.values()].filter((job) => !TERMINAL_STATUSES.has(job.status));
    await Promise.all(running.map((job) => this.cancel({ jobId: job.jobId }).catch(() => undefined)));
  }
}

module.exports = { AnalysisJobManager, TERMINAL_STATUSES };
