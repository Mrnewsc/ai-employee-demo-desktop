const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const {
  DeepSeekProductExtractionProvider,
  ProductExtractionService,
  deepSeekConfigFromEnvironment,
} = require('../extraction/runtime/extraction-runtime.cjs');
const { MatchEngine } = require('../matching/runtime/matching-runtime.cjs');

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'catalog-required']);
const PIPELINE_DEFAULT_MAX_OUTPUT_TOKENS = '6000';

function pipelineError(code, message, retryable = false, technicalDetail = null) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  error.technicalDetail = technicalDetail;
  return error;
}

function safeDetail(error) {
  const messages = [];
  let current = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    const value = typeof current?.message === 'string' ? current.message : String(current ?? '');
    if (value && !messages.includes(value)) messages.push(value);
    current = current?.cause;
  }
  return messages.join(' | ')
    .replace(/[A-Za-z]:\\[^\s"']+/g, '[本地路径]')
    .replace(/file:\/\/\/[^\s"']+/g, '[本地路径]')
    .replace(/Authorization\s*[:=]\s*Bearer\s+\S+/gi, 'Authorization=[已隐藏]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[API凭据已隐藏]')
    .slice(0, 500);
}

function providerHttpStatus(error) {
  const match = safeDetail(error).match(/HTTP\s+(\d{3})/i);
  return match ? Number(match[1]) : null;
}

function normalizePipelineError(error) {
  const sourceCode = typeof error?.code === 'string' ? error.code : 'INTERNAL_ANALYSIS_ERROR';
  const codeMap = {
    AI_EXTRACTION_CANCELLED: 'AI_EXTRACTION_FAILED',
    INTERNAL_PARSE_ERROR: 'INTERNAL_ANALYSIS_ERROR',
  };
  const httpStatus = providerHttpStatus(error);
  let code = codeMap[sourceCode] ?? sourceCode;
  if (httpStatus === 429) code = 'AI_RATE_LIMITED';
  else if ([401, 402].includes(httpStatus) || (httpStatus !== null && httpStatus >= 500)) code = 'AI_REQUEST_FAILED';
  const retryableCodes = new Set(['AI_REQUEST_FAILED', 'AI_TIMEOUT', 'AI_RATE_LIMITED', 'AI_OUTPUT_TRUNCATED', 'AI_INVALID_JSON', 'AI_SCHEMA_INVALID', 'OCR_FAILED', 'PARSE_TIMEOUT']);
  return {
    schemaVersion: '1.0',
    code,
    message: typeof error?.message === 'string' ? error.message.slice(0, 500) : '资料分析失败',
    retryable: Boolean(error?.retryable) || retryableCodes.has(code),
    technicalDetail: safeDetail(error) || null,
  };
}

function elapsedMs(startedAt, completedAt = new Date().toISOString()) {
  if (!startedAt) return null;
  const value = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(value) ? Math.max(0, value) : null;
}

function createFileDiagnostics(files) {
  return files.map((file) => ({
    schemaVersion: '1.0',
    fileId: file.fileId,
    safeFileName: file.fileName,
    fileType: file.fileType,
    parseStatus: file.status,
    parseDurationMs: null,
    ocrUsed: false,
    ocrWarningCodes: [],
  }));
}

function createAttemptDiagnostics(job, attemptNumber, startedAt = null) {
  return {
    schemaVersion: '1.0', attemptNumber, jobId: job.jobId, customerId: job.customerId,
    status: job.status, stage: job.stage, startedAt, completedAt: null, durationMs: null,
    files: createFileDiagnostics(job.files),
    extraction: {
      schemaVersion: '1.0', provider: null, model: null, extractionStartedAt: null,
      extractionDurationMs: null, requestCount: 0, retryCount: 0, repairCount: 0,
      errorCode: null, errorStage: null, providerHttpStatus: null, providerRequestId: null,
      timeoutMs: null, outputTruncated: false, schemaValid: null,
    },
    matching: {
      schemaVersion: '1.0', catalogVersion: null, extractedProductCount: 0,
      matchGroupCount: 0, matchingDurationMs: null, matchingErrorCode: null,
    },
    failureStage: null, failureCode: null, safeFailureMessage: null,
    statusHistory: [],
  };
}

function recordDiagnosticState(job) {
  const diagnostic = job.diagnostics;
  if (!diagnostic) return;
  diagnostic.status = job.status;
  diagnostic.stage = job.stage;
  diagnostic.files = diagnostic.files.map((entry) => {
    const current = job.files.find((file) => file.fileId === entry.fileId);
    return current ? { ...entry, parseStatus: current.status } : entry;
  });
  const latest = diagnostic.statusHistory.at(-1);
  if (!latest || latest.status !== job.status || latest.stage !== job.stage) {
    diagnostic.statusHistory.push({ status: job.status, stage: job.stage, timestamp: new Date().toISOString() });
  }
}

function finalizeDiagnostic(job) {
  if (!job.diagnostics) return;
  recordDiagnosticState(job);
  job.diagnostics.completedAt = job.finishedAt;
  job.diagnostics.durationMs = elapsedMs(job.diagnostics.startedAt, job.finishedAt ?? undefined);
}

function updateParsedFileDiagnostics(job) {
  if (!job.diagnostics || !job.documents) return;
  job.diagnostics.files = job.diagnostics.files.map((entry) => {
    const document = job.documents.find((item) => item.fileId === entry.fileId || item.fileName === entry.safeFileName);
    if (!document) return entry;
    const warningCodes = document.warnings?.filter((warning) => warning.code.startsWith('ocr_')).map((warning) => warning.code) ?? [];
    const ocrUsed = document.fileType === 'image'
      || document.blocks?.some((block) => block.type === 'ocr-line')
      || document.images?.some((image) => Boolean(image.ocrText));
    return {
      ...entry,
      parseStatus: 'parsed',
      parseDurationMs: typeof document.metadata?.parseDurationMs === 'number' ? document.metadata.parseDurationMs : null,
      ocrUsed,
      ocrWarningCodes: [...new Set(warningCodes)],
    };
  });
}

function assertStartPayload(payload) {
  if (!payload || !Array.isArray(payload.fileIds) || !payload.fileIds.length || payload.fileIds.length > 10) throw pipelineError('INVALID_REQUEST', '请选择1至10个客户文件');
  if (typeof payload.customerId !== 'string' || !/^[A-Za-z0-9._-]{2,100}$/.test(payload.customerId)) throw pipelineError('INVALID_REQUEST', '客户上下文无效');
  return { fileIds: [...new Set(payload.fileIds)], customerId: payload.customerId };
}

function assertJobId(payload) {
  if (!payload || typeof payload.jobId !== 'string' || !/^pipeline_[a-f0-9-]{12,}$/.test(payload.jobId)) throw pipelineError('INVALID_REQUEST', '分析任务ID无效');
  return payload.jobId;
}

function evidenceProductNameHint(product) {
  const text = (product.evidence ?? []).map((item) => item.text).join('\n');
  const match = text.match(/产品\s*名\s*称\s*[:：]?\s*([^\n，,；;]+?)(?=型\s*号|数\s*量|材\s*质|产\s*能|$)/i);
  const value = match?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
  return value.length >= 2 && value.length <= 80 ? value : null;
}

function matchingInput(product) {
  const currentName = product.productName?.trim() ?? '';
  const genericName = !currentName || /客户.*清单|产品.*清单|脱敏.*测试/.test(currentName.replace(/\s+/g, ''));
  const hint = genericName ? evidenceProductNameHint(product) : null;
  if (!hint) return { product, usedEvidenceHint: false };
  return {
    product: {
      ...product,
      productName: hint,
      needsHumanReview: true,
      reviewReasons: [...new Set([...(product.reviewReasons ?? []), '候选召回使用原始Evidence中的产品名称提示，需要人工确认。'])],
    },
    usedEvidenceHint: true,
  };
}

class FullAnalysisJobManager extends EventEmitter {
  constructor({ parserJobManager, stagingService, productRepository, environment = process.env, extractionServiceFactory = null, matchEngineFactory = null } = {}) {
    super();
    if (!parserJobManager || !stagingService || !productRepository) throw new Error('完整分析Pipeline配置不完整');
    this.parserJobManager = parserJobManager;
    this.stagingService = stagingService;
    this.productRepository = productRepository;
    this.environment = environment;
    this.extractionServiceFactory = extractionServiceFactory;
    this.matchEngineFactory = matchEngineFactory;
    this.jobs = new Map();
    this.parserToPipeline = new Map();
    this.disposed = false;
    this.onParserProgress = (snapshot) => this.handleParserProgress(snapshot);
    this.parserJobManager.on('progress', this.onParserProgress);
  }

  async initialize() {
    await this.productRepository.initialize();
  }

  start(payload) {
    if (this.disposed) throw pipelineError('INTERNAL_ANALYSIS_ERROR', '资料分析服务已关闭');
    const { fileIds, customerId } = assertStartPayload(payload);
    const descriptors = fileIds.map((fileId) => this.stagingService.getDescriptor(fileId));
    const jobId = `pipeline_${crypto.randomUUID()}`;
    const job = {
      jobId,
      customerId,
      fileIds,
      descriptors,
      status: 'queued',
      stage: 'receiving-files',
      progress: { schemaVersion: '1.0', completedFiles: 0, totalFiles: fileIds.length, currentFile: null, message: '文件已接收' },
      files: descriptors.map((entry) => ({ schemaVersion: '1.0', fileId: entry.fileId, fileName: entry.displayName, fileType: entry.detectedType, size: entry.size, status: 'queued' })),
      parserWarnings: [],
      extraction: null,
      matchGroups: [],
      catalogVersion: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      documents: null,
      parserJobId: null,
      controller: new AbortController(),
      runToken: 0,
      attemptNumber: 1,
      previousAttempts: [],
      diagnostics: null,
    };
    job.diagnostics = createAttemptDiagnostics(job, job.attemptNumber);
    this.jobs.set(jobId, job);
    this.emitSnapshot(job);
    queueMicrotask(() => this.run(job).catch(() => undefined));
    return this.snapshot(job);
  }

  status(payload) {
    return this.snapshot(this.requireJob(assertJobId(payload)));
  }

  resume(payload) {
    if (!payload || typeof payload.customerId !== 'string') throw pipelineError('INVALID_REQUEST', '客户上下文无效');
    const jobs = [...this.jobs.values()].filter((job) => job.customerId === payload.customerId).sort((left, right) => (right.startedAt ?? '').localeCompare(left.startedAt ?? ''));
    return jobs[0] ? this.snapshot(jobs[0]) : null;
  }

  async cancel(payload) {
    const job = this.requireJob(assertJobId(payload));
    if (TERMINAL.has(job.status)) return this.snapshot(job);
    job.runToken += 1;
    job.controller.abort();
    if (job.parserJobId) await this.parserJobManager.cancel({ jobId: job.parserJobId }).catch(() => undefined);
    job.status = 'cancelled';
    job.stage = 'cancelled';
    job.finishedAt = new Date().toISOString();
    job.error = normalizePipelineError(pipelineError('JOB_CANCELLED', '分析任务已取消'));
    job.progress.message = '分析已取消';
    job.diagnostics.failureStage = 'cancelled';
    job.diagnostics.failureCode = 'JOB_CANCELLED';
    job.diagnostics.safeFailureMessage = '分析任务已取消';
    finalizeDiagnostic(job);
    this.emitSnapshot(job);
    return this.snapshot(job);
  }

  retry(payload) {
    const job = this.requireJob(assertJobId(payload));
    if (!TERMINAL.has(job.status)) throw pipelineError('INVALID_REQUEST', '运行中的任务不能重试');
    if (!job.documents?.length) throw pipelineError('REUPLOAD_REQUIRED', '原文件解析结果不可复用，请重新上传文件');
    finalizeDiagnostic(job);
    job.previousAttempts.push(structuredClone(job.diagnostics));
    job.runToken += 1;
    job.attemptNumber += 1;
    job.controller = new AbortController();
    job.status = 'extracting';
    job.stage = 'extracting-products';
    job.error = null;
    job.finishedAt = null;
    job.extraction = null;
    job.matchGroups = [];
    job.catalogVersion = null;
    job.progress.message = '正在重新提取产品信息';
    job.diagnostics = createAttemptDiagnostics(job, job.attemptNumber, new Date().toISOString());
    updateParsedFileDiagnostics(job);
    const token = job.runToken;
    this.emitSnapshot(job);
    queueMicrotask(() => this.runFromDocuments(job, token).catch(() => undefined));
    return this.snapshot(job);
  }

  async catalogStatus() {
    const info = await this.productRepository.getVersionInfo();
    return {
      schemaVersion: '1.0',
      ready: Boolean(info.currentVersion && info.productCount > 0),
      catalogVersion: info.currentVersion,
      productCount: info.productCount,
      message: info.currentVersion && info.productCount > 0 ? `企业产品库已就绪，共${info.productCount}条产品` : '尚未配置企业产品库，无法进行产品匹配。',
    };
  }

  async run(job) {
    const token = ++job.runToken;
    job.startedAt = new Date().toISOString();
    job.diagnostics.startedAt = job.startedAt;
    job.status = 'staging';
    job.stage = 'receiving-files';
    this.emitSnapshot(job);
    try {
      const parser = this.parserJobManager.start({ fileIds: job.fileIds });
      job.parserJobId = parser.jobId;
      this.parserToPipeline.set(parser.jobId, job.jobId);
      const terminal = await this.parserJobManager.waitForTerminal(parser.jobId);
      this.parserToPipeline.delete(parser.jobId);
      if (!this.isCurrent(job, token)) return;
      if (terminal.status === 'cancelled') throw pipelineError('JOB_CANCELLED', '分析任务已取消');
      if (terminal.status !== 'completed' || !terminal.documents?.length) {
        const error = terminal.error ?? pipelineError('INTERNAL_ANALYSIS_ERROR', '文件解析失败');
        throw Object.assign(new Error(error.message), { code: error.code, retryable: error.retryable });
      }
      job.documents = terminal.documents;
      job.parserWarnings = terminal.warnings;
      job.files = job.files.map((file) => ({ ...file, status: 'parsed' }));
      updateParsedFileDiagnostics(job);
      await this.runFromDocuments(job, token);
    } catch (error) {
      this.handleFailure(job, token, error);
    }
  }

  async runFromDocuments(job, token) {
    try {
      if (!this.isCurrent(job, token)) return;
      job.status = 'extracting';
      job.stage = 'extracting-products';
      job.progress.message = '正在提取产品信息';
      const extractionStartedAt = new Date().toISOString();
      job.diagnostics.extraction.extractionStartedAt = extractionStartedAt;
      this.emitSnapshot(job);
      if (!this.extractionServiceFactory) {
        const apiKey = this.environment.DEEPSEEK_API_KEY?.trim();
        const model = this.environment.DEEPSEEK_MODEL?.trim();
        if (!apiKey || !model) throw pipelineError('AI_NOT_CONFIGURED', 'AI分析服务尚未配置，请设置DEEPSEEK_API_KEY和DEEPSEEK_MODEL后重试');
      }
      let extractionService;
      if (this.extractionServiceFactory) {
        extractionService = this.extractionServiceFactory();
        job.diagnostics.extraction.provider = 'injected';
        job.diagnostics.extraction.model = 'test-or-local';
      } else {
        const providerEnvironment = this.environment.DEEPSEEK_MAX_OUTPUT_TOKENS
          ? this.environment
          : { ...this.environment, DEEPSEEK_MAX_OUTPUT_TOKENS: PIPELINE_DEFAULT_MAX_OUTPUT_TOKENS };
        const config = deepSeekConfigFromEnvironment(providerEnvironment);
        job.diagnostics.extraction.provider = 'deepseek';
        job.diagnostics.extraction.model = config.model;
        job.diagnostics.extraction.timeoutMs = config.timeoutMs;
        const auditLogger = (event) => {
          if (!this.isCurrent(job, token)) return;
          if (event.event === 'repair-started') job.diagnostics.extraction.repairCount = Math.max(job.diagnostics.extraction.repairCount, event.repairAttempts);
          if (event.errorCode) job.diagnostics.extraction.errorCode = event.errorCode;
        };
        const requestLogger = (record) => {
          if (!this.isCurrent(job, token)) return;
          job.diagnostics.extraction.requestCount += 1;
          job.diagnostics.extraction.repairCount = Math.max(job.diagnostics.extraction.repairCount, record.repairAttempt);
          if (record.errorCode) job.diagnostics.extraction.errorCode = record.errorCode;
        };
        extractionService = new ProductExtractionService(new DeepSeekProductExtractionProvider(config, auditLogger, fetch, requestLogger));
      }
      const extraction = await extractionService.extract(job.documents, {
        jobId: `extract_${job.jobId.slice('pipeline_'.length)}`,
        signal: job.controller.signal,
        optionalContext: { customerId: job.customerId },
        chunkConfig: { maxConcurrentRequests: 1 },
      });
      if (!this.isCurrent(job, token)) return;
      job.extraction = extraction;
      job.diagnostics.extraction.provider = extraction.provider;
      job.diagnostics.extraction.model = extraction.model;
      job.diagnostics.extraction.extractionDurationMs = extraction.metrics.durationMs ?? elapsedMs(extractionStartedAt);
      job.diagnostics.extraction.requestCount = extraction.metrics.requestCount;
      job.diagnostics.extraction.repairCount = extraction.metrics.repairAttempts;
      job.diagnostics.extraction.schemaValid = true;
      job.status = 'matching';
      job.stage = 'checking-catalog';
      job.progress.message = `已识别${extraction.products.length}个客户产品，正在查询企业产品库`;
      this.emitSnapshot(job);
      const readiness = await this.catalogStatus();
      job.catalogVersion = readiness.catalogVersion;
      job.diagnostics.matching.catalogVersion = readiness.catalogVersion;
      job.diagnostics.matching.extractedProductCount = extraction.products.length;
      if (!readiness.ready) {
        job.status = 'catalog-required';
        job.stage = 'awaiting-catalog';
        job.error = normalizePipelineError(pipelineError('CATALOG_NOT_CONFIGURED', readiness.message, true));
        job.finishedAt = new Date().toISOString();
        job.progress.message = `已识别${extraction.products.length}个客户产品，产品匹配等待企业产品库`;
        finalizeDiagnostic(job);
        this.emitSnapshot(job);
        return;
      }
      job.stage = 'matching-products';
      job.progress.message = '正在匹配企业产品库';
      const matchingStartedAt = new Date().toISOString();
      this.emitSnapshot(job);
      const engine = this.matchEngineFactory ? this.matchEngineFactory(this.productRepository) : new MatchEngine({ repository: this.productRepository });
      const matchGroups = [];
      for (const product of extraction.products) {
        if (!this.isCurrent(job, token)) return;
        const warnings = extraction.warnings.filter((warning) => warning.productId === null || warning.productId === product.id);
        const input = matchingInput(product);
        const output = await engine.match({ extractedProduct: input.product, extractionWarnings: warnings, catalogVersion: readiness.catalogVersion });
        const results = input.usedEvidenceHint ? output.results.map((result) => ({
          ...result,
          extractedProductSnapshot: { ...result.extractedProductSnapshot, productName: product.productName },
          needsHumanReview: true,
          reviewStatus: 'pending',
          reviewReasons: [...new Set([...result.reviewReasons, '企业候选召回使用了客户原始Evidence中的产品名称提示，必须人工确认。'])],
        })) : output.results;
        matchGroups.push({ schemaVersion: '1.0', extractedProductId: product.id, results });
      }
      if (!this.isCurrent(job, token)) return;
      job.matchGroups = matchGroups;
      job.diagnostics.matching.matchGroupCount = matchGroups.length;
      job.diagnostics.matching.matchingDurationMs = elapsedMs(matchingStartedAt);
      job.status = 'completed';
      job.stage = 'complete';
      job.finishedAt = new Date().toISOString();
      job.error = null;
      const pending = matchGroups.filter((group) => group.results[0]?.needsHumanReview || group.results[0]?.level === 'none').length;
      job.progress.message = `分析完成，${pending}项需要人工确认`;
      finalizeDiagnostic(job);
      this.emitSnapshot(job);
    } catch (error) {
      this.handleFailure(job, token, error);
    }
  }

  handleParserProgress(snapshot) {
    const pipelineId = this.parserToPipeline.get(snapshot.jobId);
    const job = pipelineId ? this.jobs.get(pipelineId) : null;
    if (!job || TERMINAL.has(job.status)) return;
    job.status = snapshot.status === 'ocr' ? 'ocr' : snapshot.status === 'staging' || snapshot.status === 'queued' ? 'staging' : 'parsing';
    job.stage = snapshot.status === 'ocr' ? 'recognizing-text' : snapshot.status === 'staging' ? 'receiving-files' : 'reading-files';
    job.progress = {
      schemaVersion: '1.0',
      completedFiles: snapshot.progress.completedFiles,
      totalFiles: snapshot.progress.totalFiles,
      currentFile: snapshot.progress.currentFile ?? null,
      message: snapshot.status === 'ocr' ? '正在识别扫描内容' : `正在读取资料 ${snapshot.progress.completedFiles}/${snapshot.progress.totalFiles}`,
    };
    job.files = job.files.map((file) => ({
      ...file,
      status: file.fileName === snapshot.progress.currentFile ? (snapshot.status === 'ocr' ? 'ocr' : 'reading') : snapshot.progress.completedFiles > job.files.indexOf(file) ? 'parsed' : file.status,
    }));
    this.emitSnapshot(job);
  }

  handleFailure(job, token, error) {
    if (!this.isCurrent(job, token)) return;
    const failureStage = job.stage;
    const normalized = normalizePipelineError(error);
    const httpStatus = providerHttpStatus(error);
    if (['receiving-files', 'reading-files', 'recognizing-text'].includes(failureStage)) {
      job.files = job.files.map((file) => file.fileName === job.progress.currentFile ? { ...file, status: 'failed' } : file);
    }
    if (failureStage === 'extracting-products') {
      job.diagnostics.extraction.extractionDurationMs = elapsedMs(job.diagnostics.extraction.extractionStartedAt);
      job.diagnostics.extraction.errorCode = normalized.code;
      job.diagnostics.extraction.errorStage = failureStage;
      job.diagnostics.extraction.providerHttpStatus = httpStatus;
      job.diagnostics.extraction.outputTruncated = normalized.code === 'AI_OUTPUT_TRUNCATED';
      job.diagnostics.extraction.schemaValid = false;
    }
    if (failureStage === 'matching-products' || failureStage === 'checking-catalog') {
      job.diagnostics.matching.matchingErrorCode = normalized.code;
    }
    if (error?.code === 'JOB_CANCELLED' || job.controller.signal.aborted) {
      job.status = 'cancelled';
      job.stage = 'cancelled';
      job.error = normalizePipelineError(pipelineError('JOB_CANCELLED', '分析任务已取消'));
      job.progress.message = '分析已取消';
    } else {
      job.status = 'failed';
      job.stage = 'failed';
      job.error = normalized;
      job.progress.message = '资料分析未完成';
    }
    job.finishedAt = new Date().toISOString();
    job.diagnostics.failureStage = failureStage;
    job.diagnostics.failureCode = job.error.code;
    job.diagnostics.safeFailureMessage = safeDetail(error) || job.error.message;
    finalizeDiagnostic(job);
    this.emitSnapshot(job);
  }

  isCurrent(job, token) {
    return !this.disposed && job.runToken === token && !TERMINAL.has(job.status);
  }

  requireJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) throw pipelineError('JOB_NOT_FOUND', '完整分析任务不存在');
    return job;
  }

  snapshot(job) {
    recordDiagnosticState(job);
    return structuredClone({
      schemaVersion: '1.0',
      jobId: job.jobId,
      customerId: job.customerId,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      files: job.files,
      parserWarnings: job.parserWarnings,
      extractedProducts: job.extraction?.products ?? [],
      extractionWarnings: job.extraction?.warnings ?? [],
      extractionMetrics: job.extraction?.metrics ?? null,
      matchGroups: job.matchGroups,
      catalogVersion: job.catalogVersion,
      error: job.error,
      diagnostics: { ...job.diagnostics, previousAttempts: job.previousAttempts },
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    });
  }

  emitSnapshot(job) {
    this.emit('progress', this.snapshot(job));
  }

  async waitForTerminal(jobId, timeoutMs = 600_000) {
    const existing = this.requireJob(jobId);
    if (TERMINAL.has(existing.status)) return this.snapshot(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off('progress', listener);
        reject(pipelineError('AI_TIMEOUT', '等待完整分析任务超时', true));
      }, timeoutMs);
      const listener = (snapshot) => {
        if (snapshot.jobId !== jobId || !TERMINAL.has(snapshot.status)) return;
        clearTimeout(timer);
        this.off('progress', listener);
        resolve(snapshot);
      };
      this.on('progress', listener);
    });
  }

  async dispose() {
    this.disposed = true;
    this.parserJobManager.off('progress', this.onParserProgress);
    const running = [...this.jobs.values()].filter((job) => !TERMINAL.has(job.status));
    await Promise.all(running.map((job) => this.cancel({ jobId: job.jobId }).catch(() => undefined)));
  }
}

module.exports = { FullAnalysisJobManager, PIPELINE_TERMINAL_STATUSES: TERMINAL, evidenceProductNameHint, matchingInput };
