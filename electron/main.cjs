const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { createRealAiRuntime } = require('./real-ai/index.cjs');
const { runElectronSmoke } = require('./real-ai/smoke/run-smoke.cjs');
const { createCatalogManagementRuntime } = require('./catalog-management/index.cjs');

const isCapture = process.argv.includes('--capture-previews');
const isRealAiSmoke = process.argv.includes('--real-ai-smoke');
const isRealAiCatalogSmoke = process.argv.includes('--real-ai-catalog-smoke');
const isRealAiPipelineSmoke = process.argv.includes('--real-ai-pipeline-smoke');
const isCatalogUiMatchSmoke = process.argv.includes('--catalog-ui-match-smoke');
if (isRealAiSmoke) {
  app.setPath('userData', path.join(os.tmpdir(), `shuyuan-real-ai-smoke-${process.pid}`));
}
if (isRealAiCatalogSmoke) {
  const catalogUserData = argumentValue('--catalog-user-data');
  if (!catalogUserData) throw new Error('CATALOG_SMOKE_USER_DATA_REQUIRED');
  app.setPath('userData', path.resolve(catalogUserData));
}
if (isRealAiPipelineSmoke) {
  const pipelineUserData = argumentValue('--pipeline-user-data');
  if (!pipelineUserData) throw new Error('PIPELINE_SMOKE_USER_DATA_REQUIRED');
  app.setPath('userData', path.resolve(pipelineUserData));
}
const catalogUiUserData = argumentValue('--catalog-ui-user-data');
if (catalogUiUserData) app.setPath('userData', path.resolve(catalogUiUserData));
const previewSpecs = [
  ...['dashboard', 'content-generator', 'ai-reception', 'roi-calculator'].map((name) => ({ name, query: name, width: 1440, height: 900 })),
  { name: 'real-analysis-1366x768', query: 'real-analysis', width: 1366, height: 768 },
  { name: 'real-analysis-1366x768-bottom', query: 'real-analysis', width: 1366, height: 768, scrollBottom: true },
  { name: 'real-analysis-1440x900', query: 'real-analysis', width: 1440, height: 900 },
  { name: 'product-catalog-empty-1366x768', query: 'product-catalog', width: 1366, height: 768 },
  { name: 'product-catalog-empty-1440x900', query: 'product-catalog', width: 1440, height: 900 },
];
if (!app.isPackaged && process.env.ELECTRON_REMOTE_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.ELECTRON_REMOTE_DEBUG_PORT);
}

function argumentValue(prefix) {
  const value = process.argv.find((argument) => argument.startsWith(`${prefix}=`));
  return value ? value.slice(prefix.length + 1) : null;
}

function createWindow(runtime, catalogRuntime) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 720,
    backgroundColor: '#05070D',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  runtime.authorize(win.webContents);
  catalogRuntime?.authorize(win.webContents);

  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
  const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
  const fileUrl = pathToFileURL(indexPath).toString();
  const target = isCapture ? fileUrl : (app.isPackaged ? fileUrl : devUrl);

  win.loadURL(target);
  win.webContents.on('did-fail-load', (_event, errorCode) => {
    if (errorCode !== -3) setTimeout(() => win.reload(), 500);
  });
  win.webContents.on('render-process-gone', () => {
    if (!win.isDestroyed()) setTimeout(() => win.reload(), 500);
  });
  if (app.isPackaged) {
    win.webContents.on('devtools-opened', () => win.webContents.closeDevTools());
    win.webContents.closeDevTools();
  }
  win.once('ready-to-show', async () => {
    win.show();
    if (isCapture) {
      const previewDir = path.resolve(argumentValue('--capture-output') || path.join(__dirname, '..', 'preview'));
      fs.mkdirSync(previewDir, { recursive: true });
      for (const preview of previewSpecs) {
        win.setSize(preview.width, preview.height);
        await win.loadURL(`${target}?preview=${preview.query}`);
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (preview.scrollBottom) {
          await win.webContents.executeJavaScript("document.querySelector('.page-content')?.scrollTo({top: document.querySelector('.page-content')?.scrollHeight ?? 0, behavior:'auto'})");
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        const image = await win.webContents.capturePage();
        fs.writeFileSync(path.join(previewDir, `${preview.name}.png`), image.toPNG());
      }
      app.quit();
    }
  });

  return win;
}

let realAiRuntime;
let catalogManagementRuntime;

