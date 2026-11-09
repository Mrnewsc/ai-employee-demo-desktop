const fs = require('node:fs/promises');
const path = require('node:path');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const { pathToFileURL } = require('node:url');

function rendererSmokeScenario() {
  const api = window.realAI;
  const terminal = new Set(['completed', 'failed', 'cancelled']);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const wait = async (jobId, timeoutMs = 240000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const job = await api.analysis.status(jobId);
      if (terminal.has(job.status)) return job;
      await sleep(20);
    }
    throw new Error(`等待任务超时:${jobId}`);
  };
  const selectOne = async () => {
    const tokens = await api.files.select();
    if (tokens.length !== 1) throw new Error('测试文件选择队列异常');
    return tokens[0];
  };

  return (async () => {
    const heartbeat = { ticks: 0, maxDriftMs: 0 };
    let previous = performance.now();
    const heartbeatTimer = setInterval(() => {
      const now = performance.now();
      heartbeat.maxDriftMs = Math.max(heartbeat.maxDriftMs, now - previous - 20);
      heartbeat.ticks += 1;
      previous = now;
    }, 20);

    const pdf = await selectOne();
    const docx = await selectOne();
    const xlsx = await selectOne();
    const leakedTokenJson = JSON.stringify([pdf, docx, xlsx]);
    const concurrentStartedAt = performance.now();
    const starts = await Promise.all([
      api.analysis.start([pdf.fileId]),
      api.analysis.start([docx.fileId]),
      api.analysis.start([xlsx.fileId]),
    ]);
    const concurrent = await Promise.all(starts.map((job) => wait(job.jobId)));
    const concurrentDurationMs = Math.round(performance.now() - concurrentStartedAt);

    const image = await selectOne();
    const ocrStartedAt = performance.now();
    const imageStart = await api.analysis.start([image.fileId]);
    const imageResult = await wait(imageStart.jobId);
    const ocrDurationMs = Math.round(performance.now() - ocrStartedAt);

    const cancelFile = await selectOne();
    const cancelStart = await api.analysis.start([cancelFile.fileId]);
    let cancelObservedStage = 'queued';
    const cancelDeadline = Date.now() + 10000;
    while (Date.now() < cancelDeadline) {
      const current = await api.analysis.status(cancelStart.jobId);
      cancelObservedStage = current.stage;
      if (current.status === 'ocr' || current.stage === 'rendering-page' || current.stage === 'recognizing-text') break;
      if (terminal.has(current.status)) break;
      await sleep(10);
    }
    const cancelResult = await api.analysis.cancel(cancelStart.jobId);

    const corrupt = await selectOne();
    const corruptStart = await api.analysis.start([corrupt.fileId]);
    const corruptResult = await wait(corruptStart.jobId);

    let invalidRequestCode = null;
    try {
      await api.analysis.status('../../etc/passwd');
    } catch (error) {
      invalidRequestCode = error.code;
    }
    clearInterval(heartbeatTimer);

    const publicJson = JSON.stringify({ concurrent, imageResult, cancelResult, corruptResult });
    return {
      concurrent: {
        durationMs: concurrentDurationMs,
        statuses: concurrent.map((job) => job.status),
        documentTypes: concurrent.map((job) => job.documents?.[0]?.fileType),
      },
      ocr: {
        durationMs: ocrDurationMs,
        status: imageResult.status,
        errorCode: imageResult.error?.code,
        errorMessage: imageResult.error?.message,
        rawTextLength: imageResult.documents?.[0]?.rawText?.length || 0,
        confidence: imageResult.documents?.[0]?.images?.[0]?.ocrConfidence,
        warningCodes: imageResult.warnings.map((warning) => warning.code),
      },
      cancellation: {
        observedStage: cancelObservedStage,
        status: cancelResult.status,
        errorCode: cancelResult.error?.code,
        resourcesCleaned: cancelResult.resourcesCleaned,
      },
      workerFailure: {
        status: corruptResult.status,
        errorCode: corruptResult.error?.code,
        resourcesCleaned: corruptResult.resourcesCleaned,
      },
      security: {
        invalidRequestCode,
        tokenLeaksPath: /stagedPath|sourcePath|[A-Za-z]:\\\\/.test(leakedTokenJson),
        resultLeaksPath: /stagedPath|sourcePath|[A-Za-z]:\\\\/.test(publicJson),
        exposesIpcRenderer: Boolean(window.ipcRenderer),
      },
      heartbeat,
    };
  })();
}

async function directoryIsEmpty(directory) {
  try {
    return (await fs.readdir(directory)).length === 0;
  } catch {
    return true;
  }
}

async function runElectronSmoke({ BrowserWindow, runtime, outputPath }) {
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    backgroundColor: '#05070D',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  runtime.authorize(win.webContents);
  await win.loadURL(pathToFileURL(path.join(__dirname, 'harness.html')).toString());

  let rendererResult;
  let passed = false;
  let failure;
  try {
    rendererResult = await win.webContents.executeJavaScript(`(${rendererSmokeScenario.toString()})()`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const cleanup = {
      stagingEmpty: await directoryIsEmpty(runtime.paths.stagingRoot),
      jobsEmpty: await directoryIsEmpty(runtime.paths.jobsRoot),
    };
    const assertions = {
      concurrentCompleted: rendererResult.concurrent.statuses.every((status) => status === 'completed'),
      fourTypesParsed: JSON.stringify(rendererResult.concurrent.documentTypes) === JSON.stringify(['pdf', 'docx', 'xlsx'])
        && rendererResult.ocr.status === 'completed',
      ocrProducedText: rendererResult.ocr.rawTextLength > 0,
      cancellationFinal: rendererResult.cancellation.status === 'cancelled'
        && rendererResult.cancellation.errorCode === 'JOB_CANCELLED'
        && rendererResult.cancellation.resourcesCleaned,
      workerFailureRecovered: rendererResult.workerFailure.status === 'failed'
        && rendererResult.workerFailure.resourcesCleaned,
      invalidIdRejected: rendererResult.security.invalidRequestCode === 'INVALID_REQUEST',
      noPathLeak: !rendererResult.security.tokenLeaksPath && !rendererResult.security.resultLeaksPath,
      noRawIpc: !rendererResult.security.exposesIpcRenderer,
      tempCleaned: cleanup.stagingEmpty && cleanup.jobsEmpty,
      rendererResponsive: rendererResult.heartbeat.ticks > 0 && rendererResult.heartbeat.maxDriftMs < 1000,
    };
    passed = Object.values(assertions).every(Boolean);
    const result = {
      schemaVersion: '1.0',
      passed,
      executedAt: new Date().toISOString(),
      packaged: process.mainModule?.filename?.includes('app.asar') || false,
      renderer: rendererResult,
      mainEventLoop: {
        meanDelayMs: Math.round((delay.mean / 1e6) * 100) / 100,
        maxDelayMs: Math.round((delay.max / 1e6) * 100) / 100,
      },
      cleanup,
      assertions,
      resourceLocations: {
        workerExists: await fs.access(runtime.paths.workerPath).then(() => true, () => false),
        tessdataExists: await fs.access(runtime.paths.tessdataPath).then(() => true, () => false),
        tesseractWorkerExists: await fs.access(runtime.paths.tesseractWorkerPath).then(() => true, () => false),
      },
    };
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    if (!passed) failure = new Error('Electron Smoke Test断言失败');
  } finally {
    delay.disable();
    if (!win.isDestroyed()) win.destroy();
  }
  if (failure) throw failure;
  return { passed, rendererResult };
}

module.exports = { runElectronSmoke };
