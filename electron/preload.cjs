const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Sandboxed preload scripts cannot require arbitrary local modules.
const catalogChannels = Object.freeze({
  SELECT_IMPORT: 'catalog-management:select-import',
  SUMMARY: 'catalog-management:summary',
  LIST: 'catalog-management:list',
  DETAIL: 'catalog-management:detail',
  PREVIEW_IMPORT: 'catalog-management:preview-import',
  COMMIT_IMPORT: 'catalog-management:commit-import',
  DISCARD_IMPORT: 'catalog-management:discard-import',
  VERSIONS: 'catalog-management:versions',
  ROLLBACK: 'catalog-management:rollback',
  SAVE_TEMPLATE: 'catalog-management:save-template',
});

const channels = Object.freeze({
  FILES_SELECT: 'real-ai:files:select',
  FILES_STAGE: 'real-ai:files:stage',
  FILES_CLEANUP: 'real-ai:files:cleanup',
  ANALYSIS_START: 'real-ai:analysis:start',
  ANALYSIS_CANCEL: 'real-ai:analysis:cancel',
  ANALYSIS_STATUS: 'real-ai:analysis:status',
  ANALYSIS_CLEANUP: 'real-ai:analysis:cleanup',
  ANALYSIS_PROGRESS: 'real-ai:analysis:progress',
  PIPELINE_START: 'real-ai:pipeline:start',
  PIPELINE_CANCEL: 'real-ai:pipeline:cancel',
  PIPELINE_STATUS: 'real-ai:pipeline:status',
  PIPELINE_RETRY: 'real-ai:pipeline:retry',
  PIPELINE_RESUME: 'real-ai:pipeline:resume',
  PIPELINE_CATALOG_STATUS: 'real-ai:pipeline:catalog-status',
  PIPELINE_PROGRESS: 'real-ai:pipeline:progress',
});

async function invoke(channel, payload) {
  const envelope = await ipcRenderer.invoke(channel, payload);
  if (envelope?.ok) return envelope.data;
  throw Object.freeze({
    name: 'RealAIError',
    message: envelope?.error?.message || '后台文件分析请求失败',
    code: envelope?.error?.code || 'INTERNAL_PARSE_ERROR',
    retryable: Boolean(envelope?.error?.retryable),
  });
}

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
});

contextBridge.exposeInMainWorld('realAI', {
  files: {
    select: () => invoke(channels.FILES_SELECT),
    stage: (files) => {
      const entries = Array.from(files || []).map((file) => ({
        sourcePath: webUtils.getPathForFile(file),
        displayName: file.name,
        declaredMimeType: file.type || '',
      }));
      if (!entries.length || entries.some((entry) => !entry.sourcePath)) {
        return Promise.reject(new Error('请选择有效的本地文件'));
      }
      return invoke(channels.FILES_STAGE, entries);
    },
    cleanup: (fileIds) => invoke(channels.FILES_CLEANUP, { fileIds }),
  },
  analysis: {
    start: (fileIds) => invoke(channels.ANALYSIS_START, { fileIds }),
    cancel: (jobId) => invoke(channels.ANALYSIS_CANCEL, { jobId }),
    status: (jobId) => invoke(channels.ANALYSIS_STATUS, { jobId }),
    cleanup: (jobId) => invoke(channels.ANALYSIS_CLEANUP, { jobId }),
    onProgress: (listener) => {
      if (typeof listener !== 'function') throw new TypeError('listener必须是函数');
      const wrapped = (_event, snapshot) => listener(snapshot);
      ipcRenderer.on(channels.ANALYSIS_PROGRESS, wrapped);
      return () => ipcRenderer.removeListener(channels.ANALYSIS_PROGRESS, wrapped);
    },
  },
  pipeline: {
    start: (customerId, fileIds) => invoke(channels.PIPELINE_START, { customerId, fileIds }),
    cancel: (jobId) => invoke(channels.PIPELINE_CANCEL, { jobId }),
    status: (jobId) => invoke(channels.PIPELINE_STATUS, { jobId }),
    retry: (jobId) => invoke(channels.PIPELINE_RETRY, { jobId }),
    resume: (customerId) => invoke(channels.PIPELINE_RESUME, { customerId }),
    catalogStatus: () => invoke(channels.PIPELINE_CATALOG_STATUS),
    onProgress: (listener) => {
      if (typeof listener !== 'function') throw new TypeError('listener必须是函数');
      const wrapped = (_event, snapshot) => listener(snapshot);
      ipcRenderer.on(channels.PIPELINE_PROGRESS, wrapped);
      return () => ipcRenderer.removeListener(channels.PIPELINE_PROGRESS, wrapped);
    },
  },
});

contextBridge.exposeInMainWorld('catalogManagement', {
  selectImportFile: () => invoke(catalogChannels.SELECT_IMPORT),
  summary: () => invoke(catalogChannels.SUMMARY),
  list: (query) => invoke(catalogChannels.LIST, query),
  detail: (productId) => invoke(catalogChannels.DETAIL, { productId }),
  previewImport: (fileId) => invoke(catalogChannels.PREVIEW_IMPORT, { fileId }),
  commitImport: (importId) => invoke(catalogChannels.COMMIT_IMPORT, { importId }),
  discardImport: (importId) => invoke(catalogChannels.DISCARD_IMPORT, { importId }),
  versions: () => invoke(catalogChannels.VERSIONS),
  rollback: (targetVersion) => invoke(catalogChannels.ROLLBACK, { targetVersion }),
  saveTemplate: () => invoke(catalogChannels.SAVE_TEMPLATE),
});
