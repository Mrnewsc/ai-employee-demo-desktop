/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { createExtractionChunks } from '../chunker';
import type { AIProviderConfig, ExtractionAuditEvent, ExtractionRequestRecord } from '../contracts';
import { GOLDEN_CASES, createGoldenResponse } from '../fixtures/golden-cases';
import { DeepSeekProductExtractionProvider } from '../providers/deepseek-product-extraction-provider';
import { analyzeRepairDiff } from '../repair-diff';
import {
  getRealDeepSeekRequestCount,
  resetRealDeepSeekRequestCountForTests,
} from '../real-provider-guard';
import { buildSchemaRepairPrompt, SCHEMA_REPAIR_SYSTEM_PROMPT } from '../schema-repair-prompt';
import {
  classifySchemaIssueRepairability,
  mapZodIssues,
  safeReceivedShape,
} from '../schema-validation-diagnostics';
import { safeCanonicalizeProviderPayload } from '../safe-canonicalization';
import { ProviderExtractionPayloadSchema } from '../schemas';

const config: AIProviderConfig = {
  provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'offline-test', apiKey: 'never-sent',
  timeoutMs: 100, maxRepairAttempts: 1, maxOutputTokens: 2_000, thinkingMode: 'disabled',
};
const golden = GOLDEN_CASES[0];
const input = createExtractionChunks(golden.documents[0], 'r3-1-offline')[0];
const validPayload = () => createGoldenResponse(golden, input);

test('A/C：expected number received string生成稳定SchemaIssue', () => {
  const schema = z.object({ count: z.number() }).strict();
  const value = { count: '3' };
  const issue = issues(schema, value)[0];
  assertIssue(issue, 'count', 'INVALID_TYPE', 'number', 'string');
});

test('expected string received array不保存数组内容', () => {
  const value = mutateProduct({ productName: ['CUSTOMER_SECRET'] });
  const issue = providerIssues(value).find((item) => item.fieldPath.endsWith('productName'))!;
  assertIssue(issue, 'products[0].productName', 'INVALID_TYPE', 'string', 'array');
  assert.equal(JSON.stringify(issue).includes('CUSTOMER_SECRET'), false);
});

test('expected array received object明确分类INVALID_ARRAY', () => {
  const issue = providerIssues(mutateProduct({ notes: { value: 'secret' } }))[0];
  assertIssue(issue, 'products[0].notes', 'INVALID_ARRAY', 'array', 'object');
});

test('D：missing required保留完整字段路径', () => {
  const value = mutateProduct({}, ['productName']);
  const issue = providerIssues(value).find((item) => item.fieldPath.endsWith('productName'))!;
  assertIssue(issue, 'products[0].productName', 'MISSING_REQUIRED', 'string', 'undefined');
});

test('F：unexpected field被定位但动态字段名不泄露', () => {
  const value = mutateProduct({ customerPrivateKey: 'CUSTOMER_SECRET' });
  const issue = providerIssues(value).find((item) => item.issueCode === 'UNKNOWN_FIELD')!;
  assertIssue(issue, 'products[0].<unknown-field-1>', 'UNKNOWN_FIELD', 'known object fields', 'object');
  assert.equal(JSON.stringify(issue).includes('customerPrivateKey'), false);
  assert.equal(JSON.stringify(issue).includes('CUSTOMER_SECRET'), false);
});

test('E：invalid enum只记录允许值数量', () => {
  const value = { ...validPayload(), schemaVersion: '2.0' };
  const issue = providerIssues(value).find((item) => item.fieldPath === 'schemaVersion')!;
  assertIssue(issue, 'schemaVersion', 'INVALID_ENUM', 'allowed literal or enum', 'string');
  assert.equal(issue.expectedConstraint, 'allowedValues=1');
  assert.equal(JSON.stringify(issue).includes('2.0'), false);
});

test('G：quantity shape错误归类INVALID_QUANTITY', () => {
  const issue = providerIssues(mutateProduct({ quantity: '3套' }))[0];
  assertIssue(issue, 'products[0].quantity', 'INVALID_QUANTITY', 'object', 'string');
});

test('H：specifications shape错误归类INVALID_SPECIFICATION', () => {
  const issue = providerIssues(mutateProduct({ specifications: [] }))[0];
  assertIssue(issue, 'products[0].specifications', 'INVALID_SPECIFICATION', 'record', 'array');
});

