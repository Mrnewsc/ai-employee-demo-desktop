import assert from 'node:assert/strict';
import test from 'node:test';
import { RealFileAnalysisClient } from '../../clients/real-file-analysis-client';
import type { RealAnalysisSnapshot } from '..';
import type { ProductMatchResult } from '../../matching';

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

const memoryStorage = new MemoryStorage();

Object.defineProperty(globalThis, 'window', { value: { sessionStorage: memoryStorage }, configurable: true });

function match(productId: string, candidateId: string | null, rank = 1): ProductMatchResult {
  return {
    schemaVersion: '1.0', matchId: `match-${productId}-${rank}`, extractedProductId: productId,
    extractedProductSnapshot: { schemaVersion: '1.0', id: productId, productName: '自动喷涂设备', model: 'SP-3000', specifications: {}, material: null, process: null, application: null, sourceFile: 'input.xlsx', needsHumanReview: false, warnings: [], conflicts: [] },
    candidateProductId: candidateId,
    candidateProductSnapshot: candidateId ? { schemaVersion: '1.0', productId: candidateId, productName: rank === 1 ? '自动喷涂设备标准方案' : '自动喷涂设备增强方案', model: rank === 1 ? 'SP-3000' : 'SP-3000A', category: '喷涂设备', specifications: { 工作宽度: '1200mm' }, applications: [], keywords: [], synonyms: [], status: 'active', version: 1 } : null,
    candidateRank: candidateId ? rank : null, status: candidateId ? 'matched' : 'none', level: candidateId ? (rank === 1 ? 'exact' : 'high') : 'none', score: candidateId ? 95 : null,
    matchedRules: [], conflictingRules: [], evidence: [], needsHumanReview: !candidateId, reviewStatus: candidateId ? 'not_required' : 'pending', reviewReasons: [], catalogVersion: 1, createdAt: new Date().toISOString(),
  };
}

function snapshot(): RealAnalysisSnapshot {
  const product = (id: string, name: string) => ({
    schemaVersion: '1.0' as const, id, productName: name, model: id === 'p1' ? 'SP-3000' : null, specifications: {},
    quantity: { schemaVersion: '1.0' as const, value: 1, unit: '套', raw: '1套' }, material: null, process: null, application: null,
    notes: [], sourceFile: 'input.xlsx', sourceLocations: [], evidence: [], confidence: 0.9, fieldConfidence: {}, needsHumanReview: id !== 'p1', conflicts: [], reviewReasons: [],
  });
  return {
    schemaVersion: '1.0', jobId: 'pipeline-quote-test', customerId: 'customer-jinhua-001', status: 'completed', stage: 'complete',
    progress: { schemaVersion: '1.0', completedFiles: 1, totalFiles: 1, currentFile: null, message: '完成' }, files: [], parserWarnings: [],
    extractedProducts: [product('p1', '自动喷涂设备'), product('p2', '未知配件')], extractionWarnings: [], extractionMetrics: null,
    matchGroups: [{ schemaVersion: '1.0', extractedProductId: 'p1', results: [match('p1', 'c1'), match('p1', 'c2', 2)] }, { schemaVersion: '1.0', extractedProductId: 'p2', results: [match('p2', null)] }],
    diagnostics: {
      schemaVersion: '1.0', attemptNumber: 1, jobId: 'pipeline-quote-test', customerId: 'customer-jinhua-001', status: 'completed', stage: 'complete',
      startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 1, files: [],
      extraction: { schemaVersion: '1.0', provider: 'mock', model: 'mock', extractionStartedAt: new Date().toISOString(), extractionDurationMs: 1, requestCount: 1, retryCount: 0, repairCount: 0, errorCode: null, errorStage: null, providerHttpStatus: null, providerRequestId: null, timeoutMs: null, outputTruncated: false, schemaValid: true },
      matching: { schemaVersion: '1.0', catalogVersion: 1, extractedProductCount: 2, matchGroupCount: 2, matchingDurationMs: 1, matchingErrorCode: null },
      failureStage: null, failureCode: null, safeFailureMessage: null, statusHistory: [], previousAttempts: [],
    },
    catalogVersion: 1, error: null, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
  };
}

test('未确认产品严格阻止报价草案', () => {
  const client = new RealFileAnalysisClient();
  assert.throws(() => client.createQuoteDraft(snapshot()), /还有2个产品需要人工确认/);
});

test('人工更换候选后只把确认产品带入报价且价格为空', () => {
  const client = new RealFileAnalysisClient();
  const state = snapshot();
  client.confirmMatch(state.jobId, 'p1', 'changed', 'c2', state, '人工选择增强方案');
  client.confirmMatch(state.jobId, 'p2', 'not-found', null, state, '产品库无对应项');
  const handoff = client.createQuoteDraft(state);
  assert.equal(handoff.items.length, 1);
  assert.equal(handoff.items[0].productId, 'c2');
  assert.equal(handoff.items[0].model, 'SP-3000A');
  assert.equal(handoff.items[0].unitPrice, null);
  assert.equal(handoff.items[0].audit.originalModel, 'SP-3000');
  assert.equal(handoff.items[0].audit.originalMatchResult?.candidateProductId, 'c1');
  assert.equal(handoff.items[0].audit.humanDecision.decision, 'changed');
  assert.equal(handoff.items[0].audit.humanDecision.selectedProductId, 'c2');
});

test('暂不确认会重新锁定报价', () => {
  const client = new RealFileAnalysisClient();
  const state = snapshot();
  client.confirmMatch(state.jobId, 'p1', 'accepted', 'c1', state);
  client.confirmMatch(state.jobId, 'p2', 'not-found', null, state);
  assert.equal(client.createQuoteDraft(state).items.length, 1);
  client.confirmMatch(state.jobId, 'p1', 'pending', null, state);
  assert.throws(() => client.createQuoteDraft(state), /还有1个产品需要人工确认/);
});

test('重试前清除旧attempt的人工确认，避免脏状态进入新结果', async () => {
  const state = snapshot();
  const client = new RealFileAnalysisClient();
  client.confirmMatch(state.jobId, 'p1', 'accepted', 'c1', state);
  const originalWindow = globalThis.window as typeof window & { realAI?: unknown };
  originalWindow.realAI = {
    pipeline: { retry: async () => state },
    files: {},
  };
  await client.retry(state.jobId);
  assert.deepEqual(client.getConfirmations(state.jobId), {});
  delete originalWindow.realAI;
});
