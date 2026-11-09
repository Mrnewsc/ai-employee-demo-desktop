import { SCHEMA_VERSION } from '../types';
import type { ParsedDocument } from '../types';
import { createExtractionChunks } from './chunker';
import { EXTRACTION_CHUNK_CONFIG, EXTRACTION_EXECUTION_CONFIG } from './config';
import type {
  AIExtractionErrorCode,
  ChunkAttemptAudit,
  ChunkExtractionAudit,
  ExtractDocumentsOptions,
  ExtractionChunkStatus,
  ExtractionJobOutcome,
  ExtractionJobStatus,
  ExtractionRequestRecord,
  LargeDocumentExtractionAudit,
  ProductExtractionMetrics,
  ProductExtractionProvider,
  ProductExtractionResult,
} from './contracts';
import { ProductExtractionError, asExtractionError } from './errors';
import { ExtractionMergeService } from './merge-service';
import { ProductExtractionResultSchema } from './schemas';

interface ChunkState {
  input: ReturnType<typeof createExtractionChunks>[number];
  audit: ChunkExtractionAudit;
  result: ProductExtractionResult | null;
  error: ProductExtractionError | null;
}

export class ProductExtractionJob {
  readonly jobId: string;
  private readonly started = performance.now();
  private readonly chunks: ChunkState[];
  private readonly executionConfig;
  private status: ExtractionJobStatus = 'queued';
  private runToken = 0;
  private activeRequests = 0;
  private peakConcurrency = 0;
  private providerRequestCount = 0;
  private finalResult: ProductExtractionResult | null = null;
  private jobError: ProductExtractionError | null = null;
  private externalCancelled = false;
  private readonly controller = new AbortController();

  constructor(
    private readonly provider: ProductExtractionProvider,
    private readonly documents: ParsedDocument[],
    private readonly mergeService: ExtractionMergeService,
    private readonly options: ExtractDocumentsOptions = {},
  ) {
    this.jobId = options.jobId ?? `extract_${Date.now().toString(36)}`;
    const chunkConfig = { ...EXTRACTION_CHUNK_CONFIG, ...options.chunkConfig };
    this.executionConfig = {
      ...EXTRACTION_EXECUTION_CONFIG,
      maxConcurrentExtractionRequests: chunkConfig.maxConcurrentRequests,
      ...options.executionConfig,
    };
    const inputs = documents.flatMap((document) => createExtractionChunks(
      document,
      this.jobId,
      options.optionalContext,
      chunkConfig,
    ));
    this.chunks = inputs.map((input, index) => ({
      input,
      result: null,
      error: null,
      audit: {
        schemaVersion: SCHEMA_VERSION,
        jobId: this.jobId,
        chunkId: input.chunkId,
        chunkIndex: index + 1,
        totalChunks: inputs.length,
        status: 'queued',
        requestAttemptCount: 0,
        providerRetryCount: 0,
        repairAttemptCount: 0,
        attempts: [],
      },
    }));
    if (options.signal?.aborted) this.cancel();
    else options.signal?.addEventListener('abort', this.cancel, { once: true });
  }

  async run(): Promise<ExtractionJobOutcome> {
    if (this.status === 'cancelled') return this.outcome();
    if (this.status !== 'queued') return this.outcome();
    return this.execute(this.chunks);
  }

  async retryFailedChunks(): Promise<ExtractionJobOutcome> {
    if (this.status === 'cancelled') return this.outcome();
    if (this.status !== 'partial-failed' && this.status !== 'failed') return this.outcome();
    const failed = this.chunks.filter((chunk) => chunk.audit.status === 'failed');
    for (const chunk of failed) {
      chunk.audit.status = 'queued';
      chunk.error = null;
      this.emitChunkAudit(chunk);
    }
    return this.execute(failed);
  }

