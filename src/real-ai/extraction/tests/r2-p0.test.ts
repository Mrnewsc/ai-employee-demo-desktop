/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { SCHEMA_VERSION } from '../../types';
import type { ParsedDocument, ParseWarning } from '../../types';
import { createExtractionChunks } from '../chunker';
import { EXTRACTION_PROVIDER_DEFAULTS } from '../config';
import type {
  AIProviderConfig,
  ExtractedProductV1,
  ExtractionInput,
  ProductExtractionResult,
  ProviderWirePayload,
} from '../contracts';
import { buildProviderEvidenceCatalog, EvidenceResolver } from '../evidence-resolver';
import { materializeProviderPayload } from '../materializer';
import { buildExtractionUserPrompt } from '../prompt';
import { DeepSeekProductExtractionProvider } from '../providers/deepseek-product-extraction-provider';
import { ProviderExtractionPayloadSchema } from '../schemas';
import { validateSmokeSample } from '../smoke/validation';

const ambiguityWarning = (source: ParsedDocument['blocks'][number]['source']): ParseWarning => ({
  schemaVersion: SCHEMA_VERSION,
  code: 'ocr_character_ambiguity',
  severity: 'info',
  message: '型号包含OCR易混字符',
  source,
});

test('OCR confidence 0.89且存在字符歧义时触发Human Review', () => {
  const document = ocrDocument('产品名称：自动喷涂设备 型号：9P-3000', 0.89, true);
  const input = createExtractionChunks(document, 'r2-ambiguity')[0];
  const result = materializeProviderPayload(input, productPayload(input, '9P-3000'), options());
  assert.equal(result.products[0].model, '9P-3000');
  assert.equal(result.products[0].needsHumanReview, true);
  assert.ok(result.warnings.some((warning) => warning.code === 'OCR_MODEL_UNCERTAIN'));
  assert.ok(input.evidenceItems[0].warningCodes.includes('ocr_character_ambiguity'));
});

test('正常置信度OCR且无歧义Warning时不误触发人工确认', () => {
  const input = createExtractionChunks(ocrDocument('产品名称：自动喷涂设备 型号：SP-3000', 0.89, false), 'r2-normal-ocr')[0];
  const result = materializeProviderPayload(input, productPayload(input, 'SP-3000'), options());
  assert.equal(result.products[0].needsHumanReview, false);
  assert.equal(result.warnings.some((warning) => warning.code === 'OCR_MODEL_UNCERTAIN'), false);
});

test('OCR歧义型号9P-3000始终保留原值', () => {
  const input = createExtractionChunks(ocrDocument('产品名称：自动喷涂设备 型号：9P-3000', 0.89, true), 'r2-model-fidelity')[0];
  const result = materializeProviderPayload(input, productPayload(input, '9P-3000'), options());
  assert.equal(result.products[0].model, '9P-3000');
  assert.notEqual(result.products[0].model, 'SP-3000');
});

test('Provider合法Evidence ID由Resolver恢复Canonical Evidence', () => {
  const input = createExtractionChunks(ocrDocument('型号：SP-3000', 0.9, false), 'r2-valid-ref')[0];
  const item = input.evidenceItems[0];
  const resolved = new EvidenceResolver(input).resolve({ model: [{ evidenceId: item.evidenceId, quote: 'SP-3000' }] });
  assert.equal(resolved.issues.length, 0);
  assert.equal(resolved.evidence[0].source, item.source);
  assert.equal(resolved.evidence[0].evidenceId, item.evidenceId);
});

test('无效Evidence ID加唯一完全一致quote可确定性恢复', () => {
  const input = createExtractionChunks(ocrDocument('型号：SP-3000', 0.9, false), 'r2-repair-ref')[0];
  const resolved = new EvidenceResolver(input).resolve({ model: [{ evidenceId: 'invalid-id', quote: input.evidenceItems[0].text }] });
  assert.equal(resolved.evidence[0].evidenceId, input.evidenceItems[0].evidenceId);
  assert.equal(resolved.issues[0].code, 'EVIDENCE_REFERENCE_REPAIRED');
  assert.equal(resolved.issues[0].recovered, true);
});

