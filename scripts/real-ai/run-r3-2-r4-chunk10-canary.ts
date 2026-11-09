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
  type ExtractionInput,
  type ExtractionRequestRecord,
  type ProductExtractionResult,
  type ProviderAttemptFinish,
  type ProviderAttemptStart,
  type ProviderExtractionPayload,
  type SchemaIssue,
} from '../../src/real-ai/extraction';
import { parseDocument } from '../../src/real-ai/parsers';

const CHUNK_INDEX = 10;
const MAX_REAL_REQUESTS = 2;
const EXPECTED_MODEL = 'deepseek-v4-flash';
const EXPECTED_SOURCE_FINGERPRINT = '2cbff87bdb373a6fcce83e3bb9912605f97f40735ee96ef0c62d985fc17d4822';
const EXPECTED_CHUNK_FINGERPRINT = '70a09fb88b52ed8f15e9b644c7299003e58ac95a3fed10ecbdfee8e17bc31a45';
const EXPECTED_PROMPT_CONFIG_FINGERPRINT = '8674ce8bfdd795e7fbba872b96c6dcffe3a943af86515979ab0ca28a8c52eb92';
const EXPECTED_EXTRACTION_CONFIG_FINGERPRINT = '527bc7dff30f044e2bf789f6850df8d7124063a3cc22865903fdbd4360e6c037';

const PRIOR_CANARIES = {
  chunk3: {
    chunkIndex: 3,
    outputName: 'r3-2-r1-canary',
    checkpointHash: '2231b7c280b92047b175736c1cb14d5a4019661f8a8bb2f81580566ecad88e0d',
    ledgerHash: 'ed7ab59130cea5d67f8e7900e8d66e9639c5347c532fa9aff6added127f6768f',
  },
  chunk7: {
    chunkIndex: 7,
    outputName: 'r3-2-r2-canary',
    checkpointHash: 'a072755fd917f42ab233b7e61a69841798ab3d9be9204bf8640fd62adcbf826a',
    ledgerHash: 'a32fba54f620a494aaa055d20f408348407645bf1ce3f51b021391d64eb56f55',
  },
  chunk27: {
    chunkIndex: 27,
    outputName: 'r3-2-r3-canary',
    checkpointHash: '8e5680a2ca0c4e23c6ea097d64d8c5c95f2aa77b0e9f06eb4e0757395d6f2591',
    ledgerHash: 'd883aa72553cf5b0b9fd8ac2473226bfce866f845f403e2a8d8ed61773304ba6',
  },
} as const;

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
if (integerArgument(args, 'chunk', CHUNK_INDEX) !== CHUNK_INDEX) throw new Error('R3_2_R4_ONLY_CHUNK_10_ALLOWED');
if (integerArgument(args, 'max-real-requests', MAX_REAL_REQUESTS) !== MAX_REAL_REQUESTS) {
  throw new Error('R3_2_R4_MAX_REAL_REQUESTS_MUST_BE_2');
}
if (integerArgument(args, 'concurrency', 1) !== 1) throw new Error('R3_2_R4_CONCURRENCY_MUST_BE_1');

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
if (parsed.sha256 !== EXPECTED_SOURCE_FINGERPRINT) throw new Error('R3_2_R4_SOURCE_FINGERPRINT_MISMATCH');

const jobId = `real_ai_001c_r3_2_${parsed.sha256.slice(0, 16)}`;
const allChunks = createExtractionChunks(parsed, jobId, { sampleId: 'real-ai-001c-r3-2-canary' }, {
  maxChunksPerDocument: 40,
  maxConcurrentRequests: 1,
});
if (allChunks.length !== 32) throw new Error('R3_2_R4_EXPECTED_32_DETERMINISTIC_CHUNKS');
const input = requireChunk(allChunks, CHUNK_INDEX);
const chunkFingerprint = createChunkFingerprint(input, parsed.sha256, CHUNK_INDEX);
if (chunkFingerprint !== EXPECTED_CHUNK_FINGERPRINT) throw new Error('R3_2_R4_CHUNK_FINGERPRINT_MISMATCH');

