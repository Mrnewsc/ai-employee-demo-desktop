/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { createExtractionChunks } from '../chunker';
import type { AIProviderConfig, ExtractionAuditEvent } from '../contracts';
import { GOLDEN_CASES, createGoldenResponse } from '../fixtures/golden-cases';
import { PRODUCT_EXTRACTION_SYSTEM_PROMPT } from '../prompt';
import { DeepSeekProductExtractionProvider } from '../providers/deepseek-product-extraction-provider';
import { safeCanonicalizeProviderPayload } from '../safe-canonicalization';
import { mapZodIssues } from '../schema-validation-diagnostics';
import { ProviderExtractionPayloadSchema } from '../schemas';

const RULE_ID = 'QUANTITY_NULL_TO_EMPTY_OBJECT';
const EMPTY_QUANTITY = { value: null, unit: null, raw: null };
const golden = GOLDEN_CASES[0];
const input = createExtractionChunks(golden.documents[0], 'r3-2-r1-offline')[0];
const validPayload = () => createGoldenResponse(golden, input);
const config: AIProviderConfig = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'offline-test',
  apiKey: 'never-sent',
  timeoutMs: 100,
  maxRepairAttempts: 1,
  maxOutputTokens: 2_000,
  thinkingMode: 'disabled',
};

test('Prompt明确quantity始终是对象且禁止猜测MOQ', () => {
  assert.match(PRODUCT_EXTRACTION_SYSTEM_PROMPT, /quantity字段始终必须输出对象/);
  assert.match(PRODUCT_EXTRACTION_SYSTEM_PROMPT, /禁止输出"quantity":null/);
  assert.match(PRODUCT_EXTRACTION_SYSTEM_PROMPT, /禁止省略quantity字段/);
  assert.match(PRODUCT_EXTRACTION_SYSTEM_PROMPT, /不得因为数量未知而猜测1、MOQ、minimum order、piece或pcs/);
});

test('Case 1：quantity:null规范化为标准空对象并通过Schema', () => {
  const before = withQuantity(validPayload(), null);
  assert.equal(schemaIssues(before).length, 1);
  const result = safeCanonicalizeProviderPayload(before);
  assert.deepEqual(productAt(result.value, 0).quantity, EMPTY_QUANTITY);
  assert.equal(ProviderExtractionPayloadSchema.safeParse(result.value).success, true);
});

test('Case 2/12：历史9项quantity:null形态离线重放全部消除', () => {
  const base = validPayload().products[0];
  const before = {
    schemaVersion: '1.0',
    products: Array.from({ length: 9 }, () => ({ ...structuredClone(base), quantity: null })),
  };
  const beforeIssues = schemaIssues(before);
  assert.equal(beforeIssues.length, 9);
  assert.ok(beforeIssues.every((issue) => issue.issueCode === 'INVALID_QUANTITY'));

  const result = safeCanonicalizeProviderPayload(before);
  const after = result.value as typeof before;
  assert.equal(after.products.length, 9);
  assert.equal(result.appliedRules.length, 9);
  assert.ok(result.appliedRules.every((rule) => rule.ruleId === RULE_ID));
  assert.deepEqual(
    result.appliedRules.map((rule) => rule.targetField),
    Array.from({ length: 9 }, (_, index) => `products[${index}].quantity`),
  );
  assert.ok(result.appliedRules.every((rule) => (
    rule.beforeShape === 'null'
      && rule.afterShape === 'object(keys=[value,unit,raw])'
      && rule.semanticSafe
  )));
  assert.equal(result.rejectedTransforms.length, 0);
  assert.equal(schemaIssues(result.value).length, 0);
  assert.equal(ProviderExtractionPayloadSchema.safeParse(result.value).success, true);
  assert.ok(after.products.every((product) => JSON.stringify(product.quantity) === JSON.stringify(EMPTY_QUANTITY)));
});

test('Case 3：原本合法的quantity不做转换', () => {
  const before = validPayload();
  const quantityBefore = structuredClone(before.products[0].quantity);
  const result = safeCanonicalizeProviderPayload(before);
  assert.deepEqual(productAt(result.value, 0).quantity, quantityBefore);
  assert.equal(result.appliedRules.some((rule) => rule.ruleId === RULE_ID), false);
});

test('Case 4：quantity字符串3不允许转换', () => {
  assertRejectedQuantity('3');
});

test('Case 4边界：空字符串、MOQ和array都不允许转换', () => {
  for (const illegal of ['', 'MOQ', []]) assertRejectedQuantity(illegal);
});

test('Case 5：quantity空对象仅使用既有子字段白名单，不命中R1新规则', () => {
  const before = withQuantity(validPayload(), {});
  const result = safeCanonicalizeProviderPayload(before);
  assert.equal(result.appliedRules.some((rule) => rule.ruleId === RULE_ID), false);
  assert.deepEqual(productAt(result.value, 0).quantity, EMPTY_QUANTITY);
  assert.deepEqual(
    result.appliedRules.map((rule) => rule.ruleId),
    ['STRUCTURAL_UNDEFINED_TO_NULL', 'STRUCTURAL_UNDEFINED_TO_NULL', 'STRUCTURAL_UNDEFINED_TO_NULL'],
  );
});

