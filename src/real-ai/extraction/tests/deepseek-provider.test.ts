/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { createExtractionChunks } from '../chunker';
import type { AIProviderConfig, ExtractionAuditEvent, ExtractionRequestRecord } from '../contracts';
import { GOLDEN_CASES, createGoldenResponse } from '../fixtures/golden-cases';
import { DeepSeekProductExtractionProvider } from '../providers/deepseek-product-extraction-provider';
import { ProductExtractionService } from '../extraction-service';

const config: AIProviderConfig = {
  provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'test-model', apiKey: 'test-secret',
  timeoutMs: 100, maxRepairAttempts: 1, maxOutputTokens: 2_000,
};

const golden = GOLDEN_CASES[0];
const input = createExtractionChunks(golden.documents[0], 'provider-test')[0];
const validPayload = () => JSON.stringify(createGoldenResponse(golden, input));

function completion(content: string | null, status = 200, finishReason = 'stop'): Response {
  return new Response(JSON.stringify({
    choices: [{ finish_reason: finishReason, message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  }), { status, headers: { 'Content-Type': 'application/json' } });
}

function sequenceFetch(responses: Response[]): typeof fetch {
  let index = 0;
  return (async () => responses[index++] ?? responses.at(-1)!) as typeof fetch;
}

test('DeepSeek合法JSON一次通过且审计日志不含客户正文和密钥', async () => {
  const events: ExtractionAuditEvent[] = [];
  const provider = new DeepSeekProductExtractionProvider(config, (event) => events.push(event), sequenceFetch([completion(validPayload())]));
  const result = await provider.extract(input);
  assert.equal(result.products.length, 1);
  assert.equal(result.metrics.repairAttempts, 0);
  const audit = JSON.stringify(events);
  assert.equal(audit.includes('自动喷涂设备'), false);
  assert.equal(audit.includes('test-secret'), false);
});

test('无效JSON只进行一次受控修复', async () => {
  const provider = new DeepSeekProductExtractionProvider(config, undefined, sequenceFetch([
    completion('{bad json'), completion(validPayload()),
  ]));
  const result = await provider.extract(input);
  assert.equal(result.metrics.requestCount, 2);
  assert.equal(result.metrics.repairAttempts, 1);
  assert.equal(result.products[0].needsHumanReview, true);
  assert.ok(result.warnings.some((warning) => warning.code === 'REPAIRED_MODEL_OUTPUT'));
});

test('Schema无效时允许一次修复', async () => {
  const structurallyInvalid = JSON.parse(validPayload());
  structurallyInvalid.products[0].notes = {};
  const provider = new DeepSeekProductExtractionProvider(config, undefined, sequenceFetch([
    completion(JSON.stringify(structurallyInvalid)), completion(validPayload()),
  ]));
  const result = await provider.extract(input);
  assert.equal(result.metrics.repairAttempts, 1);
});

test('第二次仍是无效JSON则明确失败，不无限重试', async () => {
  const provider = new DeepSeekProductExtractionProvider(config, undefined, sequenceFetch([
    completion('{bad'), completion('{still bad'), completion(validPayload()),
  ]));
  await assert.rejects(provider.extract(input), (error: unknown) => (error as { code?: string }).code === 'AI_INVALID_JSON');
});

test('API失败、限流、空响应和截断分别返回明确错误码', async () => {
  const cases: Array<[Response, string]> = [
    [new Response('{}', { status: 500 }), 'AI_HTTP_ERROR'],
    [new Response('{}', { status: 429 }), 'AI_RATE_LIMITED'],
    [completion(null), 'AI_EMPTY_RESPONSE'],
    [completion(validPayload(), 200, 'length'), 'AI_OUTPUT_TRUNCATED'],
  ];
  for (const [response, code] of cases) {
    const provider = new DeepSeekProductExtractionProvider(config, undefined, sequenceFetch([response]));
    await assert.rejects(provider.extract(input), (error: unknown) => (error as { code?: string }).code === code);
  }
});

test('非JSON HTTP响应被安全分类且审计不保存响应正文', async () => {
  const records: ExtractionRequestRecord[] = [];
  const secretBody = '<html><body>upstream secret response</body></html>';
  const provider = new DeepSeekProductExtractionProvider(
    config,
    undefined,
    sequenceFetch([new Response(secretBody, {
      status: 200,
      headers: { 'Content-Type': 'text/html', 'x-request-id': 'safe-request-id' },
    })]),
    (record) => records.push(record),
  );
  await assert.rejects(provider.extract(input), (error: unknown) => (
    (error as { code?: string }).code === 'AI_INVALID_CONTENT_TYPE'
  ));
  assert.equal(records.length, 1);
  assert.equal(records[0].responseKind, 'html');
  assert.equal(records[0].responseBodyLength, secretBody.length);
  assert.equal(records[0].providerRequestId, 'safe-request-id');
  assert.equal(JSON.stringify(records).includes('upstream secret response'), false);
});

test('非JSON HTTP响应可进入有限Provider Retry并恢复', async () => {
  const provider = new DeepSeekProductExtractionProvider(config, undefined, sequenceFetch([
    new Response('<html>temporary upstream response</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    completion(validPayload()),
  ]));
  const job = new ProductExtractionService(provider).createJob([golden.documents[0]], {
    jobId: 'invalid-http-retry',
    executionConfig: { maxProviderRetries: 1, providerRetryDelayMs: 0 },
  });
  const outcome = await job.run();
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.audit.providerRequestCount, 2);
  assert.equal(outcome.audit.chunks[0].providerRetryCount, 1);
  assert.ok(outcome.audit.errorCodes.includes('AI_INVALID_CONTENT_TYPE'));
});

test('请求超时返回AI_TIMEOUT', async () => {
  const timeoutConfig = { ...config, timeoutMs: 10 };
  const hangingFetch = ((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  })) as typeof fetch;
  const provider = new DeepSeekProductExtractionProvider(timeoutConfig, undefined, hangingFetch);
  await assert.rejects(provider.extract(input), (error: unknown) => (error as { code?: string }).code === 'AI_TIMEOUT');
});

test('用户取消返回AI_EXTRACTION_CANCELLED且不生成旧结果', async () => {
  const controller = new AbortController();
  const hangingFetch = ((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  })) as typeof fetch;
  const provider = new DeepSeekProductExtractionProvider(config, undefined, hangingFetch);
  const pending = provider.extract(input, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error: unknown) => (error as { code?: string }).code === 'AI_EXTRACTION_CANCELLED');
});