  cancel = () => {
    if (this.isTerminal() && this.status !== 'running') return;
    this.externalCancelled = true;
    this.runToken += 1;
    this.controller.abort();
    this.status = 'cancelled';
    for (const chunk of this.chunks) {
      if (chunk.audit.status === 'queued' || chunk.audit.status === 'retrying' || chunk.audit.status === 'running') {
        chunk.audit.status = 'cancelled';
        this.emitChunkAudit(chunk);
      }
    }
  };

  snapshot(): ExtractionJobOutcome {
    return this.outcome();
  }

  private async execute(targets: ChunkState[]): Promise<ExtractionJobOutcome> {
    const token = ++this.runToken;
    this.status = 'running';
    let nextIndex = 0;
    const concurrency = Math.min(
      Math.max(1, this.executionConfig.maxConcurrentExtractionRequests),
      Math.max(1, targets.length),
    );
    const workers = Array.from({ length: concurrency }, async () => {
      while (this.isCurrent(token)) {
        const index = nextIndex++;
        if (index >= targets.length) return;
        const chunk = targets[index];
        if (chunk.audit.status !== 'queued') continue;
        await this.executeChunk(chunk, token);
      }
    });
    await Promise.all(workers);
    if (!this.isCurrent(token)) return this.outcome();
    this.finalizeStatus();
    return this.outcome();
  }

  private async executeChunk(chunk: ChunkState, token: number): Promise<void> {
    const maxAttemptsThisRun = 1 + Math.max(0, this.executionConfig.maxProviderRetries);
    let attemptsThisRun = 0;
    while (attemptsThisRun < maxAttemptsThisRun && this.isCurrent(token)) {
      attemptsThisRun += 1;
      const requestAttempt = ++chunk.audit.requestAttemptCount;
      chunk.audit.providerRetryCount = Math.max(0, chunk.audit.requestAttemptCount - 1);
      chunk.audit.status = requestAttempt === 1 ? 'running' : 'retrying';
      const attemptId = `${this.jobId}:${chunk.audit.chunkIndex}:${requestAttempt}:${token}`;
      const attempt = createAttemptAudit(chunk, attemptId, requestAttempt, this.provider);
      chunk.audit.attempts.push(attempt);
      this.emitChunkAudit(chunk);
      const attemptController = new AbortController();
      const cancelAttempt = () => attemptController.abort();
      this.controller.signal.addEventListener('abort', cancelAttempt, { once: true });
      this.activeRequests += 1;
      this.peakConcurrency = Math.max(this.peakConcurrency, this.activeRequests);
      try {
        const pending = this.provider.extract(chunk.input, {
          signal: attemptController.signal,
          optionalContext: this.options.optionalContext,
          requestContext: {
            attemptId,
            requestAttempt,
            chunkIndex: chunk.audit.chunkIndex,
            totalChunks: chunk.audit.totalChunks,
          },
          onRequestRecord: (record) => {
            if (!this.isCurrent(token) || attempt.attemptId !== attemptId) return;
            this.consumeRequestRecord(attempt, chunk, record);
          },
        });
        const result = await withAttemptTimeout(
          pending,
          this.executionConfig.attemptTimeoutMs,
          attemptController,
        );
        if (!this.isCurrent(token) || attempt.attemptId !== attemptId) return;
        chunk.result = result;
        chunk.error = null;
        chunk.audit.status = 'completed';
        attempt.status = 'completed';
        attempt.schemaValid = true;
        attempt.productCount = result.products.length;
        attempt.repairAttempt = Math.max(attempt.repairAttempt, result.metrics.repairAttempts);
        fillUsageFromResult(attempt, result.metrics);
        finishAttempt(attempt);
        this.emitChunkAudit(chunk);
        return;
      } catch (error) {
        const normalized = asExtractionError(error);
        if (!this.isCurrent(token) || this.externalCancelled || normalized.code === 'AI_EXTRACTION_CANCELLED') {
          attempt.status = 'cancelled';
          attempt.errorCode = 'AI_EXTRACTION_CANCELLED';
          attempt.errorStage = 'cancel';
          finishAttempt(attempt);
          chunk.audit.status = 'cancelled';
          this.emitChunkAudit(chunk);
          return;
        }
        chunk.error = normalized;
        attempt.status = 'failed';
        attempt.errorCode = normalized.code;
        applySafeDiagnostics(attempt, normalized);
        finishAttempt(attempt);
        const shouldRetry = normalized.retryable && attemptsThisRun < maxAttemptsThisRun;
        chunk.audit.status = shouldRetry ? 'retrying' : 'failed';
        this.emitChunkAudit(chunk);
        if (!shouldRetry) return;
        await delay(this.executionConfig.providerRetryDelayMs, this.controller.signal);
      } finally {
        this.activeRequests = Math.max(0, this.activeRequests - 1);
        this.controller.signal.removeEventListener('abort', cancelAttempt);
      }
    }
  }

