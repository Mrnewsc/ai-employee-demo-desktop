/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { MATCHING_GOLDEN_CASES, createExtractedProduct } from '../fixtures/golden-cases';
import { MatchEngine } from '../match-engine';
import { ProductMatchResultSchema } from '../schemas';
import { MockSemanticMatchProvider } from '../semantic-provider';
import { runMatchingValidation } from '../validation';
import { createTestRepository } from './test-repository';

test('34个黄金案例满足准确性与P0安全指标', async (context) => {
  const repository = await createTestRepository(context);
  const report = await runMatchingValidation(repository);
  const failures = report.cases.filter((entry) => !entry.passed);
  assert.deepEqual(failures, []);
  assert.equal(report.caseCount, MATCHING_GOLDEN_CASES.length);
  assert.equal(report.p0.passed, true);
  assert.equal(report.top1Accuracy, 1);
  assert.equal(report.top3Recall, 1);
  assert.equal(report.exactPrecision, 1);
  assert.equal(report.humanReviewRecall, 1);
});

test('匹配结果通过Runtime Schema并同时含客户、产品库和规则Evidence', async (context) => {
  const repository = await createTestRepository(context);
  const output = await new MatchEngine({ repository, now: () => new Date('2026-08-09T08:00:00.000Z') }).match({
    extractedProduct: createExtractedProduct('schema', { specifications: { 工作宽度: '1200mm' }, application: '五金配件' }),
  });
  const result = output.results[0];
  assert.equal(ProductMatchResultSchema.safeParse(result).success, true);
  assert.ok(result.evidence.some((entry) => entry.side === 'customer'));
  assert.ok(result.evidence.some((entry) => entry.side === 'catalog'));
  assert.ok(result.evidence.some((entry) => entry.side === 'rule'));
  assert.equal(result.catalogVersion, 1);
});

test('AI语义建议不能覆盖硬规格冲突', async (context) => {
  const repository = await createTestRepository(context);
  const semantic = new MockSemanticMatchProvider((request) => request.candidates.map((candidate) => ({
    candidateProductId: candidate.product.productId,
    adjustment: 1,
    explanation: 'Mock认为语义高度相似',
    conflictsWithRules: true,
  })));
  const output = await new MatchEngine({ repository, semanticProvider: semantic }).match({
    extractedProduct: createExtractedProduct('semantic-conflict', { specifications: { 工作宽度: '2000mm' } }),
    options: { useSemanticReview: true },
  });
  assert.notEqual(output.results[0].level, 'exact');
  assert.ok(output.results[0].conflictingRules.some((rule) => rule.code === 'SPEC_CONFLICT'));
  assert.ok(output.results[0].reviewReasons.some((reason) => reason.includes('确定性规则')));
});

test('OCR 9P-3000保留原始值并只将SP-3000作为人工候选', async (context) => {
  const repository = await createTestRepository(context);
  const golden = MATCHING_GOLDEN_CASES.find((entry) => entry.id === 'ocr-ambiguous-model')!;
  const output = await new MatchEngine({ repository }).match({ extractedProduct: createExtractedProduct(golden.id, golden.input), extractionWarnings: golden.extractionWarnings });
  assert.equal(output.results[0].extractedProductSnapshot.model, '9P-3000');
  assert.equal(output.results[0].candidateProductSnapshot?.model, 'SP-3000');
  assert.notEqual(output.results[0].level, 'exact');
  assert.equal(output.results[0].needsHumanReview, true);
  assert.ok(output.results[0].reviewReasons.some((reason) => reason.includes('9P-3000')));
});

test('请求版本与当前Catalog版本不一致时进入人工确认', async (context) => {
  const repository = await createTestRepository(context);
  const output = await new MatchEngine({ repository }).match({ extractedProduct: createExtractedProduct('version', {}), catalogVersion: 99 });
  assert.ok(output.retrievalIssues.some((issue) => issue.code === 'CATALOG_VERSION_MISMATCH'));
  assert.equal(output.results[0].needsHumanReview, true);
});
