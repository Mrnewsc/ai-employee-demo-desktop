/// <reference types="node" />

import path from 'node:path';
import type {
  ExtractionInput,
  ExtractionRequestRecord,
  ProductExtractionProvider,
  ProductExtractionResult,
  ProviderExtractionPayload,
} from './contracts';
import { asExtractionError } from './errors';
import {
  createChunkFingerprint,
  type ChunkCheckpointCompatibility,
  PersistentChunkCheckpointStore,
} from './persistent-chunk-checkpoint';
import { RealProviderAttemptLedger } from './real-provider-attempt-ledger';

export const R3_2_ALLOWED_CHUNK_INDEXES = Object.freeze([3, 7, 27] as const);

export interface R32CanaryDefinition {
  jobId: string;
  sourceFile: string;
  sourceFingerprint: string;
  allChunks: ExtractionInput[];
  selectedChunkIndexes: number[];
  provider: ProductExtractionProvider;
  thinkingMode: 'disabled';
  promptConfigFingerprint: string;
  extractionConfigFingerprint: string;
  checkpointStore: PersistentChunkCheckpointStore;
  ledger: RealProviderAttemptLedger;
  maxRealRequests: number;
  concurrency: 1;
  dryRun: boolean;
  resume: boolean;
}

export type R32CanaryChunkStatus = 'not-started' | 'checkpoint-hit' | 'completed' | 'failed' | 'blocked';

export interface R32CanaryChunkResult {
  chunkIndex: number;
  chunkId: string;
  inputChars: number;
  status: R32CanaryChunkStatus;
  checkpointHit: boolean;
  providerRequestCount: number;
  repairRequestCount: number;
  schemaIssueCount: number;
  errorCode: string | null;
  result: ProductExtractionResult | null;
}

export interface R32CanaryResult {
  sourceFile: string;
  sourceFingerprint: string;
  historicalCheckpointRecoverable: false;
  totalChunks: number;
  selectedChunks: number[];
  chunkIndexes: number[];
  inputChars: number;
  estimatedRequestCount: number;
  maxRealRequests: number;
  usedBudgetBefore: number;
  usedBudgetAfter: number;
  remainingBudget: number;
  thinkingMode: 'disabled';
  concurrency: 1;
  dryRun: boolean;
  resume: boolean;
  status: 'dry-run' | 'completed' | 'partial-failed' | 'blocked';
  providerRequestCount: number;
  chunks: R32CanaryChunkResult[];
}

export async function runR32Canary(definition: R32CanaryDefinition): Promise<R32CanaryResult> {
  assertDefinition(definition);
  await definition.ledger.initialize();
  definition.ledger.assertChunksSafeToRun(definition.selectedChunkIndexes);
  const usedBudgetBefore = definition.ledger.usedBudget();
  const selected = definition.selectedChunkIndexes.map((chunkIndex) => ({
    chunkIndex,
    input: requireChunk(definition.allChunks, chunkIndex),
  }));
  const states: Array<{
    compatibility: ChunkCheckpointCompatibility;
    result: R32CanaryChunkResult;
    shouldRun: boolean;
  }> = [];

  for (const { chunkIndex, input } of selected) {
    const compatibility = compatibilityFor(definition, input, chunkIndex);
    const checkpoint = await definition.checkpointStore.read(compatibility);
    if (checkpoint?.status === 'completed') {
      states.push({
        compatibility,
        shouldRun: false,
        result: baseChunkResult(input, chunkIndex, {
          status: 'checkpoint-hit', checkpointHit: true, result: checkpoint.result,
        }),
      });
      continue;
    }
    if (checkpoint?.status === 'failed' && !definition.resume) {
      states.push({
        compatibility,
        shouldRun: false,
        result: baseChunkResult(input, chunkIndex, {
          status: 'blocked', errorCode: 'EXPLICIT_RESUME_REQUIRED',
        }),
      });
      continue;
    }
    assertNoOrphanAttempt(definition.ledger, chunkIndex, checkpoint?.status ?? null);
    states.push({
      compatibility,
      shouldRun: true,
      result: baseChunkResult(input, chunkIndex),
    });
  }

  const runnableCount = states.filter((state) => state.shouldRun).length;
  const estimatedRequestCount = runnableCount * 2;
  if (!definition.dryRun && estimatedRequestCount > definition.ledger.remainingBudget()) {
    return buildResult(definition, states.map((state) => ({
      ...state.result,
      status: state.shouldRun ? 'blocked' : state.result.status,
      errorCode: state.shouldRun ? 'INSUFFICIENT_REQUEST_BUDGET' : state.result.errorCode,
    })), usedBudgetBefore, estimatedRequestCount, 'blocked');
  }
  if (definition.dryRun) {
    return buildResult(definition, states.map((state) => state.result), usedBudgetBefore, estimatedRequestCount, 'dry-run');
  }

  for (const state of states) {
    if (!state.shouldRun) continue;
    const input = requireChunk(definition.allChunks, state.result.chunkIndex);
    let validatedWireDto: ProviderExtractionPayload | null = null;
    const records: ExtractionRequestRecord[] = [];
    try {
      const result = await definition.provider.extract(input, {
        requestContext: {
          attemptId: `${definition.jobId}:chunk:${state.result.chunkIndex}`,
          requestAttempt: 1,
          chunkIndex: state.result.chunkIndex,
          totalChunks: definition.allChunks.length,
        },
        providerAttemptHooks: definition.ledger,
        onRequestRecord: (record) => records.push(structuredClone(record)),
        onValidatedPayload: (record) => { validatedWireDto = structuredClone(record.payload); },
      });
      if (!validatedWireDto) throw safeCanaryError('VALIDATED_WIRE_DTO_MISSING');
      await definition.checkpointStore.writeCompleted(state.compatibility, validatedWireDto, result);
      state.result = baseChunkResult(input, state.result.chunkIndex, {
        status: 'completed',
        result,
        providerRequestCount: records.length || result.metrics.requestCount,
        repairRequestCount: records.filter((record) => record.repairAttempt > 0).length,
        schemaIssueCount: records.reduce((sum, record) => sum + record.schemaIssues.length, 0),
      });
    } catch (error) {
      const normalized = asExtractionError(error);
      await definition.checkpointStore.writeFailed(state.compatibility, normalized.code);
      state.result = baseChunkResult(input, state.result.chunkIndex, {
        status: 'failed',
        providerRequestCount: records.length,
        repairRequestCount: records.filter((record) => record.repairAttempt > 0).length,
        schemaIssueCount: records.reduce((sum, record) => sum + record.schemaIssues.length, 0),
        errorCode: normalized.code,
      });
    }
  }

  const results = states.map((state) => state.result);
  const status = results.every((item) => item.status === 'completed' || item.status === 'checkpoint-hit')
    ? 'completed'
    : results.some((item) => item.status === 'completed' || item.status === 'checkpoint-hit') ? 'partial-failed' : 'blocked';
  return buildResult(definition, results, usedBudgetBefore, estimatedRequestCount, status);
}

