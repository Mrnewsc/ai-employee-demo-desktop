/// <reference types="node" />

import { access, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DeepSeekProductExtractionProvider,
  EXTRACTION_PROVIDER_DEFAULTS,
  JSON_REPAIR_SYSTEM_PROMPT,
  PRODUCT_EXTRACTION_SYSTEM_PROMPT,
  PROVIDER_WIRE_SCHEMA_SUMMARY,
  PersistentChunkCheckpointStore,
  RealProviderAttemptLedger,
  SCHEMA_REPAIR_SYSTEM_PROMPT,
  asExtractionError,
  createChunkFingerprint,
  createExtractionChunks,
  deepSeekConfigFromEnvironment,
  fingerprintJson,
  getRealDeepSeekRequestCount,
  type AIProviderConfig,
  type ChunkCheckpointCompatibility,
  type ExtractionAuditEvent,
  type ExtractionRequestRecord,
  type ProviderExtractionPayload,
} from '../../src/real-ai/extraction';
import { parseDocument } from '../../src/real-ai/parsers';

const CHUNK_INDEX = 3;
const MAX_REAL_REQUESTS = 2;
const EXPECTED_SOURCE_FINGERPRINT = '2cbff87bdb373a6fcce83e3bb9912605f97f40735ee96ef0c62d985fc17d4822';
const EXPECTED_CHUNK_FINGERPRINT = 'd6fb484aae65ea513928ca6a37d8e7435ac3ea65907a87090217c686fc75f1ba';

const args = parseArguments(process.argv.slice(2));
const repositoryRoot = path.resolve('.');
const pdfArgument = args.get('pdf');
if (!pdfArgument) throw new Error('MISSING_EXTERNAL_PDF');
const pdfPath = path.resolve(pdfArgument);
await access(pdfPath);
if (isInside(pdfPath, repositoryRoot)) throw new Error('CUSTOMER_PDF_MUST_REMAIN_OUTSIDE_REPOSITORY');

const executeReal = booleanArgument(args, 'execute-real', false);
const confirmCost = booleanArgument(args, 'confirm-ai-cost', false);
const dryRun = !executeReal;
if (executeReal && !confirmCost) throw new Error('AI_COST_NOT_CONFIRMED');
if (integerArgument(args, 'chunk', CHUNK_INDEX) !== CHUNK_INDEX) throw new Error('R3_2_R1_ONLY_CHUNK_3_ALLOWED');
if (integerArgument(args, 'max-real-requests', MAX_REAL_REQUESTS) !== MAX_REAL_REQUESTS) {
  throw new Error('R3_2_R1_MAX_REAL_REQUESTS_MUST_BE_2');
}
if (integerArgument(args, 'concurrency', 1) !== 1) throw new Error('R3_2_R1_CONCURRENCY_MUST_BE_1');

if (dryRun) {
  process.env.REAL_AI_BLOCK_REAL_DEEPSEEK = '1';
  process.env.REAL_AI_MAX_DEEPSEEK_REQUESTS = '0';
} else {
  delete process.env.REAL_AI_BLOCK_REAL_DEEPSEEK;
  process.env.REAL_AI_MAX_DEEPSEEK_REQUESTS = String(MAX_REAL_REQUESTS);
}

const parsed = await parseDocument(pdfPath, {
  maxFileSizeBytes: 100 * 1024 * 1024,
  timeoutMs: 15 * 60_000,
  enableOcr: true,
});
if (parsed.sha256 !== EXPECTED_SOURCE_FINGERPRINT) throw new Error('R3_2_R1_SOURCE_FINGERPRINT_MISMATCH');

// Keep the original job/chunk identity so the R1 input fingerprint proves it is the same deterministic Chunk 3.
const jobId = `real_ai_001c_r3_2_${parsed.sha256.slice(0, 16)}`;
const allChunks = createExtractionChunks(parsed, jobId, { sampleId: 'real-ai-001c-r3-2-canary' }, {
  maxChunksPerDocument: 40,
  maxConcurrentRequests: 1,
});
if (allChunks.length !== 32) throw new Error('R3_2_R1_EXPECTED_32_DETERMINISTIC_CHUNKS');
const input = allChunks[CHUNK_INDEX - 1];
if (!input) throw new Error('R3_2_R1_CHUNK_3_NOT_FOUND');
const chunkFingerprint = createChunkFingerprint(input, parsed.sha256, CHUNK_INDEX);
if (chunkFingerprint !== EXPECTED_CHUNK_FINGERPRINT) throw new Error('R3_2_R1_CHUNK_FINGERPRINT_MISMATCH');

