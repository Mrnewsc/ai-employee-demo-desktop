import type { ParseWarning, ParsedDocument, ParsedFileType, VersionedContract } from './contracts';

export interface StagedFileToken extends VersionedContract {
  fileId: string;
  displayName: string;
  size: number;
  declaredMimeType: string;
  detectedType: ParsedFileType;
  sha256: string;
  createdAt: string;
}

export type AnalysisJobStatus =
  | 'queued'
  | 'staging'
  | 'parsing'
  | 'ocr'
  | 'normalizing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AnalysisJobStage =
  | 'queued'
  | 'copying-files'
  | 'reading-file'
  | 'parsing-document'
  | 'rendering-page'
  | 'recognizing-text'
  | 'validating-result'
  | 'cleaning-up'
  | 'complete'
  | 'failed'
  | 'cancelled';

export type AnalysisErrorCode =
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'FILE_EMPTY'
  | 'FILE_NOT_FOUND'
  | 'FILE_CORRUPTED'
  | 'FILE_SIGNATURE_MISMATCH'
  | 'PDF_PASSWORD_REQUIRED'
  | 'PARSE_TIMEOUT'
  | 'OCR_FAILED'
  | 'JOB_CANCELLED'
  | 'INTERNAL_PARSE_ERROR'
  | 'INVALID_REQUEST'
  | 'FILE_TOKEN_NOT_FOUND'
  | 'JOB_NOT_FOUND';

export interface AnalysisErrorResult extends VersionedContract {
  code: AnalysisErrorCode;
  message: string;
  retryable: boolean;
}

export interface AnalysisProgress extends VersionedContract {
  completedFiles: number;
  totalFiles: number;
  currentFile?: string;
}

export interface AnalysisJobSnapshot extends VersionedContract {
  jobId: string;
  fileIds: string[];
  status: AnalysisJobStatus;
  stage: AnalysisJobStage;
  progress: AnalysisProgress;
  startedAt: string | null;
  finishedAt: string | null;
  warnings: ParseWarning[];
  error: AnalysisErrorResult | null;
  documents?: ParsedDocument[];
  resourcesCleaned: boolean;
}
