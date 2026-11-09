import { SCHEMA_VERSION } from '../../types';
import type {
  AIProviderConfig,
  ExtractionAuditEvent,
  ExtractionAuditLogger,
  ExtractionInput,
  ExtractionOptions,
  ExtractionRequestLogger,
  SafeProviderDiagnostics,
  ProductExtractionProvider,
  ProductExtractionResult,
  ProviderExtractionPayload,
} from '../contracts';
import { ProductExtractionError, asExtractionError } from '../errors';
import { materializeProviderPayload } from '../materializer';
import {
  JSON_REPAIR_SYSTEM_PROMPT,
  PRODUCT_EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
  buildJsonRepairPrompt,
} from '../prompt';
import { parseProviderPayload } from '../provider-utils';
import { analyzeRepairDiff } from '../repair-diff';
import { assertRealDeepSeekRequestAllowed } from '../real-provider-guard';
import { buildSchemaRepairPrompt, SCHEMA_REPAIR_SYSTEM_PROMPT } from '../schema-repair-prompt';
import { safeCanonicalizeProviderPayload } from '../safe-canonicalization';

interface DeepSeekResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: unknown;
}

interface ModelCallResult {
  content: string;
  usage: DeepSeekResponse['usage'];
  diagnostics: SafeProviderDiagnostics;
}

interface ValidatedRequestResult {
  call: ModelCallResult;
  payload: ProviderExtractionPayload | null;
  validationError: ProductExtractionError | null;
}

export class DeepSeekProductExtractionProvider implements ProductExtractionProvider {
  readonly provider = 'deepseek';
  readonly model: string;
  private requestSequence = 0;

  constructor(
    private readonly config: AIProviderConfig,
    private readonly auditLogger: ExtractionAuditLogger = () => undefined,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly requestLogger: ExtractionRequestLogger = () => undefined,
  ) {
    this.model = config.model;
  }