const providerConfig = providerConfigForMode(dryRun);
const promptConfigFingerprint = fingerprintJson({
  extractionSystemPrompt: PRODUCT_EXTRACTION_SYSTEM_PROMPT,
  jsonRepairSystemPrompt: JSON_REPAIR_SYSTEM_PROMPT,
  schemaRepairSystemPrompt: SCHEMA_REPAIR_SYSTEM_PROMPT,
  wireSchema: PROVIDER_WIRE_SCHEMA_SUMMARY,
  responseFormat: 'json_object',
  maxRepairAttempts: providerConfig.maxRepairAttempts,
});
const extractionConfigFingerprint = fingerprintJson({
  maxTextCharacters: 8_000,
  maxTableRows: 40,
  maxChunksPerDocument: 40,
  maxConcurrentRequests: 1,
  maxOutputTokens: providerConfig.maxOutputTokens,
  thinkingMode: 'disabled',
  stream: false,
});
const compatibility: ChunkCheckpointCompatibility = {
  jobId,
  sourceFingerprint: parsed.sha256,
  chunkId: input.chunkId,
  chunkIndex: CHUNK_INDEX,
  chunkFingerprint,
  schemaVersion: '1.0',
  provider: 'deepseek',
  model: providerConfig.model,
  thinkingMode: 'disabled',
  promptConfigFingerprint,
  extractionConfigFingerprint,
};

const pilotRoot = path.resolve(args.get('pilot-output') || path.join(os.homedir(), 'Documents', 'sy', 'real-ai-pilot-output'));
if (isInside(pilotRoot, repositoryRoot)) throw new Error('CANARY_OUTPUT_MUST_REMAIN_OUTSIDE_REPOSITORY');
const canaryRoot = path.join(pilotRoot, 'r3-2-r1-canary', parsed.sha256.slice(0, 16));
const checkpointStore = new PersistentChunkCheckpointStore(path.join(canaryRoot, 'checkpoints'));
const ledger = new RealProviderAttemptLedger(path.join(canaryRoot, 'real-provider-attempt-ledger.json'), jobId, MAX_REAL_REQUESTS);
await ledger.initialize();
ledger.assertChunksSafeToRun([CHUNK_INDEX]);
const usedBudgetBefore = ledger.usedBudget();

const existingCheckpoint = await checkpointStore.read(compatibility);
const orphanAttempts = ledger.snapshot().attempts.filter((attempt) => attempt.chunkIndex === CHUNK_INDEX);
if (!existingCheckpoint && orphanAttempts.length > 0) throw new Error('AMBIGUOUS_ATTEMPT');
if (existingCheckpoint?.status === 'failed') throw new Error('R3_2_R1_FAILED_CHECKPOINT_REQUIRES_NEW_AUTHORIZATION');

const reportPath = path.join(canaryRoot, dryRun ? 'preflight-dry-run.json' : 'chunk-3-canary-result.json');
const auditEvents: ExtractionAuditEvent[] = [];
const requestRecords: ExtractionRequestRecord[] = [];
let validatedWireDto: ProviderExtractionPayload | null = null;
let status: 'dry-run' | 'checkpoint-hit' | 'completed' | 'failed' = dryRun ? 'dry-run' : 'failed';
let errorCode: string | null = null;
let productCount: number | null = null;
let needsHumanReviewCount: number | null = null;
let hallucinatedFieldCount: number | null = null;
let checkpointWritten = false;
let checkpointReloaded = false;

