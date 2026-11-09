const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { FullAnalysisJobManager, matchingInput } = require('../pipeline/full-analysis-job-manager.cjs');

function descriptor(fileId = 'file-001') {
  return { fileId, displayName: `${fileId}.xlsx`, detectedType: 'xlsx', size: 1024 };
}

function document(fileId = 'file-001', fileType = 'xlsx') {
  return {
    schemaVersion: '1.0', fileId, fileName: `${fileId}.${fileType === 'image' ? 'png' : fileType}`, fileType,
    mimeType: fileType === 'image' ? 'image/png' : 'application/octet-stream', size: 100, sha256: fileId.padEnd(64, '0').slice(0, 64),
    rawText: '自动喷涂设备 SP-3000', blocks: [], tables: [], images: [],
    metadata: { schemaVersion: '1.0', parser: 'test', parseDurationMs: 2 }, warnings: [],
  };
}

function extractedProduct(id = 'extracted-001') {
  return {
    schemaVersion: '1.0', id, productName: '自动喷涂设备', model: 'SP-3000', specifications: {},
    quantity: { schemaVersion: '1.0', value: 1, unit: '套', raw: '1套' }, material: null, process: null,
    application: '五金件喷涂', notes: [], sourceFile: 'file-001.xlsx', sourceLocations: [], evidence: [],
    confidence: 0.96, fieldConfidence: {}, needsHumanReview: false, conflicts: [], reviewReasons: [],
  };
}