const providerConfig = providerConfigForMode(dryRun);
if (providerConfig.model !== EXPECTED_MODEL) throw new Error('R3_2_R4_MODEL_MISMATCH');
if (providerConfig.thinkingMode !== 'disabled') throw new Error('R3_2_R4_THINKING_MODE_MUST_BE_DISABLED');
if (providerConfig.maxRepairAttempts !== 1) throw new Error('R3_2_R4_REPAIR_BUDGET_MUST_BE_1');

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
  throw new Error('R3_2_R4_PROMPT_CONFIG_FINGERPRINT_MISMATCH');
}
if (extractionConfigFingerprint !== EXPECTED_EXTRACTION_CONFIG_FINGERPRINT) {
  throw new Error('R3_2_R4_EXTRACTION_CONFIG_FINGERPRINT_MISMATCH');
}

const compatibility = compatibilityFor(input, CHUNK_INDEX);
const pilotRoot = path.resolve(args.get('pilot-output') || path.join(os.homedir(), 'Documents', 'sy', 'real-ai-pilot-output'));
if (isInside(pilotRoot, repositoryRoot)) throw new Error('CANARY_OUTPUT_MUST_REMAIN_OUTSIDE_REPOSITORY');

const sourcePrefix = parsed.sha256.slice(0, 16);
const priorProtectionBefore = await validatePriorCanaries(pilotRoot, sourcePrefix);
const coreSourceFiles = [
  path.join(repositoryRoot, 'src', 'real-ai', 'extraction', 'schemas.ts'),
  path.join(repositoryRoot, 'src', 'real-ai', 'extraction', 'contracts.ts'),
  path.join(repositoryRoot, 'src', 'real-ai', 'extraction', 'safe-canonicalization.ts'),
  path.join(repositoryRoot, 'src', 'real-ai', 'extraction', 'providers', 'deepseek-product-extraction-provider.ts'),
];
const coreHashesBefore = await hashFiles(coreSourceFiles);

const canaryRoot = path.join(pilotRoot, 'r3-2-r4-canary', sourcePrefix);
const checkpointStore = new PersistentChunkCheckpointStore(path.join(canaryRoot, 'checkpoints'));
const ledger = new RealProviderAttemptLedger(path.join(canaryRoot, 'real-provider-attempt-ledger.json'), jobId, MAX_REAL_REQUESTS);
await ledger.initialize();
ledger.assertChunksSafeToRun([CHUNK_INDEX]);
const initialLedger = ledger.snapshot();
if (initialLedger.attempts.some((attempt) => attempt.status === 'AMBIGUOUS_ATTEMPT')) throw new Error('AMBIGUOUS_ATTEMPT');
if (initialLedger.attempts.some((attempt) => attempt.chunkIndex !== CHUNK_INDEX)) {
  throw new Error('R3_2_R4_LEDGER_CONTAINS_FORBIDDEN_CHUNK');
}

const usedBudgetBefore = ledger.usedBudget();
const remainingBudgetBefore = ledger.remainingBudget();
const existingCheckpoint = await checkpointStore.read(compatibility);
const orphanAttempts = initialLedger.attempts.filter((attempt) => attempt.chunkIndex === CHUNK_INDEX);
if (!existingCheckpoint && orphanAttempts.length > 0) throw new Error('AMBIGUOUS_ATTEMPT');
if (existingCheckpoint?.status === 'failed') throw new Error('R3_2_R4_FAILED_CHECKPOINT_REQUIRES_NEW_AUTHORIZATION');
if (!existingCheckpoint && remainingBudgetBefore !== MAX_REAL_REQUESTS) throw new Error('R3_2_R4_REMAINING_BUDGET_MUST_BE_2');