  async extract(input: ExtractionInput, options: ExtractionOptions = {}): Promise<ProductExtractionResult> {
    const startedAt = performance.now();
    let repairAttempts = 0;
    this.audit('request-started', input, { repairAttempts: 0 });
    try {
      const firstRequest = await this.executeRequest(input, [
        { role: 'system', content: PRODUCT_EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: buildExtractionUserPrompt(input) },
      ], 0, options);
      const first = firstRequest.call;
      let payload = firstRequest.payload;
      let validationError = firstRequest.validationError;
      let repaired = false;
      let final = first;
      let schemaRepairSource: unknown | null = null;
      if (validationError?.code === 'AI_SCHEMA_INVALID') {
        const legalJson = parseLegalJson(first.content);
        if (legalJson !== null) {
          const canonicalization = safeCanonicalizeProviderPayload(legalJson);
          schemaRepairSource = canonicalization.value;
          if (canonicalization.appliedRules.length > 0 || canonicalization.rejectedTransforms.length > 0) {
            this.audit(
              canonicalization.rejectedTransforms.length > 0 ? 'canonicalization-rejected' : 'canonicalization-applied',
              input,
              {
                repairAttempts: 0,
                schemaIssues: validationError.schemaIssues,
                canonicalizationRules: canonicalization.appliedRules,
                canonicalizationRejectedCount: canonicalization.rejectedTransforms.length,
              },
            );
          }
          try {
            payload = parseProviderPayload(JSON.stringify(canonicalization.value));
            validationError = null;
          } catch (error) {
            validationError = asExtractionError(error);
          }
        }
      }
      if (validationError) {
        const extractionError = validationError;
        const schemaRepairable = extractionError.code === 'AI_SCHEMA_INVALID'
          && extractionError.schemaIssues.length > 0
          && extractionError.schemaIssues.every((issue) => issue.repairable);
        const repairable = extractionError.code === 'AI_INVALID_JSON' || schemaRepairable;
        if (!repairable || this.config.maxRepairAttempts === 0) throw extractionError;
        repaired = true;
        repairAttempts = 1;
        this.audit('repair-started', input, {
          repairAttempts: 1,
          schemaIssues: extractionError.schemaIssues,
        });
        if (extractionError.code === 'AI_SCHEMA_INVALID' && schemaRepairSource === null) {
          schemaRepairSource = parseLegalJson(first.content);
        }
        const repairMessages = schemaRepairSource === null
          ? [
              { role: 'system' as const, content: JSON_REPAIR_SYSTEM_PROMPT },
              { role: 'user' as const, content: buildJsonRepairPrompt(first.content) },
            ]
          : [
              { role: 'system' as const, content: SCHEMA_REPAIR_SYSTEM_PROMPT },
              { role: 'user' as const, content: buildSchemaRepairPrompt(schemaRepairSource, extractionError.schemaIssues) },
            ];
        const repairedRequest = await this.executeRequest(input, [
          ...repairMessages,
        ], 1, options);
        final = repairedRequest.call;
        if (schemaRepairSource !== null) {
          const repairedJson = parseLegalJson(final.content);
          const repairDiagnostics = repairedJson === null ? null : analyzeRepairDiff(schemaRepairSource, repairedJson, {
            repairAttempt: 1,
            schemaIssueCountBefore: extractionError.schemaIssues.length,
            schemaIssueCountAfter: repairedRequest.validationError?.schemaIssues.length ?? 0,
          });
          this.audit(repairDiagnostics?.semanticDriftDetected ? 'repair-rejected' : 'repair-completed', input, {
            repairAttempts: 1,
            schemaIssues: repairedRequest.validationError?.schemaIssues ?? [],
            repairDiagnostics,
          });
          if (repairDiagnostics?.semanticDriftDetected) {
            throw new ProductExtractionError('REPAIR_SEMANTIC_DRIFT', 'Schema Repair改变了已有事实或Evidence结构，已拒绝结果', {
              schemaIssues: repairedRequest.validationError?.schemaIssues ?? [],
              diagnostics: {
                httpStatus: null,
                responseContentType: null,
                responseBodyLength: null,
                responseKind: null,
                providerRequestId: null,
                errorStage: 'repair',
              },
            });
          }
        }
        if (repairedRequest.validationError) throw repairedRequest.validationError;
        payload = repairedRequest.payload;
      }

      if (!payload) throw new ProductExtractionError('AI_SCHEMA_INVALID', 'DeepSeek结构化结果为空');

      options.onValidatedPayload?.({
        jobId: input.jobId,
        chunkId: input.chunkId,
        repaired,
        payload: structuredClone(payload),
      });

      const result = materializeProviderPayload(input, payload, {
        provider: this.provider,
        model: this.model,
        repaired,
        durationMs: Math.round(performance.now() - startedAt),
        outputCharacters: first.content.length + (repaired ? final.content.length : 0),
        usage: sumUsage(first.usage, repaired ? final.usage : undefined),
      });
      this.audit('request-completed', input, {
        durationMs: result.metrics.durationMs,
        productCount: result.products.length,
        repairAttempts: result.metrics.repairAttempts,
      });
      return result;
    } catch (error) {
      const normalized = asExtractionError(error);
      this.audit('request-failed', input, { errorCode: normalized.code, repairAttempts });
      throw normalized;
    }
  }

