const assert = require('node:assert/strict');
const test = require('node:test');
const os = require('node:os');
const path = require('node:path');
const { mkdtemp, rm, copyFile } = require('node:fs/promises');
const XLSX = require('xlsx');
const { createCatalogManagementServices } = require('../catalog-management-service.cjs');
const { MatchEngine } = require('../../real-ai/matching/runtime/matching-runtime.cjs');

const fixtureRoot = path.resolve('src/real-ai/catalog/fixtures');
const templatePath = path.resolve('assets/templates/企业产品库标准导入模板.xlsx');

async function workspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'catalog-ui-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const services = await createCatalogManagementServices({
    app: { getPath: (name) => path.join(root, name) },
    templatePath,
  });
  return { root, ...services };
}

async function previewFile(services, sourcePath) {
  const [token] = await services.stagingService.stagePathEntries([{
    sourcePath,
    displayName: path.basename(sourcePath),
    declaredMimeType: '',
  }]);
  return services.managementService.previewImport(token.fileId);
}

function extractedProduct(model = 'SP-3000') {
  return {
    schemaVersion: '1.0', id: `customer-${model}`, productName: '自动喷涂设备标准方案', model,
    specifications: {}, quantity: { schemaVersion: '1.0', value: 1, unit: '套', raw: '1套' },
    material: null, process: null, application: '五金配件', notes: [], sourceFile: 'customer.xlsx',
    sourceLocations: [], evidence: [], confidence: 0.98, fieldConfidence: {}, needsHumanReview: false,
    conflicts: [], reviewReasons: [],
  };
}

test('空库、标准导入、搜索筛选、详情、失败不污染、版本与回滚形成真实闭环', async (t) => {
  const services = await workspace(t);
  const empty = await services.managementService.summary();
  assert.equal(empty.configured, false);
  assert.equal(empty.productCount, 0);

  const templateOutput = path.join(services.root, 'saved-template.xlsx');
  assert.equal((await services.managementService.saveTemplate(templateOutput)).saved, true);
  assert.equal(XLSX.readFile(templateOutput).SheetNames.length > 0, true);

  const v1Preview = await previewFile(services, path.join(fixtureRoot, 'standard-product-catalog.xlsx'));
  assert.equal(v1Preview.status, 'ready');
  assert.equal(v1Preview.totalRows, 24);
  const v1Commit = await services.managementService.commitImport(v1Preview.importId);
  assert.equal(v1Commit.version.currentVersion, 1);
  assert.equal(v1Commit.version.productCount, 24);

  const list = await services.managementService.listProducts({ search: 'SP-3000', status: 'all', category: '', sort: 'updated-desc', page: 1, pageSize: 20 });
  assert.ok(list.items.some((product) => product.model === 'SP-3000'));
  const inactive = await services.managementService.listProducts({ search: '', status: 'inactive', category: '', sort: 'updated-desc', page: 1, pageSize: 20 });
  assert.ok(inactive.items.length > 0);
  assert.ok(inactive.items.every((product) => product.status === 'inactive'));
  const detail = await services.managementService.productDetail(list.items[0].productId);
  assert.equal(detail.catalogVersion, 1);
  assert.equal(detail.product.productId, list.items[0].productId);

  const beforeInvalid = await services.repository.getCurrentSnapshot();
  const invalidPreview = await previewFile(services, path.join(fixtureRoot, 'invalid-products.xlsx'));
  assert.equal(invalidPreview.status, 'invalid');
  await assert.rejects(() => services.managementService.commitImport(invalidPreview.importId), { code: 'CATALOG_IMPORT_VALIDATION_FAILED' });
  const afterInvalid = await services.repository.getCurrentSnapshot();
  assert.equal(afterInvalid.catalogVersion, beforeInvalid.catalogVersion);
  assert.equal(afterInvalid.checksum, beforeInvalid.checksum);
  assert.deepEqual(afterInvalid.products, beforeInvalid.products);

  const matchV1 = await new MatchEngine({ repository: services.repository }).match({ extractedProduct: extractedProduct() });
  assert.equal(matchV1.results[0].catalogVersion, 1);

  const v2Preview = await previewFile(services, path.join(fixtureRoot, 'standard-product-catalog-v2.xlsx'));
  const v2Commit = await services.managementService.commitImport(v2Preview.importId);
  assert.equal(v2Commit.version.currentVersion, 2);
  const versions = await services.managementService.versions();
  assert.deepEqual(versions.items.map((item) => item.version), [2, 1]);
  assert.equal(versions.items.find((item) => item.version === 1).canRollback, true);

  const matchV2 = await new MatchEngine({ repository: services.repository }).match({ extractedProduct: extractedProduct() });
  assert.equal(matchV2.results[0].catalogVersion, 2);
  assert.equal(matchV1.results[0].catalogVersion, 1, '历史匹配结果不得被新版产品库篡改');

  const rollback = await services.managementService.rollback(1);
  assert.equal(rollback.restoredFromVersion, 1);
  assert.equal(rollback.version.currentVersion, 3, '001D回滚语义应创建新的审计版本');
  const afterRollback = await services.repository.getCurrentSnapshot();
  assert.deepEqual(afterRollback.products, beforeInvalid.products);
  const matchV3 = await new MatchEngine({ repository: services.repository }).match({ extractedProduct: extractedProduct() });
  assert.equal(matchV3.results[0].catalogVersion, 3);
  assert.equal(matchV2.results[0].catalogVersion, 2);
});

test('500条列表搜索分页与1000条XLSX预览提交可在后台完成', async (t) => {
  const services = await workspace(t);
  const largePath = path.join(services.root, 'catalog-1000.xlsx');
  const rows = Array.from({ length: 1000 }, (_, index) => ({
    产品ID: `PERF-${String(index + 1).padStart(4, '0')}`,
    产品名称: `脱敏工业产品 ${index + 1}`,
    型号: `PX-${String(index + 1).padStart(4, '0')}`,
    分类: index % 2 ? '自动化设备' : '喷涂设备',
    应用场景: index % 2 ? '制造产线' : '五金工件',
    关键词: `产品${index + 1}；工业设备`,
    同义词: `方案${index + 1}`,
    产品说明: '脱敏性能测试记录',
    状态: index % 10 === 0 ? '停用' : '启用',
    '规格.功率': `${10 + index % 20}kW`,
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), '产品库');
  XLSX.writeFile(workbook, largePath);

  const previewStarted = performance.now();
  const preview = await previewFile(services, largePath);
  const previewDurationMs = Math.round(performance.now() - previewStarted);
  assert.equal(preview.status, 'ready');
  assert.equal(preview.totalRows, 1000);
  const commitStarted = performance.now();
  await services.managementService.commitImport(preview.importId);
  const commitDurationMs = Math.round(performance.now() - commitStarted);

  const listStarted = performance.now();
  const page = await services.managementService.listProducts({ search: '', status: 'all', category: '', sort: 'updated-desc', page: 1, pageSize: 100 });
  const first500DurationMs = Math.round(performance.now() - listStarted);
  assert.equal(page.total, 1000);
  assert.equal(page.items.length, 100);
  const search = await services.managementService.listProducts({ search: 'PX-0500', status: 'all', category: '', sort: 'name-asc', page: 1, pageSize: 20 });
  assert.equal(search.items[0].model, 'PX-0500');
  assert.ok(previewDurationMs < 30000);
  assert.ok(commitDurationMs < 10000);
  assert.ok(first500DurationMs < 2000);
  t.diagnostic(JSON.stringify({ preview1000Ms: previewDurationMs, commit1000Ms: commitDurationMs, list1000Ms: first500DurationMs }));
});