  private consumeRequestRecord(attempt: ChunkAttemptAudit, chunk: ChunkState, record: ExtractionRequestRecord) {
    this.providerRequestCount += 1;
    attempt.inputChars = Math.max(attempt.inputChars, record.inputChars);
    attempt.inputTokens = sumNullablePair(attempt.inputTokens, record.inputTokens);
    attempt.outputTokens = sumNullablePair(attempt.outputTokens, record.outputTokens);
    attempt.totalTokens = sumNullablePair(attempt.totalTokens, record.totalTokens);
    attempt.repairAttempt = Math.max(attempt.repairAttempt, record.repairAttempt);
    attempt.httpStatus = record.httpStatus;
    attempt.responseContentType = record.responseContentType;
    attempt.responseBodyLength = record.responseBodyLength;
    attempt.responseKind = record.responseKind;
    attempt.providerRequestId = record.providerRequestId;
    attempt.schemaValid = record.schemaValid;
    attempt.productCount = record.productCount;
    attempt.errorCode = record.errorCode;
    attempt.errorStage = record.errorStage;
    attempt.thinkingMode = record.thinkingMode;
    attempt.schemaIssues = record.schemaIssues;
    chunk.audit.repairAttemptCount = Math.max(chunk.audit.repairAttemptCount, record.repairAttempt);
  }

  private finalizeStatus() {
    if (this.externalCancelled) {
      this.status = 'cancelled';
      return;
    }
    const completed = this.chunks.filter((chunk) => chunk.audit.status === 'completed').length;
    const failed = this.chunks.filter((chunk) => chunk.audit.status === 'failed').length;
    if (failed === 0 && completed === this.chunks.length) this.status = 'completed';
    else if (completed > 0 && failed > 0) this.status = 'partial-failed';
    else this.status = 'failed';
    if (this.status === 'completed') {
      try {
        this.finalResult = this.buildFinalResult(this.chunks);
        this.jobError = null;
      } catch (error) {
        this.finalResult = null;
        this.jobError = asExtractionError(error);
        this.status = 'failed';
      }
    }
  }

  private outcome(): ExtractionJobOutcome {
    const successful = this.chunks.filter((chunk) => chunk.audit.status === 'completed');
    const failed = this.chunks.filter((chunk) => chunk.audit.status === 'failed');
    return {
      schemaVersion: SCHEMA_VERSION,
      jobId: this.jobId,
      status: this.status,
      successfulChunkCount: successful.length,
      failedChunkCount: failed.length,
      failedChunkIds: failed.map((chunk) => chunk.input.chunkId),
      result: this.status === 'completed' ? this.finalResult : null,
      audit: this.buildAudit(successful.length, failed.length),
    };
  }

