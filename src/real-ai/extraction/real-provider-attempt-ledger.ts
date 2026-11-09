/// <reference types="node" />

import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { ProviderAttemptFinish, ProviderAttemptHooks, ProviderAttemptStart } from './contracts';

const attemptSchema = z.object({
  attemptId: z.string().min(1),
  jobId: z.string().min(1),
  chunkIndex: z.number().int().positive(),
  requestAttempt: z.number().int().positive(),
  repairAttempt: z.number().int().nonnegative(),
  provider: z.string().min(1),
  model: z.string().min(1),
  status: z.enum(['started', 'completed', 'failed', 'AMBIGUOUS_ATTEMPT']),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  durationMs: z.number().nonnegative().nullable(),
  providerRequestId: z.string().nullable(),
  errorCode: z.string().nullable(),
}).strict();

const ledgerSchema = z.object({
  schemaVersion: z.literal('1.0'),
  sensitivity: z.literal('local-only/no-prompt-no-response'),
  jobId: z.string().min(1),
  maxRealRequests: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  attempts: z.array(attemptSchema),
}).strict();

export type RealProviderAttempt = z.infer<typeof attemptSchema>;
export type RealProviderAttemptLedgerSnapshot = z.infer<typeof ledgerSchema>;

export class RealProviderLedgerError extends Error {
  constructor(
    readonly code: 'LEDGER_CORRUPT' | 'LEDGER_INCOMPATIBLE' | 'REAL_REQUEST_BUDGET_EXHAUSTED' | 'AMBIGUOUS_ATTEMPT',
    message: string,
  ) {
    super(message);
    this.name = 'RealProviderLedgerError';
  }
}

