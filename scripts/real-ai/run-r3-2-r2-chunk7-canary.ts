/// <reference types="node" />

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
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
  type ProductExtractionResult,
  type ProviderAttemptFinish,
  type ProviderAttemptStart,
  type ProviderExtractionPayload,
  type SchemaIssue,
} from '../../src/real-ai/extraction';
import { parseDocument } from '../../src/real-ai/parsers';

const CHUNK_INDEX = 7;
const MAX_REAL_REQUESTS = 2;
const EXPECTED_MODEL = 'deepseek-v4-flash';
const EXPECTED_SOURCE_FINGERPRINT = '2cbff87bdb373a6fcce83e3bb9912605f97f40735ee96ef0c62d985fc17d4822';
const EXPECTED_CHUNK_FINGERPRINT = 'e3e9905edab585f28cdde8eb40a27f76013cae33f720aafe1bae99ab4abdaf72';
const EXPECTED_PROMPT_CONFIG_FINGERPRINT = '8674ce8bfdd795e7fbba872b96c6dcffe3a943af86515979ab0ca28a8c52eb92';
const EXPECTED_EXTRACTION_CONFIG_FINGERPRINT = '527bc7dff30f044e2bf789f6850df8d7124063a3cc22865903fdbd4360e6c037';
const EXPECTED_CHUNK_3_CHECKPOINT_HASH = '2231b7c280b92047b175736c1cb14d5a4019661f8a8bb2f81580566ecad88e0d';
const EXPECTED_CHUNK_3_LEDGER_HASH = 'ed7ab59130cea5d67f8e7900e8d66e9639c5347c532fa9aff6added127f6768f';

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
if (integerArgument(args, 'chunk', CHUNK_INDEX) !== CHUNK_INDEX) throw new Error('R3_2_R2_ONLY_CHUNK_7_ALLOWED');
if (integerArgument(args, 'max-real-requests', MAX_REAL_REQUESTS) !== MAX_REAL_REQUESTS) {
  throw new Error('R3_2_R2_MAX_REAL_REQUESTS_MUST_BE_2');
}
if (integerArgument(args, 'concurrency', 1) !== 1) throw new Error('R3_2_R2_CONCURRENCY_MUST_BE_1');

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
if (parsed.sha256 !== EXPECTED_SOURCE_FINGERPRINT) throw new Error('R3_2_R2_SOURCE_FINGERPRINT_MISMATCH');

const jobId = `real_ai_001c_r3_2_${parsed.sha256.slice(0, 16)}`;
const allChunks = createExtractionChunks(parsed, jobId, { sampleId: 'real-ai-001c-r3-2-canary' }, {
  maxChunksPerDocument: 40,
  maxConcurrentRequests: 1,
});
if (allChunks.length !== 32) throw new Error('R3_2_R2_EXPECTED_32_DETERMINISTIC_CHUNKS');
const input = allChunks[CHUNK_INDEX - 1];
if (!input) throw new Error('R3_2_R2_CHUNK_7_NOT_FOUND');
const chunkFingerprint = createChunkFingerprint(input, parsed.sha256, CHUNK_INDEX);
if (chunkFingerprint !== EXPECTED_CHUNK_FINGERPRINT) throw new Error('R3_2_R2_CHUNK_FINGERPRINT_MISMATCH');

const providerConfig = providerConfigForMode(dryRun);
if (providerConfig.model !== EXPECTED_MODEL) throw new Error('R3_2_R2_MODEL_MISMATCH');
if (providerConfig.thinkingMode !== 'disabled') throw new Error('R3_2_R2_THINKING_MODE_MUST_BE_DISABLED');
if (providerConfig.maxRepairAttempts !== 1) throw new Error('R3_2_R2_REPAIR_BUDGET_MUST_BE_1');
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
if (promptConfigFingerprint !== EXPECTED_PROMPT_CONFIG_FINGERPRINT) {
  throw new Error('R3_2_R2_PROMPT_CONFIG_FINGERPRINT_MISMATCH');
}
if (extractionConfigFingerprint !== EXPECTED_EXTRACTION_CONFIG_FINGERPRINT) {
  throw new Error('R3_2_R2_EXTRACTION_CONFIG_FINGERPRINT_MISMATCH');
}

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
const canaryRoot = path.join(pilotRoot, 'r3-2-r2-canary', parsed.sha256.slice(0, 16));
const checkpointStore = new PersistentChunkCheckpointStore(path.join(canaryRoot, 'checkpoints'));
const ledger = new RealProviderAttemptLedger(path.join(canaryRoot, 'real-provider-attempt-ledger.json'), jobId, MAX_REAL_REQUESTS);
const chunk3Root = path.join(pilotRoot, 'r3-2-r1-canary', parsed.sha256.slice(0, 16));
const chunk3Artifacts = {
  checkpoint: path.join(chunk3Root, 'checkpoints', 'chunk-0003.json'),
  ledger: path.join(chunk3Root, 'real-provider-attempt-ledger.json'),
};
const chunk3HashesBefore = await assertChunk3Frozen(chunk3Artifacts);

