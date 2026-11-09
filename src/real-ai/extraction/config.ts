import type { AIProviderConfig, ExtractionChunkConfig, ExtractionExecutionConfig } from './contracts';
import { ProductExtractionError } from './errors';

export const EXTRACTION_CHUNK_CONFIG: Readonly<ExtractionChunkConfig> = Object.freeze({
  maxTextCharacters: 8_000,
  maxTableRows: 40,
  maxChunksPerDocument: 30,
  maxConcurrentRequests: 2,
});

export const EXTRACTION_EXECUTION_CONFIG: Readonly<ExtractionExecutionConfig> = Object.freeze({
  maxConcurrentExtractionRequests: 2,
  maxProviderRetries: 1,
  providerRetryDelayMs: 250,
  attemptTimeoutMs: null,
});

export const EXTRACTION_PROVIDER_DEFAULTS = Object.freeze({
  baseUrl: 'https://api.deepseek.com',
  timeoutMs: 60_000,
  maxRepairAttempts: 1 as const,
  maxOutputTokens: 3_500,
  thinkingMode: 'disabled' as const,
});

export function deepSeekConfigFromEnvironment(
  environment: Record<string, string | undefined> = process.env,
): AIProviderConfig {
  const apiKey = environment.DEEPSEEK_API_KEY?.trim();
  const model = environment.DEEPSEEK_MODEL?.trim();
  if (!apiKey) {
    throw new ProductExtractionError('AI_EXTRACTION_FAILED', '未配置DEEPSEEK_API_KEY');
  }
  if (!model) {
    throw new ProductExtractionError('AI_EXTRACTION_FAILED', '未配置DEEPSEEK_MODEL');
  }
  return {
    provider: 'deepseek',
    apiKey,
    model,
    baseUrl: environment.DEEPSEEK_BASE_URL?.trim() || EXTRACTION_PROVIDER_DEFAULTS.baseUrl,
    timeoutMs: parsePositiveInteger(environment.DEEPSEEK_TIMEOUT_MS, EXTRACTION_PROVIDER_DEFAULTS.timeoutMs),
    maxRepairAttempts: EXTRACTION_PROVIDER_DEFAULTS.maxRepairAttempts,
    maxOutputTokens: parsePositiveInteger(
      environment.DEEPSEEK_MAX_OUTPUT_TOKENS,
      EXTRACTION_PROVIDER_DEFAULTS.maxOutputTokens,
    ),
    thinkingMode: environment.DEEPSEEK_THINKING_MODE === 'enabled' ? 'enabled' : EXTRACTION_PROVIDER_DEFAULTS.thinkingMode,
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