  private async executeRequest(
    input: ExtractionInput,
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    repairAttempt: number,
    options: ExtractionOptions,
  ): Promise<ValidatedRequestResult> {
    const requestId = `ds_${Date.now().toString(36)}_${++this.requestSequence}`;
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const inputChars = messages.reduce((sum, message) => sum + message.content.length, 0);
    let call: ModelCallResult | null = null;
    try {
      call = await this.callModel(messages, {
        input,
        requestId,
        repairAttempt,
        options,
      });
      try {
        const payload = parseProviderPayload(call.content);
        this.logRequest(options, {
          schemaVersion: SCHEMA_VERSION,
          requestId,
          sampleId: input.optionalContext.sampleId ?? input.jobId,
          chunkId: input.chunkId,
          startedAt,
          durationMs: Math.round(performance.now() - started),
          inputChars,
          inputTokens: call.usage?.prompt_tokens ?? null,
          outputTokens: call.usage?.completion_tokens ?? null,
          totalTokens: call.usage?.total_tokens ?? null,
          schemaValid: true,
          repairAttempt,
          productCount: payload.products.length,
          errorCode: null,
          ...requestContextFields(options),
          ...call.diagnostics,
          errorStage: null,
          thinkingMode: this.config.thinkingMode ?? 'disabled',
          schemaIssues: [],
        });
        return { call, payload, validationError: null };
      } catch (error) {
        const validationError = asExtractionError(error);
        this.logRequest(options, {
          schemaVersion: SCHEMA_VERSION,
          requestId,
          sampleId: input.optionalContext.sampleId ?? input.jobId,
          chunkId: input.chunkId,
          startedAt,
          durationMs: Math.round(performance.now() - started),
          inputChars,
          inputTokens: call.usage?.prompt_tokens ?? null,
          outputTokens: call.usage?.completion_tokens ?? null,
          totalTokens: call.usage?.total_tokens ?? null,
          schemaValid: false,
          repairAttempt,
          productCount: null,
          errorCode: validationError.code,
          ...requestContextFields(options),
          ...call.diagnostics,
          errorStage: validationError.code === 'AI_SCHEMA_INVALID' ? 'schema' : 'response-envelope',
          thinkingMode: this.config.thinkingMode ?? 'disabled',
          schemaIssues: validationError.schemaIssues,
        });
        return { call, payload: null, validationError };
      }
    } catch (error) {
      const requestError = asExtractionError(error);
      this.logRequest(options, {
        schemaVersion: SCHEMA_VERSION,
        requestId,
        sampleId: input.optionalContext.sampleId ?? input.jobId,
        chunkId: input.chunkId,
        startedAt,
        durationMs: Math.round(performance.now() - started),
        inputChars,
        inputTokens: call?.usage?.prompt_tokens ?? requestError.diagnostics?.inputTokens ?? null,
        outputTokens: call?.usage?.completion_tokens ?? requestError.diagnostics?.outputTokens ?? null,
        totalTokens: call?.usage?.total_tokens ?? requestError.diagnostics?.totalTokens ?? null,
        schemaValid: false,
        repairAttempt,
        productCount: null,
        errorCode: requestError.code,
        ...requestContextFields(options),
        ...(requestError.diagnostics ?? emptyDiagnostics()),
        errorStage: requestError.diagnostics?.errorStage ?? errorStageFor(requestError.code),
        thinkingMode: this.config.thinkingMode ?? 'disabled',
        schemaIssues: requestError.schemaIssues,
      });
      throw requestError;
    }
  }

