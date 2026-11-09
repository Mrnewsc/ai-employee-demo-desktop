/// <reference types="node" />

import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseDocument } from '../../src/real-ai/parsers';
import type { ParsedDocument } from '../../src/real-ai/types';
import {
  DeepSeekProductExtractionProvider,
  ProductExtractionService,
  ProductExtractionResultSchema,
  buildExtractionUserPrompt,
  createExtractionChunks,
  deepSeekConfigFromEnvironment,
} from '../../src/real-ai/extraction';
import type {
  AIExtractionErrorCode,
  ExtractionRequestRecord,
  ProductExtractionResult,
} from '../../src/real-ai/extraction';
import { PRODUCT_EXTRACTION_SYSTEM_PROMPT } from '../../src/real-ai/extraction/prompt';
import type { ExpectedSmokeSample, FieldCheck, SmokeValidationResult } from '../../src/real-ai/extraction/smoke/validation';
import { serializeExtractedProduct, validateSmokeSample } from '../../src/real-ai/extraction/smoke/validation';

if (!process.env.DEEPSEEK_API_KEY || !process.env.DEEPSEEK_MODEL) {
  console.log(JSON.stringify({
    status: 'skipped',
    reason: 'DEEPSEEK_API_KEY或DEEPSEEK_MODEL未配置，真实Smoke未执行',
  }, null, 2));
  process.exit(0);
}

const realAiRoot = path.resolve('src', 'real-ai');
const fixtureRoot = path.join(realAiRoot, 'fixtures');
const outputPath = path.resolve('src', 'real-ai', 'extraction', 'tests', 'results', 'deepseek-smoke.json');
const expectedPath = path.resolve('src', 'real-ai', 'extraction', 'fixtures', 'real-smoke', 'expected-extraction.json');
const previousResult = await readJsonIfExists(outputPath);
const expectedFixture = JSON.parse(await readFile(expectedPath, 'utf8')) as {
  schemaVersion: '1.0';
  samples: ExpectedSmokeSample[];
};
const requestRecords: ExtractionRequestRecord[] = [];
const auditEvents: unknown[] = [];
const provider = new DeepSeekProductExtractionProvider(
  deepSeekConfigFromEnvironment(),
  (event) => auditEvents.push(event),
  fetch,
  (record) => requestRecords.push(record),
);
const parseCache = new Map<string, ParsedDocument>();
const cases = [];

for (const expectedSample of expectedFixture.samples) {
  const sampleStartedAt = performance.now();
  const recordsBefore = requestRecords.length;
  let documents: ParsedDocument[] = [];
  let result: ProductExtractionResult | null = null;
  let validation: SmokeValidationResult | null = null;
  let errorCode: AIExtractionErrorCode | null = null;
  let errorMessage: string | null = null;
  try {
    documents = await Promise.all(expectedSample.sourcePaths.map((sourcePath) => parseFixture(sourcePath)));
    result = await new ProductExtractionService(provider).extract(documents, {
      jobId: `deepseek-smoke-${expectedSample.sampleId}`,
      optionalContext: {
        purpose: 'deidentified technical smoke test',
        sampleId: expectedSample.sampleId,
      },
    });
    validation = validateSmokeSample(expectedSample, documents, result);
  } catch (error) {
    errorCode = typeof (error as { code?: unknown })?.code === 'string'
      ? (error as { code: AIExtractionErrorCode }).code
      : 'AI_EXTRACTION_FAILED';
    errorMessage = error instanceof Error ? error.message.slice(0, 300) : '未知错误';
  }
  const sampleRequests = requestRecords.slice(recordsBefore);
  const schemaValid = result ? ProductExtractionResultSchema.safeParse(result).success : false;
  cases.push({
    sampleId: expectedSample.sampleId,
    sampleType: expectedSample.sampleType,
    sourceFiles: documents.map((document) => document.fileName),
    expectedSummary: validation?.resolvedExpectedProducts ?? expectedSample.products,
    requestCount: sampleRequests.length,
    chunkCount: result?.metrics.chunkCount ?? diagnoseDocuments(documents, expectedSample.sampleId).chunkCount,
    inputChars: result?.metrics.inputCharacters ?? 0,
    inputTokens: sumNullable(sampleRequests.map((record) => record.inputTokens)),
    outputTokens: sumNullable(sampleRequests.map((record) => record.outputTokens)),
    totalTokens: sumNullable(sampleRequests.map((record) => record.totalTokens)),
    durationMs: result?.metrics.durationMs ?? Math.round(performance.now() - sampleStartedAt),
    repairAttempts: result?.metrics.repairAttempts ?? sampleRequests.filter((record) => record.repairAttempt > 0).length,
    schemaValid,
    errorCode,
    errorMessage,
    localDiagnostics: diagnoseDocuments(documents, expectedSample.sampleId),
    requests: sampleRequests,
    products: result?.products.map((product) => serializeExtractedProduct(product, result!.warnings)) ?? [],
    warnings: result?.warnings ?? [],
    conflicts: result?.conflicts ?? [],
    validation,
  });
}

