/// <reference types="node" />

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { importProductCatalogExcel, JsonProductRepository } from '../../catalog';

export async function createTestRepository(context?: TestContext): Promise<JsonProductRepository> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'matching-catalog-'));
  context?.after(() => rm(root, { recursive: true, force: true }));
  const repository = new JsonProductRepository(path.join(root, 'repository'));
  await repository.initialize();
  const fixture = path.resolve('src', 'real-ai', 'catalog', 'fixtures', 'standard-product-catalog.xlsx');
  const report = await importProductCatalogExcel(fixture, 'standard-product-catalog.xlsx', {
    namespace: 'matching-golden',
    now: '2026-08-09T00:00:00.000Z',
  });
  if (report.status !== 'ready' || report.previewRecords.length !== 24) throw new Error('001D黄金产品库加载失败');
  await repository.import(report.previewRecords, {
    importId: report.importId,
    sourceFile: report.sourceFile,
    importedAt: report.createdAt,
  });
  return repository;
}