export class RealProviderAttemptLedger implements ProviderAttemptHooks {
  private snapshotValue: RealProviderAttemptLedgerSnapshot | null = null;
  private writeTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly ledgerPath: string,
    private readonly expectedJobId: string,
    private readonly expectedMaxRealRequests: number,
  ) {}

  async initialize(): Promise<RealProviderAttemptLedgerSnapshot> {
    if (!Number.isSafeInteger(this.expectedMaxRealRequests) || this.expectedMaxRealRequests < 1) {
      throw new RealProviderLedgerError('LEDGER_INCOMPATIBLE', '真实请求预算必须是正整数');
    }
    let snapshot: RealProviderAttemptLedgerSnapshot;
    try {
      const raw = await readFile(this.ledgerPath, 'utf8');
      const parsed = ledgerSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) throw new RealProviderLedgerError('LEDGER_CORRUPT', '真实Provider请求账本未通过Runtime Schema');
      snapshot = parsed.data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        if (error instanceof SyntaxError) throw new RealProviderLedgerError('LEDGER_CORRUPT', '真实Provider请求账本不是合法JSON');
        throw error;
      }
      const now = new Date().toISOString();
      snapshot = {
        schemaVersion: '1.0',
        sensitivity: 'local-only/no-prompt-no-response',
        jobId: this.expectedJobId,
        maxRealRequests: this.expectedMaxRealRequests,
        createdAt: now,
        updatedAt: now,
        attempts: [],
      };
      this.snapshotValue = snapshot;
      await this.persist();
      return this.snapshot();
    }
    if (snapshot.jobId !== this.expectedJobId || snapshot.maxRealRequests !== this.expectedMaxRealRequests) {
      throw new RealProviderLedgerError('LEDGER_INCOMPATIBLE', '请求账本的Job或预算与当前Canary不兼容');
    }
    let changed = false;
    snapshot.attempts = snapshot.attempts.map((attempt) => {
      if (attempt.status !== 'started') return attempt;
      changed = true;
      return { ...attempt, status: 'AMBIGUOUS_ATTEMPT' as const, errorCode: 'AMBIGUOUS_ATTEMPT' };
    });
    this.snapshotValue = snapshot;
    if (changed) await this.persist();
    return this.snapshot();
  }

  async onStarted(attempt: ProviderAttemptStart): Promise<void> {
    await this.withWriteLock(async () => {
      const snapshot = this.requireInitialized();
      if (attempt.jobId !== this.expectedJobId) {
        throw new RealProviderLedgerError('LEDGER_INCOMPATIBLE', '请求attempt所属Job与当前账本不一致');
      }
      if (snapshot.attempts.some((entry) => entry.status === 'AMBIGUOUS_ATTEMPT' && entry.chunkIndex === attempt.chunkIndex)) {
        throw new RealProviderLedgerError('AMBIGUOUS_ATTEMPT', `Chunk ${attempt.chunkIndex}存在无法确认是否计费的请求，禁止自动重试`);
      }
      if (snapshot.attempts.length >= snapshot.maxRealRequests) {
        throw new RealProviderLedgerError('REAL_REQUEST_BUDGET_EXHAUSTED', `真实请求预算${snapshot.maxRealRequests}已用尽`);
      }
      if (snapshot.attempts.some((entry) => entry.attemptId === attempt.attemptId)) {
        throw new RealProviderLedgerError('LEDGER_INCOMPATIBLE', `重复attemptId：${attempt.attemptId}`);
      }
      snapshot.attempts.push({
        attemptId: attempt.attemptId,
        jobId: attempt.jobId,
        chunkIndex: attempt.chunkIndex,
        requestAttempt: attempt.requestAttempt,
        repairAttempt: attempt.repairAttempt,
        provider: attempt.provider,
        model: attempt.model,
        status: 'started',
        startedAt: attempt.startedAt,
        completedAt: null,
        durationMs: null,
        providerRequestId: null,
        errorCode: null,
      });
      await this.persistUnlocked();
    });
  }

  async onFinished(attempt: ProviderAttemptFinish): Promise<void> {
    await this.withWriteLock(async () => {
      const snapshot = this.requireInitialized();
      const index = snapshot.attempts.findIndex((entry) => entry.attemptId === attempt.attemptId);
      if (index < 0) throw new RealProviderLedgerError('LEDGER_CORRUPT', `找不到待完成的请求账本项：${attempt.attemptId}`);
      const current = snapshot.attempts[index];
      if (current.status !== 'started') {
        throw new RealProviderLedgerError('LEDGER_CORRUPT', `请求账本项不是started状态：${attempt.attemptId}`);
      }
      snapshot.attempts[index] = {
        ...current,
        status: attempt.status,
        completedAt: attempt.completedAt,
        durationMs: attempt.durationMs,
        providerRequestId: attempt.providerRequestId,
        errorCode: attempt.errorCode,
      };
      await this.persistUnlocked();
    });
  }

  assertChunksSafeToRun(chunkIndexes: number[]): void {
    const ambiguous = this.requireInitialized().attempts
      .filter((attempt) => attempt.status === 'AMBIGUOUS_ATTEMPT' && chunkIndexes.includes(attempt.chunkIndex))
      .map((attempt) => attempt.chunkIndex);
    if (ambiguous.length) {
      throw new RealProviderLedgerError('AMBIGUOUS_ATTEMPT', `以下Chunk存在模糊请求，禁止自动执行：${[...new Set(ambiguous)].join(',')}`);
    }
  }

  snapshot(): RealProviderAttemptLedgerSnapshot {
    return structuredClone(this.requireInitialized());
  }

  usedBudget(): number {
    return this.requireInitialized().attempts.length;
  }

  remainingBudget(): number {
    const snapshot = this.requireInitialized();
    return Math.max(0, snapshot.maxRealRequests - snapshot.attempts.length);
  }

  private requireInitialized(): RealProviderAttemptLedgerSnapshot {
    if (!this.snapshotValue) throw new RealProviderLedgerError('LEDGER_INCOMPATIBLE', '请求账本尚未初始化');
    return this.snapshotValue;
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.writeTail;
    let release!: () => void;
    this.writeTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async persist(): Promise<void> {
    await this.withWriteLock(() => this.persistUnlocked());
  }

  private async persistUnlocked(): Promise<void> {
    const snapshot = this.requireInitialized();
    snapshot.updatedAt = new Date().toISOString();
    const validated = ledgerSchema.parse(snapshot);
    await writeJsonAtomic(this.ledgerPath, validated);
  }
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