  private async callModel(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    context: {
      input: ExtractionInput;
      requestId: string;
      repairAttempt: number;
      options: ExtractionOptions;
    },
  ): Promise<ModelCallResult> {
    const externalSignal = context.options.signal;
    const controller = new AbortController();
    let timedOut = false;
    let providerAttemptStarted = false;
    let providerAttemptFinalized = false;
    let providerRequestId: string | null = null;
    const providerAttemptStartedAt = new Date().toISOString();
    const providerAttemptClock = performance.now();
    const providerAttempt = {
      attemptId: context.requestId,
      jobId: context.input.jobId,
      chunkId: context.input.chunkId,
      chunkIndex: context.options.requestContext?.chunkIndex ?? chunkIndexFromId(context.input.chunkId),
      requestAttempt: context.options.requestContext?.requestAttempt ?? 1,
      repairAttempt: context.repairAttempt,
      provider: this.provider,
      model: this.model,
      startedAt: providerAttemptStartedAt,
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.timeoutMs);
    const cancel = () => controller.abort();
    externalSignal?.addEventListener('abort', cancel, { once: true });

    try {
      if (context.options.providerAttemptHooks) {
        await context.options.providerAttemptHooks.onStarted(providerAttempt);
      }
      providerAttemptStarted = true;
      if (controller.signal.aborted) {
        throw new ProductExtractionError('AI_EXTRACTION_CANCELLED', 'AI结构化提取已取消');
      }
      assertRealDeepSeekRequestAllowed(this.fetchImpl);
      const response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          response_format: { type: 'json_object' },
          thinking: { type: this.config.thinkingMode ?? 'disabled' },
          temperature: 0,
          max_tokens: this.config.maxOutputTokens,
          stream: false,
        }),
        signal: controller.signal,
      });
      const diagnostics = responseDiagnostics(response);
      providerRequestId = diagnostics.providerRequestId;
      if (response.status === 429) {
        throw new ProductExtractionError('AI_RATE_LIMITED', 'DeepSeek请求受到频率限制', {
          diagnostics: { ...diagnostics, errorStage: 'http' },
        });
      }
      if (!response.ok) {
        throw new ProductExtractionError('AI_HTTP_ERROR', `DeepSeek请求失败（HTTP ${response.status}）`, {
          retryable: response.status >= 500 || response.status === 408,
          diagnostics: { ...diagnostics, errorStage: 'http' },
        });
      }
      const body = await response.text();
      const bodyDiagnostics = {
        ...diagnostics,
        responseBodyLength: body.length,
        responseKind: classifyResponseKind(diagnostics.responseContentType, body),
      } satisfies SafeProviderDiagnostics;
      if (!body.trim()) {
        throw new ProductExtractionError('AI_EMPTY_HTTP_RESPONSE', 'DeepSeek返回空HTTP响应', {
          diagnostics: { ...bodyDiagnostics, responseKind: 'empty', errorStage: 'response-envelope' },
        });
      }
      if (!isJsonContentType(diagnostics.responseContentType)) {
        throw new ProductExtractionError('AI_INVALID_CONTENT_TYPE', 'DeepSeek响应Content-Type不是JSON', {
          diagnostics: { ...bodyDiagnostics, errorStage: 'response-envelope' },
        });
      }
      let data: DeepSeekResponse;
      try {
        data = JSON.parse(body) as DeepSeekResponse;
      } catch (error) {
        throw new ProductExtractionError('AI_INVALID_HTTP_RESPONSE', 'DeepSeek响应不是合法HTTP JSON', {
          cause: error,
          diagnostics: { ...bodyDiagnostics, errorStage: 'response-envelope' },
        });
      }
      if (data.error !== undefined) {
        throw new ProductExtractionError('AI_PROVIDER_ERROR', 'DeepSeek返回Provider业务错误', {
          diagnostics: { ...bodyDiagnostics, errorStage: 'provider' },
        });
      }
      const choice = data.choices?.[0];
      if (choice?.finish_reason === 'length') {
        throw new ProductExtractionError('AI_OUTPUT_TRUNCATED', 'DeepSeek输出因长度限制被截断', {
          diagnostics: withUsage({ ...bodyDiagnostics, errorStage: 'provider' }, data.usage),
        });
      }
      const content = choice?.message?.content?.trim();
      if (!content) {
        throw new ProductExtractionError('AI_EMPTY_RESPONSE', 'DeepSeek返回空内容', {
          diagnostics: withUsage({ ...bodyDiagnostics, errorStage: 'provider' }, data.usage),
        });
      }
      providerAttemptFinalized = true;
      await context.options.providerAttemptHooks?.onFinished({
        ...providerAttempt,
        status: 'completed',
        completedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - providerAttemptClock),
        providerRequestId,
        errorCode: null,
      });
      return { content, usage: data.usage, diagnostics: { ...bodyDiagnostics, errorStage: 'unknown' } };
    } catch (error) {
      if (providerAttemptStarted && !providerAttemptFinalized) {
        providerAttemptFinalized = true;
        const normalized = asExtractionError(error);
        await context.options.providerAttemptHooks?.onFinished({
          ...providerAttempt,
          status: 'failed',
          completedAt: new Date().toISOString(),
          durationMs: Math.round(performance.now() - providerAttemptClock),
          providerRequestId,
          errorCode: normalized.code,
        });
      }
      if (!providerAttemptStarted && isProviderAttemptSafetyError(error)) {
        throw new ProductExtractionError('AI_REAL_PROVIDER_BLOCKED', '真实Provider请求在发送前被安全策略阻断', {
          cause: error,
          diagnostics: {
            httpStatus: null,
            responseContentType: null,
            responseBodyLength: null,
            responseKind: null,
            providerRequestId: null,
            errorStage: 'transport',
          },
        });
      }
      if (externalSignal?.aborted) {
        throw new ProductExtractionError('AI_EXTRACTION_CANCELLED', 'AI结构化提取已取消', { cause: error });
      }
      if (timedOut) {
        throw new ProductExtractionError('AI_TIMEOUT', 'DeepSeek结构化提取请求超时', { cause: error });
      }
      if (error instanceof ProductExtractionError) throw error;
      throw new ProductExtractionError('AI_REQUEST_FAILED', 'DeepSeek网络请求失败', { cause: error });
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', cancel);
    }
  }

  private logRequest(options: ExtractionOptions, record: Parameters<ExtractionRequestLogger>[0]) {
    this.requestLogger(record);
    options.onRequestRecord?.(record);
  }

  private audit(
    event: ExtractionAuditEvent['event'],
    input: ExtractionInput,
    values: Partial<Omit<ExtractionAuditEvent, 'schemaVersion' | 'timestamp' | 'jobId' | 'chunkId' | 'provider' | 'model' | 'event'>>,
  ) {
    this.auditLogger({
      schemaVersion: SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      jobId: input.jobId,
      chunkId: input.chunkId,
      provider: this.provider,
      model: this.model,
      event,
      durationMs: values.durationMs ?? null,
      productCount: values.productCount ?? null,
      errorCode: values.errorCode ?? null,
      repairAttempts: values.repairAttempts ?? 0,
      schemaIssues: values.schemaIssues ?? [],
      repairDiagnostics: values.repairDiagnostics ?? null,
      canonicalizationRules: values.canonicalizationRules ?? [],
      canonicalizationRejectedCount: values.canonicalizationRejectedCount ?? 0,
    });
  }
}

