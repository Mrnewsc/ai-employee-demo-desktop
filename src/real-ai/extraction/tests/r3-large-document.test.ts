/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { SCHEMA_VERSION } from '../../types';
import type { ParsedDocument } from '../../types';
import type {
  ExtractionInput,
  ExtractionOptions,
  ProductExtractionProvider,
  ProductExtractionResult,
} from '../contracts';
import { ProductExtractionError } from '../errors';
import { ProductExtractionService } from '../extraction-service';

test('R3 Case 1：32 Chunk全部成功且峰值并发不超过2', async () => {
  const provider = new ScenarioProvider();
  const outcome = await service(provider).createJob(document32(), options()).run();
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.successfulChunkCount, 32);
  assert.equal(outcome.failedChunkCount, 0);
  assert.equal(outcome.audit.peakConcurrency, 2);
  assert.equal(outcome.audit.providerRequestCount, 32);
  assert.ok([...provider.calls.values()].every((count) => count === 1));
});

test('R3 Case 2：Chunk 17首次transport失败后仅重试自身', async () => {
  const provider = new ScenarioProvider({ failOnce: 17 });
  const outcome = await service(provider).createJob(document32(), options()).run();
  assert.equal(outcome.status, 'completed');
  assert.equal(provider.calls.get(17), 2);
  assert.equal(outcome.audit.providerRequestCount, 33);
  assert.deepEqual([...provider.calls.entries()].filter(([index]) => index !== 17).map(([, count]) => count), Array(31).fill(1));
});

test('R3 Case 3：永久失败产生partial-failed且不发布正式结果', async () => {
  const provider = new ScenarioProvider({ failAlways: 17 });
  const job = service(provider).createJob(document32(), options());
  const outcome = await job.run();
  assert.equal(outcome.status, 'partial-failed');
  assert.equal(outcome.successfulChunkCount, 31);
  assert.equal(outcome.failedChunkCount, 1);
  assert.equal(outcome.result, null);
  assert.equal(provider.calls.get(17), 2);
  assert.ok(outcome.failedChunkIds[0].endsWith(':chunk:17'));
});

test('R3 Case 4：retryFailedChunks只恢复失败Chunk', async () => {
  const provider = new ScenarioProvider({ failUntil: { chunk: 17, attempts: 2 } });
  const job = service(provider).createJob(document32(), options());
  const first = await job.run();
  assert.equal(first.status, 'partial-failed');
  const before = new Map(provider.calls);
  const recovered = await job.retryFailedChunks();
  assert.equal(recovered.status, 'completed');
  assert.equal(recovered.result?.metrics.chunkCount, 32);
  assert.equal(provider.calls.get(17), 3);
  for (let index = 1; index <= 32; index += 1) {
    if (index !== 17) assert.equal(provider.calls.get(index), before.get(index));
  }
});

test('超时旧attempt迟到返回不能覆盖第二次成功结果', async () => {
  const provider = new LateProvider();
  const job = service(provider).createJob(document32(1), {
    ...options(),
    executionConfig: { maxProviderRetries: 1, providerRetryDelayMs: 0, attemptTimeoutMs: 10 },
  });
  const outcome = await job.run();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const snapshot = job.snapshot();
  assert.equal(outcome.status, 'completed');
  assert.equal(snapshot.status, 'completed');
  assert.equal(snapshot.audit.chunks[0].attempts.length, 2);
  assert.equal(snapshot.audit.chunks[0].attempts.filter((attempt) => attempt.status === 'completed').length, 1);
  assert.equal(snapshot.result?.products.length, 0);
});

test('Cancel停止queued Chunk且迟到结果不能把状态改回completed', async () => {
  const provider = new SlowIgnoringCancelProvider();
  const job = service(provider).createJob(document32(), options());
  const pending = job.run();
  await provider.started;
  job.cancel();
  const outcome = await pending;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(outcome.status, 'cancelled');
  assert.equal(job.snapshot().status, 'cancelled');
  assert.ok(provider.callCount <= 2);
  assert.equal(job.snapshot().result, null);
});

function options() {
  return {
    jobId: 'r3-large-document',
    chunkConfig: { maxChunksPerDocument: 40, maxConcurrentRequests: 2 },
    executionConfig: { maxProviderRetries: 1, providerRetryDelayMs: 0 },
  };
}

