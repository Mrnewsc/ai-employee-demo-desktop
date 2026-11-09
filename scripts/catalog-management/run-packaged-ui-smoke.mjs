import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const executablePath = path.resolve('release', 'win-unpacked', '数员科技 AI数字员工.exe');
const runId = `${Date.now()}-${process.pid}`;
const userData = path.resolve('.tmp', `catalog-ui-packaged-${runId}`);
const evidenceRoot = path.resolve('preview', 'product-catalog-ui');
const resultRoot = path.resolve('electron', 'catalog-management', 'tests', 'results');
const templateOutput = path.join(resultRoot, 'packaged-downloaded-template.xlsx');
const reportPath = path.join(resultRoot, 'windows-packaged-ui-smoke.json');
const matchOutput = path.join(resultRoot, 'windows-packaged-match-smoke.json');
const fixtures = {
  v1: path.resolve('src', 'real-ai', 'catalog', 'fixtures', 'standard-product-catalog.xlsx'),
  invalid: path.resolve('src', 'real-ai', 'catalog', 'fixtures', 'invalid-products.xlsx'),
  v2: path.resolve('src', 'real-ai', 'catalog', 'fixtures', 'standard-product-catalog-v2.xlsx'),
};

class CdpClient {
  constructor(url) { this.url = url; this.id = 1; this.pending = new Map(); this.events = []; }
  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('CDP_CONNECT_TIMEOUT')), 15000);
      this.socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
      this.socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('CDP_CONNECT_FAILED')); }, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) { this.events.push(message); return; }
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
    });
  }
  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); });
  }
  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'CDP_EVALUATION_FAILED');
    return response.result?.value;
  }
  close() { this.socket?.close(); }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(action, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try { const value = await action(); if (value) return value; } catch (error) { last = error; }
    await sleep(180);
  }
  throw new Error(`${label}_TIMEOUT${last ? `: ${last.message}` : ''}`);
}