function chunkIndexFromId(chunkId: string): number {
  const parsed = Number(chunkId.match(/:chunk:(\d+)$/)?.[1]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function isProviderAttemptSafetyError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === 'REAL_REQUEST_BUDGET_EXHAUSTED'
    || code === 'AMBIGUOUS_ATTEMPT'
    || code === 'LEDGER_CORRUPT'
    || code === 'LEDGER_INCOMPATIBLE';
}

function parseLegalJson(content: string): unknown | null {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}

function requestContextFields(options: ExtractionOptions) {
  return {
    attemptId: options.requestContext?.attemptId ?? null,
    requestAttempt: options.requestContext?.requestAttempt ?? 1,
  };
}

function emptyDiagnostics(): SafeProviderDiagnostics {
  return {
    httpStatus: null,
    responseContentType: null,
    responseBodyLength: null,
    responseKind: null,
    providerRequestId: null,
    errorStage: 'unknown',
  };
}

function withUsage(diagnostics: SafeProviderDiagnostics, usage: DeepSeekResponse['usage']): SafeProviderDiagnostics {
  return {
    ...diagnostics,
    inputTokens: usage?.prompt_tokens ?? null,
    outputTokens: usage?.completion_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
  };
}

function responseDiagnostics(response: Response): SafeProviderDiagnostics {
  return {
    httpStatus: response.status,
    responseContentType: response.headers.get('content-type'),
    responseBodyLength: positiveHeaderNumber(response.headers.get('content-length')),
    responseKind: null,
    providerRequestId: response.headers.get('x-request-id') ?? response.headers.get('request-id'),
    errorStage: 'unknown',
  };
}

function positiveHeaderNumber(value: string | null): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function isJsonContentType(value: string | null): boolean {
  return value !== null && /(?:application|text)\/(?:[\w.+-]*\+)?json\b/i.test(value);
}

function classifyResponseKind(contentType: string | null, body: string) {
  if (!body.trim()) return 'empty' as const;
  if (/text\/html/i.test(contentType ?? '') || /^\s*<!doctype html|^\s*<html/i.test(body)) return 'html' as const;
  if (isJsonContentType(contentType)) return 'json' as const;
  if (/text\/plain/i.test(contentType ?? '')) return 'text/plain' as const;
  return 'unknown' as const;
}

function errorStageFor(code: import('../contracts').AIExtractionErrorCode) {
  if (code === 'AI_EXTRACTION_CANCELLED') return 'cancel' as const;
  if (code === 'AI_REAL_PROVIDER_BLOCKED') return 'transport' as const;
  if (code === 'REPAIR_SEMANTIC_DRIFT') return 'repair' as const;
  if (code === 'AI_TIMEOUT' || code === 'AI_REQUEST_FAILED') return 'transport' as const;
  if (code === 'AI_HTTP_ERROR' || code === 'AI_RATE_LIMITED') return 'http' as const;
  if (code === 'AI_PROVIDER_ERROR') return 'provider' as const;
  if (code === 'AI_SCHEMA_INVALID') return 'schema' as const;
  return 'response-envelope' as const;
}

function sumUsage(
  first: DeepSeekResponse['usage'],
  second?: DeepSeekResponse['usage'],
): { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null } {
  return {
    promptTokens: sumOptional(first?.prompt_tokens, second?.prompt_tokens),
    completionTokens: sumOptional(first?.completion_tokens, second?.completion_tokens),
    totalTokens: sumOptional(first?.total_tokens, second?.total_tokens),
  };
}

function sumOptional(first?: number, second?: number): number | null {
  return first === undefined && second === undefined ? null : (first ?? 0) + (second ?? 0);
}
