const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const isCapture = process.argv.includes('--capture-previews');
const previewNames = ['dashboard', 'content-generator', 'ai-reception', 'roi-calculator'];
if (!app.isPackaged && process.env.ELECTRON_REMOTE_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.ELECTRON_REMOTE_DEBUG_PORT);
}

function createWindow() {
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
    },
  });

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
      const previewDir = path.join(__dirname, '..', 'preview');
      fs.mkdirSync(previewDir, { recursive: true });
      for (const name of previewNames) {
        await win.loadURL(`${target}?preview=${name}`);
        await new Promise((resolve) => setTimeout(resolve, 500));
        const image = await win.webContents.capturePage();
        fs.writeFileSync(path.join(previewDir, `${name}.png`), image.toPNG());
      }
      app.quit();
    }
  });

  return win;
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
