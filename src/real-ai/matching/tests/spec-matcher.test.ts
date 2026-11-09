/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { importProductCatalogExcel } from '../../catalog';
import path from 'node:path';
import { resolveMatchPolicy } from '../config';
import { createExtractedProduct } from '../fixtures/golden-cases';
import { compareSpecifications } from '../spec-matcher';

async function product(id: string) {
  const report = await importProductCatalogExcel(path.resolve('src', 'real-ai', 'catalog', 'fixtures', 'standard-product-catalog.xlsx'), 'standard-product-catalog.xlsx', { namespace: 'spec-test', now: '2026-08-09T00:00:00.000Z' });
  return report.previewRecords.find((entry) => entry.productId === id)!;
}

test('规格匹配复用基础单位并支持mm/cm/m与W/kW', async () => {
  const candidate = await product('JG-SP-3000');
  const comparisons = compareSpecifications(createExtractedProduct('unit', { specifications: { 工作宽度: '1.2m', 功率: '15000W' } }), candidate, resolveMatchPolicy());
  assert.deepEqual(comparisons.map((entry) => entry.status), ['matched', 'matched']);
});

test('硬规格下限不足形成冲突', async () => {
  const candidate = await product('JG-SP-3000');
  const [comparison] = compareSpecifications(createExtractedProduct('width', { specifications: { 工作宽度: '2000mm' } }), candidate, resolveMatchPolicy());
  assert.equal(comparison.status, 'conflicting');
  assert.equal(comparison.rule.importance, 'hard');
});

test('范围值和不可比较值采用保守结果', async () => {
  const candidate = await product('JG-SP-3000');
  const comparisons = compareSpecifications(createExtractedProduct('range', { specifications: { 功率: '10-20kW', 接口规格: 'PROFINET' } }), candidate, resolveMatchPolicy());
  assert.equal(comparisons[0].status, 'matched');
  assert.equal(comparisons[1].status, 'missing');
});
