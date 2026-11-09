const fs = require('node:fs/promises');
const path = require('node:path');
const { FileStagingService } = require('../../file-staging-service.cjs');
const {
  JsonProductRepository,
  ProductCatalogService,
} = require('../runtime/catalog-runtime.cjs');

async function stageExcel(stagingService, filePath) {
  const [token] = await stagingService.stagePathEntries([{
    sourcePath: filePath,
    displayName: path.basename(filePath),
    declaredMimeType: '',
  }]);
  return token.fileId;
}

async function readExistingReport(outputPath) {
  try {
    return JSON.parse(await fs.readFile(outputPath, 'utf8'));
  } catch {
    return { schemaVersion: '1.0', passed: false, phases: {} };
  }
}

async function runCatalogSmoke({ app, fixtureRoot, outputPath, phase }) {
  const userDataPath = app.getPath('userData');
  const catalogRoot = path.join(userDataPath, 'real-ai', 'product-catalog');
  const stagingRoot = path.join(app.getPath('temp'), `shuyuan-catalog-smoke-${process.pid}`, 'staged');
  const stagingService = new FileStagingService({ stagingRoot });
  await stagingService.initialize();
  const repository = new JsonProductRepository(catalogRoot);
  const service = new ProductCatalogService(repository, stagingService, 'packaged-smoke-catalog');
  await service.initialize();

  const existing = await readExistingReport(outputPath);
  try {
    if (phase === '1') {
      const fileId = await stageExcel(stagingService, path.join(fixtureRoot, 'standard-product-catalog.xlsx'));
      const preview = await service.previewImport(fileId);
      const committed = await service.confirmImport(preview.importId);
      const product = (await service.findByNormalizedModel('SP-3000'))[0];
      existing.phases.phase1 = {
        previewStatus: preview.status,
        importedRows: preview.previewRecords.length,
        currentVersion: committed.version.currentVersion,
        productId: product?.productId,
      };
    } else if (phase === '2') {
      const reopenedVersion = await service.getVersionInfo();
      const reopenedProduct = (await service.findByNormalizedModel('SP 3000'))[0];
      const fileId = await stageExcel(stagingService, path.join(fixtureRoot, 'standard-product-catalog-v2.xlsx'));
      const preview = await service.previewImport(fileId);
      const committed = await service.confirmImport(preview.importId);
      const changedDescription = (await service.getById('JG-SP-3000'))?.description ?? '';
      const rolledBack = await service.rollbackPrevious();
      const restoredDescription = (await service.getById('JG-SP-3000'))?.description ?? '';
      existing.phases.phase2 = {
        reopenedVersion: reopenedVersion.currentVersion,
        reopenedProductId: reopenedProduct?.productId,
        importedVersion: committed.version.currentVersion,
        changedContentObserved: changedDescription.includes('V2内部测试变更'),
        rollbackVersion: rolledBack.currentVersion,
        restoredContent: !restoredDescription.includes('V2内部测试变更'),
      };
    } else {
      throw new Error('未知产品库Smoke阶段');
    }

    const versions = await repository.listStoredVersions();
    const finalInfo = await service.getVersionInfo();
    existing.schemaVersion = '1.0';
    existing.packaged = app.isPackaged;
    existing.userDataIsolation = path.resolve(catalogRoot).startsWith(path.resolve(userDataPath));
    existing.catalogRootRelative = path.relative(userDataPath, catalogRoot);
    existing.versions = versions;
    existing.finalInfo = finalInfo;
    existing.executedAt = new Date().toISOString();
    existing.passed = Boolean(
      existing.phases.phase1?.previewStatus === 'ready'
      && existing.phases.phase1?.importedRows === 24
      && existing.phases.phase1?.currentVersion === 1
      && existing.phases.phase1?.productId === 'JG-SP-3000'
      && existing.phases.phase2?.reopenedVersion === 1
      && existing.phases.phase2?.reopenedProductId === 'JG-SP-3000'
      && existing.phases.phase2?.importedVersion === 2
      && existing.phases.phase2?.changedContentObserved
      && existing.phases.phase2?.rollbackVersion === 3
      && existing.phases.phase2?.restoredContent
      && existing.userDataIsolation
    );
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
    if (phase === '2' && !existing.passed) throw new Error('产品库Smoke断言失败');
    return existing;
  } finally {
    await stagingService.dispose();
    await fs.rm(path.dirname(stagingRoot), { recursive: true, force: true });
  }
}

module.exports = { runCatalogSmoke };