function extractionResult(product = extractedProduct()) {
  return {
    schemaVersion: '1.0', jobId: 'extract-test', provider: 'mock', model: 'mock', products: [product], conflicts: [], warnings: [],
    metrics: { schemaVersion: '1.0', documentCount: 1, chunkCount: 1, requestCount: 1, repairAttempts: 0, inputCharacters: 10, outputCharacters: 10, durationMs: 1, usage: { schemaVersion: '1.0', promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
    needsHumanReview: false, createdAt: new Date().toISOString(),
  };
}

function matchResult(product = extractedProduct()) {
  return {
    schemaVersion: '1.0', matchId: 'match-001', extractedProductId: product.id,
    extractedProductSnapshot: { ...product, warnings: [], conflicts: [] }, candidateProductId: 'catalog-001',
    candidateProductSnapshot: { schemaVersion: '1.0', productId: 'catalog-001', productName: '自动喷涂设备标准方案', model: 'SP-3000', category: '喷涂设备', specifications: {}, applications: ['五金件喷涂'], keywords: [], synonyms: [], status: 'active', version: 1 },
    candidateRank: 1, status: 'matched', level: 'exact', score: 100, matchedRules: [], conflictingRules: [], evidence: [],
    needsHumanReview: false, reviewStatus: 'not_required', reviewReasons: [], catalogVersion: 1, createdAt: new Date().toISOString(),
  };
}

class FakeParser extends EventEmitter {
  constructor({ delay = 0 } = {}) { super(); this.delay = delay; this.cancelled = new Set(); this.jobs = new Map(); }
  start({ fileIds }) { const jobId = `parser-${Date.now()}-${this.jobs.size}`; this.jobs.set(jobId, fileIds); return { jobId }; }
  async waitForTerminal(jobId) {
    if (this.delay) await new Promise((resolve) => setTimeout(resolve, this.delay));
    if (this.cancelled.has(jobId)) return { status: 'cancelled' };
    return { status: 'completed', documents: (this.jobs.get(jobId) ?? []).map((fileId) => document(fileId, fileId.includes('image') ? 'image' : fileId.includes('pdf') ? 'pdf' : 'xlsx')), warnings: [] };
  }
  async cancel({ jobId }) { this.cancelled.add(jobId); return { status: 'cancelled' }; }
}

function repository(ready = true) {
  return {
    initialize: async () => undefined,
    getVersionInfo: async () => ({ currentVersion: ready ? 1 : null, productCount: ready ? 1 : 0 }),
  };
}

function manager(options = {}) {
  const parserJobManager = options.parserJobManager ?? new FakeParser();
  const descriptors = new Map();
  const stagingService = { getDescriptor(fileId) { if (!descriptors.has(fileId)) descriptors.set(fileId, descriptor(fileId)); return descriptors.get(fileId); } };
  return new FullAnalysisJobManager({
    parserJobManager, stagingService, productRepository: options.productRepository ?? repository(true),
    environment: options.environment ?? {}, extractionServiceFactory: options.extractionServiceFactory,
    matchEngineFactory: options.matchEngineFactory ?? (() => ({ match: async ({ extractedProduct }) => ({ results: [matchResult(extractedProduct)] }) })),
  });
}

const successfulExtraction = () => ({ extract: async () => extractionResult() });

test('真实编排按解析、提取、匹配完成并保留客户上下文', async () => {
  const subject = manager({ extractionServiceFactory: successfulExtraction });
  const started = subject.start({ customerId: 'customer-jinhua-001', fileIds: ['file-001'] });
  const result = await subject.waitForTerminal(started.jobId);
  assert.equal(result.status, 'completed');
  assert.equal(result.customerId, 'customer-jinhua-001');
  assert.equal(result.extractedProducts[0].model, 'SP-3000');
  assert.equal(result.matchGroups[0].results[0].level, 'exact');
  assert.equal(result.diagnostics.attemptNumber, 1);
  assert.equal(result.diagnostics.extraction.schemaValid, true);
  assert.equal(result.diagnostics.matching.matchGroupCount, 1);
  await subject.dispose();
});

test('产品库为空时保留提取结果并暂停匹配', async () => {
  const subject = manager({ extractionServiceFactory: successfulExtraction, productRepository: repository(false) });
  const result = await subject.waitForTerminal(subject.start({ customerId: 'customer-jinhua-001', fileIds: ['file-001'] }).jobId);
  assert.equal(result.status, 'catalog-required');
  assert.equal(result.extractedProducts.length, 1);
  assert.equal(result.matchGroups.length, 0);
  assert.equal(result.error.code, 'CATALOG_NOT_CONFIGURED');
  await subject.dispose();
});

test('无DeepSeek配置明确失败且不切换Mock', async () => {
  const subject = manager({ extractionServiceFactory: null, environment: {} });
  const result = await subject.waitForTerminal(subject.start({ customerId: 'customer-jinhua-001', fileIds: ['file-001'] }).jobId);
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'AI_NOT_CONFIGURED');
  assert.equal(result.extractedProducts.length, 0);
  await subject.dispose();
});

test('取消后忽略迟到的提取结果', async () => {
  const extractionServiceFactory = () => ({ extract: async () => { await new Promise((resolve) => setTimeout(resolve, 80)); return extractionResult(); } });
  const subject = manager({ extractionServiceFactory });
  const started = subject.start({ customerId: 'customer-jinhua-001', fileIds: ['file-001'] });
  await new Promise((resolve) => setTimeout(resolve, 15));
  await subject.cancel({ jobId: started.jobId });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const result = subject.status({ jobId: started.jobId });
  assert.equal(result.status, 'cancelled');
  assert.equal(result.matchGroups.length, 0);
  await subject.dispose();
});

test('AI失败后可以复用解析结果重试', async () => {
  let attempts = 0;
  const extractionServiceFactory = () => ({ extract: async () => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error('timeout'), { code: 'AI_TIMEOUT', retryable: true });
    return extractionResult();
  } });
  const subject = manager({ extractionServiceFactory });
  const started = subject.start({ customerId: 'customer-jinhua-001', fileIds: ['file-001'] });
  const failed = await subject.waitForTerminal(started.jobId);
  assert.equal(failed.status, 'failed');
  subject.retry({ jobId: started.jobId });
  const completed = await subject.waitForTerminal(started.jobId);
  assert.equal(completed.status, 'completed');
  assert.equal(attempts, 2);
  assert.equal(completed.diagnostics.attemptNumber, 2);
  assert.equal(completed.diagnostics.previousAttempts.length, 1);
  assert.equal(completed.diagnostics.previousAttempts[0].failureCode, 'AI_TIMEOUT');
  assert.equal(completed.extractedProducts.length, 1);
  await subject.dispose();
});

test('按客户恢复任务且不会串客户', async () => {
  const subject = manager({ extractionServiceFactory: successfulExtraction });
  const first = subject.start({ customerId: 'customer-jinhua-001', fileIds: ['file-a'] });
  const second = subject.start({ customerId: 'customer-yiwu-002', fileIds: ['file-b'] });
  await Promise.all([subject.waitForTerminal(first.jobId), subject.waitForTerminal(second.jobId)]);
  assert.equal(subject.resume({ customerId: 'customer-jinhua-001' }).jobId, first.jobId);
  assert.equal(subject.resume({ customerId: 'customer-yiwu-002' }).jobId, second.jobId);
  await subject.dispose();
});

test('OCR型号歧义时只用原始Evidence名称提示召回且不修改原型号', () => {
  const product = extractedProduct('ocr-001');
  product.productName = null;
  product.model = '9P-3000';
  product.needsHumanReview = true;
  product.evidence = [{ schemaVersion: '1.0', evidenceId: 'ev-1', chunkId: 'chunk-1', field: 'model', text: '产品 名称：自动 喷涂 设备 型号：9P-3000 数量：1套', sourceFile: 'input.png', source: { schemaVersion: '1.0', kind: 'image', imageId: 'image-1' }, confidence: 0.62, originKind: 'ocr' }];
  const resolved = matchingInput(product);
  assert.equal(resolved.usedEvidenceHint, true);
  assert.equal(resolved.product.productName, '自动 喷涂 设备');
  assert.equal(resolved.product.model, '9P-3000');
  assert.equal(product.productName, null);
});

