const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { z } = require('zod');
const channels = require('./channels.cjs');

const listSchema = z.object({
  search: z.string().max(100).default(''),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  category: z.string().max(100).default(''),
  sort: z.enum(['updated-desc', 'name-asc', 'model-asc']).default('updated-desc'),
  page: z.number().int().positive().max(100_000).default(1),
  pageSize: z.union([z.literal(20), z.literal(50), z.literal(100)]).default(20),
}).strict();
const productSchema = z.object({ productId: z.string().min(1).max(160) }).strict();
const importSchema = z.object({ fileId: z.string().regex(/^file_[a-f0-9-]{12,}$/) }).strict();
const importIdSchema = z.object({ importId: z.string().regex(/^import_[a-f0-9-]{12,}$/) }).strict();
const rollbackSchema = z.object({ targetVersion: z.number().int().positive() }).strict();

function safeError(error) {
  const allowed = new Set([
    'CATALOG_NOT_FOUND', 'CATALOG_EMPTY', 'CATALOG_IMPORT_INVALID_FILE',
    'CATALOG_IMPORT_VALIDATION_FAILED', 'CATALOG_WRITE_FAILED', 'CATALOG_VERSION_NOT_FOUND',
    'CATALOG_ROLLBACK_FAILED', 'CATALOG_BUSY', 'CATALOG_TEMPLATE_SAVE_FAILED', 'INVALID_REQUEST',
  ]);
  const importFileCodes = new Set(['CATALOG_EXCEL_REQUIRED', 'UNSUPPORTED_FILE_TYPE', 'FILE_SIGNATURE_MISMATCH', 'FILE_EMPTY', 'FILE_CORRUPTED', 'FILE_TOO_LARGE']);
  const sourceCode = importFileCodes.has(error?.code) ? 'CATALOG_IMPORT_INVALID_FILE' : error?.code;
  const code = allowed.has(sourceCode) ? sourceCode : 'CATALOG_WRITE_FAILED';
  const message = String(error?.message || '企业产品库操作失败')
    .replace(/[A-Za-z]:\\[^\s"']+/g, '[本地路径]')
    .replace(/file:\/\/\/[^\s"']+/g, '[本地路径]')
    .slice(0, 500);
  return { schemaVersion: '1.0', code, message, retryable: ['CATALOG_BUSY', 'CATALOG_WRITE_FAILED'].includes(code) };
}

function validate(schema, payload) {
  const result = schema.safeParse(payload ?? {});
  if (result.success) return result.data;
  const error = new Error('企业产品库请求参数无效');
  error.code = 'INVALID_REQUEST';
  throw error;
}

function isPathInside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function registerCatalogManagementIpc({ ipcMain, dialog, stagingService, managementService, allowedSenderIds, allowedFileRoots, importFilePicker, templateSavePicker, devOrigin = 'http://127.0.0.1:5173' }) {
  const registered = [];
  const assertSender = (event) => {
    if (!allowedSenderIds.has(event.sender.id)) throw Object.assign(new Error('IPC发送方未授权'), { code: 'INVALID_REQUEST' });
    const senderUrl = event.senderFrame?.url || event.sender.getURL();
    if (senderUrl.startsWith(devOrigin)) return;
    if (senderUrl.startsWith('file:')) {
      let senderPath = '';
      try { senderPath = fileURLToPath(senderUrl.split(/[?#]/, 1)[0]); } catch {}
      if (senderPath && allowedFileRoots.some((root) => isPathInside(senderPath, root))) return;
    }
    throw Object.assign(new Error('IPC来源页面不受信任'), { code: 'INVALID_REQUEST' });
  };
  const handle = (channel, callback) => {
    ipcMain.handle(channel, async (event, payload) => {
      try {
        assertSender(event);
        return { ok: true, data: await callback(payload) };
      } catch (error) {
        return { ok: false, error: safeError(error) };
      }
    });
    registered.push(channel);
  };

  handle(channels.SELECT_IMPORT, async () => {
    const selected = importFilePicker
      ? await importFilePicker()
      : (await dialog.showOpenDialog({ title: '选择企业产品库', properties: ['openFile'], filters: [{ name: 'Excel产品库', extensions: ['xlsx', 'xls'] }] })).filePaths;
    if (!selected?.length) return null;
    const [token] = await stagingService.stagePathEntries([{ sourcePath: selected[0], displayName: path.basename(selected[0]), declaredMimeType: '' }]);
    return token;
  });
  handle(channels.SUMMARY, () => managementService.summary());
  handle(channels.LIST, (payload) => managementService.listProducts(validate(listSchema, payload)));
  handle(channels.DETAIL, (payload) => managementService.productDetail(validate(productSchema, payload).productId));
  handle(channels.PREVIEW_IMPORT, (payload) => managementService.previewImport(validate(importSchema, payload).fileId));
  handle(channels.COMMIT_IMPORT, (payload) => managementService.commitImport(validate(importIdSchema, payload).importId));
  handle(channels.DISCARD_IMPORT, (payload) => managementService.discardImport(validate(importIdSchema, payload).importId));
  handle(channels.VERSIONS, () => managementService.versions());
  handle(channels.ROLLBACK, (payload) => managementService.rollback(validate(rollbackSchema, payload).targetVersion));
  handle(channels.SAVE_TEMPLATE, async () => {
    const destination = templateSavePicker
      ? await templateSavePicker()
      : (await dialog.showSaveDialog({ title: '保存企业产品库标准模板', defaultPath: '企业产品库标准导入模板.xlsx', filters: [{ name: 'Excel工作簿', extensions: ['xlsx'] }] })).filePath;
    if (!destination) return { schemaVersion: '1.0', saved: false, fileName: null };
    return managementService.saveTemplate(destination);
  });
  return () => registered.forEach((channel) => ipcMain.removeHandler(channel));
}

module.exports = { registerCatalogManagementIpc, safeError };
