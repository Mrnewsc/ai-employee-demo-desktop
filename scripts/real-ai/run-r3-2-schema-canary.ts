/// <reference types="node" />

import { access, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DeepSeekProductExtractionProvider,
  EXTRACTION_PROVIDER_DEFAULTS,
  JSON_REPAIR_SYSTEM_PROMPT,
  PersistentChunkCheckpointStore,
  PRODUCT_EXTRACTION_SYSTEM_PROMPT,
  PROVIDER_WIRE_SCHEMA_SUMMARY,
  SCHEMA_REPAIR_SYSTEM_PROMPT,
  RealProviderAttemptLedger,
  createExtractionChunks,
  deepSeekConfigFromEnvironment,
  fingerprintJson,
  getRealDeepSeekRequestCount,
  runR32Canary,
  type AIProviderConfig,
  type ExtractionAuditEvent,
  type ExtractionRequestRecord,
} from '../../src/real-ai/extraction';
import { parseDocument } from '../../src/real-ai/parsers';

const args = parseArguments(process.argv.slice(2));
const repositoryRoot = path.resolve('.');
const pdfArgument = args.get('pdf');
if (!pdfArgument) throw new Error('MISSING_EXTERNAL_PDF');
const pdfPath = path.resolve(pdfArgument);
await access(pdfPath);
if (isInside(pdfPath, repositoryRoot)) throw new Error('CUSTOMER_PDF_MUST_REMAIN_OUTSIDE_REPOSITORY');

const executeReal = booleanArgument(args, 'execute-real', false);
const confirmCost = booleanArgument(args, 'confirm-ai-cost', false);
const explicitlyDry = booleanArgument(args, 'dry-run', true);
if (executeReal && explicitlyDry && args.has('dry-run')) throw new Error('CONFLICTING_EXECUTION_FLAGS');
if (executeReal && !confirmCost) throw new Error('AI_COST_NOT_CONFIRMED');
const dryRun = !executeReal;
const resume = booleanArgument(args, 'resume', false);
const selectedChunks = integerListArgument(args, 'chunks', [3, 7, 27]);
const maxRealRequests = integerArgument(args, 'max-real-requests', 6);
const concurrency = integerArgument(args, 'concurrency', 1);
if (maxRealRequests !== 6) throw new Error('R3_2_MAX_REAL_REQUESTS_MUST_BE_6');
if (concurrency !== 1) throw new Error('R3_2_CONCURRENCY_MUST_BE_1');

if (dryRun) {
  process.env.REAL_AI_BLOCK_REAL_DEEPSEEK = '1';
  process.env.REAL_AI_MAX_DEEPSEEK_REQUESTS = '0';
} else {
  delete process.env.REAL_AI_BLOCK_REAL_DEEPSEEK;
  process.env.REAL_AI_MAX_DEEPSEEK_REQUESTS = String(maxRealRequests);
}

const parsed = await parseDocument(pdfPath, {
  maxFileSizeBytes: 100 * 1024 * 1024,
  timeoutMs: 15 * 60_000,
  enableOcr: true,
});
const jobId = `real_ai_001c_r3_2_${parsed.sha256.slice(0, 16)}`;
const allChunks = createExtractionChunks(parsed, jobId, { sampleId: 'real-ai-001c-r3-2-canary' }, {
  maxChunksPerDocument: 40,
  maxConcurrentRequests: 1,
});

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
const pilotRoot = path.resolve(args.get('pilot-output') || path.join(
  os.homedir(), 'Documents', 'sy', 'real-ai-pilot-output',
));
if (isInside(pilotRoot, repositoryRoot)) throw new Error('CANARY_OUTPUT_MUST_REMAIN_OUTSIDE_REPOSITORY');
const canaryRoot = path.join(pilotRoot, 'r3-2-canary', parsed.sha256.slice(0, 16));
const checkpointRoot = path.join(canaryRoot, 'checkpoints');
const ledgerPath = path.join(canaryRoot, 'real-provider-attempt-ledger.json');
const reportPath = path.resolve(args.get('output') || path.join(
  canaryRoot,
  dryRun ? 'preflight-dry-run.json' : 'canary-result.json',
));
if (isInside(reportPath, repositoryRoot)) throw new Error('CANARY_REPORT_MUST_REMAIN_OUTSIDE_REPOSITORY');

const auditEvents: ExtractionAuditEvent[] = [];
const requestRecords: ExtractionRequestRecord[] = [];
const provider = new DeepSeekProductExtractionProvider(
  providerConfig,
  (event) => auditEvents.push(event),
  fetch,
  (record) => requestRecords.push(record),
);
const ledger = new RealProviderAttemptLedger(ledgerPath, jobId, maxRealRequests);
const result = await runR32Canary({
  jobId,
  sourceFile: parsed.fileName,
  sourceFingerprint: parsed.sha256,
  allChunks,
  selectedChunkIndexes: selectedChunks,
  provider,
  thinkingMode: 'disabled',
  promptConfigFingerprint,
  extractionConfigFingerprint,
  checkpointStore: new PersistentChunkCheckpointStore(checkpointRoot),
  ledger,
  maxRealRequests,
  concurrency: 1,
  dryRun,
  resume,
});