const summary = buildSummary(cases, requestRecords);
const output = {
  schemaVersion: '1.0',
  reportVersion: 'REAL-AI-001C-R2',
  executedAt: new Date().toISOString(),
  provider: provider.provider,
  model: provider.model,
  containsSensitiveCustomerData: false,
  summary,
  ocrBeforeAfter: buildOcrBeforeAfter(previousResult, cases),
  requests: requestRecords,
  cases,
  auditSummary: {
    eventCount: auditEvents.length,
    note: '审计事件仅统计数量，完整Prompt、客户全文、Authorization和API Key未写入结果文件',
  },
};
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
await rename(temporaryPath, outputPath);
console.log(JSON.stringify({
  status: 'completed',
  outputPath,
  sampleCount: cases.length,
  requestCount: requestRecords.length,
  successCount: summary.basic.successCount,
  failureCount: summary.basic.failureCount,
  p0Passed: summary.p0Passed,
}, null, 2));

async function parseFixture(sourcePath: string): Promise<ParsedDocument> {
  const absolutePath = sourcePath.startsWith('extraction/')
    ? path.join(realAiRoot, sourcePath)
    : path.join(fixtureRoot, sourcePath);
  const cached = parseCache.get(absolutePath);
  if (cached) return cached;
  const document = await parseDocument(absolutePath, {
    enableOcr: sourcePath.split('/').includes('images'),
    timeoutMs: 180_000,
  });
  parseCache.set(absolutePath, document);
  return document;
}

function diagnoseDocuments(documents: ParsedDocument[], sampleId: string) {
  const chunks = documents.flatMap((document) => createExtractionChunks(document, `diagnose-${sampleId}`, { sampleId }));
  return {
    rawTextLength: documents.reduce((sum, document) => sum + document.rawText.length, 0),
    blocksTextLength: documents.reduce((sum, document) => sum + document.blocks.reduce((blockSum, block) => blockSum + block.text.length, 0), 0),
    tablesTextLength: documents.reduce((sum, document) => sum + document.tables.reduce((tableSum, table) => tableSum + table.rows.flat().reduce((cellSum, cell) => cellSum + cell.displayValue.length, 0), 0), 0),
    imageOcrTextLength: documents.reduce((sum, document) => sum + document.images.reduce((imageSum, image) => imageSum + (image.ocrText?.length ?? 0), 0), 0),
    rawTextSentDirectly: false,
    chunkCount: chunks.length,
    chunks: chunks.map((chunk) => {
      const userPrompt = buildExtractionUserPrompt(chunk);
      return {
        chunkId: chunk.chunkId,
        evidenceChars: chunk.evidenceItems.reduce((sum, evidence) => sum + evidence.text.length, 0),
        promptTemplateChars: PRODUCT_EXTRACTION_SYSTEM_PROMPT.length,
        userPromptChars: userPrompt.length,
        messagesChars: PRODUCT_EXTRACTION_SYSTEM_PROMPT.length + userPrompt.length,
        sourceKinds: [...new Set(chunk.evidenceItems.map((item) => item.kind))],
      };
    }),
  };
}

