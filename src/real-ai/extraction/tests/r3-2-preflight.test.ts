/// <reference types="node" />

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SCHEMA_VERSION } from '../../types';
import type { ParsedDocument } from '../../types';
import { createExtractionChunks } from '../chunker';
import type {
  AIProviderConfig,
  ExtractionInput,
  ProductExtractionResult,
  ProviderAttemptStart,
  ProviderExtractionPayload,
} from '../contracts';
import {
  ChunkCheckpointError,
  createChunkFingerprint,
  fingerprintJson,
  PersistentChunkCheckpointStore,
  type ChunkCheckpointCompatibility,
} from '../persistent-chunk-checkpoint';
import { DeepSeekProductExtractionProvider } from '../providers/deepseek-product-extraction-provider';
import {
  RealProviderAttemptLedger,
  RealProviderLedgerError,
} from '../real-provider-attempt-ledger';
import { runR32Canary } from '../r3-2-canary-runner';

const config: AIProviderConfig = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'canary-mock-model',
  apiKey: 'never-sent',
  timeoutMs: 1_000,
  maxRepairAttempts: 1,
  maxOutputTokens: 6_000,
  thinkingMode: 'disabled',
};

test('Checkpoint Case 1：成功后重启resume复用且Provider调用0次', async () => withTemp(async (root) => {
  const firstFetch = scriptedFetch(() => validEmptyPayload());
  const first = await run(root, [3], firstFetch.fetch, { resume: false });
  assert.equal(first.status, 'completed');
  assert.equal(firstFetch.count(), 1);

  const restartedFetch = scriptedFetch(() => validEmptyPayload());
  const restarted = await run(root, [3], restartedFetch.fetch, { resume: true });
  assert.equal(restarted.status, 'completed');
  assert.equal(restarted.chunks[0].status, 'checkpoint-hit');
  assert.equal(restarted.chunks[0].checkpointHit, true);
  assert.equal(restarted.chunks[0].providerRequestCount, 0);
  assert.equal(restartedFetch.count(), 0);
}));

test('Checkpoint成功记录保留完整Validated Wire DTO与Evidence refs', async () => withTemp(async (root) => {
  const store = new PersistentChunkCheckpointStore(root);
  const input = inputs()[2];
  const payload = validRepairPayload();
  payload.products[0].productName = '脱敏产品';
  payload.products[0].evidenceRefs.productName = [{ evidenceId: 'safe-evidence-id', quote: '脱敏产品' }];
  await store.writeCompleted(compatibility(input, 3), payload, emptyResult(input));
  const restored = await store.read(compatibility(input, 3));
  assert.equal(restored?.status, 'completed');
  if (restored?.status !== 'completed') return;
  assert.deepEqual(restored.validatedWireDto, payload);
  assert.deepEqual(restored.validatedWireDto.products[0].evidenceRefs.productName, payload.products[0].evidenceRefs.productName);
}));

test('Checkpoint Case 2：失败后显式resume只调用失败Chunk', async () => withTemp(async (root) => {
  const initialFetch = scriptedFetch((_request, call) => call === 1 ? httpFailure(400) : validEmptyPayload());
  const initial = await run(root, [3, 7], initialFetch.fetch, { resume: false });
  assert.equal(initial.status, 'partial-failed');
  assert.equal(initialFetch.count(), 2);

  const resumedFetch = scriptedFetch(() => validEmptyPayload());
  const resumed = await run(root, [3, 7], resumedFetch.fetch, { resume: true });
  assert.equal(resumed.status, 'completed');
  assert.equal(resumedFetch.count(), 1);
  assert.equal(resumed.chunks.find((item) => item.chunkIndex === 7)?.status, 'checkpoint-hit');
  assert.equal(resumed.chunks.find((item) => item.chunkIndex === 3)?.status, 'completed');
}));