async function pageTarget(port) {
  return waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json`);
    if (!response.ok) return null;
    return (await response.json()).find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  }, 'CDP_PAGE', 20000);
}

function clickText(text, selector = 'button') {
  return `(() => { const node=[...document.querySelectorAll(${JSON.stringify(selector)})].find(x=>x.textContent?.includes(${JSON.stringify(text)})); if(!node)return false; node.scrollIntoView({block:'center'}); node.click(); return true; })()`;
}

function stopProcess(pid) {
  if (pid) spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
}

async function capture(cdp, name, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await sleep(150);
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const filePath = path.join(evidenceRoot, name);
  await writeFile(filePath, Buffer.from(result.data, 'base64'));
  return path.relative(process.cwd(), filePath).replaceAll('\\', '/');
}

async function captureClip(cdp, name, clip) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip });
  const filePath = path.join(evidenceRoot, name);
  await writeFile(filePath, Buffer.from(result.data, 'base64'));
  return path.relative(process.cwd(), filePath).replaceAll('\\', '/');
}

async function runUiSession({ phase, fixture, port, action }) {
  const args = [
    `--remote-debugging-port=${port}`,
    `--catalog-ui-user-data=${userData}`,
    `--catalog-ui-template-output=${templateOutput}`,
  ];
  if (fixture) args.push(`--catalog-ui-import-fixture=${fixture}`);
  const child = spawn(executablePath, args, { cwd: process.cwd(), windowsHide: true, stdio: 'ignore' });
  let cdp;
  try {
    const target = await pageTarget(port);
    cdp = new CdpClient(target.webSocketDebuggerUrl);
    await cdp.connect();
    await Promise.all([cdp.send('Runtime.enable'), cdp.send('Page.enable'), cdp.send('Log.enable')]);
    await cdp.evaluate(`location.href = location.pathname + '?preview=product-catalog'`);
    await waitFor(() => cdp.evaluate(`document.body?.innerText.includes('企业产品目录')`), `${phase}_CATALOG_PAGE`);
    const result = await action(cdp);
    const errors = cdp.events.filter((event) => event.method === 'Runtime.exceptionThrown' || (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error'));
    if (errors.length) throw new Error(`${phase}_RENDERER_ERRORS_${errors.length}`);
    return { phase, passed: true, ...result, rendererErrorCount: 0 };
  } finally {
    cdp?.close();
    stopProcess(child.pid);
    await sleep(450);
  }
}

async function clickImport(cdp) {
  if (!await cdp.evaluate(clickText('导入产品库'))) throw new Error('IMPORT_BUTTON_MISSING');
  await waitFor(() => cdp.evaluate(`document.body.innerText.includes('选择 Excel 产品库')`), 'IMPORT_DRAWER');
  if (!await cdp.evaluate(clickText('选择 Excel 产品库'))) throw new Error('FILE_BUTTON_MISSING');
}

await Promise.all([access(executablePath), ...Object.values(fixtures).map(access)]);
await mkdir(userData, { recursive: true });
await mkdir(evidenceRoot, { recursive: true });
await mkdir(resultRoot, { recursive: true });

const evidence = [];
const phases = [];

phases.push(await runUiSession({ phase: 'initial-import', fixture: fixtures.v1, port: 9441, action: async (cdp) => {
  evidence.push(await capture(cdp, '01-empty-1366x768.png', 1366, 768));
  evidence.push(await captureClip(cdp, '11-brand-header-2x.png', { x: 0, y: 0, width: 248, height: 96, scale: 2 }));
  if (!await cdp.evaluate(clickText('下载标准模板'))) throw new Error('TEMPLATE_BUTTON_MISSING');
  await waitFor(async () => { try { return (await stat(templateOutput)).size > 0; } catch { return false; } }, 'TEMPLATE_SAVED');
  await clickImport(cdp);
  await waitFor(() => cdp.evaluate(`document.body.innerText.includes('预览校验通过')`), 'VALID_PREVIEW', 60000);
  evidence.push(await capture(cdp, '03-import-preview-collapsed-1366x768.png', 1366, 768));
  if (!await cdp.evaluate(clickText('查看字段映射'))) throw new Error('MAPPING_TOGGLE_MISSING');
  await waitFor(() => cdp.evaluate(`Boolean(document.querySelector('.catalog-mapping-list.full'))`), 'MAPPING_EXPANDED');
  evidence.push(await capture(cdp, '04-import-preview-expanded-1366x768.png', 1366, 768));
  if (!await cdp.evaluate(clickText('进入确认'))) throw new Error('CONFIRM_STAGE_BUTTON_MISSING');
  if (!await cdp.evaluate(clickText('确认并更新'))) throw new Error('COMMIT_BUTTON_MISSING');
  await waitFor(() => cdp.evaluate(`document.body.innerText.includes('产品库更新完成')`), 'IMPORT_COMPLETED', 60000);
  evidence.push(await capture(cdp, '05-import-success-1366x768.png', 1366, 768));
  if (!await cdp.evaluate(clickText('查看产品库'))) throw new Error('VIEW_CATALOG_BUTTON_MISSING');
  await waitFor(() => cdp.evaluate(`document.body.innerText.includes('SP-3000') && document.body.innerText.includes('V1')`), 'V1_LIST');
  await sleep(3200);
  evidence.push(await capture(cdp, '02-product-list-1366x768.png', 1366, 768));
  const searchState = await cdp.evaluate(`(() => { const input=document.querySelector('.catalog-search input'); if(!input)return false; const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'SP-3000'); input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
  if (!searchState) throw new Error('SEARCH_INPUT_MISSING');
  await waitFor(() => cdp.evaluate(`[...document.querySelectorAll('.catalog-product-row')].some(row=>row.textContent?.includes('SP-3000'))`), 'SEARCH_RESULT');
  if (!await cdp.evaluate(`(() => { const row=[...document.querySelectorAll('.catalog-product-row')].find(item=>item.textContent?.includes('SP-3000')); if(!row)return false; row.click(); return true; })()`)) throw new Error('PRODUCT_ROW_MISSING');
  await waitFor(() => cdp.evaluate(`Boolean(document.querySelector('.catalog-detail-drawer'))`), 'PRODUCT_DETAIL');
  evidence.push(await capture(cdp, '07-product-detail-1366x768.png', 1366, 768));
  return { catalogVersion: 1, templateSaved: true, search: 'SP-3000', detailOpened: true };
} }));

phases.push(await runUiSession({ phase: 'invalid-import', fixture: fixtures.invalid, port: 9442, action: async (cdp) => {
  await waitFor(() => cdp.evaluate(`document.body.innerText.includes('V1') && document.body.innerText.includes('24')`), 'PERSISTED_V1');
  await clickImport(cdp);
  await waitFor(() => cdp.evaluate(`document.body.innerText.includes('正式导入已锁定')`), 'INVALID_PREVIEW', 60000);
  const commitDisabled = await cdp.evaluate(`(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('进入确认')); return Boolean(b?.disabled); })()`);
  if (!commitDisabled) throw new Error('INVALID_IMPORT_NOT_BLOCKED');
  evidence.push(await capture(cdp, '06-error-rows-1366x768.png', 1366, 768));
  return { currentVersionUnchanged: 1, invalidCommitBlocked: true };
} }));

