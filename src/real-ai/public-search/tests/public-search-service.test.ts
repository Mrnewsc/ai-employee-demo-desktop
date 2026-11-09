import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  CandidateSearchProvider,
  ProviderCandidate,
  PublicProductSearchRequest,
} from '../contracts';
import { PublicSearchService } from '../public-search-service';

const request: PublicProductSearchRequest = {
  schemaVersion: '1.0', requestId: 'service-request', extractedProductId: 'extracted-1', productName: '晾衣架', model: null,
  specifications: {}, material: '不锈钢', application: '阳台晾晒', category: '晾晒用品', keywords: [],
  customerEvidence: [{ schemaVersion: '1.0', field: 'productName', text: '晾衣架', sourceFile: 'external.pdf', source: { schemaVersion: '1.0', kind: 'pdf', page: 12 } }],
  imageReferences: [{ schemaVersion: '1.0', imageId: 'pdf-image-12', sourceFile: 'external.pdf', mimeType: null, page: 12, bbox: null, sha256: null, availableForVisualSearch: false }],
  searchReason: 'test-harness',
};

function providerCandidate(index: number, duplicate = false): ProviderCandidate {
  const url = duplicate ? 'https://example.com/product/1' : `https://example.com/product/${index}`;
  const title = duplicate ? '不锈钢晾衣架 1' : `不锈钢晾衣架 ${index}`;
  return {
    schemaVersion: '1.0', providerCandidateId: `provider-${index}`, title, source: '公开测试来源', sourceType: 'public-web', url,
    imageUrl: null, priceText: null, currency: null, moq: null, supplierName: null, location: null, specifications: {},
    material: null, description: '不锈钢 阳台 晾晒', searchQuery: '晾衣架 不锈钢',
    sourceEvidence: [{ schemaVersion: '1.0', evidenceId: `e-${index}`, evidenceType: 'public-page', sourceUrl: url, retrievedAt: '2026-08-10T00:00:00.000Z', title, snippet: '不锈钢 阳台 晾晒', imageUrl: null, supportsFields: ['title', 'description'] }],
  };
}

test('服务只保留有证据的Top 5并强制人工核验', async () => {
  const provider: CandidateSearchProvider = {
    provider: 'fake-public',
    async healthCheck() { return { schemaVersion: '1.0', provider: this.provider, status: 'AVAILABLE', checkedAt: '2026-08-10T00:00:00.000Z', durationMs: 1, message: null }; },
    async search(_request, query) {
      const candidates = [1, 2, 3, 4, 5, 6].map((index) => providerCandidate(index));
      if (query.queryId.endsWith('duplicate')) candidates.push(providerCandidate(7, true));
      return { schemaVersion: '1.0', provider: this.provider, status: 'AVAILABLE', query, candidates, rawResultCount: candidates.length, durationMs: 1, message: null };
    },
  };
  const result = await new PublicSearchService([provider], { maxQueries: 1, now: () => new Date('2026-08-10T00:00:00.000Z') }).search(request);
  assert.equal(result.candidates.length, 5);
  assert.ok(result.candidates.every((candidate) => candidate.needsHumanReview));
  assert.ok(result.candidates.every((candidate) => candidate.sourceEvidence.length > 0));
  assert.equal(result.searchReason, 'test-harness');
});

test('Provider不可用时不得偷偷生成候选', async () => {
  const provider: CandidateSearchProvider = {
    provider: 'blocked',
    async healthCheck() { return { schemaVersion: '1.0', provider: this.provider, status: 'SOURCE_REQUIRES_AUTH', checkedAt: '2026-08-10T00:00:00.000Z', durationMs: 1, message: 'requires auth' }; },
    async search(_request, query) { return { schemaVersion: '1.0', provider: this.provider, status: 'SOURCE_REQUIRES_AUTH', query, candidates: [], rawResultCount: 0, durationMs: 1, message: 'requires auth' }; },
  };
  const result = await new PublicSearchService([provider], { maxQueries: 1 }).search(request);
  assert.deepEqual(result.candidates, []);
  assert.equal(result.diagnostics.providerStatuses[0].status, 'SOURCE_REQUIRES_AUTH');
});

test('Provider抛错时记录SOURCE_UNAVAILABLE且不降级为Demo候选', async () => {
  const provider: CandidateSearchProvider = {
    provider: 'crashed-provider',
    async healthCheck() { throw new Error('network failed'); },
    async search() { throw new Error('network failed'); },
  };
  const result = await new PublicSearchService([provider], { maxQueries: 1 }).search(request);
  assert.deepEqual(result.candidates, []);
  assert.equal(result.diagnostics.providerStatuses[0].status, 'SOURCE_UNAVAILABLE');
});
