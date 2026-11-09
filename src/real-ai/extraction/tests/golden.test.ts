/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductExtractionService } from '../extraction-service';
import { GOLDEN_CASES, createGoldenResponse } from '../fixtures/golden-cases';
import { MockProductExtractionProvider } from '../providers/mock-product-extraction-provider';
import { ProductExtractionResultSchema } from '../schemas';

for (const goldenCase of GOLDEN_CASES) {
  test(`黄金样本：${goldenCase.description}`, async () => {
    const provider = new MockProductExtractionProvider((input) => createGoldenResponse(goldenCase, input));
    const result = await new ProductExtractionService(provider).extract(goldenCase.documents, {
      jobId: `golden-${goldenCase.id}`,
    });
    assert.equal(result.products.length, goldenCase.expected.productCount);
    assert.equal(ProductExtractionResultSchema.safeParse(result).success, true);
    if (goldenCase.expected.models) {
      assert.deepEqual(result.products.map((product) => product.model).sort(), [...goldenCase.expected.models].sort());
    }
    if (goldenCase.expected.needsHumanReview !== undefined) {
      assert.equal(result.needsHumanReview, goldenCase.expected.needsHumanReview);
    }
    if (goldenCase.expected.conflictField) {
      assert.ok(result.conflicts.some((conflict) => conflict.field === goldenCase.expected.conflictField));
    }
    for (const product of result.products) {
      for (const evidence of product.evidence) {
        assert.ok(evidence.sourceFile);
        assert.ok(evidence.evidenceId);
        assert.ok(['pdf', 'docx', 'sheet', 'image'].includes(evidence.source.kind));
      }
    }
  });
}

test('缺数量样本保持null，不自动补1套', async () => {
  const goldenCase = GOLDEN_CASES.find((item) => item.id === 'missing-quantity')!;
  const provider = new MockProductExtractionProvider((input) => createGoldenResponse(goldenCase, input));
  const result = await new ProductExtractionService(provider).extract(goldenCase.documents);
  assert.deepEqual(result.products[0].quantity, {
    schemaVersion: '1.0', value: null, unit: null, raw: null,
  });
});

test('OCR输入9P-3000保持原值，不被改写为SP-3000', async () => {
  const goldenCase = GOLDEN_CASES.find((item) => item.id === 'low-confidence-ocr-model')!;
  const provider = new MockProductExtractionProvider((input) => createGoldenResponse(goldenCase, input));
  const result = await new ProductExtractionService(provider).extract(goldenCase.documents);
  assert.equal(result.products[0].model, '9P-3000');
  assert.equal(result.products[0].needsHumanReview, true);
  assert.ok(result.warnings.some((warning) => warning.code === 'OCR_MODEL_UNCERTAIN'));
});

test('多来源冲突保留双方Evidence，不以最后一个值覆盖', async () => {
  const goldenCase = GOLDEN_CASES.find((item) => item.id === 'conflicting-models')!;
  const provider = new MockProductExtractionProvider((input) => createGoldenResponse(goldenCase, input));
  const result = await new ProductExtractionService(provider).extract(goldenCase.documents);
  const conflict = result.products[0].conflicts.find((item) => item.field === 'model');
  assert.ok(conflict);
  assert.deepEqual(conflict.values.map((item) => item.value), ['SP-3000', 'SP-3200']);
  assert.ok(conflict.values.every((item) => item.evidence.length > 0));
  assert.equal(result.products[0].model, 'SP-3000');
});