test('I：evidenceRefs shape错误归类INVALID_EVIDENCE_REF', () => {
  const issue = providerIssues(mutateProduct({ evidenceRefs: [] }))[0];
  assertIssue(issue, 'products[0].evidenceRefs', 'INVALID_EVIDENCE_REF', 'record', 'array');
});

test('B：嵌套数组路径保留products索引与Evidence索引', () => {
  const product = structuredClone(validPayload().products[0]);
  const value = { schemaVersion: '1.0', products: [product, structuredClone(product), structuredClone(product)] };
  value.products[2].evidenceRefs.model = [
    value.products[2].evidenceRefs.model[0],
    { evidenceId: [], quote: 'safe' } as never,
  ];
  const issue = providerIssues(value).find((item) => item.fieldPath.includes('[1].evidenceId'))!;
  assertIssue(issue, 'products[2].evidenceRefs.model[1].evidenceId', 'INVALID_EVIDENCE_REF', 'string', 'array');
});

test('J：products root错误归类ROOT_SHAPE_INVALID', () => {
  const value = { schemaVersion: '1.0', products: {} };
  const issue = providerIssues(value)[0];
  assertIssue(issue, 'products', 'ROOT_SHAPE_INVALID', 'array', 'object');
});

test('K：null与必填array冲突保持INVALID_ARRAY', () => {
  const issue = providerIssues(mutateProduct({ notes: null }))[0];
  assertIssue(issue, 'products[0].notes', 'INVALID_ARRAY', 'array', 'null');
});

test('L：union无法匹配归类INVALID_UNION', () => {
  const schema = z.object({ choice: z.union([z.string(), z.number()]) });
  const issue = issues(schema, { choice: [] })[0];
  assertIssue(issue, 'choice', 'INVALID_UNION', null, 'array');
});

test('M：receivedShape只记录结构且不泄露自由文本', () => {
  const shape = safeReceivedShape({ value: 'CUSTOMER_SECRET', unit: '件', customSecretKey: 'x' });
  assert.equal(shape, 'object(keys=3;known=[unit,value];dynamicKeys=1)');
  assert.equal(shape.includes('CUSTOMER_SECRET'), false);
  assert.equal(shape.includes('customSecretKey'), false);
});

test('N/O：Schema Repair Prompt不含客户原始Chunk并明确禁止新增事实', () => {
  const providerJson = mutateProduct({ notes: {} });
  const prompt = buildSchemaRepairPrompt(providerJson, providerIssues(providerJson));
  assert.equal(prompt.includes('CUSTOMER_RAW_CHUNK_NOT_IN_PROVIDER_JSON'), false);
  assert.match(SCHEMA_REPAIR_SYSTEM_PROMPT, /不新增产品/);
  assert.match(SCHEMA_REPAIR_SYSTEM_PROMPT, /不修改已有文本事实/);
  assert.match(SCHEMA_REPAIR_SYSTEM_PROMPT, /不改变Evidence引用语义/);
  assert.match(SCHEMA_REPAIR_SYSTEM_PROMPT, /只修复字段类型、结构和Schema允许值/);
});

test('P：RepairDiff在事实、产品和Evidence未变化时通过', () => {
  const before = mutateProduct({ notes: {} });
  const after = validPayload();
  const result = analyzeRepairDiff(before, after, issueCounts());
  assert.equal(result.semanticDriftDetected, false);
  assert.equal(result.productCountBefore, result.productCountAfter);
  assert.equal(result.evidenceRefCountBefore, result.evidenceRefCountAfter);
});

test('Q：产品数量变化触发REPAIR_SEMANTIC_DRIFT', () => {
  const before = validPayload();
  const after = { ...validPayload(), products: [...validPayload().products, structuredClone(validPayload().products[0])] };
  const result = analyzeRepairDiff(before, after, issueCounts());
  assert.equal(result.semanticDriftDetected, true);
  assert.ok(result.driftReasons.includes('PRODUCT_COUNT_CHANGED'));
});

test('R：Evidence变化触发REPAIR_SEMANTIC_DRIFT', () => {
  const before = validPayload();
  const after = structuredClone(before);
  after.products[0].evidenceRefs.model = [];
  const result = analyzeRepairDiff(before, after, issueCounts());
  assert.equal(result.semanticDriftDetected, true);
  assert.ok(result.driftReasons.includes('EVIDENCE_REFS_CHANGED'));
});

