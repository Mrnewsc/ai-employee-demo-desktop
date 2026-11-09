/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductRecord, ProductRepository } from '../../catalog';
import { resolveMatchPolicy } from '../config';
import { CandidateRetriever } from '../candidate-retriever';
import { createExtractedProduct } from '../fixtures/golden-cases';
import { createTestRepository } from './test-repository';

test('候选召回优先精确型号并排除停用产品', async (context) => {
  const repository = await createTestRepository(context);
  const exact = await new CandidateRetriever(repository).retrieve(createExtractedProduct('exact', {}), resolveMatchPolicy());
  assert.equal(exact.candidates[0].product.productId, 'JG-SP-3000');
  const inactive = await new CandidateRetriever(repository).retrieve(createExtractedProduct('inactive', { productName: null, model: 'MIX-200' }), resolveMatchPolicy());
  assert.equal(inactive.candidates.length, 0);
  assert.ok(inactive.issues.some((issue) => issue.code === 'INACTIVE_PRODUCT_SKIPPED'));
});

test('重复标准化型号不会被静默选择', async (context) => {
  const repository = await createTestRepository(context);
  const original = (await repository.getById('JG-SP-3000'))!;
  const duplicate: ProductRecord = { ...structuredClone(original), productId: 'DUP-SP-3000', productName: '重复型号测试产品' };
  const fake: ProductRepository = {
    ...repository,
    initialize: () => repository.initialize(),
    list: (filter) => repository.list(filter),
    getById: (id) => repository.getById(id),
    findByNormalizedModel: async () => [original, duplicate],
    searchCandidates: (query) => repository.searchCandidates(query),
    import: (records, importContext) => repository.import(records, importContext),
    getVersionInfo: () => repository.getVersionInfo(),
    getCurrentSnapshot: () => repository.getCurrentSnapshot(),
    getPreviousSnapshot: () => repository.getPreviousSnapshot(),
    rollbackPrevious: () => repository.rollbackPrevious(),
  };
  const result = await new CandidateRetriever(fake).retrieve(createExtractedProduct('duplicate', {}), resolveMatchPolicy());
  assert.ok(result.issues.some((issue) => issue.code === 'DUPLICATE_NORMALIZED_MODEL'));
  assert.equal(result.candidates.filter((entry) => entry.product.normalizedModel === 'SP3000').length, 2);
});

test('损坏产品记录被跳过并返回明确问题码', async (context) => {
  const repository = await createTestRepository(context);
  const invalid = { ...(await repository.getById('JG-SP-3000'))!, productName: '' } as ProductRecord;
  const fake: ProductRepository = {
    initialize: () => repository.initialize(),
    list: (filter) => repository.list(filter),
    getById: (id) => repository.getById(id),
    findByNormalizedModel: async () => [],
    searchCandidates: async () => [invalid],
    import: (records, importContext) => repository.import(records, importContext),
    getVersionInfo: () => repository.getVersionInfo(),
    getCurrentSnapshot: () => repository.getCurrentSnapshot(),
    getPreviousSnapshot: () => repository.getPreviousSnapshot(),
    rollbackPrevious: () => repository.rollbackPrevious(),
  };
  const result = await new CandidateRetriever(fake).retrieve(createExtractedProduct('invalid', { model: null }), resolveMatchPolicy());
  assert.equal(result.candidates.length, 0);
  assert.ok(result.issues.some((issue) => issue.code === 'INVALID_CATALOG_RECORD'));
});
