/// <reference types="node" />

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { ExtractionInput, ProductExtractionResult, ProviderExtractionPayload } from './contracts';
import { ProductExtractionResultSchema, ProviderExtractionPayloadSchema } from './schemas';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const compatibilitySchema = z.object({
  jobId: z.string().min(1),
  sourceFingerprint: hash,
  chunkId: z.string().min(1),
  chunkIndex: z.number().int().positive(),
  chunkFingerprint: hash,
  schemaVersion: z.literal('1.0'),
  provider: z.string().min(1),
  model: z.string().min(1),
  thinkingMode: z.literal('disabled'),
  promptConfigFingerprint: hash,
  extractionConfigFingerprint: hash,
}).strict();

const baseRecordSchema = compatibilitySchema.extend({
  sensitivity: z.literal('sensitive/local-only'),
}).strict();

const completedRecordSchema = baseRecordSchema.extend({
  status: z.literal('completed'),
  completedAt: z.string().datetime(),
  validatedWireDto: ProviderExtractionPayloadSchema,
  result: ProductExtractionResultSchema,
  resultHash: hash,
}).strict();

const failedRecordSchema = baseRecordSchema.extend({
  status: z.literal('failed'),
  failedAt: z.string().datetime(),
  errorCode: z.string().min(1),
}).strict();

const checkpointRecordSchema = z.discriminatedUnion('status', [completedRecordSchema, failedRecordSchema]);

export interface ChunkCheckpointCompatibility {
  jobId: string;
  sourceFingerprint: string;
  chunkId: string;
  chunkIndex: number;
  chunkFingerprint: string;
  schemaVersion: '1.0';
  provider: string;
  model: string;
  thinkingMode: 'disabled';
  promptConfigFingerprint: string;
  extractionConfigFingerprint: string;
}

export type CompletedChunkCheckpoint = ChunkCheckpointCompatibility & {
  sensitivity: 'sensitive/local-only';
  status: 'completed';
  completedAt: string;
  validatedWireDto: ProviderExtractionPayload;
  result: ProductExtractionResult;
  resultHash: string;
};

export type FailedChunkCheckpoint = ChunkCheckpointCompatibility & {
  sensitivity: 'sensitive/local-only';
  status: 'failed';
  failedAt: string;
  errorCode: string;
};

export type ChunkCheckpointRecord = CompletedChunkCheckpoint | FailedChunkCheckpoint;

export class ChunkCheckpointError extends Error {
  constructor(readonly code: 'CHECKPOINT_CORRUPT' | 'CHECKPOINT_INCOMPATIBLE' | 'CHECKPOINT_COMPLETED_IMMUTABLE', message: string) {
    super(message);
    this.name = 'ChunkCheckpointError';
  }
}

export class PersistentChunkCheckpointStore {
  constructor(private readonly rootDirectory: string) {}

