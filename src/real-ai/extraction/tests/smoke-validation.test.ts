/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductExtractionService } from '../extraction-service';
import { GOLDEN_CASES, createGoldenResponse } from '../fixtures/golden-cases';
import { MockProductExtractionProvider } from '../providers/mock-product-extraction-provider';
import type { ExpectedSmokeSample } from '../smoke/validation';
import { serializeExtractedProduct, validateSmokeSample } from '../smoke/validation';

test('Smoke验收器按字段验证黄金答案并追溯全部Evidence', async () => {
  const golden = GOLDEN_CASES.find((item) => item.id === 'single-product-pdf')!;
  const result = await extractGolden(golden);
  const expected: ExpectedSmokeSample = {
    sampleId: 'validator-single',
    sampleType: '单产品',
    sourcePaths: [],
    products: [{
      productName: '自动喷涂设备', model: 'SP-3000', specifications: {},
      quantity: { value: 1, unit: '套', raw: '1套' }, material: '不锈钢', process: null,
      application: null, expectedHumanReview: false, expectedWarnings: [],
    }],
    expectedConflictFields: [],
    expectedSourceFileCount: 1,
  };
  const validation = validateSmokeSample(expected, golden.documents, result);
  assert.equal(validation.fieldChecks.every((check) => check.correct), true);
  assert.equal(validation.evidenceInvalid, 0);
  assert.equal(validation.evidenceAccuracy, 1);
  assert.equal(validation.hallucinatedFieldCount, 0);
  assert.equal(validation.criticalFieldsWithoutEvidence, 0);
});

test('无有效Evidence的非空关键字段计入幻觉', async () => {
  const golden = GOLDEN_CASES.find((item) => item.id === 'missing-quantity')!;
  const result = await extractGolden(golden);
  result.products[0] = { ...result.products[0], material: '文件中不存在的材质' };
  const expected: ExpectedSmokeSample = {
    sampleId: 'validator-hallucination', sampleType: '幻觉检查', sourcePaths: [],
    products: [{
      productName: '自动喷涂设备', model: 'SP-3000', specifications: {},
      quantity: { value: null, unit: null, raw: null }, material: null, process: null,
      application: null, expectedHumanReview: false, expectedWarnings: [],
    }],
    expectedConflictFields: [], expectedSourceFileCount: 1,
  };
  const validation = validateSmokeSample(expected, golden.documents, result);
  assert.equal(validation.hallucinatedFieldCount, 1);
  assert.equal(validation.criticalFieldsWithoutEvidence, 1);
});

test('冲突与跨文件合并验证不会丢失双方来源', async () => {
  const conflictGolden = GOLDEN_CASES.find((item) => item.id === 'conflicting-models')!;
  const conflictResult = await extractGolden(conflictGolden);
  const conflictExpected: ExpectedSmokeSample = {
    sampleId: 'validator-conflict', sampleType: '冲突', sourcePaths: [],
    scoredFields: ['productName', 'model'],
    products: [{
      productName: '自动喷涂设备', model: 'SP-3000', specifications: {},
      quantity: { value: null, unit: null, raw: null }, material: null, process: null,
      application: null, expectedHumanReview: true, expectedWarnings: ['FIELD_CONFLICT'],
    }],
    expectedConflictFields: ['model'], expectedSourceFileCount: 2,
  };
  const conflictValidation = validateSmokeSample(conflictExpected, conflictGolden.documents, conflictResult);
  assert.equal(conflictValidation.silentlyOverwrittenConflictCount, 0);
  assert.equal(conflictValidation.actualSourceFileCount, 2);
  assert.equal(conflictValidation.correctMergeCount, 1);

  const mergeGolden = GOLDEN_CASES.find((item) => item.id === 'same-product-multi-file')!;
  const mergeResult = await extractGolden(mergeGolden);
  const mergeExpected = { ...conflictExpected, sampleId: 'validator-merge', expectedConflictFields: [] };
  const mergeValidation = validateSmokeSample(mergeExpected, mergeGolden.documents, mergeResult);
  assert.equal(mergeValidation.actualProductCount, 1);
  assert.equal(mergeValidation.actualSourceFileCount, 2);
  assert.equal(mergeValidation.duplicateProductCount, 0);
});

test('完整序列化包含字段、告警、冲突和可定位Evidence', async () => {
  const golden = GOLDEN_CASES.find((item) => item.id === 'conflicting-models')!;
  const result = await extractGolden(golden);
  const serialized = serializeExtractedProduct(result.products[0], result.warnings);
  assert.ok('productName' in serialized);
  assert.ok('quantity' in serialized);
  assert.ok('specifications' in serialized);
  assert.ok('fieldConfidence' in serialized);
  assert.ok(serialized.warnings.length > 0);
  assert.ok(serialized.conflicts.length > 0);
  assert.ok(serialized.evidence.every((evidence) => evidence.file && evidence.source.kind));
});

async function extractGolden(golden: (typeof GOLDEN_CASES)[number]) {
  const provider = new MockProductExtractionProvider((input) => createGoldenResponse(golden, input));
  return new ProductExtractionService(provider).extract(golden.documents, { jobId: `smoke-validator-${golden.id}` });
}

