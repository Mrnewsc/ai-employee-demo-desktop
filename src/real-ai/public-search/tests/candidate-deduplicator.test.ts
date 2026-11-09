import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublicProductCandidate } from '../contracts';
import { deduplicateCandidates } from '../candidate-deduplicator';

function candidate(id: string, title: string, url: string, score: number): PublicProductCandidate {
  return {
    schemaVersion: '1.0', candidateId: id, title, normalizedTitle: title.toLocaleLowerCase(), source: 'test', sourceType: 'search-engine-index',
    url, domain: 'example.com', imageUrl: null, priceText: null, currency: null, moq: null, supplierName: null, location: null,
    specifications: {}, material: null, description: null, searchQuery: 'query', matchedSignals: [], conflictingSignals: [], score,
    retrievedAt: '2026-08-10T00:00:00.000Z', needsHumanReview: true,
    sourceEvidence: [{ schemaVersion: '1.0', evidenceId: id, evidenceType: 'search-result', sourceUrl: 'https://search.example/result', retrievedAt: '2026-08-10T00:00:00.000Z', title, snippet: null, imageUrl: null, supportsFields: ['title'] }],
  };
}

test('相同公开URL即使标题略有差异也只保留最高分候选', () => {
  const first = candidate('a', '手机支架', 'https://example.com/item?id=1&utm_source=test', 0.4);
  const second = candidate('b', '车载手机支架', 'https://example.com/item?id=1', 0.7);
  const result = deduplicateCandidates([first, second]);
  assert.equal(result.length, 1);
  assert.equal(result[0].candidateId, 'b');
});

