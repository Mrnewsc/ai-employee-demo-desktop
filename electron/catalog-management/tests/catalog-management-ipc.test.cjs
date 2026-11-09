const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { registerCatalogManagementIpc, safeError } = require('../register-catalog-management-ipc.cjs');
const channels = require('../channels.cjs');

function harness(overrides = {}) {
  const handlers = new Map();
  const ipcMain = { handle: (channel, callback) => handlers.set(channel, callback), removeHandler: (channel) => handlers.delete(channel) };
  const calls = [];
  const managementService = {
    summary: async () => ({ schemaVersion: '1.0', productCount: 0 }),
    listProducts: async (query) => (calls.push(query), { schemaVersion: '1.0', items: [] }),
    productDetail: async () => ({}), previewImport: async () => ({}), commitImport: async () => ({}),
    discardImport: () => ({}), versions: async () => ({}), rollback: async () => ({}), saveTemplate: async () => ({}),
    ...overrides,
  };
  const dispose = registerCatalogManagementIpc({
    ipcMain,
    dialog: {},
    stagingService: { stagePathEntries: async () => [] },
    managementService,
    allowedSenderIds: new Set([7]),
    allowedFileRoots: [path.resolve('dist')],
    importFilePicker: async () => [],
    templateSavePicker: async () => null,
  });
  const invoke = (channel, payload, senderId = 7, url = 'http://127.0.0.1:5173') => handlers.get(channel)({ sender: { id: senderId, getURL: () => url }, senderFrame: { url } }, payload);
  return { handlers, calls, invoke, dispose };
}

test('IPC只注册最小产品库能力并拒绝未授权发送方和无效参数', async () => {
  const value = harness();
  assert.equal(value.handlers.size, 10);
  const unauthorized = await value.invoke(channels.SUMMARY, {}, 99);
  assert.equal(unauthorized.ok, false);
  assert.equal(unauthorized.error.code, 'INVALID_REQUEST');
  const invalid = await value.invoke(channels.LIST, { search: '', status: 'bad' });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'INVALID_REQUEST');
  const valid = await value.invoke(channels.LIST, { search: 'SP', status: 'active', category: '', sort: 'name-asc', page: 1, pageSize: 20 });
  assert.equal(valid.ok, true);
  assert.equal(value.calls[0].search, 'SP');
  value.dispose();
  assert.equal(value.handlers.size, 0);
});

test('IPC错误不泄露Windows绝对路径并映射文件错误', () => {
  const result = safeError(Object.assign(new Error('读取 C:\\Users\\Boss\\Desktop\\机密\\产品.xlsx 失败'), { code: 'CATALOG_EXCEL_REQUIRED' }));
  assert.equal(result.code, 'CATALOG_IMPORT_INVALID_FILE');
  assert.equal(result.message.includes('C:\\Users'), false);
  assert.equal(result.message.includes('[本地路径]'), true);
});