  async read(expected: ChunkCheckpointCompatibility): Promise<ChunkCheckpointRecord | null> {
    const target = this.pathFor(expected.chunkIndex);
    let raw: string;
    try {
      raw = await readFile(target, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ChunkCheckpointError('CHECKPOINT_CORRUPT', `Chunk ${expected.chunkIndex} Checkpoint不是合法JSON`);
    }
    const validated = checkpointRecordSchema.safeParse(parsed);
    if (!validated.success) {
      throw new ChunkCheckpointError('CHECKPOINT_CORRUPT', `Chunk ${expected.chunkIndex} Checkpoint未通过Runtime Schema`);
    }
    const record = validated.data as ChunkCheckpointRecord;
    assertCompatible(record, expected);
    if (record.status === 'completed') {
      const actualHash = checkpointResultHash(record.validatedWireDto, record.result);
      if (actualHash !== record.resultHash) {
        throw new ChunkCheckpointError('CHECKPOINT_CORRUPT', `Chunk ${expected.chunkIndex} Checkpoint校验和不一致`);
      }
    }
    return structuredClone(record);
  }

  async writeCompleted(
    compatibility: ChunkCheckpointCompatibility,
    validatedWireDto: ProviderExtractionPayload,
    result: ProductExtractionResult,
  ): Promise<CompletedChunkCheckpoint> {
    const existing = await this.readIfPresentWithoutCompatibility(compatibility.chunkIndex);
    if (existing) assertCompatible(existing, compatibility);
    if (existing?.status === 'completed') {
      throw new ChunkCheckpointError('CHECKPOINT_COMPLETED_IMMUTABLE', `Chunk ${compatibility.chunkIndex}成功Checkpoint禁止覆盖`);
    }
    const record = completedRecordSchema.parse({
      ...compatibility,
      sensitivity: 'sensitive/local-only',
      status: 'completed',
      completedAt: new Date().toISOString(),
      validatedWireDto,
      result,
      resultHash: checkpointResultHash(validatedWireDto, result),
    }) as CompletedChunkCheckpoint;
    await writeJsonAtomic(this.pathFor(compatibility.chunkIndex), record);
    return structuredClone(record);
  }

  async writeFailed(compatibility: ChunkCheckpointCompatibility, errorCode: string): Promise<FailedChunkCheckpoint> {
    const existing = await this.readIfPresentWithoutCompatibility(compatibility.chunkIndex);
    if (existing) assertCompatible(existing, compatibility);
    if (existing?.status === 'completed') {
      throw new ChunkCheckpointError('CHECKPOINT_COMPLETED_IMMUTABLE', `Chunk ${compatibility.chunkIndex}成功Checkpoint禁止改为失败`);
    }
    const record = failedRecordSchema.parse({
      ...compatibility,
      sensitivity: 'sensitive/local-only',
      status: 'failed',
      failedAt: new Date().toISOString(),
      errorCode,
    }) as FailedChunkCheckpoint;
    await writeJsonAtomic(this.pathFor(compatibility.chunkIndex), record);
    return structuredClone(record);
  }

  private async readIfPresentWithoutCompatibility(chunkIndex: number): Promise<ChunkCheckpointRecord | null> {
    try {
      const parsed = JSON.parse(await readFile(this.pathFor(chunkIndex), 'utf8')) as unknown;
      const validated = checkpointRecordSchema.safeParse(parsed);
      if (!validated.success) throw new ChunkCheckpointError('CHECKPOINT_CORRUPT', `Chunk ${chunkIndex} Checkpoint未通过Runtime Schema`);
      return validated.data as ChunkCheckpointRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      if (error instanceof SyntaxError) throw new ChunkCheckpointError('CHECKPOINT_CORRUPT', `Chunk ${chunkIndex} Checkpoint不是合法JSON`);
      throw error;
    }
  }

  private pathFor(chunkIndex: number): string {
    return path.join(this.rootDirectory, `chunk-${String(chunkIndex).padStart(4, '0')}.json`);
  }
}

export function createChunkFingerprint(input: ExtractionInput, sourceFingerprint: string, chunkIndex: number): string {
  return fingerprintJson({
    sourceFingerprint,
    chunkIndex,
    chunkCanonicalContent: {
      schemaVersion: input.schemaVersion,
      chunkId: input.chunkId,
      fileType: input.fileType,
      evidenceItems: input.evidenceItems.map((item) => ({
        evidenceId: item.evidenceId,
        text: item.text,
        source: item.source,
        confidence: item.confidence,
        kind: item.kind,
        warningCodes: item.warningCodes,
      })),
    },
  });
}

export function fingerprintJson(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function checkpointResultHash(payload: ProviderExtractionPayload, result: ProductExtractionResult): string {
  return fingerprintJson({ validatedWireDto: payload, result });
}

function assertCompatible(actual: ChunkCheckpointCompatibility, expected: ChunkCheckpointCompatibility): void {
  const fields = [
    'jobId', 'sourceFingerprint', 'chunkId', 'chunkIndex', 'chunkFingerprint', 'schemaVersion', 'provider', 'model',
    'thinkingMode', 'promptConfigFingerprint', 'extractionConfigFingerprint',
  ] as const;
  const mismatches = fields.filter((field) => actual[field] !== expected[field]);
  if (mismatches.length) {
    throw new ChunkCheckpointError(
      'CHECKPOINT_INCOMPATIBLE',
      `Chunk ${expected.chunkIndex} Checkpoint兼容键不一致：${mismatches.join(',')}`,
    );
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function writeJsonAtomic(targetPath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporaryPath, 'wx');
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
