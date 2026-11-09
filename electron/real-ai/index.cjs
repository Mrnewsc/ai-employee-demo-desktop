const path = require('node:path');
const { FileStagingService } = require('./file-staging-service.cjs');
const { AnalysisJobManager } = require('./job-manager.cjs');
const { FullAnalysisJobManager } = require('./pipeline/full-analysis-job-manager.cjs');
const { JsonProductRepository } = require('./catalog/runtime/catalog-runtime.cjs');
const { registerRealAiIpc } = require('./ipc/register.cjs');
const config = require('./config.cjs');
const { cleanupStaleDirectories, ensureDirectory } = require('./temp-utils.cjs');

function unpackedModulePath(modulePath) {
  return modulePath.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
}

async function createRealAiRuntime({ app, ipcMain, dialog, filePicker } = {}) {
  const tempRoot = path.join(app.getPath('temp'), 'shuyuan-real-ai');
  const stagingRoot = path.join(tempRoot, 'staged');
  const jobsRoot = path.join(tempRoot, 'jobs');
  const cacheRoot = path.join(tempRoot, 'cache');
  await Promise.all([
    cleanupStaleDirectories(stagingRoot, config.temp.staleAfterMs),
    cleanupStaleDirectories(jobsRoot, config.temp.staleAfterMs),
    ensureDirectory(cacheRoot),
  ]);

  const workerPath = app.isPackaged
    ? path.join(process.resourcesPath, 'real-ai', 'parser-worker.mjs')
    : path.join(__dirname, 'workers', 'parser-worker.mjs');
  const tessdataPath = app.isPackaged
    ? path.join(process.resourcesPath, 'real-ai', 'tessdata')
    : path.dirname(require.resolve('@tesseract.js-data/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz'));
  const resolvedTesseractWorker = require.resolve('tesseract.js/src/worker-script/node/index.js');
  const tesseractWorkerPath = app.isPackaged
    ? unpackedModulePath(resolvedTesseractWorker)
    : resolvedTesseractWorker;

  const stagingService = new FileStagingService({ stagingRoot });
  await stagingService.initialize();
  const jobManager = new AnalysisJobManager({
    jobsRoot,
    workerPath,
    stagingService,
    tessdataPath,
    tessdataCachePath: cacheRoot,
    tesseractWorkerPath,
  });
  await jobManager.initialize();
  const catalogRoot = path.join(app.getPath('userData'), 'real-ai', 'product-catalog');
  const productRepository = new JsonProductRepository(catalogRoot);
  const pipelineManager = new FullAnalysisJobManager({
    parserJobManager: jobManager,
    stagingService,
    productRepository,
  });
  await pipelineManager.initialize();

  const allowedSenderIds = new Set();
  const unregister = registerRealAiIpc({
    ipcMain,
    dialog,
    stagingService,
    jobManager,
    pipelineManager,
    allowedSenderIds,
    allowedFileRoots: [path.join(__dirname, '..', '..', 'dist'), path.join(__dirname, 'smoke')],
    filePicker,
  });

  return {
    stagingService,
    jobManager,
    pipelineManager,
    productRepository,
    paths: { tempRoot, stagingRoot, jobsRoot, cacheRoot, catalogRoot, workerPath, tessdataPath, tesseractWorkerPath },
    authorize(webContents) {
      allowedSenderIds.add(webContents.id);
      webContents.once('destroyed', () => allowedSenderIds.delete(webContents.id));
    },
    async dispose() {
      unregister();
      await pipelineManager.dispose();
      await jobManager.dispose();
      await stagingService.dispose();
    },
  };
}

module.exports = { createRealAiRuntime };
