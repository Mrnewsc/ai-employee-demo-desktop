import type { AIExtractionErrorCode, SafeProviderDiagnostics } from './contracts';
import type { SchemaIssue } from './schema-validation-diagnostics';

const RETRYABLE_CODES = new Set<AIExtractionErrorCode>([
  'AI_REQUEST_FAILED',
  'AI_HTTP_ERROR',
  'AI_INVALID_CONTENT_TYPE',
  'AI_EMPTY_HTTP_RESPONSE',
  'AI_INVALID_HTTP_RESPONSE',
  'AI_PROVIDER_ERROR',
  'AI_TIMEOUT',
  'AI_RATE_LIMITED',
]);

export class ProductExtractionError extends Error {
  readonly code: AIExtractionErrorCode;
  readonly retryable: boolean;
  readonly cause?: unknown;
  readonly diagnostics?: SafeProviderDiagnostics;
  readonly schemaIssues: SchemaIssue[];

  constructor(
    code: AIExtractionErrorCode,
    message: string,
    options: { cause?: unknown; retryable?: boolean; diagnostics?: SafeProviderDiagnostics; schemaIssues?: SchemaIssue[] } = {},
  ) {
    super(message);
    this.name = 'ProductExtractionError';
    this.code = code;
    this.retryable = options.retryable ?? RETRYABLE_CODES.has(code);
    this.cause = options.cause;
    this.diagnostics = options.diagnostics;
    this.schemaIssues = options.schemaIssues ?? [];
  }
}

export function asExtractionError(
  error: unknown,
  fallbackCode: AIExtractionErrorCode = 'AI_EXTRACTION_FAILED',
): ProductExtractionError {
  if (error instanceof ProductExtractionError) return error;
  if (error instanceof Error && error.name === 'AbortError') {
    return new ProductExtractionError('AI_EXTRACTION_CANCELLED', 'AI结构化提取已取消', { cause: error });
  }
  return new ProductExtractionError(fallbackCode, 'AI结构化提取失败', { cause: error });
}