test('Checkpoint Case 3：3个成功2个失败重启后只处理2个失败项', async () => withTemp(async (root) => {
  const store = new PersistentChunkCheckpointStore(path.join(root, 'checkpoints'));
  const chunks = inputs();
  for (const index of [1, 2, 3]) {
    const expected = compatibility(chunks[index - 1], index);
    await store.writeCompleted(expected, validEmptyPayload(), emptyResult(chunks[index - 1]));
  }
  for (const index of [4, 5]) {
    await store.writeFailed(compatibility(chunks[index - 1], index), 'AI_HTTP_ERROR');
  }
  const restarted = new PersistentChunkCheckpointStore(path.join(root, 'checkpoints'));
  let providerCalls = 0;
  for (const index of [1, 2, 3, 4, 5]) {
    const checkpoint = await restarted.read(compatibility(chunks[index - 1], index));
    if (checkpoint?.status === 'completed') continue;
    providerCalls += 1;
    await restarted.writeCompleted(compatibility(chunks[index - 1], index), validEmptyPayload(), emptyResult(chunks[index - 1]));
  }
  assert.equal(providerCalls, 2);
}));

test('Checkpoint Case 4：sourceFingerprint变化时拒绝复用', async () => withTemp(async (root) => {
  const store = new PersistentChunkCheckpointStore(root);
  const input = inputs()[2];
  const expected = compatibility(input, 3);
  await store.writeCompleted(expected, validEmptyPayload(), emptyResult(input));
  await assert.rejects(store.read({ ...expected, sourceFingerprint: 'b'.repeat(64) }), checkpointError('CHECKPOINT_INCOMPATIBLE'));
}));

test('Checkpoint Case 5：schemaVersion变化时拒绝复用', async () => withTemp(async (root) => {
  const store = new PersistentChunkCheckpointStore(root);
  const input = inputs()[2];
  const expected = compatibility(input, 3);
  await store.writeCompleted(expected, validEmptyPayload(), emptyResult(input));
  await assert.rejects(store.read({ ...expected, schemaVersion: '2.0' } as never), checkpointError('CHECKPOINT_INCOMPATIBLE'));
}));

test('Checkpoint Case 6：model或thinking变化时拒绝复用', async () => withTemp(async (root) => {
  const store = new PersistentChunkCheckpointStore(root);
  const input = inputs()[2];
  const expected = compatibility(input, 3);
  await store.writeCompleted(expected, validEmptyPayload(), emptyResult(input));
  await assert.rejects(store.read({ ...expected, model: 'different-model' }), checkpointError('CHECKPOINT_INCOMPATIBLE'));
  await assert.rejects(store.read({ ...expected, thinkingMode: 'enabled' } as never), checkpointError('CHECKPOINT_INCOMPATIBLE'));
}));

test('Checkpoint兼容键：Chunk或提取配置指纹变化时拒绝复用', async () => withTemp(async (root) => {
  const store = new PersistentChunkCheckpointStore(root);
  const input = inputs()[2];
  const expected = compatibility(input, 3);
  await store.writeCompleted(expected, validEmptyPayload(), emptyResult(input));
  await assert.rejects(store.read({ ...expected, chunkFingerprint: 'd'.repeat(64) }), checkpointError('CHECKPOINT_INCOMPATIBLE'));
  await assert.rejects(store.read({ ...expected, extractionConfigFingerprint: 'e'.repeat(64) }), checkpointError('CHECKPOINT_INCOMPATIBLE'));
}));

test('Checkpoint Case 7：损坏文件Fail Closed且不调用Provider', async () => withTemp(async (root) => {
  const checkpointRoot = path.join(root, 'checkpoints');
  await writeFileAt(path.join(checkpointRoot, 'chunk-0003.json'), '{broken-json');
  const fake = scriptedFetch(() => validEmptyPayload());
  await assert.rejects(run(root, [3], fake.fetch, { resume: true }), checkpointError('CHECKPOINT_CORRUPT'));
  assert.equal(fake.count(), 0);
}));

test('Ledger Case 1：request started后completed正常落盘', async () => withTemp(async (root) => {
  const ledger = new RealProviderAttemptLedger(path.join(root, 'ledger.json'), 'ledger-job', 6);
  await ledger.initialize();
  const start = attempt(1, 'ledger-1');
  await ledger.onStarted(start);
  await ledger.onFinished({ ...start, status: 'completed', completedAt: new Date().toISOString(), durationMs: 12, providerRequestId: 'safe-id', errorCode: null });
  assert.equal(ledger.snapshot().attempts[0].status, 'completed');
  assert.equal(ledger.usedBudget(), 1);
}));