await ledger.initialize();
ledger.assertChunksSafeToRun([CHUNK_INDEX]);
if (ledger.snapshot().attempts.some((attempt) => attempt.status === 'AMBIGUOUS_ATTEMPT')) {
  throw new Error('AMBIGUOUS_ATTEMPT');
}
const usedBudgetBefore = ledger.usedBudget();
const remainingBudgetBefore = ledger.remainingBudget();

const existingCheckpoint = await checkpointStore.read(compatibility);
const orphanAttempts = ledger.snapshot().attempts.filter((attempt) => attempt.chunkIndex === CHUNK_INDEX);
if (!existingCheckpoint && orphanAttempts.length > 0) throw new Error('AMBIGUOUS_ATTEMPT');
if (existingCheckpoint?.status === 'failed') throw new Error('R3_2_R2_FAILED_CHECKPOINT_REQUIRES_NEW_AUTHORIZATION');
if (!existingCheckpoint && remainingBudgetBefore !== MAX_REAL_REQUESTS) throw new Error('R3_2_R2_REMAINING_BUDGET_MUST_BE_2');

const reportName = dryRun
  ? existingCheckpoint?.status === 'completed' ? 'checkpoint-resume-dry-run.json' : 'preflight-dry-run.json'
  : 'chunk-7-canary-result.json';
const reportPath = path.join(canaryRoot, reportName);
const auditEvents: ExtractionAuditEvent[] = [];
const requestRecords: ExtractionRequestRecord[] = [];
let validatedWireDto: ProviderExtractionPayload | null = null;
let result: ProductExtractionResult | null = existingCheckpoint?.status === 'completed' ? existingCheckpoint.result : null;
let status: 'dry-run' | 'checkpoint-hit' | 'completed' | 'failed' = dryRun ? 'dry-run' : 'failed';
let errorCode: string | null = null;
let finalSchemaIssues: SchemaIssue[] = [];
let checkpointWritten = false;
let checkpointReloaded = false;

