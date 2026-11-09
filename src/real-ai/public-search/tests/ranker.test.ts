import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublicProductCandidate, PublicProductSearchRequest } from '../contracts';
import { rankCandidate } from '../candidate-ranker';

const request: PublicProductSearchRequest = {
  schemaVersion: '1.0', requestId: 'r', extractedProductId: 'p', productName: '厨房置物架', model: null,
  specifications: { width: '40cm' }, material: '不锈钢', application: '厨房收纳', category: '家居收纳', keywords: [],
  customerEvidence: [], imageReferences: [], searchReason: 'test-harness',
};

function candidate(material: string): PublicProductCandidate {
  return {
    schemaVersion: '1.0', candidateId: material, title: '厨房置物架 40cm', normalizedTitle: '厨房置物架 40cm',
    source: 'test', sourceType: 'public-web', url: `https://example.com/${encodeURIComponent(material)}`, domain: 'example.com',
    imageUrl: null, priceText: null, currency: null, moq: null, supplierName: null, location: null,
    specifications: { width: '40cm' }, material, description: '适合厨房收纳', searchQuery: '厨房置物架',
    matchedSignals: [], conflictingSignals: [], score: 0, retrievedAt: '2026-08-10T00:00:00.000Z', needsHumanReview: true,
    sourceEvidence: [{ schemaVersion: '1.0', evidenceId: 'e', evidenceType: 'public-page', sourceUrl: `https://example.com/${encodeURIComponent(material)}`, retrievedAt: '2026-08-10T00:00:00.000Z', title: '厨房置物架 40cm', snippet: null, imageUrl: null, supportsFields: ['title', 'material', 'specifications'] }],
  };
}

test('材料冲突会明确标记并降低候选得分', () => {
  const matching = rankCandidate(request, candidate('不锈钢'));
  const conflicting = rankCandidate(request, candidate('ABS'));
  assert.ok(matching.score > conflicting.score);
  assert.ok(conflicting.conflictingSignals.some((signal) => signal.includes('材料不一致')));
});