function buildSummary(cases: Array<Record<string, any>>, records: ExtractionRequestRecord[]) {
  const successful = cases.filter((item) => item.errorCode === null && item.schemaValid);
  const validations = successful.map((item) => item.validation as SmokeValidationResult).filter(Boolean);
  const fieldChecks = validations.flatMap((item) => item.fieldChecks);
  const fieldQuality = Object.fromEntries(([
    'productName', 'model', 'quantity', 'specifications', 'material', 'process', 'application',
  ] as FieldCheck['field'][]).map((field) => {
    const checks = fieldChecks.filter((check) => check.field === field);
    const correct = checks.filter((check) => check.correct).length;
    return [field, { total: checks.length, correct, accuracy: checks.length ? correct / checks.length : null }];
  }));
  const requestDurations = records.map((record) => record.durationMs).sort((left, right) => left - right);
  const humanReasons = validations.flatMap((item) => item.humanReviewReasons);
  const reasonDistribution = Object.fromEntries([...new Set(humanReasons)].map((reason) => [reason, humanReasons.filter((item) => item === reason).length]));
  const initialRequests = records.filter((record) => record.repairAttempt === 0);
  const apiErrors = records.filter((record) => record.errorCode && !['AI_INVALID_JSON', 'AI_SCHEMA_INVALID'].includes(record.errorCode));
  const ocrHumanReviewValidations = validations.filter((item) => item.expectedWarningCodes.includes('OCR_MODEL_UNCERTAIN'));
  const p0Checks = {
    allSamplesCompletedOrExplained: cases.every((item) => item.errorCode === null || Boolean(item.errorMessage)),
    schemaValid: successful.length === cases.length,
    modelFidelity: fieldChecks.filter((check) => check.field === 'model').every((check) => check.correct),
    missingFieldsRemainEmpty: validations.every((item) => item.missingExpectedFieldCorrect === item.missingExpectedFieldTotal),
    noHallucinations: validations.every((item) => item.hallucinatedFieldCount === 0),
    allCriticalFieldsHaveEvidence: validations.every((item) => item.criticalFieldsWithoutEvidence === 0),
    evidenceTraceable: validations.every((item) => item.evidenceInvalid === 0),
    ocrHumanReview: ocrHumanReviewValidations.length > 0 && ocrHumanReviewValidations.every((item) => (
      item.missingExpectedWarningCodes.length === 0 && item.humanReviewActual >= item.humanReviewExpected
    )),
    conflictsPreserved: validations.every((item) => item.silentlyOverwrittenConflictCount === 0),
    crossFileEvidencePreserved: validations.every((item) => item.expectedSourceFileCount <= 1 || item.actualSourceFileCount === item.expectedSourceFileCount),
    noWrongMerges: validations.every((item) => item.wrongMergeCount === 0),
    noMissingExpectedProducts: validations.every((item) => item.missingExpectedProductCount === 0),
    ocrDuplicateResolved: cases.filter((item) => item.sampleId.startsWith('ocr-')).every((item) => item.localDiagnostics.chunkCount === 1),
  };
  return {
    basic: {
      sampleCount: cases.length,
      requestCount: records.length,
      successCount: successful.length,
      failureCount: cases.length - successful.length,
      productCount: successful.reduce((sum, item) => sum + item.products.length, 0),
      schemaFirstPassCount: initialRequests.filter((record) => record.schemaValid).length,
      schemaFirstPassRate: initialRequests.length ? initialRequests.filter((record) => record.schemaValid).length / initialRequests.length : 0,
      repairCount: records.filter((record) => record.repairAttempt > 0).length,
      apiErrorCount: apiErrors.length,
    },
    fieldQuality: {
      ...fieldQuality,
      missingFields: {
        total: validations.reduce((sum, item) => sum + item.missingExpectedFieldTotal, 0),
        correctlyEmpty: validations.reduce((sum, item) => sum + item.missingExpectedFieldCorrect, 0),
      },
      hallucinatedFieldCount: validations.reduce((sum, item) => sum + item.hallucinatedFieldCount, 0),
    },
    evidence: {
      total: validations.reduce((sum, item) => sum + item.evidenceTotal, 0),
      valid: validations.reduce((sum, item) => sum + item.evidenceValid, 0),
      invalid: validations.reduce((sum, item) => sum + item.evidenceInvalid, 0),
      accuracy: ratio(validations.reduce((sum, item) => sum + item.evidenceValid, 0), validations.reduce((sum, item) => sum + item.evidenceTotal, 0)),
      criticalFieldsWithoutEvidence: validations.reduce((sum, item) => sum + item.criticalFieldsWithoutEvidence, 0),
      invalidProviderEvidenceReferenceCount: validations.reduce((sum, item) => sum + item.invalidProviderEvidenceReferenceCount, 0),
    },
    humanReview: {
      expectedProducts: validations.reduce((sum, item) => sum + item.humanReviewExpected, 0),
      triggeredProducts: validations.reduce((sum, item) => sum + item.humanReviewActual, 0),
      reasonDistribution,
    },
    merge: {
      correctMergeCount: validations.reduce((sum, item) => sum + item.correctMergeCount, 0),
      duplicateProductCount: validations.reduce((sum, item) => sum + item.duplicateProductCount, 0),
      wrongMergeCount: validations.reduce((sum, item) => sum + item.wrongMergeCount, 0),
      missingExpectedProductCount: validations.reduce((sum, item) => sum + item.missingExpectedProductCount, 0),
      silentlyOverwrittenConflictCount: validations.reduce((sum, item) => sum + item.silentlyOverwrittenConflictCount, 0),
    },
    performance: {
      averageRequestDurationMs: average(requestDurations),
      p95RequestDurationMs: percentile(requestDurations, 0.95),
      slowestRequest: [...records].sort((left, right) => right.durationMs - left.durationMs)[0] ?? null,
      samples: cases.map((item) => ({ sampleId: item.sampleId, durationMs: item.durationMs, chunkCount: item.chunkCount, totalTokens: item.totalTokens })),
    },
    p0Checks,
    p0Passed: Object.values(p0Checks).every(Boolean),
  };
}