test('Ledger Case 2：started后崩溃在重启时标记AMBIGUOUS并禁止重试', async () => withTemp(async (root) => {
  const ledgerPath = path.join(root, 'ledger.json');
  const first = new RealProviderAttemptLedger(ledgerPath, 'ledger-job', 6);
  await first.initialize();
  await first.onStarted(attempt(3, 'ledger-crash'));
  const restarted = new RealProviderAttemptLedger(ledgerPath, 'ledger-job', 6);
  await restarted.initialize();
  assert.equal(restarted.snapshot().attempts[0].status, 'AMBIGUOUS_ATTEMPT');
  assert.throws(() => restarted.assertChunksSafeToRun([3]), ledgerError('AMBIGUOUS_ATTEMPT'));
}));

test('Ledger Case 3：MAX 6已started 4次，重启后remaining为2', async () => withTemp(async (root) => {
  const ledgerPath = path.join(root, 'ledger.json');
  const first = new RealProviderAttemptLedger(ledgerPath, 'ledger-job', 6);
  await first.initialize();
  for (let index = 1; index <= 4; index += 1) {
    const start = attempt(index, `ledger-${index}`);
    await first.onStarted(start);
    await first.onFinished({ ...start, status: 'completed', completedAt: new Date().toISOString(), durationMs: 1, providerRequestId: null, errorCode: null });
  }
  const restarted = new RealProviderAttemptLedger(ledgerPath, 'ledger-job', 6);
  await restarted.initialize();
  assert.equal(restarted.usedBudget(), 4);
  assert.equal(restarted.remainingBudget(), 2);
}));

test('Ledger Case 4：第7次在HTTP发送前阻断', async () => withTemp(async (root) => {
  const ledger = new RealProviderAttemptLedger(path.join(root, 'ledger.json'), 'canary-job', 6);
  await ledger.initialize();
  const fake = scriptedFetch(() => validEmptyPayload());
  const provider = new DeepSeekProductExtractionProvider(config, undefined, fake.fetch);
  const input = inputs()[2];
  for (let index = 1; index <= 6; index += 1) {
    await provider.extract(input, {
      requestContext: { attemptId: `outer-${index}`, requestAttempt: index, chunkIndex: 3, totalChunks: 32 },
      providerAttemptHooks: ledger,
    });
  }
  await assert.rejects(provider.extract(input, {
    requestContext: { attemptId: 'outer-7', requestAttempt: 7, chunkIndex: 3, totalChunks: 32 },
    providerAttemptHooks: ledger,
  }), (error: unknown) => (
    (error as { code?: string; cause?: { code?: string } }).code === 'AI_REAL_PROVIDER_BLOCKED'
    && (error as { cause?: { code?: string } }).cause?.code === 'REAL_REQUEST_BUDGET_EXHAUSTED'
  ));
  assert.equal(fake.count(), 6);
  assert.equal(ledger.usedBudget(), 6);
}));

test('Mock Canary：只执行3/7/27且Schema Valid总请求为3', async () => withTemp(async (root) => {
  const fake = scriptedFetch(() => validEmptyPayload());
  const result = await run(root, [3, 7, 27], fake.fetch, { resume: false });
  assert.equal(result.status, 'completed');
  assert.equal(fake.count(), 3);
  assert.deepEqual(fake.chunkIndexes(), [3, 7, 27]);
  assert.equal(result.usedBudgetAfter, 3);
}));

test('Mock Canary：三个Chunk都需要Repair时总请求严格等于6', async () => withTemp(async (root) => {
  const fake = scriptedFetch((_request, call) => call % 2 === 1 ? structurallyInvalidPayload() : validRepairPayload());
  const result = await run(root, [3, 7, 27], fake.fetch, { resume: false });
  assert.equal(result.status, 'completed');
  assert.equal(fake.count(), 6);
  assert.deepEqual(fake.chunkIndexes(), [3, 7, 27]);
  const ledger = new RealProviderAttemptLedger(path.join(root, 'ledger.json'), 'canary-job', 6);
  await ledger.initialize();
  assert.deepEqual(ledger.snapshot().attempts.map((attempt) => attempt.chunkIndex), [3, 3, 7, 7, 27, 27]);
  assert.equal(result.usedBudgetAfter, 6);
  assert.ok(result.chunks.every((chunk) => chunk.repairRequestCount === 1));
  assert.ok(result.chunks.every((chunk) => chunk.schemaIssueCount === 1));
}));