test('Case 5边界：quantity部分非法对象不命中R1规则且仍不通过Schema', () => {
  for (const illegal of [{ value: '3' }, { unit: 'pcs' }]) {
    const result = safeCanonicalizeProviderPayload(withQuantity(validPayload(), illegal));
    assert.equal(result.appliedRules.some((rule) => rule.ruleId === RULE_ID), false);
    assert.equal(ProviderExtractionPayloadSchema.safeParse(result.value).success, false);
  }
});

test('Case 6：quantity:null规范化后Schema通过且AI Repair不执行', async () => {
  const before = withQuantity(validPayload(), null);
  const events: ExtractionAuditEvent[] = [];
  let providerRequestCount = 0;
  const provider = new DeepSeekProductExtractionProvider(
    config,
    (event) => events.push(event),
    (async () => {
      providerRequestCount += 1;
      return completion(before);
    }) as typeof fetch,
  );

  const result = await provider.extract(input);
  assert.equal(providerRequestCount, 1);
  assert.equal(result.metrics.repairAttempts, 0);
  assert.equal(events.some((event) => event.event === 'repair-started'), false);
  const canonicalization = events.find((event) => event.event === 'canonicalization-applied');
  assert.ok(canonicalization);
  assert.equal(canonicalization.canonicalizationRules.length, 1);
  assert.equal(canonicalization.canonicalizationRejectedCount, 0);
});

test('Case 7：Canonicalization前后产品数不变', () => {
  const before = nineNullQuantityProducts();
  const result = safeCanonicalizeProviderPayload(before) as { value: typeof before };
  assert.equal(result.value.products.length, before.products.length);
});

test('Case 8：Evidence refs在Canonicalization前后完全不变', () => {
  const before = withQuantity(validPayload(), null);
  const evidenceBefore = structuredClone(before.products[0].evidenceRefs);
  const result = safeCanonicalizeProviderPayload(before);
  assert.deepEqual(productAt(result.value, 0).evidenceRefs, evidenceBefore);
});

test('Case 9：除quantity容器外其他产品字段完全不变', () => {
  const before = withQuantity(validPayload(), null);
  const expected = withoutQuantity(before.products[0]);
  const result = safeCanonicalizeProviderPayload(before);
  assert.deepEqual(withoutQuantity(productAt(result.value, 0)), expected);
});

test('Case 10：规则审计记录精确路径、形状和semanticSafe', () => {
  const result = safeCanonicalizeProviderPayload(withQuantity(validPayload(), null));
  assert.deepEqual(result.appliedRules, [{
    ruleId: RULE_ID,
    targetField: 'products[0].quantity',
    beforeShape: 'null',
    afterShape: 'object(keys=[value,unit,raw])',
    semanticSafe: true,
  }]);
});

test('quantity:null规范化不产生数量、单位或原始文本事实', () => {
  const result = safeCanonicalizeProviderPayload(withQuantity(validPayload(), null));
  const quantity = productAt(result.value, 0).quantity;
  assert.equal(quantity.value, null);
  assert.equal(quantity.unit, null);
  assert.equal(quantity.raw, null);
  assert.equal(JSON.stringify(quantity).includes('MOQ'), false);
  assert.equal(JSON.stringify(quantity).includes('pcs'), false);
});

function nineNullQuantityProducts() {
  const product = validPayload().products[0];
  return {
    schemaVersion: '1.0',
    products: Array.from({ length: 9 }, () => ({ ...structuredClone(product), quantity: null })),
  };
}

function withQuantity(payload: ReturnType<typeof validPayload>, quantity: unknown) {
  const value = structuredClone(payload) as any;
  value.products[0].quantity = quantity;
  return value;
}

function productAt(value: unknown, index: number): any {
  return (value as any).products[index];
}

function withoutQuantity(product: any) {
  const value = structuredClone(product);
  delete value.quantity;
  return value;
}

function schemaIssues(value: unknown) {
  const result = ProviderExtractionPayloadSchema.safeParse(value);
  return result.success ? [] : mapZodIssues(result.error.issues, value);
}

function assertRejectedQuantity(quantity: unknown) {
  const before = withQuantity(validPayload(), quantity);
  const result = safeCanonicalizeProviderPayload(before);
  assert.deepEqual(productAt(result.value, 0).quantity, quantity);
  assert.equal(result.appliedRules.some((rule) => rule.ruleId === RULE_ID), false);
  assert.equal(result.rejectedTransforms.length, 1);
  assert.equal(ProviderExtractionPayloadSchema.safeParse(result.value).success, false);
}

function completion(payload: unknown): Response {
  return new Response(JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