test('逐请求记录包含Chunk、Tokens、耗时和Schema结果但不包含正文或密钥', async () => {
  const records: ExtractionRequestRecord[] = [];
  const provider = new DeepSeekProductExtractionProvider(
    config,
    undefined,
    sequenceFetch([completion(validPayload())]),
    (record) => records.push(record),
  );
  await provider.extract({ ...input, optionalContext: { sampleId: 'request-metrics' } });
  assert.equal(records.length, 1);
  assert.equal(records[0].sampleId, 'request-metrics');
  assert.equal(records[0].chunkId, input.chunkId);
  assert.equal(records[0].schemaValid, true);
  assert.equal(records[0].inputTokens, 10);
  assert.equal(records[0].outputTokens, 20);
  assert.equal(records[0].totalTokens, 30);
  assert.ok(records[0].inputChars > 0);
  const serialized = JSON.stringify(records);
  assert.equal(serialized.includes('自动喷涂设备'), false);
  assert.equal(serialized.includes('test-secret'), false);
});

test('修复请求独立记录repairAttempt与首次Schema失败', async () => {
  const records: ExtractionRequestRecord[] = [];
  const provider = new DeepSeekProductExtractionProvider(
    config,
    undefined,
    sequenceFetch([completion('{bad'), completion(validPayload())]),
    (record) => records.push(record),
  );
  await provider.extract(input);
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((record) => record.repairAttempt), [0, 1]);
  assert.deepEqual(records.map((record) => record.schemaValid), [false, true]);
  assert.equal(records[0].errorCode, 'AI_INVALID_JSON');
  assert.equal(records[1].errorCode, null);
});
