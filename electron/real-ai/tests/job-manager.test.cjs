const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { FileStagingService } = require('../file-staging-service.cjs');
const { AnalysisJobManager } = require('../job-manager.cjs');

const fixtures = path.resolve('src', 'real-ai', 'fixtures');

async function createServices(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'real-ai-jobs-test-'));
  const stagingService = new FileStagingService({ stagingRoot: path.join(root, 'staged') });
  await stagingService.initialize();
  const jobManager = new AnalysisJobManager({
    jobsRoot: path.join(root, 'jobs'),
    workerPath: path.resolve('electron', 'real-ai', 'workers', 'parser-worker.mjs'),
    stagingService,
    tessdataPath: path.dirname(require.resolve('@tesseract.js-data/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz')),
    tessdataCachePath: path.join(root, 'cache'),
    tesseractWorkerPath: require.resolve('tesseract.js/src/worker-script/node/index.js'),
  });
  await jobManager.initialize();
  context.after(async () => {
    await jobManager.dispose();
    await stagingService.dispose();
    await fs.rm(root, { recursive: true, force: true });
  });
  return { root, stagingService, jobManager };
}

async function stage(service, relativePath, displayName) {
  const [token] = await service.stagePathEntries([{
    sourcePath: path.join(fixtures, ...relativePath),
    displayName,
    declaredMimeType: '',
  }]);
  return token;
}

test('Job Manager支持三任务并发且完成后清理临时文件', async (context) => {
  const { root, stagingService, jobManager } = await createServices(context);
  const tokens = await Promise.all([
    stage(stagingService, ['pdf', 'native-text', 'input.pdf'], '产品资料.pdf'),
    stage(stagingService, ['docx', 'structured-content', 'input.docx'], '规格说明.docx'),
    stage(stagingService, ['excel', 'normal-products', 'input.xlsx'], '产品清单.xlsx'),
  ]);
  const starts = tokens.map((token) => jobManager.start({ fileIds: [token.fileId] }));
  const results = await Promise.all(starts.map((job) => jobManager.waitForTerminal(job.jobId)));
  assert.deepEqual(results.map((job) => job.status), ['completed', 'completed', 'completed']);
  assert.deepEqual(results.map((job) => job.documents[0].fileType), ['pdf', 'docx', 'xlsx']);
  assert.equal(results.every((job) => job.resourcesCleaned), true);
  assert.deepEqual(await fs.readdir(path.join(root, 'jobs')), []);
  assert.deepEqual(await fs.readdir(path.join(root, 'staged')), []);
});

test('OCR任务可取消且终态不会回写completed', async (context) => {
  const { stagingService, jobManager } = await createServices(context);
  const token = await stage(stagingService, ['pdf', 'scanned', 'input.pdf'], '扫描资料.pdf');
  const started = jobManager.start({ fileIds: [token.fileId] });
  await new Promise((resolve) => {
    const listener = (snapshot) => {
      if (snapshot.jobId !== started.jobId) return;
      if (snapshot.stage !== 'rendering-page' && snapshot.status !== 'ocr') return;
      jobManager.off('progress', listener);
      resolve();
    };
    jobManager.on('progress', listener);
  });
  const cancelled = await jobManager.cancel({ jobId: started.jobId });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.error.code, 'JOB_CANCELLED');
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(jobManager.status({ jobId: started.jobId }).status, 'cancelled');
  assert.equal(cancelled.resourcesCleaned, true);
});

test('Worker解析失败后Job Manager返回结构化错误并恢复', async (context) => {
  const { stagingService, jobManager } = await createServices(context);
  const token = await stage(stagingService, ['errors', 'corrupted-pdf', 'input.pdf'], '损坏资料.pdf');
  const started = jobManager.start({ fileIds: [token.fileId] });
  const failed = await jobManager.waitForTerminal(started.jobId);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error.code, 'FILE_CORRUPTED');
  assert.equal(failed.resourcesCleaned, true);
});