app.whenReady().then(async () => {
  if (isCatalogUiMatchSmoke) {
    const { JsonProductRepository } = require('./real-ai/catalog/runtime/catalog-runtime.cjs');
    const { MatchEngine } = require('./real-ai/matching/runtime/matching-runtime.cjs');
    try {
      const repository = new JsonProductRepository(path.join(app.getPath('userData'), 'real-ai', 'product-catalog'));
      await repository.initialize();
      const output = await new MatchEngine({ repository }).match({
        extractedProduct: {
          schemaVersion: '1.0', id: 'catalog-ui-packaged-match', productName: '自动喷涂设备标准方案', model: 'SP-3000',
          specifications: {}, quantity: { schemaVersion: '1.0', value: 1, unit: '套', raw: '1套' },
          material: null, process: null, application: '五金配件', notes: [], sourceFile: 'packaged-smoke.xlsx',
          sourceLocations: [], evidence: [], confidence: 1, fieldConfidence: {}, needsHumanReview: false, conflicts: [], reviewReasons: [],
        },
      });
      const outputPath = argumentValue('--catalog-ui-match-output');
      if (!outputPath) throw new Error('CATALOG_UI_MATCH_OUTPUT_REQUIRED');
      fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
      fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify({
        schemaVersion: '1.0', packaged: app.isPackaged, catalogVersion: output.results[0]?.catalogVersion ?? null,
        candidateProductId: output.results[0]?.candidateProductId ?? null, candidateModel: output.results[0]?.candidateProductSnapshot?.model ?? null,
        level: output.results[0]?.level ?? 'none', needsHumanReview: output.results[0]?.needsHumanReview ?? true,
      }, null, 2)}\n`);
      app.exit(0);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      app.exit(1);
    }
    return;
  }
  if (isRealAiPipelineSmoke) {
    const { runFullPipelineSmoke, runOcrOnlySmoke, runNoCatalogSmoke, runNoKeySmoke, runCancellationSmoke } = require('./real-ai/pipeline/smoke/run-full-pipeline-smoke.cjs');
    realAiRuntime = await createRealAiRuntime({ app, ipcMain, dialog });
    try {
      const smokeOptions = {
        runtime: realAiRuntime,
        fixtureRoot: path.resolve(argumentValue('--pipeline-fixture-root') || 'src/real-ai/fixtures'),
        catalogFixture: path.resolve(argumentValue('--pipeline-catalog-fixture') || 'src/real-ai/catalog/fixtures/standard-product-catalog.xlsx'),
        outputPath: path.resolve(argumentValue('--pipeline-smoke-output') || 'src/real-ai/pipeline/tests/results/windows-packaged-e2e-r1.json'),
        packaged: app.isPackaged,
        appVersion: app.getVersion(),
      };
      const smokeCase = argumentValue('--pipeline-smoke-case');
      if (smokeCase === 'ocr-only') await runOcrOnlySmoke(smokeOptions);
      else if (smokeCase === 'empty-catalog') await runNoCatalogSmoke(smokeOptions);
      else if (smokeCase === 'missing-key') await runNoKeySmoke(smokeOptions);
      else if (smokeCase === 'cancel') await runCancellationSmoke(smokeOptions);
      else await runFullPipelineSmoke(smokeOptions);
      await realAiRuntime.dispose();
      app.exit(0);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      await realAiRuntime?.dispose().catch(() => undefined);
      app.exit(1);
    }
    return;
  }
  if (isRealAiCatalogSmoke) {
    const { runCatalogSmoke } = require('./real-ai/catalog/smoke/run-catalog-smoke.cjs');
    try {
      await runCatalogSmoke({
        app,
        phase: argumentValue('--catalog-smoke-phase') || '1',
        fixtureRoot: path.resolve(argumentValue('--catalog-fixture-root') || 'src/real-ai/catalog/fixtures'),
        outputPath: path.resolve(argumentValue('--catalog-smoke-output') || 'src/real-ai/catalog/tests/results/catalog-smoke.json'),
      });
      app.exit(0);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      app.exit(1);
    }
    return;
  }

  if (isRealAiSmoke) {
    const fixtureRoot = path.resolve(argumentValue('--fixture-root') || 'src/real-ai/fixtures');
    const outputPath = path.resolve(argumentValue('--smoke-output') || 'src/real-ai/tests/results/electron-smoke.json');
    const selections = [
      path.join(fixtureRoot, 'pdf', 'native-text', 'input.pdf'),
      path.join(fixtureRoot, 'docx', 'structured-content', 'input.docx'),
      path.join(fixtureRoot, 'excel', 'normal-products', 'input.xlsx'),
      path.join(fixtureRoot, 'images', 'product-list', 'input.png'),
      path.join(fixtureRoot, 'pdf', 'scanned', 'input.pdf'),
      path.join(fixtureRoot, 'errors', 'corrupted-pdf', 'input.pdf'),
    ];
    realAiRuntime = await createRealAiRuntime({
      app,
      ipcMain,
      dialog,
      filePicker: async () => selections.length ? [selections.shift()] : [],
    });
    try {
      await runElectronSmoke({ BrowserWindow, runtime: realAiRuntime, outputPath });
      app.exit(0);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      app.exit(1);
    }
    return;
  }

  const uiSmokeFixture = argumentValue('--real-ai-ui-smoke-fixture');
  realAiRuntime = await createRealAiRuntime({
    app,
    ipcMain,
    dialog,
    filePicker: uiSmokeFixture
      ? async () => uiSmokeFixture.split('|').filter(Boolean).map((fixture) => path.resolve(fixture))
      : undefined,
  });
  const catalogImportFixture = argumentValue('--catalog-ui-import-fixture');
  const catalogTemplateOutput = argumentValue('--catalog-ui-template-output');
  catalogManagementRuntime = await createCatalogManagementRuntime({
    app,
    ipcMain,
    dialog,
    importFilePicker: catalogImportFixture ? async () => [path.resolve(catalogImportFixture)] : undefined,
    templateSavePicker: catalogTemplateOutput ? async () => path.resolve(catalogTemplateOutput) : undefined,
  });
  createWindow(realAiRuntime, catalogManagementRuntime);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(realAiRuntime, catalogManagementRuntime);
  });
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  realAiRuntime?.dispose().catch(() => undefined);
  catalogManagementRuntime?.dispose().catch(() => undefined);
});