test('S：Safe Canonicalization只执行白名单无语义规则', () => {
  const value = mutateProduct({ productName: '  自动喷涂设备  ', notes: undefined, specifications: undefined, evidenceRefs: undefined });
  const result = safeCanonicalizeProviderPayload(value);
  const product = (result.value as any).products[0];
  assert.equal(product.productName, '自动喷涂设备');
  assert.deepEqual(product.notes, []);
  assert.deepEqual(product.specifications, {});
  assert.deepEqual(product.evidenceRefs, {});
  assert.ok(result.appliedRules.every((rule) => rule.semanticSafe));
});

test('T：非白名单类型强转被拒绝且原值保持', () => {
  const value = mutateProduct({ productName: ['自动喷涂设备'], quantity: { value: '3', unit: null, raw: '3套' } });
  const result = safeCanonicalizeProviderPayload(value);
  const product = (result.value as any).products[0];
  assert.deepEqual(product.productName, ['自动喷涂设备']);
  assert.equal(product.quantity.value, '3');
  assert.equal(result.rejectedTransforms.length, 2);
});

test('U：Repairability对结构包装与业务语义保持保守分类', () => {
  const structural = classifySchemaIssueRepairability(baseIssue('UNKNOWN_FIELD', 'products[0].extra'));
  const quantity = classifySchemaIssueRepairability(baseIssue('INVALID_QUANTITY', 'products[0].quantity.value'));
  const evidence = classifySchemaIssueRepairability(baseIssue('INVALID_EVIDENCE_REF', 'products[0].evidenceRefs'));
  assert.equal(structural.repairable, true);
  assert.equal(quantity.repairable, false);
  assert.equal(evidence.repairable, false);
});

test('Schema Repair正常结构修复并记录安全Diff', async () => {
  const before = mutateProduct({ notes: {} });
  const events: ExtractionAuditEvent[] = [];
  const records: ExtractionRequestRecord[] = [];
  const provider = new DeepSeekProductExtractionProvider(
    config,
    (event) => events.push(event),
    sequenceFetch([completion(before), completion(validPayload())]),
    (record) => records.push(record),
  );
  const result = await provider.extract(input);
  assert.equal(result.products.length, 1);
  assert.equal(records[0].schemaIssues[0].fieldPath, 'products[0].notes');
  assert.equal(records[0].thinkingMode, 'disabled');
  const repairEvent = events.find((event) => event.event === 'repair-completed')!;
  assert.equal(repairEvent.repairDiagnostics?.semanticDriftDetected, false);
  assert.equal(JSON.stringify(records).includes('自动喷涂设备'), false);
});

test('Schema失败先执行Safe Canonicalization且成功后不调用Repair', async () => {
  const before = mutateProduct({ notes: undefined, productName: '  自动喷涂设备  ' });
  const events: ExtractionAuditEvent[] = [];
  let requestCount = 0;
  const provider = new DeepSeekProductExtractionProvider(
    config,
    (event) => events.push(event),
    (async () => {
      requestCount += 1;
      return completion(before);
    }) as typeof fetch,
  );
  const result = await provider.extract(input);
  assert.equal(result.products.length, 1);
  assert.equal(requestCount, 1);
  const event = events.find((item) => item.event === 'canonicalization-applied')!;
  assert.ok(event.canonicalizationRules.some((rule) => rule.targetField === 'products[0].notes'));
  assert.equal(event.canonicalizationRejectedCount, 0);
});

test('存在不可安全修复Schema Issue时禁止调用模型Repair', async () => {
  const before = mutateProduct({ quantity: { value: '3', unit: '套', raw: '3套' } });
  let requestCount = 0;
  const provider = new DeepSeekProductExtractionProvider(
    config,
    undefined,
    (async () => {
      requestCount += 1;
      return completion(before);
    }) as typeof fetch,
  );
  await assert.rejects(provider.extract(input), (error: unknown) => (
    (error as { code?: string }).code === 'AI_SCHEMA_INVALID'
  ));
  assert.equal(requestCount, 1);
});