function buildOcrBeforeAfter(previous: any, currentCases: Array<Record<string, any>>) {
  const before = previous?.cases?.find((item: any) => item.id === 'ocr-nameplate' || item.sampleId === 'ocr-nameplate-regression');
  const after = currentCases.find((item) => item.sampleId === 'ocr-nameplate-regression');
  return {
    comparableSample: 'images/nameplate/input.jpg',
    before: before ? {
      chunkCount: before.chunkCount ?? before.metrics?.chunkCount ?? null,
      inputChars: before.inputChars ?? before.metrics?.inputCharacters ?? null,
      totalTokens: before.totalTokens ?? before.metrics?.usage?.totalTokens ?? null,
      durationMs: before.durationMs ?? before.metrics?.durationMs ?? null,
    } : null,
    after: after ? {
      chunkCount: after.chunkCount,
      inputChars: after.inputChars,
      totalTokens: after.totalTokens,
      durationMs: after.durationMs,
    } : null,
  };
}

async function readJsonIfExists(filePath: string): Promise<any | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function sumNullable(values: Array<number | null>): number | null {
  return values.every((value) => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function average(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function percentile(values: number[], percentileValue: number): number | null {
  if (!values.length) return null;
  return values[Math.min(values.length - 1, Math.ceil(values.length * percentileValue) - 1)];
}

function ratio(numerator: number, denominator: number): number {
  return denominator ? numerator / denominator : 1;
}