const reportName = dryRun
  ? existingCheckpoint?.status === 'completed' ? 'checkpoint-resume-dry-run.json' : 'preflight-dry-run.json'
  : 'chunk-10-canary-result.json';
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
let checkpointResultHash: string | null = existingCheckpoint?.status === 'completed' ? existingCheckpoint.resultHash : null;

if (existingCheckpoint?.status === 'completed') {
  status = 'checkpoint-hit';
  checkpointReloaded = true;
} else if (!dryRun) {
  const provider = new DeepSeekProductExtractionProvider(
    providerConfig,
    (event) => auditEvents.push(structuredClone(event)),
    fetch,
  );
  const attemptHooks = scopedAttemptHooks(ledger, `${jobId}:r4:chunk:${CHUNK_INDEX}`);
  try {
    result = await provider.extract(input, {
      requestContext: {
        attemptId: `${jobId}:r4:chunk:${CHUNK_INDEX}`,
        requestAttempt: 1,
        chunkIndex: CHUNK_INDEX,
        totalChunks: allChunks.length,
      },
      providerAttemptHooks: attemptHooks,
      onRequestRecord: (record) => requestRecords.push(structuredClone(record)),
      onValidatedPayload: (record) => { validatedWireDto = structuredClone(record.payload); },
    });
    if (!validatedWireDto) throw new Error('VALIDATED_WIRE_DTO_MISSING');
    const written = await checkpointStore.writeCompleted(compatibility, validatedWireDto, result);
    checkpointWritten = true;
    checkpointResultHash = written.resultHash;
    const reloaded = await checkpointStore.read(compatibility);
    if (reloaded?.status !== 'completed') throw new Error('COMPLETED_CHECKPOINT_RELOAD_FAILED');
    if (reloaded.resultHash !== written.resultHash) throw new Error('COMPLETED_CHECKPOINT_RESULT_HASH_MISMATCH');
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

const priorProtectionAfter = await validatePriorCanaries(pilotRoot, sourcePrefix);
const coreHashesAfter = await hashFiles(coreSourceFiles);
if (fingerprintJson(coreHashesBefore) !== fingerprintJson(coreHashesAfter)) {
  throw new Error('R3_2_R4_FROZEN_EXTRACTION_SOURCE_CHANGED_DURING_CANARY');
}

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
const ledgerSnapshot = ledger.snapshot();
const mainAttempts = ledgerSnapshot.attempts.filter((attempt) => attempt.chunkIndex === CHUNK_INDEX && attempt.repairAttempt === 0);
const successfulChunkDuplicateRequestCount = Math.max(0, mainAttempts.length - 1);
const priorArtifactsUnchanged = fingerprintJson(priorProtectionBefore) === fingerprintJson(priorProtectionAfter);

const safeReport = {
  schemaVersion: '1.0',
  scope: 'REAL-AI-001C-R3.2-R4-Chunk-10-Canary',
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
    providerMatched: compatibility.provider === 'deepseek',
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
    canonicalizationRuleIds: canonicalizationRules.map((rule) => rule.ruleId),
    canonicalizationRejectedCount: canonicalizationEvents.reduce((sum, event) => sum + event.canonicalizationRejectedCount, 0),
    repairExecuted,
    repairRequestCount: repairRequests.length,
    schemaIssueCountAfterRepair: issuesAfterRepair,
    semanticDriftDetected: repairDiagnostics.some((entry) => entry.semanticDriftDetected),
    providerRequestCount: requestRecords.length,
    providerErrorCount: requestRecords.filter((record) => (
      record.errorStage === 'provider' || record.errorStage === 'http' || record.errorStage === 'transport'
    )).length,
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
  canonicalization: { rules: canonicalizationRules },
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
    resultHash: checkpointResultHash,
    resumeProviderRequestCount: status === 'checkpoint-hit' ? getRealDeepSeekRequestCount() : null,
  },
  priorCheckpointProtection: {
    before: priorProtectionBefore,
    after: priorProtectionAfter,
    unchanged: priorArtifactsUnchanged,
    verificationProviderRequestCount: 0,
    r4Chunk3AttemptCount: ledgerSnapshot.attempts.filter((attempt) => attempt.chunkIndex === 3).length,
    r4Chunk7AttemptCount: ledgerSnapshot.attempts.filter((attempt) => attempt.chunkIndex === 7).length,
    r4Chunk27AttemptCount: ledgerSnapshot.attempts.filter((attempt) => attempt.chunkIndex === 27).length,
  },
  frozenImplementation: {
    hashesBefore: coreHashesBefore,
    hashesAfter: coreHashesAfter,
    unchanged: fingerprintJson(coreHashesBefore) === fingerprintJson(coreHashesAfter),
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

function compatibilityFor(chunk: ExtractionInput, chunkIndex: number): ChunkCheckpointCompatibility {
  return {
    jobId,
    sourceFingerprint: parsed.sha256,
    chunkId: chunk.chunkId,
    chunkIndex,
    chunkFingerprint: createChunkFingerprint(chunk, parsed.sha256, chunkIndex),
    schemaVersion: '1.0',
    provider: 'deepseek',
    model: providerConfig.model,
    thinkingMode: 'disabled',
    promptConfigFingerprint,
    extractionConfigFingerprint,
  };
}

async function validatePriorCanaries(root: string, sourcePrefixValue: string) {
  const checked: Record<string, unknown> = {};
  for (const [name, definition] of Object.entries(PRIOR_CANARIES)) {
    const canaryRoot = path.join(root, definition.outputName, sourcePrefixValue);
    const checkpointRoot = path.join(canaryRoot, 'checkpoints');
    const checkpointFile = path.join(checkpointRoot, `chunk-${String(definition.chunkIndex).padStart(4, '0')}.json`);
    const ledgerFile = path.join(canaryRoot, 'real-provider-attempt-ledger.json');
    const checkpointHash = await sha256File(checkpointFile);
    const ledgerHash = await sha256File(ledgerFile);
    if (checkpointHash !== definition.checkpointHash) throw new Error(`${name.toUpperCase()}_CHECKPOINT_CHANGED`);
    if (ledgerHash !== definition.ledgerHash) throw new Error(`${name.toUpperCase()}_LEDGER_CHANGED`);
    const checkpoint = await new PersistentChunkCheckpointStore(checkpointRoot)
      .read(compatibilityFor(requireChunk(allChunks, definition.chunkIndex), definition.chunkIndex));
    if (checkpoint?.status !== 'completed') throw new Error(`${name.toUpperCase()}_COMPLETED_CHECKPOINT_UNAVAILABLE`);
    const ledgerContent = JSON.parse(await readFile(ledgerFile, 'utf8')) as {
      attempts?: Array<{ chunkIndex?: number; repairAttempt?: number; status?: string }>;
    };
    const attempts = ledgerContent.attempts ?? [];
    if (attempts.some((attempt) => attempt.status === 'AMBIGUOUS_ATTEMPT')) {
      throw new Error(`${name.toUpperCase()}_LEDGER_AMBIGUOUS`);
    }
    checked[name] = {
      checkpointHash,
      ledgerHash,
      checkpointStatus: checkpoint.status,
      checkpointResultHash: checkpoint.resultHash,
      checkpointProductCount: checkpoint.result.products.length,
      historicalLedgerAttemptCount: attempts.length,
      currentVerificationProviderRequestCount: 0,
    };
  }
  return checked;
}

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

function validateFinalEvidence(inputValue: ExtractionInput, extractionResult: ProductExtractionResult) {
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

async function hashFiles(files: string[]) {
  const result: Record<string, string> = {};
  for (const file of files) result[path.relative(repositoryRoot, file).replaceAll('\\', '/')] = await sha256File(file);
  return result;
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

function requireChunk(chunks: ExtractionInput[], chunkIndex: number): ExtractionInput {
  const chunk = chunks[chunkIndex - 1];
  if (!chunk) throw new Error(`CHUNK_${chunkIndex}_NOT_FOUND`);
  return chunk;
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