  private buildFinalResult(successful: ChunkState[]): ProductExtractionResult {
    if (successful.length === 0) return emptyResult(this.jobId, this.provider, this.documents.length, this.started);
    const chunkResults = successful.map((chunk) => chunk.result).filter((result): result is ProductExtractionResult => result !== null);
    const merged = this.mergeService.merge(chunkResults.flatMap((result) => result.products));
    const result: ProductExtractionResult = {
      schemaVersion: SCHEMA_VERSION,
      jobId: this.jobId,
      provider: this.provider.provider,
      model: this.provider.model,
      products: merged.products,
      conflicts: merged.conflicts,
      warnings: [...chunkResults.flatMap((item) => item.warnings), ...merged.warnings],
      metrics: aggregateMetrics(chunkResults.map((item) => item.metrics), this.documents.length, this.chunks.length, this.started),
      needsHumanReview: merged.products.some((product) => product.needsHumanReview),
      createdAt: new Date().toISOString(),
    };
    const validated = ProductExtractionResultSchema.safeParse(result);
    if (!validated.success) {
      throw new ProductExtractionError('AI_SCHEMA_INVALID', '最终产品提取结果未通过Runtime Schema', { cause: validated.error });
    }
    return result;
  }

  private buildAudit(completedChunks: number, failedChunks: number): LargeDocumentExtractionAudit {
    const attempts = this.chunks.flatMap((chunk) => chunk.audit.attempts);
    return {
      schemaVersion: SCHEMA_VERSION,
      jobId: this.jobId,
      status: this.status,
      totalChunks: this.chunks.length,
      completedChunks,
      failedChunks,
      retriedChunks: this.chunks.filter((chunk) => chunk.audit.providerRetryCount > 0).length,
      peakConcurrency: this.peakConcurrency,
      providerRequestCount: this.providerRequestCount || attempts.length,
      totalDurationMs: Math.round(performance.now() - this.started),
      usage: {
        schemaVersion: SCHEMA_VERSION,
        promptTokens: sumNullable(attempts.map((attempt) => attempt.inputTokens)),
        completionTokens: sumNullable(attempts.map((attempt) => attempt.outputTokens)),
        totalTokens: sumNullable(attempts.map((attempt) => attempt.totalTokens)),
      },
      failedChunkIds: this.chunks.filter((chunk) => chunk.audit.status === 'failed').map((chunk) => chunk.input.chunkId),
      errorCodes: [...new Set([
        ...attempts.flatMap((attempt) => attempt.errorCode ? [attempt.errorCode] : []),
        ...(this.jobError ? [this.jobError.code] : []),
      ])],
      chunks: this.chunks.map((chunk) => structuredClone(chunk.audit)),
    };
  }

  private emitChunkAudit(chunk: ChunkState) {
    this.options.chunkAuditLogger?.(structuredClone(chunk.audit));
  }

  private isCurrent(token: number) {
    return !this.externalCancelled && this.runToken === token && !this.controller.signal.aborted;
  }

  private isTerminal() {
    return ['completed', 'partial-failed', 'failed', 'cancelled'].includes(this.status);
  }
}

function createAttemptAudit(
  chunk: ChunkState,
  attemptId: string,
  requestAttempt: number,
  provider: ProductExtractionProvider,
): ChunkAttemptAudit {
  return {
    schemaVersion: SCHEMA_VERSION,
    jobId: chunk.audit.jobId,
    attemptId,
    chunkId: chunk.audit.chunkId,
    chunkIndex: chunk.audit.chunkIndex,
    totalChunks: chunk.audit.totalChunks,
    status: chunk.audit.status,
    startedAt: new Date().toISOString(),
    completedAt: null,
    durationMs: null,
    provider: provider.provider,
    model: provider.model,
    inputChars: chunk.input.evidenceItems.reduce((sum, item) => sum + item.text.length, 0),
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    requestAttempt,
    repairAttempt: 0,
    httpStatus: null,
    responseContentType: null,
    responseBodyLength: null,
    responseKind: null,
    providerRequestId: null,
    schemaValid: null,
    productCount: null,
    errorCode: null,
    errorStage: null,
    thinkingMode: null,
    schemaIssues: [],
  };
}

function finishAttempt(attempt: ChunkAttemptAudit) {
  attempt.completedAt = new Date().toISOString();
  attempt.durationMs = Math.max(0, new Date(attempt.completedAt).getTime() - new Date(attempt.startedAt).getTime());
}

