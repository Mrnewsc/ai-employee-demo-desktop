const path = require('node:path');
const { fileURLToPath } = require('node:url');
const channels = require('./channels.cjs');
const { normalizeError } = require('../errors.cjs');
const { FileIdsRequestSchema, validate } = require('../runtime-schemas.cjs');

function isPathInside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function registerRealAiIpc({
  ipcMain,
  dialog,
  stagingService,
  jobManager,
  pipelineManager,
  allowedSenderIds,
  allowedFileRoots,
  devOrigin = 'http://127.0.0.1:5173',
  filePicker,
}) {
  const registeredChannels = [];

  function assertSender(event) {
    if (!allowedSenderIds.has(event.sender.id)) {
      const error = new Error('IPC发送方未授权');
      error.code = 'INVALID_REQUEST';
      throw error;
    }
    const senderUrl = event.senderFrame?.url || event.sender.getURL();
    if (senderUrl.startsWith(devOrigin)) return;
    if (senderUrl.startsWith('file:')) {
      let senderPath;
      try {
        senderPath = fileURLToPath(senderUrl.split(/[?#]/, 1)[0]);
      } catch {
        senderPath = '';
      }
      if (senderPath && allowedFileRoots.some((root) => isPathInside(senderPath, root))) return;
    }
    const error = new Error('IPC来源页面不受信任');
    error.code = 'INVALID_REQUEST';
    throw error;
  }

  function handle(channel, handler) {
    ipcMain.handle(channel, async (event, payload) => {
      try {
        assertSender(event);
        return { ok: true, data: await handler(event, payload) };
      } catch (error) {
        return { ok: false, error: normalizeError(error) };
      }
    });
    registeredChannels.push(channel);
  }

  handle(channels.FILES_SELECT, async () => {
    const sourcePaths = filePicker
      ? await filePicker()
      : (await dialog.showOpenDialog({
          title: '选择客户资料',
          properties: ['openFile', 'multiSelections'],
          filters: [
            { name: '客户资料', extensions: ['pdf', 'docx', 'xlsx', 'xls', 'jpg', 'jpeg', 'png'] },
          ],
        })).filePaths;
    if (!sourcePaths?.length) return [];
    return stagingService.stagePathEntries(sourcePaths.map((sourcePath) => ({
      sourcePath,
      displayName: path.basename(sourcePath),
      declaredMimeType: '',
    })));
  });
  handle(channels.FILES_STAGE, (_event, payload) => stagingService.stagePathEntries(payload));
  handle(channels.FILES_CLEANUP, async (_event, payload) => {
    const { fileIds } = validate(FileIdsRequestSchema, payload, '清理文件请求');
    await stagingService.cleanup(fileIds);
    return { schemaVersion: '1.0', cleaned: fileIds.length };
  });
  handle(channels.ANALYSIS_START, (_event, payload) => jobManager.start(payload));
  handle(channels.ANALYSIS_CANCEL, (_event, payload) => jobManager.cancel(payload));
  handle(channels.ANALYSIS_STATUS, (_event, payload) => jobManager.status(payload));
  handle(channels.ANALYSIS_CLEANUP, (_event, payload) => jobManager.cleanup(payload));
  handle(channels.PIPELINE_START, (_event, payload) => pipelineManager.start(payload));
  handle(channels.PIPELINE_CANCEL, (_event, payload) => pipelineManager.cancel(payload));
  handle(channels.PIPELINE_STATUS, (_event, payload) => pipelineManager.status(payload));
  handle(channels.PIPELINE_RETRY, (_event, payload) => pipelineManager.retry(payload));
  handle(channels.PIPELINE_RESUME, (_event, payload) => pipelineManager.resume(payload));
  handle(channels.PIPELINE_CATALOG_STATUS, () => pipelineManager.catalogStatus());

  const progressListener = (snapshot) => {
    for (const id of allowedSenderIds) {
      const target = require('electron').webContents.fromId(id);
      if (target && !target.isDestroyed()) target.send(channels.ANALYSIS_PROGRESS, snapshot);
    }
  };
  jobManager.on('progress', progressListener);
  const pipelineProgressListener = (snapshot) => {
    for (const id of allowedSenderIds) {
      const target = require('electron').webContents.fromId(id);
      if (target && !target.isDestroyed()) target.send(channels.PIPELINE_PROGRESS, snapshot);
    }
  };
  pipelineManager.on('progress', pipelineProgressListener);

  return () => {
    jobManager.off('progress', progressListener);
    pipelineManager.off('progress', pipelineProgressListener);
    for (const channel of registeredChannels) ipcMain.removeHandler(channel);
  };
}

module.exports = { registerRealAiIpc };