test('产品事实变化时拒绝Repair并返回REPAIR_SEMANTIC_DRIFT', async () => {
  const before = mutateProduct({ notes: {} });
  const after = validPayload();
  after.products[0].productName = '被修改的产品名称';
  const provider = new DeepSeekProductExtractionProvider(config, undefined, sequenceFetch([completion(before), completion(after)]));
  await assert.rejects(provider.extract(input), (error: unknown) => (
    (error as { code?: string }).code === 'REPAIR_SEMANTIC_DRIFT'
  ));
});

test('V：测试环境真实Provider保护生效且请求计数保持0', async () => {
  const previous = process.env.REAL_AI_BLOCK_REAL_DEEPSEEK;
  process.env.REAL_AI_BLOCK_REAL_DEEPSEEK = '1';
  resetRealDeepSeekRequestCountForTests();
  try {
    const provider = new DeepSeekProductExtractionProvider(config);
    await assert.rejects(provider.extract(input), (error: unknown) => (
      (error as { code?: string }).code === 'AI_REAL_PROVIDER_BLOCKED'
    ));
    assert.equal(getRealDeepSeekRequestCount(), 0);
  } finally {
    if (previous === undefined) delete process.env.REAL_AI_BLOCK_REAL_DEEPSEEK;
    else process.env.REAL_AI_BLOCK_REAL_DEEPSEEK = previous;
  }
});

test('真实Provider进程级请求上限在发送前阻断额外请求', async () => {
  const previousLimit = process.env.REAL_AI_MAX_DEEPSEEK_REQUESTS;
  const previousBlock = process.env.REAL_AI_BLOCK_REAL_DEEPSEEK;
  const originalFetch = globalThis.fetch;
  process.env.REAL_AI_MAX_DEEPSEEK_REQUESTS = '1';
  delete process.env.REAL_AI_BLOCK_REAL_DEEPSEEK;
  globalThis.fetch = (async () => completion(validPayload())) as typeof fetch;
  resetRealDeepSeekRequestCountForTests();
  try {
    const provider = new DeepSeekProductExtractionProvider(config);
    await provider.extract(input);
    await assert.rejects(provider.extract(input), (error: unknown) => (
      (error as { code?: string }).code === 'AI_REAL_PROVIDER_BLOCKED'
    ));
    assert.equal(getRealDeepSeekRequestCount(), 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousLimit === undefined) delete process.env.REAL_AI_MAX_DEEPSEEK_REQUESTS;
    else process.env.REAL_AI_MAX_DEEPSEEK_REQUESTS = previousLimit;
    if (previousBlock === undefined) delete process.env.REAL_AI_BLOCK_REAL_DEEPSEEK;
    else process.env.REAL_AI_BLOCK_REAL_DEEPSEEK = previousBlock;
    resetRealDeepSeekRequestCountForTests();
  }
});

function providerIssues(value: unknown) {
  return issues(ProviderExtractionPayloadSchema, value);
}

function issues(schema: z.ZodType, value: unknown) {
  const result = schema.safeParse(value);
  assert.equal(result.success, false);
  return mapZodIssues(result.error!.issues, value);
}

function mutateProduct(changes: Record<string, unknown>, remove: string[] = []) {
  const payload = structuredClone(validPayload()) as any;
  Object.assign(payload.products[0], changes);
  remove.forEach((field) => delete payload.products[0][field]);
  return payload;
}

function assertIssue(issue: any, fieldPath: string, issueCode: string, expectedType: string | null, receivedType: string) {
  assert.equal(issue.fieldPath, fieldPath);
  assert.equal(issue.issueCode, issueCode);
  assert.equal(issue.expectedType, expectedType);
  assert.equal(issue.receivedType, receivedType);
}

function issueCounts() {
  return { repairAttempt: 1, schemaIssueCountBefore: 1, schemaIssueCountAfter: 0 };
}

function baseIssue(issueCode: any, fieldPath: string) {
  return { fieldPath, issueCode, expectedType: null, receivedType: 'object', expectedConstraint: null, receivedShape: 'object(keys=1)', message: 'safe' };
}

function completion(payload: unknown): Response {
  const content = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return new Response(JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function sequenceFetch(responses: Response[]): typeof fetch {
  let index = 0;
  return (async () => responses[index++] ?? responses.at(-1)!) as typeof fetch;
}
