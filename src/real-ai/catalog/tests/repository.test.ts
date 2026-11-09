/// <reference types="node" />

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { importProductCatalogExcel } from '../excel-importer';
import { JsonProductRepository } from '../json-product-repository';

const fixtures = path.resolve('src', 'real-ai', 'catalog', 'fixtures');

async function report(name = 'standard-product-catalog.xlsx') {
  return importProductCatalogExcel(path.join(fixtures, name), name, { namespace: 'repository-test' });
}

async function temporaryRepository(context: TestContext) {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'catalog-user-data-'));
  context.after(() => rm(userData, { recursive: true, force: true }));
  const root = path.join(userData, 'real-ai', 'product-catalog');
  const repository = new JsonProductRepository(root);
  await repository.initialize();
  return { userData, root, repository };
}

test('Repository创建版本并支持按ID与标准化型号查询', async (context) => {
  const { repository } = await temporaryRepository(context);
  const imported = await report();
  const version = await repository.import(imported.previewRecords, {
    importId: imported.importId,
    sourceFile: imported.sourceFile,
    importedAt: imported.createdAt,
  });
  assert.equal(version.currentVersion, 1);
  assert.equal((await repository.getById('JG-SP-3000'))?.productName, '自动喷涂设备标准方案');
  assert.equal((await repository.findByNormalizedModel('ＳＰ ３０００'))[0]?.productId, 'JG-SP-3000');
});

test('候选查询支持名称、关键词和分类基础召回', async (context) => {
  const { repository } = await temporaryRepository(context);
  const imported = await report();
  await repository.import(imported.previewRecords, { importId: imported.importId, sourceFile: imported.sourceFile, importedAt: imported.createdAt });
  const candidates = await repository.searchCandidates({ productName: '自动喷涂设备', keywords: ['五金喷涂'], limit: 5 });
  assert.ok(candidates.some((product) => product.productId === 'JG-SP-3000'));
  assert.ok((await repository.list({ category: '家具喷涂设备' })).length >= 4);
});

test('新导入生成新版本并保留上一有效版本', async (context) => {
  const { repository } = await temporaryRepository(context);
  const first = await report();
  await repository.import(first.previewRecords, { importId: first.importId, sourceFile: first.sourceFile, importedAt: first.createdAt });
  const second = await report('standard-product-catalog-v2.xlsx');
  const info = await repository.import(second.previewRecords, { importId: second.importId, sourceFile: second.sourceFile, importedAt: new Date(Date.now() + 1000).toISOString() });
  assert.equal(info.currentVersion, 2);
  assert.equal(info.previousVersion, 1);
  assert.match((await repository.getById('JG-SP-3000'))?.description ?? '', /V2内部测试变更/);
});

test('回滚上一版本会创建新的审计版本', async (context) => {
  const { repository } = await temporaryRepository(context);
  const first = await report();
  await repository.import(first.previewRecords, { importId: first.importId, sourceFile: first.sourceFile, importedAt: first.createdAt });
  const second = await report('standard-product-catalog-v2.xlsx');
  await repository.import(second.previewRecords, { importId: second.importId, sourceFile: second.sourceFile, importedAt: new Date(Date.now() + 1000).toISOString() });
  const rolledBack = await repository.rollbackPrevious();
  assert.equal(rolledBack.currentVersion, 3);
  assert.equal(rolledBack.previousVersion, 2);
  assert.doesNotMatch((await repository.getById('JG-SP-3000'))?.description ?? '', /V2内部测试变更/);
});

test('userData中的版本化JSON可在Repository重建后继续读取', async (context) => {
  const { root, repository } = await temporaryRepository(context);
  const imported = await report();
  await repository.import(imported.previewRecords, { importId: imported.importId, sourceFile: imported.sourceFile, importedAt: imported.createdAt });
  const reopened = new JsonProductRepository(root);
  await reopened.initialize();
  assert.equal((await reopened.findByNormalizedModel('SP-3000'))[0]?.productId, 'JG-SP-3000');
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.currentVersion, 1);
});

test('并发导入在进程内串行生成不同版本号', async (context) => {
  const { repository } = await temporaryRepository(context);
  const first = await report();
  const second = await report('standard-product-catalog-v2.xlsx');
  await Promise.all([
    repository.import(first.previewRecords, { importId: first.importId, sourceFile: first.sourceFile, importedAt: first.createdAt }),
    repository.import(second.previewRecords, { importId: second.importId, sourceFile: second.sourceFile, importedAt: new Date(Date.now() + 1000).toISOString() }),
  ]);
  assert.deepEqual(await repository.listStoredVersions(), [1, 2]);
  assert.equal((await repository.getVersionInfo()).currentVersion, 2);
});