phases.push(await runUiSession({ phase: 'v2-and-rollback', fixture: fixtures.v2, port: 9443, action: async (cdp) => {
  await clickImport(cdp);
  await waitFor(() => cdp.evaluate(`document.body.innerText.includes('预览校验通过')`), 'V2_PREVIEW', 60000);
  await cdp.evaluate(clickText('进入确认'));
  await cdp.evaluate(clickText('确认并更新'));
  await waitFor(() => cdp.evaluate(`document.body.innerText.includes('新版本') && document.body.innerText.includes('V2')`), 'V2_COMMITTED', 60000);
  await cdp.evaluate(clickText('查看产品库'));
  await waitFor(() => cdp.evaluate(`document.body.innerText.includes('V2')`), 'V2_LIST');
  if (!await cdp.evaluate(clickText('版本记录'))) throw new Error('VERSIONS_BUTTON_MISSING');
  await waitFor(() => cdp.evaluate(`document.querySelector('.catalog-version-drawer')?.innerText.includes('V2') && document.querySelector('.catalog-version-drawer')?.innerText.includes('V1')`), 'VERSION_HISTORY');
  evidence.push(await capture(cdp, '08-version-history-1366x768.png', 1366, 768));
  if (!await cdp.evaluate(clickText('回滚至此'))) throw new Error('ROLLBACK_BUTTON_MISSING');
  await waitFor(() => cdp.evaluate(`document.body.innerText.includes('确认回滚至 V1')`), 'ROLLBACK_CONFIRM');
  evidence.push(await capture(cdp, '09-rollback-confirm-1366x768.png', 1366, 768));
  if (!await cdp.evaluate(clickText('确认回滚'))) throw new Error('ROLLBACK_CONFIRM_BUTTON_MISSING');
  await waitFor(() => cdp.evaluate(`document.querySelector('.catalog-version-drawer')?.innerText.includes('V3 · 当前版本')`), 'ROLLBACK_V3', 60000);
  await cdp.evaluate(`document.querySelector('.catalog-version-drawer .top-icon')?.click(); true`);
  await waitFor(() => cdp.evaluate(`!document.querySelector('.catalog-version-drawer') && document.body.innerText.includes('V3')`), 'ROLLBACK_REFRESH');
  return { importedVersion: 2, rollbackCreatedVersion: 3, restoredFromVersion: 1 };
} }));

phases.push(await runUiSession({ phase: 'restart-persistence', fixture: null, port: 9444, action: async (cdp) => {
  await waitFor(() => cdp.evaluate(`document.body.innerText.includes('V3') && document.body.innerText.includes('SP-3000')`), 'RESTART_PERSISTENCE');
  evidence.push(await capture(cdp, '10-product-list-1440x900.png', 1440, 900));
  const text = await cdp.evaluate(`document.body.innerText`);
  return { catalogVersion: 3, productVisible: text.includes('SP-3000'), productCountVisible: text.includes('24') };
} }));

const matchRun = spawnSync(executablePath, [
  '--catalog-ui-match-smoke',
  `--catalog-ui-user-data=${userData}`,
  `--catalog-ui-match-output=${matchOutput}`,
], { cwd: process.cwd(), windowsHide: true, encoding: 'utf8' });
if (matchRun.status !== 0) throw new Error(`PACKAGED_MATCH_FAILED: ${matchRun.stderr || matchRun.stdout}`);
const match = JSON.parse(await readFile(matchOutput, 'utf8'));
if (!match.packaged || match.catalogVersion !== 3 || match.candidateModel !== 'SP-3000') throw new Error('PACKAGED_MATCH_RESULT_INVALID');

const templateBytes = await readFile(templateOutput);
const templateWorkbook = await import('xlsx').then((module) => module.default.read(templateBytes));
const report = {
  schemaVersion: '1.0',
  executedAt: new Date().toISOString(),
  executable: path.relative(process.cwd(), executablePath).replaceAll('\\', '/'),
  userDataIsolated: true,
  phases,
  evidence,
  template: { saved: true, fileName: path.basename(templateOutput), standardXlsx: templateWorkbook.SheetNames.length > 0 },
  packagedMatch: match,
  passed: phases.every((phase) => phase.passed) && match.catalogVersion === 3,
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`Catalog packaged UI smoke passed: ${reportPath}\n`);