function fillUsageFromResult(attempt: ChunkAttemptAudit, metrics: ProductExtractionMetrics) {
  if (attempt.inputTokens === null) attempt.inputTokens = metrics.usage.promptTokens;
  if (attempt.outputTokens === null) attempt.outputTokens = metrics.usage.completionTokens;
  if (attempt.totalTokens === null) attempt.totalTokens = metrics.usage.totalTokens;
}

function applySafeDiagnostics(attempt: ChunkAttemptAudit, error: ProductExtractionError) {
  attempt.httpStatus = error.diagnostics?.httpStatus ?? attempt.httpStatus;
  attempt.responseContentType = error.diagnostics?.responseContentType ?? attempt.responseContentType;
  attempt.responseBodyLength = error.diagnostics?.responseBodyLength ?? attempt.responseBodyLength;
  attempt.responseKind = error.diagnostics?.responseKind ?? attempt.responseKind;
  attempt.providerRequestId = error.diagnostics?.providerRequestId ?? attempt.providerRequestId;
  attempt.errorStage = error.diagnostics?.errorStage ?? 'unknown';
}

async function withAttemptTimeout<T>(promise: Promise<T>, timeoutMs: number | null, controller: AbortController): Promise<T> {
  if (timeoutMs === null) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ProductExtractionError('AI_TIMEOUT', 'Chunk Provider请求超时', {
        diagnostics: {
          httpStatus: null,
          responseContentType: null,
          responseBodyLength: null,
          responseKind: null,
          providerRequestId: null,
          errorStage: 'transport',
        },
      }));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function delay(milliseconds: number, signal: AbortSignal) {
  if (milliseconds <= 0 || signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, milliseconds);
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}

function aggregateMetrics(
  metrics: ProductExtractionMetrics[],
  documentCount: number,
  chunkCount: number,
  startedAt: number,
): ProductExtractionMetrics {
  return {
    schemaVersion: SCHEMA_VERSION,
    documentCount,
    chunkCount,
    requestCount: metrics.reduce((sum, item) => sum + item.requestCount, 0),
    repairAttempts: metrics.reduce((sum, item) => sum + item.repairAttempts, 0),
    inputCharacters: metrics.reduce((sum, item) => sum + item.inputCharacters, 0),
    outputCharacters: metrics.reduce((sum, item) => sum + item.outputCharacters, 0),
    durationMs: Math.round(performance.now() - startedAt),
    usage: {
      schemaVersion: SCHEMA_VERSION,
      promptTokens: sumNullable(metrics.map((item) => item.usage.promptTokens)),
      completionTokens: sumNullable(metrics.map((item) => item.usage.completionTokens)),
      totalTokens: sumNullable(metrics.map((item) => item.usage.totalTokens)),
    },
  };
}

function sumNullable(values: Array<number | null>): number | null {
  return values.every((value) => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function sumNullablePair(left: number | null, right: number | null): number | null {
  return left === null && right === null ? null : (left ?? 0) + (right ?? 0);
}

function emptyResult(
  jobId: string,
  provider: ProductExtractionProvider,
  documentCount: number,
  startedAt: number,
): ProductExtractionResult {
  return {
    schemaVersion: SCHEMA_VERSION,
    jobId,
    provider: provider.provider,
    model: provider.model,
    products: [],
    conflicts: [],
    warnings: [],
    metrics: {
      schemaVersion: SCHEMA_VERSION,
      documentCount,
      chunkCount: 0,
      requestCount: 0,
      repairAttempts: 0,
      inputCharacters: 0,
      outputCharacters: 0,
      durationMs: Math.round(performance.now() - startedAt),
      usage: { schemaVersion: SCHEMA_VERSION, promptTokens: null, completionTokens: null, totalTokens: null },
    },
    needsHumanReview: false,
    createdAt: new Date().toISOString(),
  };
}