if (existingCheckpoint?.status === 'completed') {
  status = 'checkpoint-hit';
  checkpointReloaded = true;
} else if (!dryRun) {
  const provider = new DeepSeekProductExtractionProvider(
    providerConfig,
    (event) => auditEvents.push(structuredClone(event)),
    fetch,
  );
  const attemptHooks = scopedAttemptHooks(ledger, `${jobId}:r2:chunk:${CHUNK_INDEX}`);
  try {
    result = await provider.extract(input, {
      requestContext: {
        attemptId: `${jobId}:r2:chunk:${CHUNK_INDEX}`,
        requestAttempt: 1,
        chunkIndex: CHUNK_INDEX,
        totalChunks: allChunks.length,
      },
      providerAttemptHooks: attemptHooks,
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
  } catch (error) {
    const normalized = asExtractionError(error);
    errorCode = normalized.code;
    finalSchemaIssues = structuredClone(normalized.schemaIssues);
    await checkpointStore.writeFailed(compatibility, normalized.code);
    checkpointWritten = true;
    status = 'failed';
  }
}

const chunk3HashesAfter = await assertChunk3Frozen(chunk3Artifacts);
const canonicalizationEvents = auditEvents.filter((event) => (
  event.canonicalizationRules.length > 0 || event.canonicalizationRejectedCount > 0
));
const canonicalizationRules = canonicalizationEvents.flatMap((event) => event.canonicalizationRules);
const repairStarted = auditEvents.find((event) => event.event === 'repair-started') ?? null;
const repairDiagnostics = auditEvents
  .filter((event) => event.repairDiagnostics !== null)
  .map((event) => ({ chunkId: event.chunkId, ...event.repairDiagnostics }));
const firstRequest = requestRecords.find((record) => record.repairAttempt === 0) ?? null;
const repairRequests = requestRecords.filter((record) => record.repairAttempt > 0);
const lastRepairRequest = repairRequests.at(-1) ?? null;
const evidence = result ? validateFinalEvidence(input, result) : null;
const firstPassIssueCount = firstRequest?.schemaIssues.length ?? 0;
const issuesAfterCanonicalization = firstRequest?.schemaValid
  ? 0
  : repairStarted
    ? repairStarted.schemaIssues.length
    : status === 'completed' || status === 'checkpoint-hit'
      ? 0
      : finalSchemaIssues.length;
const repairExecuted = repairRequests.length > 0;
const issuesAfterRepair = repairExecuted ? (lastRepairRequest?.schemaIssues.length ?? finalSchemaIssues.length) : null;
const quantityRules = canonicalizationRules.filter((rule) => rule.ruleId === 'QUANTITY_NULL_TO_EMPTY_OBJECT');
const canonicalizationFactInvariant = canonicalizationRules.length === 0
  ? null
  : canonicalizationRules.every((rule) => rule.semanticSafe)
    && quantityRules.every((rule) => (
      /^products\[\d+\]\.quantity$/.test(rule.targetField)
      && rule.beforeShape === 'null'
      && rule.afterShape === 'object(keys=[value,unit,raw])'
    ));
const ledgerSnapshot = ledger.snapshot();
const mainAttempts = ledgerSnapshot.attempts.filter((attempt) => attempt.chunkIndex === CHUNK_INDEX && attempt.repairAttempt === 0);
const successfulChunkDuplicateRequestCount = Math.max(0, mainAttempts.length - 1);

const safeReport = {
  schemaVersion: '1.0',
  scope: 'REAL-AI-001C-R3.2-R2-Chunk-7-Canary',
  executedAt: new Date().toISOString(),
  input: {
    sourceFile: path.basename(parsed.fileName),
    sourceFingerprint: parsed.sha256,
    chunkIndex: CHUNK_INDEX,
    chunkId: input.chunkId,
    chunkFingerprint,
    totalChunks: allChunks.length,
    evidenceItemCount: input.evidenceItems.length,
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
    sourceFingerprintMatched: parsed.sha256 === EXPECTED_SOURCE_FINGERPRINT,
    chunkFingerprintMatched: chunkFingerprint === EXPECTED_CHUNK_FINGERPRINT,
    schemaVersionMatched: compatibility.schemaVersion === '1.0',
    modelMatched: compatibility.model === EXPECTED_MODEL,
    thinkingModeMatched: compatibility.thinkingMode === 'disabled',
    promptConfigFingerprintMatched: promptConfigFingerprint === EXPECTED_PROMPT_CONFIG_FINGERPRINT,
    extractionConfigFingerprintMatched: extractionConfigFingerprint === EXPECTED_EXTRACTION_CONFIG_FINGERPRINT,
    ambiguousAttempt: false,
    compatibleCompletedCheckpointBeforeRun: existingCheckpoint?.status === 'completed',
    compatibleFailedCheckpointBeforeRun: existingCheckpoint?.status === 'failed',
    usedBudgetBefore,
    remainingBudgetBefore,
  },
  result: {
    status,
    errorCode,
    schemaValidFirstPass: firstRequest?.schemaValid ?? null,
    schemaIssueCountBeforeCanonicalization: firstPassIssueCount,
    schemaIssueCountAfterCanonicalization: issuesAfterCanonicalization,
    canonicalizationApplied: canonicalizationRules.length > 0,
    canonicalizationAppliedCount: canonicalizationRules.length,
    canonicalizationRejectedCount: canonicalizationEvents.reduce((sum, event) => sum + event.canonicalizationRejectedCount, 0),
    repairExecuted,
    repairRequestCount: repairRequests.length,
    schemaIssueCountAfterRepair: issuesAfterRepair,
    semanticDriftDetected: repairDiagnostics.some((entry) => entry.semanticDriftDetected),
    providerRequestCount: requestRecords.length,
    providerErrorCount: requestRecords.filter((record) => record.errorStage === 'provider' || record.errorStage === 'http' || record.errorStage === 'transport').length,
    outputTruncatedCount: requestRecords.filter((record) => record.errorCode === 'AI_OUTPUT_TRUNCATED').length,
    productCount: result?.products.length ?? null,
    needsHumanReviewCount: result?.products.filter((product) => product.needsHumanReview).length ?? null,
    hallucinatedFieldCount: result?.warnings.filter((warning) => warning.code === 'MISSING_FIELD_EVIDENCE').length ?? null,
    checkpointWritten,
    checkpointReloaded,
    checkpointHit: status === 'checkpoint-hit',
    successfulChunkDuplicateRequestCount,
  },
  schemaDiagnostics: {
    firstProviderResponse: firstRequest?.schemaIssues ?? [],
    afterCanonicalization: repairStarted?.schemaIssues ?? (issuesAfterCanonicalization > 0 ? finalSchemaIssues : []),
    afterRepair: lastRepairRequest?.schemaIssues ?? [],
    final: finalSchemaIssues,
  },
  canonicalization: {
    rules: canonicalizationRules,
    factInvariantVerification: {
      applicable: canonicalizationFactInvariant !== null,
      verified: canonicalizationFactInvariant,
      method: canonicalizationFactInvariant === null
        ? 'not-applicable-no-canonicalization'
        : 'allowlisted-runtime-audit-plus-offline-fact-diff-tests',
    },
  },
  repair: {
    diagnostics: repairDiagnostics,
    finalStatus: !repairExecuted
      ? 'NOT_EXECUTED'
      : repairDiagnostics.some((entry) => entry.semanticDriftDetected)
        ? 'REPAIR_SEMANTIC_DRIFT'
        : issuesAfterRepair === 0 ? 'SUCCESS' : 'FAILED_SCHEMA',
  },
  evidence,
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
    responseContentType: record.responseContentType,
  })),
  totals: {
    inputTokens: requestRecords.reduce((sum, record) => sum + (record.inputTokens ?? 0), 0),
    outputTokens: requestRecords.reduce((sum, record) => sum + (record.outputTokens ?? 0), 0),
    totalTokens: requestRecords.reduce((sum, record) => sum + (record.totalTokens ?? 0), 0),
    durationMs: requestRecords.reduce((sum, record) => sum + record.durationMs, 0),
    ledgerAttempts: ledger.usedBudget(),
    remainingBudget: ledger.remainingBudget(),
    realProviderRequestCount: getRealDeepSeekRequestCount(),
    repairRequestCount: repairRequests.length,
  },
  checkpoint: {
    written: checkpointWritten,
    reloaded: checkpointReloaded,
    resultHash: existingCheckpoint?.status === 'completed' ? existingCheckpoint.resultHash : null,
    resumeProviderRequestCount: status === 'checkpoint-hit' ? getRealDeepSeekRequestCount() : null,
  },
  chunk3Protection: {
    checkpointHashBefore: chunk3HashesBefore.checkpoint,
    checkpointHashAfter: chunk3HashesAfter.checkpoint,
    ledgerHashBefore: chunk3HashesBefore.ledger,
    ledgerHashAfter: chunk3HashesAfter.ledger,
    unchanged: chunk3HashesBefore.checkpoint === chunk3HashesAfter.checkpoint
      && chunk3HashesBefore.ledger === chunk3HashesAfter.ledger,
    r2Chunk3AttemptCount: ledgerSnapshot.attempts.filter((attempt) => attempt.chunkIndex === 3).length,
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

function scopedAttemptHooks(ledgerValue: RealProviderAttemptLedger, attemptPrefix: string) {
  const normalize = <T extends ProviderAttemptStart | ProviderAttemptFinish>(attempt: T): T => ({
    ...attempt,
    attemptId: `${attemptPrefix}:repair:${attempt.repairAttempt}`,
  });
  return {
    onStarted: (attempt: ProviderAttemptStart) => ledgerValue.onStarted(normalize(attempt)),
    onFinished: (attempt: ProviderAttemptFinish) => ledgerValue.onFinished(normalize(attempt)),
  };
}

function validateFinalEvidence(inputValue: typeof input, extractionResult: ProductExtractionResult) {
  const catalog = new Map(inputValue.evidenceItems.map((item) => [item.evidenceId, item]));
  const allEvidence = extractionResult.products.flatMap((product) => product.evidence);
  const validCount = allEvidence.filter((entry) => {
    const source = catalog.get(entry.evidenceId);
    if (!source) return false;
    return source.sourceFile === entry.sourceFile
      && normalized(source.text).includes(normalized(entry.text))
      && fingerprintJson(source.source) === fingerprintJson(entry.source);
  }).length;
  return {
    evidenceTotal: allEvidence.length,
    evidenceValid: validCount,
    evidenceInvalid: allEvidence.length - validCount,
    productsWithoutEvidence: extractionResult.products.filter((product) => product.evidence.length === 0).length,
    validationMethod: 'evidenceId+exact-contained-text+source-location+source-file',
  };
}

async function assertChunk3Frozen(artifacts: { checkpoint: string; ledger: string }) {
  const hashes = {
    checkpoint: await sha256File(artifacts.checkpoint),
    ledger: await sha256File(artifacts.ledger),
  };
  if (hashes.checkpoint !== EXPECTED_CHUNK_3_CHECKPOINT_HASH) throw new Error('CHUNK_3_CHECKPOINT_CHANGED');
  if (hashes.ledger !== EXPECTED_CHUNK_3_LEDGER_HASH) throw new Error('CHUNK_3_LEDGER_CHANGED');
  return hashes;
}

async function sha256File(filePath: string): Promise<string> {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

function providerConfigForMode(dry: boolean): AIProviderConfig {
  if (!dry) {
    const configured = deepSeekConfigFromEnvironment(process.env);
    return {
      ...configured,
      thinkingMode: 'disabled',
      maxRepairAttempts: 1,
      maxOutputTokens: Math.max(configured.maxOutputTokens, 6_000),
    };
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

function normalized(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
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
