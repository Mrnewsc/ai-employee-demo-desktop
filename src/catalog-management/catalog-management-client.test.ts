/// <reference types="node" />
import assert from 'node:assert/strict';
import test from 'node:test';
import { CatalogManagementClient } from './catalog-management-client';
import type { CatalogManagementApi } from './contracts';

test('CatalogManagementClient只通过注入的安全桥接调用后台能力', async () => {
  const calls: string[] = [];
  const api = {
    selectImportFile: async () => (calls.push('select'), null),
    summary: async () => (calls.push('summary'), { productCount: 0 }),
    list: async () => (calls.push('list'), { items: [] }),
    detail: async () => (calls.push('detail'), {}),
    previewImport: async () => (calls.push('preview'), {}),
    commitImport: async () => (calls.push('commit'), {}),
    discardImport: async () => (calls.push('discard'), { discarded: true }),
    versions: async () => (calls.push('versions'), {}),
    rollback: async () => (calls.push('rollback'), {}),
    saveTemplate: async () => (calls.push('template'), { saved: false, fileName: null }),
  } as unknown as CatalogManagementApi;
  const client = new CatalogManagementClient(() => api);
  await client.selectImportFile();
  await client.getSummary();
  await client.listProducts({ search: '', status: 'all', category: '', sort: 'updated-desc', page: 1, pageSize: 20 });
  await client.getProductDetail('product');
  await client.previewImport('file_123456789abc');
  await client.commitImport('import_123456789abc');
  await client.discardImport('import_123456789abc');
  await client.getVersions();
  await client.rollback(1);
  await client.saveTemplate();
  assert.deepEqual(calls, ['select', 'summary', 'list', 'detail', 'preview', 'commit', 'discard', 'versions', 'rollback', 'template']);
});