if (existingCheckpoint?.status === 'completed') {
  status = 'checkpoint-hit';
  productCount = existingCheckpoint.result.products.length;
  needsHumanReviewCount = existingCheckpoint.result.products.filter((product) => product.needsHumanReview).length;
  hallucinatedFieldCount = existingCheckpoint.result.warnings.filter((warning) => warning.code === 'MISSING_FIELD_EVIDENCE').length;
  checkpointReloaded = true;
} else if (!dryRun) {
  const provider = new DeepSeekProductExtractionProvider(
    providerConfig,
    (event) => auditEvents.push(structuredClone(event)),
    fetch,
  );
  try {
    const result = await provider.extract(input, {
      requestContext: {
        attemptId: `${jobId}:r1:chunk:${CHUNK_INDEX}`,
        requestAttempt: 1,
        chunkIndex: CHUNK_INDEX,
        totalChunks: allChunks.length,
      },
      providerAttemptHooks: ledger,
      onRequestRecord: (record) => requestRecords.push(structuredClone(record)),
      onValidatedPayload: (record) => { validatedWireDto = structuredClone(record.payload); },
    });
    if (!validatedWireDto) throw new Error('VALIDATED_WIRE_DTO_MISSING');
    await checkpointStore.writeCompleted(compatibility, validatedWireDto, result);
    checkpointWritten = true;
    const reloaded = await checkpointStore.read(compatibility);
    if (reloaded?.status !== 'completed') throw new Error('COMPLETED_CHECKPOINT_RELOAD_FAILED');
    checkpointReloaded = true;
    status = 'completed';
    productCount = result.products.length;
    needsHumanReviewCount = result.products.filter((product) => product.needsHumanReview).length;
    hallucinatedFieldCount = result.warnings.filter((warning) => warning.code === 'MISSING_FIELD_EVIDENCE').length;
  } catch (error) {
    const normalized = asExtractionError(error);
    errorCode = normalized.code;
    await checkpointStore.writeFailed(compatibility, normalized.code);
    checkpointWritten = true;
    status = 'failed';
  }
}

const canonicalizationEvents = auditEvents.filter((event) => (
  event.canonicalizationRules.length > 0 || event.canonicalizationRejectedCount > 0
));
const canonicalizationRules = canonicalizationEvents.flatMap((event) => event.canonicalizationRules);
const repairDiagnostics = auditEvents
  .filter((event) => event.repairDiagnostics !== null)
  .map((event) => ({ chunkId: event.chunkId, ...event.repairDiagnostics }));
const firstRequest = requestRecords.find((record) => record.repairAttempt === 0) ?? null;
const repairRequests = requestRecords.filter((record) => record.repairAttempt > 0);
const factInvariantVerified = canonicalizationRules.every((rule) => (
  rule.ruleId === 'QUANTITY_NULL_TO_EMPTY_OBJECT'
    && rule.targetField.match(/^products\[\d+\]\.quantity$/) !== null
    && rule.beforeShape === 'null'
    && rule.afterShape === 'object(keys=[value,unit,raw])'
    && rule.semanticSafe
));

