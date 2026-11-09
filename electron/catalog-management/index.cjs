const path = require('node:path');
const { createCatalogManagementServices } = require('./catalog-management-service.cjs');
const { registerCatalogManagementIpc } = require('./register-catalog-management-ipc.cjs');

async function createCatalogManagementRuntime({ app, ipcMain, dialog, importFilePicker, templateSavePicker }) {
  const templatePath = app.isPackaged
    ? path.join(process.resourcesPath, 'real-ai', 'templates', '企业产品库标准导入模板.xlsx')
    : path.join(__dirname, '..', '..', 'assets', 'templates', '企业产品库标准导入模板.xlsx');
  const services = await createCatalogManagementServices({ app, templatePath });
  const allowedSenderIds = new Set();
  const unregister = registerCatalogManagementIpc({
    ipcMain,
    dialog,
    stagingService: services.stagingService,
    managementService: services.managementService,
    allowedSenderIds,
    allowedFileRoots: [path.join(__dirname, '..', '..', 'dist')],
    importFilePicker,
    templateSavePicker,
  });
  return {
    ...services,
    authorize(webContents) {
      allowedSenderIds.add(webContents.id);
      webContents.once('destroyed', () => allowedSenderIds.delete(webContents.id));
    },
    async dispose() {
      unregister();
      await services.stagingService.dispose();
    },
  };
}

module.exports = { createCatalogManagementRuntime };
