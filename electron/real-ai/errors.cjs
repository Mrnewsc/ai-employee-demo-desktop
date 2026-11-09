const ERROR_MAP = {
  FILE_TYPE_MISMATCH: 'FILE_SIGNATURE_MISMATCH',
  PARSER_FAILED: 'INTERNAL_PARSE_ERROR',
  FILE_EMPTY: 'FILE_EMPTY',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
};

const RETRYABLE = new Set(['PARSE_TIMEOUT', 'OCR_FAILED', 'INTERNAL_PARSE_ERROR']);

function normalizeError(error, fallbackCode = 'INTERNAL_PARSE_ERROR') {
  const sourceCode = typeof error?.code === 'string' ? error.code : fallbackCode;
  const code = ERROR_MAP[sourceCode] ?? sourceCode;
  const allowed = new Set([
    'UNSUPPORTED_FILE_TYPE',
    'FILE_TOO_LARGE',
    'FILE_EMPTY',
    'FILE_NOT_FOUND',
    'FILE_CORRUPTED',
    'FILE_SIGNATURE_MISMATCH',
    'PDF_PASSWORD_REQUIRED',
    'PARSE_TIMEOUT',
    'OCR_FAILED',
    'JOB_CANCELLED',
    'INTERNAL_PARSE_ERROR',
    'INVALID_REQUEST',
    'FILE_TOKEN_NOT_FOUND',
    'JOB_NOT_FOUND',
  ]);
  const safeCode = allowed.has(code) ? code : fallbackCode;
  return {
    schemaVersion: '1.0',
    code: safeCode,
    message: sanitizeMessage(error?.message) || defaultMessage(safeCode),
    retryable: RETRYABLE.has(safeCode),
  };
}

function sanitizeMessage(message) {
  if (typeof message !== 'string') return '';
  return message
    .replace(/[A-Za-z]:\\[^\s"']+/g, '[本地路径]')
    .replace(/file:\/\/\/[^\s"']+/g, '[本地路径]')
    .slice(0, 500);
}

function defaultMessage(code) {
  const messages = {
    UNSUPPORTED_FILE_TYPE: '不支持该文件类型',
    FILE_TOO_LARGE: '文件超过允许大小',
    FILE_EMPTY: '文件为空',
    FILE_NOT_FOUND: '文件不存在',
    FILE_CORRUPTED: '文件损坏或结构不完整',
    FILE_SIGNATURE_MISMATCH: '扩展名与文件真实类型不一致',
    PDF_PASSWORD_REQUIRED: 'PDF需要密码',
    PARSE_TIMEOUT: '文件解析超时',
    OCR_FAILED: 'OCR识别失败',
    JOB_CANCELLED: '分析任务已取消',
    INVALID_REQUEST: '请求参数无效',
    FILE_TOKEN_NOT_FOUND: '文件令牌不存在或已失效',
    JOB_NOT_FOUND: '分析任务不存在',
    INTERNAL_PARSE_ERROR: '后台解析失败',
  };
  return messages[code] ?? '后台解析失败';
}

module.exports = { normalizeError };
