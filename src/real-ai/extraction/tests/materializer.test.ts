/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { createExtractionChunks } from '../chunker';
import { GOLDEN_CASES } from '../fixtures/golden-cases';
import { materializeProviderPayload } from '../materializer';

test('无证据字段被置空并触发人工复核', () => {
  const input = createExtractionChunks(GOLDEN_CASES[0].documents[0], 'job-no-evidence')[0];
  const result = materializeProviderPayload(input, {
    schemaVersion: '1.0',
    products: [{
      productName: '自动喷涂设备',
      model: 'FAKE-9999',
      specifications: { 功率: '99kW' },
      quantity: { value: 9, unit: '套', raw: '9套' },
      material: null,
      process: null,
      application: null,
      notes: [],
      evidenceRefs: { productName: [{ evidenceId: input.evidenceItems[0].evidenceId, quote: '自动喷涂设备' }] },
    }],
  }, { provider: 'test', model: 'test', repaired: false, durationMs: 1, outputCharacters: 1 });
  const product = result.products[0];
  assert.equal(product.model, null);
  assert.deepEqual(product.specifications, {});
  assert.equal(product.quantity.value, null);
  assert.equal(product.needsHumanReview, true);
});

test('AI修改型号时恢复证据原字形并要求人工确认', () => {
  const golden = GOLDEN_CASES.find((item) => item.id === 'low-confidence-ocr-model')!;
  const input = createExtractionChunks(golden.documents[0], 'job-model-restore')[0];
  const evidenceId = input.evidenceItems[0].evidenceId;
  const result = materializeProviderPayload(input, {
    schemaVersion: '1.0',
    products: [{
      productName: '自动喷涂设备', model: 'SP-3000', specifications: {},
      quantity: { value: null, unit: null, raw: null },
      material: null, process: null, application: null, notes: [],
      evidenceRefs: {
        productName: [{ evidenceId, quote: '自动喷涂设备' }],
        model: [{ evidenceId, quote: '9P-3000' }],
      },
    }],
  }, { provider: 'test', model: 'test', repaired: false, durationMs: 1, outputCharacters: 1 });
  assert.equal(result.products[0].model, '9P-3000');
  assert.ok(result.warnings.some((warning) => warning.code === 'MODEL_RESTORED_FROM_EVIDENCE'));
});

test('缺少产品名称时保留可验证型号并要求人工复核', () => {
  const input = createExtractionChunks(GOLDEN_CASES[0].documents[0], 'job-missing-name')[0];
  const evidenceId = input.evidenceItems[0].evidenceId;
  const result = materializeProviderPayload(input, {
    schemaVersion: '1.0',
    products: [{
      productName: null, model: 'SP-3000', specifications: {},
      quantity: { value: null, unit: null, raw: null },
      material: null, process: null, application: null, notes: [],
      evidenceRefs: { model: [{ evidenceId, quote: 'SP-3000' }] },
    }],
  }, { provider: 'test', model: 'test', repaired: false, durationMs: 1, outputCharacters: 1 });
  assert.equal(result.products[0].model, 'SP-3000');
  assert.equal(result.products[0].productName, null);
  assert.equal(result.products[0].needsHumanReview, true);
});

test('扫描PDF的OCR低置信度也会触发型号人工复核', () => {
  const sourceDocument = GOLDEN_CASES[0].documents[0];
  const document = {
    ...sourceDocument,
    fileName: '扫描铭牌.pdf',
    blocks: [{
      ...sourceDocument.blocks[0],
      type: 'ocr-line' as const,
      text: '自动喷涂设备 型号 9P-3000',
      confidence: 0.5,
      source: { schemaVersion: '1.0' as const, kind: 'pdf' as const, page: 1 },
    }],
  };
  const input = createExtractionChunks(document, 'job-scanned-pdf')[0];
  const evidenceId = input.evidenceItems[0].evidenceId;
  const result = materializeProviderPayload(input, {
    schemaVersion: '1.0',
    products: [{
      productName: '自动喷涂设备', model: '9P-3000', specifications: {},
      quantity: { value: null, unit: null, raw: null },
      material: null, process: null, application: null, notes: [],
      evidenceRefs: {
        productName: [{ evidenceId, quote: '自动喷涂设备' }],
        model: [{ evidenceId, quote: '9P-3000' }],
      },
    }],
  }, { provider: 'test', model: 'test', repaired: false, durationMs: 1, outputCharacters: 1 });
  assert.ok(result.warnings.some((warning) => warning.code === 'OCR_MODEL_UNCERTAIN'));
});
