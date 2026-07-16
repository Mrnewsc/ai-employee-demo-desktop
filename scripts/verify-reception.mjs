const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const targets = await fetch('http://127.0.0.1:9222/json/list').then((response) => response.json());
const target = targets.find((item) => item.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('未找到 Electron 渲染页面的调试目标');

const socket = new WebSocket(target.webSocketDebuggerUrl);
let sequence = 0;
const pending = new Map();
const consoleErrors = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') consoleErrors.push(message.params.exceptionDetails?.text || 'Runtime exception');
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') consoleErrors.push(message.params.entry.text || 'Console error');
  const resolve = pending.get(message.id);
  if (resolve) {
    pending.delete(message.id);
    resolve(message);
  }
});
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
const command = (method, params = {}) => new Promise((resolve) => {
  const id = ++sequence;
  pending.set(id, resolve);
  socket.send(JSON.stringify({ id, method, params }));
});

await command('Runtime.enable');
await command('Log.enable');

const evaluate = async (expression) => {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || '页面脚本执行失败');
  return result.result?.result?.value;
};

const waitFor = async (expression, timeout = 10000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression)) return true;
    await sleep(150);
  }
  return false;
};

const report = (label, pass, detail = '') => console.log(`${pass ? 'PASS' : 'FAIL'} | ${label}${detail ? ` | ${detail}` : ''}`);

report('Electron渲染页面已挂载', await waitFor(`document.querySelectorAll('.nav-item').length > 0`));
await evaluate(`[...document.querySelectorAll('.nav-item')].find((element) => element.innerText.includes('AI智能接待'))?.click()`);
report('AI智能接待页面可进入', await waitFor(`document.querySelector('h1')?.innerText === 'AI智能接待'`));
report('默认对话已加载', (await evaluate(`document.body.innerText.includes('你们的设备适合五金工厂吗？') && document.body.innerText.includes('每天大约3000件')`)) === true);
report('默认客户标记存在', (await evaluate(`document.body.innerText.includes('金华某五金制品厂（演示客户）') && !!document.querySelector('.demo-client-tag')`)) === true);

await evaluate(`[...document.querySelectorAll('.chat-contact')][1]?.click()`);
await sleep(150);
report('客户列表可以切换', (await evaluate(`document.querySelectorAll('.chat-contact')[1]?.classList.contains('active')`)) === true);
await evaluate(`[...document.querySelectorAll('.chat-contact')][0]?.click()`);

await evaluate(`[...document.querySelectorAll('.chip')].find((element) => element.innerText.includes('设备价格大概多少'))?.click()`);
await sleep(120);
report('快捷问题进入聊天区', (await evaluate(`document.body.innerText.includes('设备价格大概多少？')`)) === true);
report('AI正在输入状态显示', (await evaluate(`document.body.innerText.includes('AI员工正在输入')`)) === true);
const firstStreamLength = await evaluate(`([...document.querySelectorAll('.chat-message.ai')].at(-1)?.innerText || '').length`);
await sleep(650);
const secondStreamLength = await evaluate(`([...document.querySelectorAll('.chat-message.ai')].at(-1)?.innerText || '').length`);
report('AI回复逐字增长', secondStreamLength > firstStreamLength, `${firstStreamLength} -> ${secondStreamLength}`);
await sleep(2600);
report('专业问题触发人工提示', (await evaluate(`document.body.innerText.includes('该问题需要人工确认，建议转交销售或技术人员。')`)) === true);
report('转人工按钮突出显示', (await evaluate(`([...document.querySelectorAll('.chat-actions .btn')].find((element) => element.innerText.includes('转人工')))?.classList.contains('btn-primary')`)) === true);

const inputExpression = `(() => { const input = document.querySelector('.chat-input'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, '每天大约3000件'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`;
await evaluate(inputExpression);
await sleep(120);
report('输入框支持Enter发送', (await evaluate(`document.body.innerText.includes('每天大约3000件')`)) === true);
await sleep(2800);
report('客户画像日产量动态更新', (await evaluate(`document.body.innerText.includes('约3000件')`)) === true);
report('客户画像建议动作更新', (await evaluate(`document.body.innerText.includes('安排销售及技术人员沟通')`)) === true);

for (const label of ['生成跟进话术', '创建客户']) {
  await evaluate(`([...document.querySelectorAll('.chat-actions .btn')].find((element) => element.innerText.includes(${JSON.stringify(label)})))?.click()`);
  await sleep(80);
  report(`${label}按钮有反馈`, (await evaluate(`document.body.innerText.includes(${JSON.stringify(label.includes('生成') ? '已生成销售跟进话术' : '客户已创建到线索池')})`)) === true);
}
await evaluate(`([...document.querySelectorAll('.chat-actions .btn')].find((element) => element.innerText.includes('转人工')))?.click()`);
await sleep(80);
report('转人工按钮有反馈', (await evaluate(`document.body.innerText.includes('已转人工，销售及技术人员任务已生成')`)) === true);
report('渲染控制台无错误', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' / '));

socket.close();