test('无效Evidence ID对应多个相同quote时禁止猜测', () => {
  const original = createExtractionChunks(ocrDocument('型号：SP-3000', 0.9, false), 'r2-ambiguous-ref')[0];
  const input: ExtractionInput = {
    ...original,
    evidenceItems: [...original.evidenceItems, { ...original.evidenceItems[0], evidenceId: 'duplicate-id' }],
  };
  const resolved = new EvidenceResolver(input).resolve({ model: [{ evidenceId: 'invalid-id', quote: original.evidenceItems[0].text }] });
  assert.equal(resolved.evidence.length, 0);
  assert.equal(resolved.issues[0].code, 'UNKNOWN_EVIDENCE_REFERENCE');
});

test('无效Evidence ID且无exact quote时字段不能成为确定事实', () => {
  const input = createExtractionChunks(ocrDocument('型号：SP-3000', 0.9, false), 'r2-missing-ref')[0];
  const resolved = new EvidenceResolver(input).resolve({ model: [{ evidenceId: 'invalid-id', quote: '不存在的原文' }] });
  assert.equal(resolved.evidence.length, 0);
  assert.equal(resolved.issues[0].code, 'UNKNOWN_EVIDENCE_REFERENCE');
});

test('单个字段Evidence失败时保留其他可验证字段而不无痕删除产品', () => {
  const input = createExtractionChunks(ocrDocument('产品名称：自动喷涂设备 型号：SP-3000', 0.9, false), 'r2-partial-ref')[0];
  const payload = productPayload(input, 'SP-3000');
  payload.products[0].evidenceRefs.model = [{ evidenceId: 'invalid-id', quote: '不存在的型号原文' }];
  const result = materializeProviderPayload(input, payload, options());
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].productName, '自动喷涂设备');
  assert.equal(result.products[0].model, null);
  assert.equal(result.products[0].needsHumanReview, true);
  assert.ok(result.warnings.some((warning) => warning.code === 'UNKNOWN_EVIDENCE_REFERENCE'));
});

test('实施要求从DOCX application转入notes', () => {
  const input = createExtractionChunks(textDocument('要求.docx', '产品名称：自动喷涂设备 型号：SP-3000 需要接入现有生产线'), 'r2-application-guard')[0];
  const item = input.evidenceItems[0];
  const result = materializeProviderPayload(input, {
    schemaVersion: SCHEMA_VERSION,
    products: [{
      productName: '自动喷涂设备', model: 'SP-3000', specifications: {}, quantity: { value: null, unit: null, raw: null },
      material: null, process: null, application: '需要接入现有生产线', notes: [],
      evidenceRefs: {
        productName: [{ evidenceId: item.evidenceId, quote: '自动喷涂设备' }],
        model: [{ evidenceId: item.evidenceId, quote: 'SP-3000' }],
        application: [{ evidenceId: item.evidenceId, quote: '需要接入现有生产线' }],
      },
    }],
  }, options());
  assert.equal(result.products[0].application, null);
  assert.deepEqual(result.products[0].notes, ['需要接入现有生产线']);
  assert.ok(result.products[0].evidence.some((evidence) => evidence.field === 'notes'));
  assert.ok(result.warnings.some((warning) => warning.code === 'APPLICATION_RECLASSIFIED'));
});

test('真实应用场景保留在application', () => {
  const input = createExtractionChunks(textDocument('场景.docx', '用于金属零件喷涂'), 'r2-real-application')[0];
  const item = input.evidenceItems[0];
  const result = materializeProviderPayload(input, {
    schemaVersion: SCHEMA_VERSION,
    products: [{
      productName: null, model: null, specifications: {}, quantity: { value: null, unit: null, raw: null },
      material: null, process: null, application: '用于金属零件喷涂', notes: [],
      evidenceRefs: { application: [{ evidenceId: item.evidenceId, quote: '用于金属零件喷涂' }] },
    }],
  }, options());
  assert.equal(result.products[0].application, '用于金属零件喷涂');
  assert.equal(result.warnings.some((warning) => warning.code === 'APPLICATION_RECLASSIFIED'), false);
});

test('预期产品缺失与错误合并使用独立指标', () => {
  const document = textDocument('缺失.pdf', '产品名称：自动喷涂设备 型号：SP-3000', 'pdf');
  const validation = validateSmokeSample({
    sampleId: 'r2-missing-product', sampleType: '指标拆分', sourcePaths: [],
    products: [{ productName: '自动喷涂设备', model: 'SP-3000', specifications: {}, quantity: { value: null, unit: null, raw: null }, material: null, process: null, application: null, expectedHumanReview: false, expectedWarnings: [] }],
    expectedConflictFields: [], expectedSourceFileCount: 1,
  }, [document], emptyResult());
  assert.equal(validation.missingExpectedProductCount, 1);
  assert.equal(validation.wrongMergeCount, 0);
});