function compatibilityFor(
  definition: R32CanaryDefinition,
  input: ExtractionInput,
  chunkIndex: number,
): ChunkCheckpointCompatibility {
  return {
    jobId: definition.jobId,
    sourceFingerprint: definition.sourceFingerprint,
    chunkId: input.chunkId,
    chunkIndex,
    chunkFingerprint: createChunkFingerprint(input, definition.sourceFingerprint, chunkIndex),
    schemaVersion: '1.0',
    provider: definition.provider.provider,
    model: definition.provider.model,
    thinkingMode: definition.thinkingMode,
    promptConfigFingerprint: definition.promptConfigFingerprint,
    extractionConfigFingerprint: definition.extractionConfigFingerprint,
  };
}

function baseChunkResult(
  input: ExtractionInput,
  chunkIndex: number,
  overrides: Partial<R32CanaryChunkResult> = {},
): R32CanaryChunkResult {
  return {
    chunkIndex,
    chunkId: input.chunkId,
    inputChars: input.evidenceItems.reduce((sum, item) => sum + item.text.length, 0),
    status: 'not-started',
    checkpointHit: false,
    providerRequestCount: 0,
    repairRequestCount: 0,
    schemaIssueCount: 0,
    errorCode: null,
    result: null,
    ...overrides,
  };
}

function buildResult(
  definition: R32CanaryDefinition,
  chunks: R32CanaryChunkResult[],
  usedBudgetBefore: number,
  estimatedRequestCount: number,
  status: R32CanaryResult['status'],
): R32CanaryResult {
  return {
    sourceFile: path.basename(definition.sourceFile),
    sourceFingerprint: definition.sourceFingerprint,
    historicalCheckpointRecoverable: false,
    totalChunks: definition.allChunks.length,
    selectedChunks: [...definition.selectedChunkIndexes],
    chunkIndexes: [...definition.selectedChunkIndexes],
    inputChars: chunks.reduce((sum, item) => sum + item.inputChars, 0),
    estimatedRequestCount,
    maxRealRequests: definition.maxRealRequests,
    usedBudgetBefore,
    usedBudgetAfter: definition.ledger.usedBudget(),
    remainingBudget: definition.ledger.remainingBudget(),
    thinkingMode: definition.thinkingMode,
    concurrency: definition.concurrency,
    dryRun: definition.dryRun,
    resume: definition.resume,
    status,
    providerRequestCount: chunks.reduce((sum, item) => sum + item.providerRequestCount, 0),
    chunks,
  };
}

function assertDefinition(definition: R32CanaryDefinition): void {
  if (definition.concurrency !== 1) throw safeCanaryError('CANARY_CONCURRENCY_MUST_BE_ONE');
  if (definition.thinkingMode !== 'disabled') throw safeCanaryError('CANARY_THINKING_MUST_BE_DISABLED');
  if (definition.maxRealRequests !== 6) throw safeCanaryError('CANARY_REQUEST_BUDGET_MUST_BE_SIX');
  const unique = [...new Set(definition.selectedChunkIndexes)];
  if (!unique.length || unique.length !== definition.selectedChunkIndexes.length) throw safeCanaryError('CANARY_CHUNKS_INVALID');
  if (unique.some((index) => !(R3_2_ALLOWED_CHUNK_INDEXES as readonly number[]).includes(index))) {
    throw safeCanaryError('CANARY_CHUNK_NOT_ALLOWED');
  }
}

function assertNoOrphanAttempt(ledger: RealProviderAttemptLedger, chunkIndex: number, checkpointStatus: string | null): void {
  if (checkpointStatus !== null) return;
  const attempts = ledger.snapshot().attempts.filter((attempt) => attempt.chunkIndex === chunkIndex);
  if (attempts.length > 0) throw safeCanaryError('AMBIGUOUS_ATTEMPT');
}

function requireChunk(chunks: ExtractionInput[], chunkIndex: number): ExtractionInput {
  const chunk = chunks[chunkIndex - 1];
  if (!chunk) throw safeCanaryError('CANARY_CHUNK_NOT_FOUND');
  return chunk;
}

function safeCanaryError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}