test('只有OCR歧义型号时不制造SP候选召回提示', () => {
  const product = extractedProduct('ocr-model-only');
  product.productName = null;
  product.model = '9P-3000';
  product.needsHumanReview = true;
  product.evidence = [{ schemaVersion: '1.0', evidenceId: 'ev-model', chunkId: 'chunk-1', field: 'model', text: '型号：9P-3000', sourceFile: 'input.png', source: { schemaVersion: '1.0', kind: 'image', imageId: 'image-1' }, confidence: 0.55, originKind: 'ocr' }];
  const resolved = matchingInput(product);
  assert.equal(resolved.usedEvidenceHint, false);
  assert.equal(resolved.product.model, '9P-3000');
  assert.equal(resolved.product.productName, null);
});

test('001F一次性把全部文档交给001C并完整透传跨文件Evidence', async () => {
  let receivedDocuments = [];
  const product = extractedProduct('cross-file-001');
  product.evidence = [
    { schemaVersion: '1.0', evidenceId: 'same-id', chunkId: 'chunk-pdf', field: 'model', text: 'SP-3000', sourceFile: 'request.pdf', source: { schemaVersion: '1.0', kind: 'pdf', page: 1 }, confidence: 0.99, originKind: 'text' },
    { schemaVersion: '1.0', evidenceId: 'same-id', chunkId: 'chunk-image', field: 'model', text: 'SP-3000', sourceFile: 'nameplate.png', source: { schemaVersion: '1.0', kind: 'image', imageId: 'image-1' }, confidence: 0.62, originKind: 'ocr' },
  ];
  const subject = manager({ extractionServiceFactory: () => ({ extract: async (documents) => { receivedDocuments = documents; return extractionResult(product); } }) });
  const result = await subject.waitForTerminal(subject.start({ customerId: 'customer-jinhua-001', fileIds: ['request-pdf', 'nameplate-image'] }).jobId);
  assert.equal(receivedDocuments.length, 2);
  assert.equal(result.extractedProducts.length, 1);
  assert.equal(result.extractedProducts[0].evidence.length, 2);
  assert.deepEqual(result.extractedProducts[0].evidence.map((item) => item.sourceFile), ['request.pdf', 'nameplate.png']);
  assert.equal(result.extractedProducts[0].evidence[1].source.kind, 'image');
  await subject.dispose();
});

test('Provider失败保留真实错误分类和安全诊断', async () => {
  const subject = manager({ extractionServiceFactory: () => ({ extract: async () => { throw Object.assign(new Error('DeepSeek请求失败（HTTP 502）'), { code: 'AI_EXTRACTION_FAILED' }); } }) });
  const result = await subject.waitForTerminal(subject.start({ customerId: 'customer-jinhua-001', fileIds: ['file-001'] }).jobId);
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'AI_REQUEST_FAILED');
  assert.equal(result.diagnostics.failureStage, 'extracting-products');
  assert.equal(result.diagnostics.extraction.providerHttpStatus, 502);
  assert.equal(result.diagnostics.extraction.errorCode, 'AI_REQUEST_FAILED');
  assert.equal(result.diagnostics.extraction.schemaValid, false);
  assert.doesNotMatch(JSON.stringify(result.diagnostics), /Authorization|sk-test-secret/);
  await subject.dispose();
});

test('无HTTP状态的提取失败不会误报为未配置', async () => {
  const subject = manager({ extractionServiceFactory: () => ({ extract: async () => { throw Object.assign(new Error('AI结构化提取失败'), { code: 'AI_EXTRACTION_FAILED' }); } }) });
  const result = await subject.waitForTerminal(subject.start({ customerId: 'customer-jinhua-001', fileIds: ['file-001'] }).jobId);
  assert.equal(result.error.code, 'AI_EXTRACTION_FAILED');
  assert.equal(result.diagnostics.failureCode, 'AI_EXTRACTION_FAILED');
  await subject.dispose();
});

test('001C内部中止不会被误报为用户取消', async () => {
  const subject = manager({ extractionServiceFactory: () => ({ extract: async () => { throw Object.assign(new Error('内部并发请求被中止'), { code: 'AI_EXTRACTION_CANCELLED' }); } }) });
  const result = await subject.waitForTerminal(subject.start({ customerId: 'customer-jinhua-001', fileIds: ['file-001'] }).jobId);
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'AI_EXTRACTION_FAILED');
  assert.equal(result.diagnostics.failureStage, 'extracting-products');
  await subject.dispose();
});