test('真正把两个不同型号合并时wrongMergeCount独立计数', () => {
  const leftDocument = textDocument('A.pdf', '产品A 型号：A-100', 'pdf');
  const rightDocument = textDocument('B.pdf', '产品B 型号：B-200', 'pdf');
  const left = createExtractionChunks(leftDocument, 'r2-wrong-merge-a')[0].evidenceItems[0];
  const right = createExtractionChunks(rightDocument, 'r2-wrong-merge-b')[0].evidenceItems[0];
  const product = domainProduct([canonical('model', 'A-100', left), canonical('model', 'B-200', right)]);
  product.conflicts = [{
    schemaVersion: SCHEMA_VERSION, field: 'model', message: '错误合并测试', values: [
      { schemaVersion: SCHEMA_VERSION, value: 'A-100', evidence: [product.evidence[0]] },
      { schemaVersion: SCHEMA_VERSION, value: 'B-200', evidence: [product.evidence[1]] },
    ],
  }];
  const validation = validateSmokeSample({
    sampleId: 'r2-wrong-merge', sampleType: '错误合并指标', sourcePaths: [],
    products: [
      { productName: '产品A', model: 'A-100', specifications: {}, quantity: { value: null, unit: null, raw: null }, material: null, process: null, application: null, expectedHumanReview: false, expectedWarnings: [] },
      { productName: '产品B', model: 'B-200', specifications: {}, quantity: { value: null, unit: null, raw: null }, material: null, process: null, application: null, expectedHumanReview: false, expectedWarnings: [] },
    ], expectedConflictFields: [], expectedSourceFileCount: 2,
  }, [leftDocument, rightDocument], resultWithProducts([product]));
  assert.equal(validation.wrongMergeCount, 1);
  assert.equal(validation.missingExpectedProductCount, 1);
});

test('Provider Wire DTO与Prompt均不包含完整SourceLocation', () => {
  const input = createExtractionChunks(ocrDocument('产品名称：自动喷涂设备 型号：SP-3000', 0.9, false), 'r2-wire')[0];
  const payload = productPayload(input, 'SP-3000');
  assert.equal(ProviderExtractionPayloadSchema.safeParse(payload).success, true);
  const serialized = JSON.stringify(payload);
  assert.equal(/bbox|sourceFile|page|sheet|cell|sourceLocation/.test(serialized), false);
  const catalog = buildProviderEvidenceCatalog(input);
  assert.deepEqual(Object.keys(catalog[0]).sort(), ['evidenceId', 'text', 'type']);
  assert.equal(/bbox=|page=|sheet=|cell=/.test(buildExtractionUserPrompt(input)), false);
});