const safeReport = {
  schemaVersion: '1.0',
  scope: 'REAL-AI-001C-R3.2-Schema-Canary',
  executedAt: new Date().toISOString(),
  input: {
    sourceFile: path.basename(result.sourceFile),
    sourceFingerprint: result.sourceFingerprint,
    sourceOutsideRepository: true,
  },
  configuration: {
    selectedChunks: result.selectedChunks,
    maxRealRequests: result.maxRealRequests,
    concurrency: result.concurrency,
    thinkingMode: result.thinkingMode,
    responseFormat: 'json_object',
    stream: false,
    dryRun: result.dryRun,
    resume: result.resume,
    promptConfigFingerprint,
    extractionConfigFingerprint,
  },
  checkpoint: {
    localOnly: true,
    sensitive: true,
    historicalCheckpointRecoverable: false,
    checkpointDirectoryRecorded: false,
  },
  result: {
    status: result.status,
    totalChunks: result.totalChunks,
    chunkIndexes: result.chunkIndexes,
    inputChars: result.inputChars,
    estimatedRequestCount: result.estimatedRequestCount,
    providerRequestCount: result.providerRequestCount,
    usedBudgetBefore: result.usedBudgetBefore,
    usedBudgetAfter: result.usedBudgetAfter,
    remainingBudget: result.remainingBudget,
    chunks: result.chunks.map((chunk) => ({
      chunkIndex: chunk.chunkIndex,
      chunkId: chunk.chunkId,
      inputChars: chunk.inputChars,
      status: chunk.status,
      checkpointHit: chunk.checkpointHit,
      providerRequestCount: chunk.providerRequestCount,
      repairRequestCount: chunk.repairRequestCount,
      schemaIssueCount: chunk.schemaIssueCount,
      errorCode: chunk.errorCode,
      productCount: chunk.result?.products.length ?? null,
      hallucinatedFieldCount: chunk.result
        ? chunk.result.warnings.filter((warning) => warning.code === 'MISSING_FIELD_EVIDENCE').length
        : null,
      needsHumanReviewCount: chunk.result?.products.filter((product) => product.needsHumanReview).length ?? null,
    })),
  },
  schemaDiagnostics: requestRecords.flatMap((record) => record.schemaIssues.map((issue) => ({
    chunkIndex: selectedChunks.find((index) => record.chunkId.endsWith(`:chunk:${index}`)) ?? null,
    ...issue,
  }))),
  repairDiagnostics: auditEvents
    .filter((event) => event.repairDiagnostics !== null)
    .map((event) => ({ chunkId: event.chunkId, ...event.repairDiagnostics })),
  canonicalization: auditEvents
    .filter((event) => event.canonicalizationRules.length > 0 || event.canonicalizationRejectedCount > 0)
    .map((event) => ({
      chunkId: event.chunkId,
      rules: event.canonicalizationRules,
      rejectedCount: event.canonicalizationRejectedCount,
    })),
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
  privacy: {
    apiKeyRecorded: false,
    authorizationRecorded: false,
    promptRecorded: false,
    messagesRecorded: false,
    providerResponseRecorded: false,
    customerTextRecorded: false,
    fullLocalPathRecorded: false,
  },
  counters: {
    realProviderRequestCount: getRealDeepSeekRequestCount(),
    REAL_DEEPSEEK_REQUEST_COUNT: getRealDeepSeekRequestCount(),
  },
};

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(safeReport, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  reportFile: path.basename(reportPath),
  sourceFile: safeReport.input.sourceFile,
  sourceFingerprint: safeReport.input.sourceFingerprint,
  totalChunks: safeReport.result.totalChunks,
  selectedChunks: safeReport.configuration.selectedChunks,
  inputChars: safeReport.result.inputChars,
  estimatedRequestCount: safeReport.result.estimatedRequestCount,
  maxRealRequests: safeReport.configuration.maxRealRequests,
  thinkingMode: safeReport.configuration.thinkingMode,
  concurrency: safeReport.configuration.concurrency,
  dryRun: safeReport.configuration.dryRun,
  status: safeReport.result.status,
  realProviderRequestCount: safeReport.counters.realProviderRequestCount,
}));

if (result.status === 'blocked' || result.status === 'partial-failed') process.exitCode = 2;

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

function integerListArgument(values: Map<string, string>, name: string, fallback: number[]): number[] {
  const raw = values.get(name);
  if (!raw) return fallback;
  const result = raw.split(',').map((item) => Number(item.trim()));
  if (!result.length || result.some((item) => !Number.isSafeInteger(item) || item < 1)) {
    throw new Error(`INVALID_INTEGER_LIST_ARGUMENT:${name}`);
  }
  return result;
}

function isInside(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