function service(provider: ProductExtractionProvider) {
  return new ProductExtractionService(provider);
}

function document32(pageCount = 32): ParsedDocument[] {
  return [{
    schemaVersion: SCHEMA_VERSION,
    fileId: 'large-document',
    fileName: 'large-document.pdf',
    fileType: 'pdf',
    mimeType: 'application/pdf',
    size: pageCount * 100,
    sha256: 'a'.repeat(64),
    rawText: '',
    blocks: Array.from({ length: pageCount }, (_, index) => ({
      schemaVersion: SCHEMA_VERSION,
      id: `page-${index + 1}`,
      type: 'paragraph' as const,
      text: `第${index + 1}页脱敏产品信息`,
      source: { schemaVersion: SCHEMA_VERSION, kind: 'pdf' as const, page: index + 1 },
      confidence: 1,
    })),
    tables: [],
    images: [],
    metadata: { schemaVersion: SCHEMA_VERSION, parser: 'r3-test', parseDurationMs: 1, pageCount },
    warnings: [],
  }];
}

class ScenarioProvider implements ProductExtractionProvider {
  readonly provider = 'r3-mock';
  readonly model = 'r3-mock-v1';
  readonly calls = new Map<number, number>();

  constructor(private readonly scenario: {
    failOnce?: number;
    failAlways?: number;
    failUntil?: { chunk: number; attempts: number };
  } = {}) {}

  async extract(input: ExtractionInput): Promise<ProductExtractionResult> {
    const chunk = chunkIndex(input);
    const count = (this.calls.get(chunk) ?? 0) + 1;
    this.calls.set(chunk, count);
    await new Promise((resolve) => setTimeout(resolve, 1));
    const fail = (this.scenario.failOnce === chunk && count === 1)
      || this.scenario.failAlways === chunk
      || (this.scenario.failUntil?.chunk === chunk && count <= this.scenario.failUntil.attempts);
    if (fail) throw retryableTransportError();
    return emptyChunkResult(input, this);
  }
}

class LateProvider implements ProductExtractionProvider {
  readonly provider = 'late-mock';
  readonly model = 'late-mock-v1';
  private calls = 0;

  async extract(input: ExtractionInput): Promise<ProductExtractionResult> {
    this.calls += 1;
    if (this.calls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 40));
      return emptyChunkResult(input, this);
    }
    return emptyChunkResult(input, this);
  }
}

class SlowIgnoringCancelProvider implements ProductExtractionProvider {
  readonly provider = 'slow-mock';
  readonly model = 'slow-mock-v1';
  callCount = 0;
  private start!: () => void;
  readonly started = new Promise<void>((resolve) => { this.start = resolve; });

  async extract(input: ExtractionInput, _options?: ExtractionOptions): Promise<ProductExtractionResult> {
    this.callCount += 1;
    this.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    return emptyChunkResult(input, this);
  }
}

function chunkIndex(input: ExtractionInput) {
  return Number(input.chunkId.match(/:chunk:(\d+)$/)?.[1] ?? 0);
}

function retryableTransportError() {
  return new ProductExtractionError('AI_REQUEST_FAILED', '模拟临时传输失败', {
    diagnostics: {
      httpStatus: null,
      responseContentType: null,
      responseBodyLength: null,
      responseKind: null,
      providerRequestId: null,
      errorStage: 'transport',
    },
  });
}

function emptyChunkResult(input: ExtractionInput, provider: ProductExtractionProvider): ProductExtractionResult {
  return {
    schemaVersion: SCHEMA_VERSION,
    jobId: input.jobId,
    provider: provider.provider,
    model: provider.model,
    products: [],
    conflicts: [],
    warnings: [],
    metrics: {
      schemaVersion: SCHEMA_VERSION,
      documentCount: 1,
      chunkCount: 1,
      requestCount: 1,
      repairAttempts: 0,
      inputCharacters: input.evidenceItems.reduce((sum, item) => sum + item.text.length, 0),
      outputCharacters: 2,
      durationMs: 1,
      usage: { schemaVersion: SCHEMA_VERSION, promptTokens: null, completionTokens: null, totalTokens: null },
    },
    needsHumanReview: false,
    createdAt: new Date().toISOString(),
  };
}