test('统一output token预算写入请求且长度截断返回明确错误', async () => {
  const requestBodies: Array<Record<string, unknown>> = [];
  const config: AIProviderConfig = {
    provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'test', apiKey: 'hidden',
    timeoutMs: 1_000, maxRepairAttempts: 0, maxOutputTokens: EXTRACTION_PROVIDER_DEFAULTS.maxOutputTokens,
  };
  const input = createExtractionChunks(ocrDocument('型号：SP-3000', 0.9, false), 'r2-budget')[0];
  const mockFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({
      choices: [{ finish_reason: 'length', message: { content: JSON.stringify({ schemaVersion: SCHEMA_VERSION, products: [] }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const provider = new DeepSeekProductExtractionProvider(config, undefined, mockFetch);
  await assert.rejects(provider.extract(input), (error: unknown) => (error as { code?: string }).code === 'AI_OUTPUT_TRUNCATED');
  assert.equal(requestBodies[0]?.max_tokens, EXTRACTION_PROVIDER_DEFAULTS.maxOutputTokens);
  assert.deepEqual(requestBodies[0]?.thinking, { type: 'disabled' });
});

function ocrDocument(text: string, confidence: number, ambiguous: boolean): ParsedDocument {
  const source = { schemaVersion: SCHEMA_VERSION, kind: 'image' as const, imageId: 'r2-image', bbox: [0, 0, 800, 500] as [number, number, number, number] };
  return {
    schemaVersion: SCHEMA_VERSION, fileId: `ocr-${confidence}-${ambiguous}`, fileName: 'r2-ocr.png', fileType: 'image',
    mimeType: 'image/png', size: text.length, sha256: 'a'.repeat(64), rawText: text,
    blocks: [{ schemaVersion: SCHEMA_VERSION, id: 'ocr-line-1', type: 'ocr-line', text, source, confidence }],
    tables: [], images: [{ schemaVersion: SCHEMA_VERSION, id: 'r2-image', mimeType: 'image/png', role: 'source-image', source, ocrText: text, ocrConfidence: confidence }],
    metadata: { schemaVersion: SCHEMA_VERSION, parser: 'r2-test', parseDurationMs: 1 },
    warnings: ambiguous ? [ambiguityWarning(source)] : [],
  };
}

function textDocument(fileName: string, text: string, fileType: 'docx' | 'pdf' = 'docx'): ParsedDocument {
  const source = fileType === 'pdf'
    ? { schemaVersion: SCHEMA_VERSION, kind: 'pdf' as const, page: 1 }
    : { schemaVersion: SCHEMA_VERSION, kind: 'docx' as const, paragraph: 1 };
  return {
    schemaVersion: SCHEMA_VERSION, fileId: fileName, fileName, fileType, mimeType: 'application/octet-stream',
    size: text.length, sha256: 'b'.repeat(64), rawText: text,
    blocks: [{ schemaVersion: SCHEMA_VERSION, id: 'block-1', type: 'paragraph', text, source, confidence: 1 }],
    tables: [], images: [], metadata: { schemaVersion: SCHEMA_VERSION, parser: 'r2-test', parseDurationMs: 1, ...(fileType === 'pdf' ? { pageCount: 1 } : {}) }, warnings: [],
  };
}

function productPayload(input: ExtractionInput, model: string): ProviderWirePayload {
  const item = input.evidenceItems[0];
  return {
    schemaVersion: SCHEMA_VERSION,
    products: [{
      productName: '自动喷涂设备', model, specifications: {}, quantity: { value: null, unit: null, raw: null },
      material: null, process: null, application: null, notes: [],
      evidenceRefs: {
        productName: [{ evidenceId: item.evidenceId, quote: '自动喷涂设备' }],
        model: [{ evidenceId: item.evidenceId, quote: model }],
      },
    }],
  };
}

function options() {
  return { provider: 'test', model: 'test', repaired: false, durationMs: 1, outputCharacters: 1 };
}

function canonical(field: 'model', text: string, item: ExtractionInput['evidenceItems'][number]) {
  return {
    schemaVersion: SCHEMA_VERSION, field, text, source: item.source, evidenceId: item.evidenceId,
    chunkId: 'r2-metric', sourceFile: item.sourceFile, confidence: item.confidence, originKind: item.kind,
  };
}

function domainProduct(evidence: ExtractedProductV1['evidence']): ExtractedProductV1 {
  return {
    schemaVersion: SCHEMA_VERSION, id: 'merged-wrongly', productName: null, model: 'A-100', specifications: {},
    quantity: { schemaVersion: SCHEMA_VERSION, value: null, unit: null, raw: null }, material: null, process: null,
    application: null, notes: [], sourceFile: evidence[0].sourceFile, sourceLocations: evidence.map((item) => item.source),
    evidence, confidence: 0.5, fieldConfidence: { model: 0.5 }, needsHumanReview: true, conflicts: [], reviewReasons: [],
  };
}

function emptyResult(): ProductExtractionResult {
  return resultWithProducts([]);
}

function resultWithProducts(products: ExtractedProductV1[]): ProductExtractionResult {
  return {
    schemaVersion: SCHEMA_VERSION, jobId: 'r2-validation', provider: 'test', model: 'test', products, conflicts: products.flatMap((product) => product.conflicts), warnings: [],
    metrics: { schemaVersion: SCHEMA_VERSION, documentCount: 1, chunkCount: 1, requestCount: 0, repairAttempts: 0, inputCharacters: 0, outputCharacters: 0, durationMs: 0, usage: { schemaVersion: SCHEMA_VERSION, promptTokens: null, completionTokens: null, totalTokens: null } },
    needsHumanReview: products.some((product) => product.needsHumanReview), createdAt: new Date().toISOString(),
  };
}