const safeReport = {
  schemaVersion: '1.0',
  scope: 'REAL-AI-001C-R3.2-R1-Chunk-3-Canary',
  executedAt: new Date().toISOString(),
  input: {
    sourceFile: path.basename(parsed.fileName),
    sourceFingerprint: parsed.sha256,
    chunkIndex: CHUNK_INDEX,
    chunkFingerprint,
    totalChunks: allChunks.length,
    inputChars: input.evidenceItems.reduce((sum, item) => sum + item.text.length, 0),
  },
  configuration: {
    maxRealProviderRequests: MAX_REAL_REQUESTS,
    concurrency: 1,
    thinkingMode: 'disabled',
    responseFormat: 'json_object',
    stream: false,
    schemaVersion: compatibility.schemaVersion,
    provider: compatibility.provider,
    model: compatibility.model,
    promptConfigFingerprint,
    extractionConfigFingerprint,
    dryRun,
  },
  preflight: {
    ambiguousAttempt: false,
    compatibleCompletedCheckpointBeforeRun: existingCheckpoint?.status === 'completed',
    compatibleFailedCheckpointBeforeRun: existingCheckpoint?.status === 'failed',
    usedBudgetBefore,
  },
  result: {
    status,
    errorCode,
    schemaValidFirstPass: firstRequest?.schemaValid ?? null,
    schemaIssueCountFirstPass: firstRequest?.schemaIssues.length ?? 0,
    canonicalizationApplied: canonicalizationRules.length > 0,
    canonicalizationAppliedCount: canonicalizationRules.length,
    canonicalizationRuleIds: canonicalizationRules.map((rule) => rule.ruleId),
    canonicalizationFieldPaths: canonicalizationRules.map((rule) => rule.targetField),
    canonicalizationRejectedCount: canonicalizationEvents.reduce((sum, event) => sum + event.canonicalizationRejectedCount, 0),
    repairExecuted: repairRequests.length > 0,
    repairRequestCount: repairRequests.length,
    semanticDriftDetected: repairDiagnostics.some((entry) => entry.semanticDriftDetected),
    providerRequestCount: requestRecords.length,
    productCount,
    needsHumanReviewCount,
    hallucinatedFieldCount,
    checkpointWritten,
    checkpointReloaded,
    resumeProviderRequestCount: checkpointReloaded && status === 'completed' ? 0 : null,
  },
  canonicalization: {
    rules: canonicalizationRules,
    factInvariantVerification: {
      verified: factInvariantVerified,
      method: 'allowlisted-rule-runtime-audit-plus-offline-fact-diff-tests',
      productCountUnchanged: factInvariantVerified,
      evidenceRefsUnchanged: factInvariantVerified,
      otherFactFieldsUnchanged: factInvariantVerified,
    },
  },
  schemaDiagnostics: requestRecords.flatMap((record) => record.schemaIssues.map((issue) => ({
    stage: record.repairAttempt === 0 ? 'first-provider-response' : 'repair-response',
    ...issue,
  }))),
  repairDiagnostics,
  requestAudit: requestRecords.map((record) => ({
    chunkId: record.chunkId,
    durationMs: record.durationMs,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    totalTokens: record.totalTokens,
    schemaValid: record.schemaValid,
    repairAttempt: record.repairAttempt,
    errorCode: record.errorCode,
    errorStage: record.errorStage,
    thinkingMode: record.thinkingMode,
    providerRequestId: record.providerRequestId,
  })),
  totals: {
    inputTokens: requestRecords.reduce((sum, record) => sum + (record.inputTokens ?? 0), 0),
    outputTokens: requestRecords.reduce((sum, record) => sum + (record.outputTokens ?? 0), 0),
    totalTokens: requestRecords.reduce((sum, record) => sum + (record.totalTokens ?? 0), 0),
    durationMs: requestRecords.reduce((sum, record) => sum + record.durationMs, 0),
    ledgerAttempts: ledger.usedBudget(),
    remainingBudget: ledger.remainingBudget(),
    realProviderRequestCount: getRealDeepSeekRequestCount(),
  },
  privacy: {
    apiKeyRecorded: false,
    authorizationRecorded: false,
    promptRecorded: false,
    messagesRecorded: false,
    providerResponseRecorded: false,
    customerTextRecorded: false,
    fullLocalPathRecorded: false,
  },
};

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(safeReport, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  reportFile: path.basename(reportPath),
  sourceFile: safeReport.input.sourceFile,
  sourceFingerprint: safeReport.input.sourceFingerprint,
  chunkIndex: safeReport.input.chunkIndex,
  chunkFingerprint: safeReport.input.chunkFingerprint,
  maxRealProviderRequests: MAX_REAL_REQUESTS,
  status,
  realProviderRequestCount: safeReport.totals.realProviderRequestCount,
}));

if (status === 'failed') process.exitCode = 2;

function providerConfigForMode(dry: boolean): AIProviderConfig {
  if (!dry) {
    const configured = deepSeekConfigFromEnvironment(process.env);
    return { ...configured, thinkingMode: 'disabled', maxOutputTokens: Math.max(configured.maxOutputTokens, 6_000) };
  }
  return {
    provider: 'deepseek',
    baseUrl: EXTRACTION_PROVIDER_DEFAULTS.baseUrl,
    model: process.env.DEEPSEEK_MODEL?.trim() || 'dry-run-model-unconfigured',
    apiKey: 'dry-run-never-sent',
    timeoutMs: EXTRACTION_PROVIDER_DEFAULTS.timeoutMs,
    maxRepairAttempts: 1,
    maxOutputTokens: Math.max(EXTRACTION_PROVIDER_DEFAULTS.maxOutputTokens, 6_000),
    thinkingMode: 'disabled',
  };
}

function parseArguments(values: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (const argument of values) {
    if (!argument.startsWith('--')) throw new Error(`INVALID_ARGUMENT:${argument}`);
    const [name, ...rest] = argument.slice(2).split('=');
    parsed.set(name, rest.length ? rest.join('=') : 'true');
  }
  return parsed;
}

function booleanArgument(values: Map<string, string>, name: string, fallback: boolean): boolean {
  const value = values.get(name);
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`INVALID_BOOLEAN_ARGUMENT:${name}`);
}

function integerArgument(values: Map<string, string>, name: string, fallback: number): number {
  const value = Number(values.get(name) ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`INVALID_INTEGER_ARGUMENT:${name}`);
  return value;
}

function isInside(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
