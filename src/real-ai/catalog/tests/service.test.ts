/// <reference types="node" />

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { JsonProductRepository } from '../json-product-repository';
import { ProductCatalogService } from '../product-catalog-service';

const require = createRequire(import.meta.url);
const { FileStagingService } = require(path.resolve('electron', 'real-ai', 'file-staging-service.cjs')) as {
  FileStagingService: new (options: { stagingRoot: string }) => {
    initialize(): Promise<void>;
    stagePathEntries(entries: Array<{ sourcePath: string; displayName: string; declaredMimeType: string }>): Promise<Array<{ fileId: string }>>;
    getDescriptor(fileId: string): { fileId: string; displayName: string; detectedType: 'xlsx' | 'xls'; stagedPath: string };
    cleanup(fileIds: string[]): Promise<void>;
    dispose(): Promise<void>;
  };
};

const fixtures = path.resolve('src', 'real-ai', 'catalog', 'fixtures');

async function setup(context: TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'catalog-service-test-'));
  const staging = new FileStagingService({ stagingRoot: path.join(root, 'staged') });
  await staging.initialize();
  const repository = new JsonProductRepository(path.join(root, 'userData', 'real-ai', 'product-catalog'));
  const service = new ProductCatalogService(repository, staging, 'service-test');
  await service.initialize();
  context.after(async () => {
    await staging.dispose();
    await rm(root, { recursive: true, force: true });
  });
  return { staging, service };
}

async function stage(staging: Awaited<ReturnType<typeof setup>>['staging'], fixture: string) {
  const [token] = await staging.stagePathEntries([{
    sourcePath: path.join(fixtures, fixture),
    displayName: fixture,
    declaredMimeType: '',
  }]);
  return token.fileId;
}

test('产品库导入只接收001B受控fileId并在确认后落库', async (context) => {
  const { staging, service } = await setup(context);
  const fileId = await stage(staging, 'standard-product-catalog.xlsx');
  const preview = await service.previewImport(fileId);
  assert.equal(preview.status, 'ready');
  const committed = await service.confirmImport(preview.importId);
  assert.equal(committed.version.currentVersion, 1);
  assert.equal((await service.findByNormalizedModel('SP-3000'))[0]?.productId, 'JG-SP-3000');
  assert.throws(() => staging.getDescriptor(fileId), (error: unknown) => (error as { code?: string }).code === 'FILE_TOKEN_NOT_FOUND');
});

test('无效导入无法确认且不会覆盖当前版本', async (context) => {
  const { staging, service } = await setup(context);
  const validId = await stage(staging, 'standard-product-catalog.xlsx');
  const valid = await service.previewImport(validId);
  await service.confirmImport(valid.importId);
  const invalidId = await stage(staging, 'invalid-products.xlsx');
  const invalid = await service.previewImport(invalidId);
  await assert.rejects(service.confirmImport(invalid.importId), (error: unknown) => (error as { code?: string }).code === 'IMPORT_HAS_ERRORS');
  assert.equal((await service.getVersionInfo()).currentVersion, 1);
  assert.equal((await service.list()).length, 24);
});
