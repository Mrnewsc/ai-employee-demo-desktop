/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExtractionInput } from '../contracts';
import { ProductExtractionService } from '../extraction-service';
import { GOLDEN_CASES, createGoldenResponse } from '../fixtures/golden-cases';
import { MockProductExtractionProvider } from '../providers/mock-product-extraction-provider';

test('服务限制Chunk并发数量', async () => {
  const document = {
    ...GOLDEN_CASES[0].documents[0],
    blocks: Array.from({ length: 6 }, (_, index) => ({
      ...GOLDEN_CASES[0].documents[0].blocks[0],
      id: `page-${index + 1}`,
      source: { schemaVersion: '1.0' as const, kind: 'pdf' as const, page: index + 1 },
    })),
  };
  let active = 0;
  let peak = 0;
  const provider = new MockProductExtractionProvider(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return { schemaVersion: '1.0', products: [] };
  });
  await new ProductExtractionService(provider).extract([document], { chunkConfig: { maxConcurrentRequests: 2 } });
  assert.equal(peak, 2);
});

test('Provider失败时服务不返回部分结果', async () => {
  let calls = 0;
  const document = {
    ...GOLDEN_CASES[0].documents[0],
    blocks: Array.from({ length: 2 }, (_, index) => ({
      ...GOLDEN_CASES[0].documents[0].blocks[0], id: `page-${index + 1}`,
      source: { schemaVersion: '1.0' as const, kind: 'pdf' as const, page: index + 1 },
    })),
  };
  const provider = new MockProductExtractionProvider((input: ExtractionInput) => {
    calls += 1;
    if (calls === 2) return new Error('failure');
    return createGoldenResponse(GOLDEN_CASES[0], input);
  });
  await assert.rejects(new ProductExtractionService(provider).extract([document]), (error: unknown) => (
    (error as { code?: string }).code === 'AI_EXTRACTION_FAILED'
  ));
});

