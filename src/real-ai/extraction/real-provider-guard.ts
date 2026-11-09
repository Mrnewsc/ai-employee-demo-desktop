import { ProductExtractionError } from './errors';

let realDeepSeekRequestCount = 0;

export function assertRealDeepSeekRequestAllowed(fetchImpl: typeof fetch, environment = process.env) {
  if (fetchImpl !== fetch) return;
  if (environment.REAL_AI_BLOCK_REAL_DEEPSEEK === '1') {
    throw new ProductExtractionError('AI_REAL_PROVIDER_BLOCKED', '测试环境已禁止真实DeepSeek请求');
  }
  const requestLimit = parseRequestLimit(environment.REAL_AI_MAX_DEEPSEEK_REQUESTS);
  if (requestLimit !== null && realDeepSeekRequestCount >= requestLimit) {
    throw new ProductExtractionError('AI_REAL_PROVIDER_BLOCKED', `真实DeepSeek请求已达到本进程安全上限${requestLimit}`);
  }
  realDeepSeekRequestCount += 1;
}

export function getRealDeepSeekRequestCount() {
  return realDeepSeekRequestCount;
}

export function resetRealDeepSeekRequestCountForTests() {
  realDeepSeekRequestCount = 0;
}

function parseRequestLimit(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ProductExtractionError('AI_REAL_PROVIDER_BLOCKED', '真实DeepSeek请求安全上限配置无效');
  }
  return parsed;
}