test('Mock Canary：Repair修改产品事实触发Semantic Drift并保存失败状态', async () => withTemp(async (root) => {
  const changed = validRepairPayload();
  changed.products[0].productName = '模型新增的事实';
  const fake = scriptedFetch((_request, call) => call === 1 ? structurallyInvalidPayload() : changed);
  const result = await run(root, [3], fake.fetch, { resume: false });
  assert.equal(result.status, 'blocked');
  assert.equal(result.chunks[0].errorCode, 'REPAIR_SEMANTIC_DRIFT');
  assert.equal(fake.count(), 2);
  const checkpoint = await new PersistentChunkCheckpointStore(path.join(root, 'checkpoints')).read(compatibility(inputs()[2], 3));
  assert.equal(checkpoint?.status, 'failed');
}));

test('Mock Canary：失败Checkpoint未显式resume时不调用Provider', async () => withTemp(async (root) => {
  const store = new PersistentChunkCheckpointStore(path.join(root, 'checkpoints'));
  await store.writeFailed(compatibility(inputs()[2], 3), 'AI_SCHEMA_INVALID');
  const fake = scriptedFetch(() => validEmptyPayload());
  const result = await run(root, [3], fake.fetch, { resume: false });
  assert.equal(result.status, 'blocked');
  assert.equal(result.chunks[0].errorCode, 'EXPLICIT_RESUME_REQUIRED');
  assert.equal(fake.count(), 0);
}));

test('Mock Canary：Ledger有历史调用但Checkpoint缺失时按模糊状态阻断', async () => withTemp(async (root) => {
  const ledger = new RealProviderAttemptLedger(path.join(root, 'ledger.json'), 'canary-job', 6);
  await ledger.initialize();
  const started = { ...attempt(3, 'orphan-request'), jobId: 'canary-job' };
  await ledger.onStarted(started);
  await ledger.onFinished({ ...started, status: 'completed', completedAt: new Date().toISOString(), durationMs: 1, providerRequestId: null, errorCode: null });
  const fake = scriptedFetch(() => validEmptyPayload());
  await assert.rejects(run(root, [3], fake.fetch, { resume: true }), (error: unknown) => (
    (error as { code?: string }).code === 'AMBIGUOUS_ATTEMPT'
  ));
  assert.equal(fake.count(), 0);
}));

test('Mock Canary：禁止选择10、26或其他Chunk', async () => withTemp(async (root) => {
  const fake = scriptedFetch(() => validEmptyPayload());
  await assert.rejects(run(root, [3, 10, 27], fake.fetch, { resume: false }), (error: unknown) => (
    (error as { code?: string }).code === 'CANARY_CHUNK_NOT_ALLOWED'
  ));
  assert.equal(fake.count(), 0);
}));

test('Mock Canary：dry-run精确选中Chunk且真实请求为0', async () => withTemp(async (root) => {
  const fake = scriptedFetch(() => validEmptyPayload());
  const result = await run(root, [3, 7, 27], fake.fetch, { resume: false, dryRun: true });
  assert.equal(result.status, 'dry-run');
  assert.deepEqual(result.chunkIndexes, [3, 7, 27]);
  assert.equal(result.estimatedRequestCount, 6);
  assert.equal(result.providerRequestCount, 0);
  assert.equal(fake.count(), 0);
  assert.equal(result.usedBudgetAfter, 0);
}));

async function run(
  root: string,
  selectedChunkIndexes: number[],
  fetchImpl: typeof fetch,
  options: { resume: boolean; dryRun?: boolean },
) {
  const provider = new DeepSeekProductExtractionProvider(config, undefined, fetchImpl);
  return runR32Canary({
    jobId: 'canary-job',
    sourceFile: 'external-customer.pdf',
    sourceFingerprint: 'a'.repeat(64),
    allChunks: inputs(),
    selectedChunkIndexes,
    provider,
    thinkingMode: 'disabled',
    promptConfigFingerprint: 'b'.repeat(64),
    extractionConfigFingerprint: 'c'.repeat(64),
    checkpointStore: new PersistentChunkCheckpointStore(path.join(root, 'checkpoints')),
    ledger: new RealProviderAttemptLedger(path.join(root, 'ledger.json'), 'canary-job', 6),
    maxRealRequests: 6,
    concurrency: 1,
    dryRun: options.dryRun ?? false,
    resume: options.resume,
  });
}

