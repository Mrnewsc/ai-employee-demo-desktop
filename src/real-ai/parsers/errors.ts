export type FileParseErrorCode =
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'FILE_EMPTY'
  | 'FILE_NOT_FOUND'
  | 'FILE_TYPE_MISMATCH'
  | 'FILE_CORRUPTED'
  | 'PDF_PASSWORD_REQUIRED'
  | 'OCR_FAILED'
  | 'PARSE_TIMEOUT'
  | 'PARSER_FAILED';

export class FileParseError extends Error {
  readonly code: FileParseErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: FileParseErrorCode,
    message: string,
    details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'FileParseError';
    this.code = code;
    this.details = details;
  }
}

export function toFileParseError(error: unknown, fallbackMessage: string): FileParseError {
  if (error instanceof FileParseError) return error;
  return new FileParseError(
    'PARSER_FAILED',
    fallbackMessage,
    { originalMessage: error instanceof Error ? error.message : String(error) },
    { cause: error },
  );
}
