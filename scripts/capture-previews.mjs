import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();
const previewDir = path.join(root, 'preview');
const viteCommand = process.platform === 'win32' ? path.join(root, 'node_modules', '.bin', 'vite.cmd') : path.join(root, 'node_modules', '.bin', 'vite');
const candidates = process.platform === 'win32'
  ? [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean)
  : [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
const browser = candidates.find((candidate) => fs.existsSync(candidate));

if (!browser) throw new Error('未找到 Chrome 或 Edge，请设置 CHROME_PATH 后重试。');

fs.mkdirSync(previewDir, { recursive: true });
const server = spawn(viteCommand, ['preview', '--host', '127.0.0.1', '--port', '4173'], { cwd: root, stdio: 'ignore', shell: true });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  await wait(1200);
  for (const name of ['dashboard', 'content-generator', 'ai-reception', 'roi-calculator']) {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-demo-preview-'));
    const output = path.join(previewDir, `${name}.png`);
    const url = `http://127.0.0.1:4173/?preview=${name}`;
    const result = spawnSync(browser, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox', '--force-device-scale-factor=1',
      '--window-size=1440,900', '--virtual-time-budget=1800', `--user-data-dir=${userDataDir}`, `--screenshot=${output}`, url,
    ], { cwd: root, stdio: 'inherit', windowsHide: true });
    if (result.status !== 0) throw new Error(`生成 ${name}.png 失败，退出码 ${result.status}`);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
  console.log('预览图已生成：preview/dashboard.png, preview/content-generator.png, preview/ai-reception.png, preview/roi-calculator.png');
} finally {
  server.kill();
}