function inputs(): ExtractionInput[] {
  return createExtractionChunks(document32(), 'canary-job', { sampleId: 'r3-2-test' }, {
    maxChunksPerDocument: 40,
    maxConcurrentRequests: 1,
  });
}

function document32(): ParsedDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    fileId: 'canary-document',
    fileName: 'external-customer.pdf',
    fileType: 'pdf',
    mimeType: 'application/pdf',
    size: 3_200,
    sha256: 'a'.repeat(64),
    rawText: '',
    blocks: Array.from({ length: 32 }, (_, index) => ({
      schemaVersion: SCHEMA_VERSION,
      id: `page-${index + 1}`,
      type: 'paragraph' as const,
      text: `第${index + 1}页脱敏产品信息`,
      source: { schemaVersion: SCHEMA_VERSION, kind: 'pdf' as const, page: index + 1 },
      confidence: 1,
    })),
    tables: [],
    images: [],
    metadata: { schemaVersion: SCHEMA_VERSION, parser: 'r3-2-test', parseDurationMs: 1, pageCount: 32 },
    warnings: [],
  };
}

function compatibility(input: ExtractionInput, chunkIndex: number): ChunkCheckpointCompatibility {
  return {
    jobId: 'canary-job',
    sourceFingerprint: 'a'.repeat(64),
    chunkId: input.chunkId,
    chunkIndex,
    chunkFingerprint: createChunkFingerprint(input, 'a'.repeat(64), chunkIndex),
    schemaVersion: '1.0',
    provider: 'deepseek',
    model: config.model,
    thinkingMode: 'disabled',
    promptConfigFingerprint: 'b'.repeat(64),
    extractionConfigFingerprint: 'c'.repeat(64),
  };
}

function validEmptyPayload(): ProviderExtractionPayload {
  return { schemaVersion: '1.0', products: [] };
}

function structurallyInvalidPayload(): unknown {
  return { ...validRepairPayload(), products: [{ ...validRepairPayload().products[0], notes: {} }] };
}

function validRepairPayload(): ProviderExtractionPayload {
  return {
    schemaVersion: '1.0',
    products: [{
      productName: null,
      model: null,
      specifications: {},
      quantity: { value: null, unit: null, raw: null },
      material: null,
      process: null,
      application: null,
      notes: [],
      evidenceRefs: {},
    }],
  };
}

function emptyResult(input: ExtractionInput): ProductExtractionResult {
  return {
    schemaVersion: SCHEMA_VERSION,
    jobId: input.jobId,
    provider: 'deepseek',
    model: config.model,
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

function scriptedFetch(responder: (request: RequestInit, call: number) => unknown | Response) {
  let calls = 0;
  const chunks: number[] = [];
  const fetchImpl = (async (_url: string | URL | Request, request?: RequestInit) => {
    calls += 1;
    const body = JSON.parse(String(request?.body ?? '{}')) as { messages?: Array<{ content?: string }> };
    const content = body.messages?.map((message) => message.content ?? '').join('\n') ?? '';
    const evidenceId = content.match(/canary-document:block:page-(\d+)/)?.[1];
    if (evidenceId) chunks.push(Number(evidenceId));
    const response = responder(request ?? {}, calls);
    if (response instanceof Response) return response;
    return completion(response);
  }) as typeof fetch;
  return { fetch: fetchImpl, count: () => calls, chunkIndexes: () => chunks };
}

function completion(payload: unknown): Response {
  return new Response(JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function httpFailure(status: number): Response {
  return new Response(JSON.stringify({ error: { type: 'test' } }), { status, headers: { 'Content-Type': 'application/json' } });
}

function attempt(chunkIndex: number, attemptId: string): ProviderAttemptStart {
  return {
    attemptId,
    jobId: 'ledger-job',
    chunkId: `document:chunk:${chunkIndex}`,
    chunkIndex,
    requestAttempt: 1,
    repairAttempt: 0,
    provider: 'deepseek',
    model: config.model,
    startedAt: new Date().toISOString(),
  };
}

function checkpointError(code: ChunkCheckpointError['code']) {
  return (error: unknown) => error instanceof ChunkCheckpointError && error.code === code;
}

function ledgerError(code: RealProviderLedgerError['code']) {
  return (error: unknown) => error instanceof RealProviderLedgerError && error.code === code;
}

async function writeFileAt(target: string, content: string) {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

async function withTemp(operation: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'r3-2-preflight-'));
  try {
    await operation(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
