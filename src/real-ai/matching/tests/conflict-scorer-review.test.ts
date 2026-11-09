/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { matchApplication } from '../application-matcher';
import { resolveMatchPolicy } from '../config';
import { detectConflicts } from '../conflict-detector';
import { createExtractedProduct, MATCHING_GOLDEN_CASES } from '../fixtures/golden-cases';
import { assessInputQuality } from '../input-quality';
import { MatchEngine } from '../match-engine';
import { matchModel } from '../model-matcher';
import { matchName } from '../name-matcher';
import { deterministicScore } from '../scorer';
import { matchSpecifications } from '../spec-matcher';
import { createTestRepository } from './test-repository';

test('ConflictDetector区分硬冲突和规格缺失', async (context) => {
  const repository = await createTestRepository(context);
  const candidate = (await repository.getById('JG-SP-3000'))!;
  const hard = createExtractedProduct('hard', { specifications: { 工作宽度: '2000mm' } });
  const assessments = [matchModel(hard, candidate, 1), matchSpecifications(hard, candidate, resolveMatchPolicy(), 1)];
  assert.equal(detectConflicts(assessments, assessInputQuality(hard)).hasHardConflict, true);
  const missing = createExtractedProduct('missing', { specifications: { 接口规格: 'PLC-Ethernet' } });
  const missingAssessments = [matchModel(missing, candidate, 1), matchSpecifications(missing, candidate, resolveMatchPolicy(), 1)];
  assert.equal(detectConflicts(missingAssessments, assessInputQuality(missing)).hasMissingHardSpecification, true);
});

test('Scorer按可用维度归一且应用场景不能覆盖型号冲突', async (context) => {
  const repository = await createTestRepository(context);
  const candidate = (await repository.getById('JG-SP-3000'))!;
  const product = createExtractedProduct('score', { model: 'SP-9999', specifications: {}, application: '五金配件' });
  const assessments = [matchModel(product, candidate, 1), matchName(product, candidate, 1), matchApplication(product, candidate, 1)];
  const score = deterministicScore(assessments, resolveMatchPolicy());
  assert.ok(score < 0.6);
  assert.ok(score >= 0);
});

test('Human Review覆盖OCR、硬冲突、近似候选和上游冲突', async (context) => {
  const repository = await createTestRepository(context);
  const engine = new MatchEngine({ repository });
  for (const id of ['ocr-ambiguous-model', 'hard-width-conflict', 'multiple-close', 'source-conflict']) {
    const golden = MATCHING_GOLDEN_CASES.find((entry) => entry.id === id)!;
    const output = await engine.match({ extractedProduct: createExtractedProduct(id, golden.input), extractionWarnings: golden.extractionWarnings, options: golden.options });
    assert.equal(output.results[0].needsHumanReview, true, id);
    assert.ok(output.results[0].reviewReasons.length > 0, id);
    if (id === 'multiple-close') assert.ok(output.results[0].reviewReasons.some((reason) => reason.includes('多个候选分数接近')));
  }
});

test('Repository集成只读匹配不改变Catalog版本或校验和', async (context) => {
  const repository = await createTestRepository(context);
  const before = await repository.getCurrentSnapshot();
  await new MatchEngine({ repository }).match({ extractedProduct: createExtractedProduct('readonly', {}) });
  const after = await repository.getCurrentSnapshot();
  assert.equal(after?.catalogVersion, before?.catalogVersion);
  assert.equal(after?.checksum, before?.checksum);
  assert.deepEqual(after?.products, before?.products);
});
