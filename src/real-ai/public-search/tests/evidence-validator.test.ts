import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublicProductCandidate } from '../contracts';
import { validateCandidateEvidence } from '../evidence-validator';

const base: PublicProductCandidate = {
  schemaVersion: '1.0', candidateId: 'c', title: '真实候选', normalizedTitle: '真实候选', source: 'test', sourceType: 'public-web',
  url: 'https://example.com/product', domain: 'example.com', imageUrl: null, priceText: null, currency: null, moq: null,
  supplierName: null, location: null, specifications: {}, material: null, description: null, searchQuery: '真实候选',
  matchedSignals: [], conflictingSignals: [], score: 0, retrievedAt: '2026-08-10T00:00:00.000Z', needsHumanReview: true,
  sourceEvidence: [{ schemaVersion: '1.0', evidenceId: 'e', evidenceType: 'public-page', sourceUrl: 'https://example.com/product', retrievedAt: '2026-08-10T00:00:00.000Z', title: '真实候选', snippet: null, imageUrl: null, supportsFields: ['title'] }],
};

test('无来源证据的候选必须拒绝', () => {
  const issues = validateCandidateEvidence({ ...base, sourceEvidence: [] });
  assert.ok(issues.some((issue) => issue.code === 'MISSING_SOURCE_EVIDENCE'));
});

test('没有证据支持的价格字段必须拒绝', () => {
  const issues = validateCandidateEvidence({ ...base, priceText: '¥99.00' });
  assert.ok(issues.some((issue) => issue.code === 'FIELD_NOT_SUPPORTED' && issue.field === 'priceText'));
});

