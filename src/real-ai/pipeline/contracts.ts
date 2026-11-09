import type { ExtractedProductV1, ExtractionWarning, ProductExtractionMetrics } from '../extraction';
import type { ProductMatchResult } from '../matching';
import type { ParseWarning, SchemaVersion } from '../types';

export type RealAnalysisStatus =
  | 'queued'
  | 'staging'
  | 'parsing'
  | 'ocr'
  | 'extracting'
  | 'matching'
  | 'catalog-required'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type RealAnalysisStage =
  | 'receiving-files'
  | 'reading-files'
  | 'recognizing-text'
  | 'extracting-products'
  | 'checking-catalog'
  | 'matching-products'
  | 'awaiting-catalog'
  | 'complete'
  | 'failed'
  | 'cancelled';

export type RealAnalysisErrorCode =
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'FILE_EMPTY'
  | 'FILE_NOT_FOUND'
  | 'FILE_CORRUPTED'
  | 'FILE_SIGNATURE_MISMATCH'
  | 'PDF_PASSWORD_REQUIRED'
  | 'PARSE_TIMEOUT'
  | 'OCR_FAILED'
  | 'AI_NOT_CONFIGURED'
  | 'AI_REQUEST_FAILED'
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_EMPTY_RESPONSE'
  | 'AI_OUTPUT_TRUNCATED'
  | 'AI_INVALID_JSON'
  | 'AI_SCHEMA_INVALID'
  | 'AI_EXTRACTION_FAILED'
  | 'CATALOG_NOT_CONFIGURED'
  | 'JOB_CANCELLED'
  | 'JOB_NOT_FOUND'
  | 'REUPLOAD_REQUIRED'
  | 'INVALID_REQUEST'
  | 'INTERNAL_ANALYSIS_ERROR';

export interface RealAnalysisError {
  schemaVersion: SchemaVersion;
  code: RealAnalysisErrorCode;
  message: string;
  retryable: boolean;
  technicalDetail: string | null;
}

export interface RealAnalysisProgress {
  schemaVersion: SchemaVersion;
  completedFiles: number;
  totalFiles: number;
  currentFile: string | null;
  message: string;
}

export interface RealAnalysisFileSummary {
  schemaVersion: SchemaVersion;
  fileId: string;
  fileName: string;
  fileType: 'pdf' | 'docx' | 'xlsx' | 'xls' | 'image';
  size: number;
  status: 'queued' | 'reading' | 'ocr' | 'parsed' | 'failed';
}

export interface RealAnalysisFileDiagnostic {
  schemaVersion: SchemaVersion;
  fileId: string;
  safeFileName: string;
  fileType: RealAnalysisFileSummary['fileType'];
  parseStatus: RealAnalysisFileSummary['status'];
  parseDurationMs: number | null;
  ocrUsed: boolean;
  ocrWarningCodes: string[];
}

export interface RealAnalysisExtractionDiagnostic {
  schemaVersion: SchemaVersion;
  provider: string | null;
  model: string | null;
  extractionStartedAt: string | null;
  extractionDurationMs: number | null;
  requestCount: number;
  retryCount: number;
  repairCount: number;
  errorCode: RealAnalysisErrorCode | null;
  errorStage: string | null;
  providerHttpStatus: number | null;
  providerRequestId: string | null;
  timeoutMs: number | null;
  outputTruncated: boolean;
  schemaValid: boolean | null;
}

export interface RealAnalysisMatchingDiagnostic {
  schemaVersion: SchemaVersion;
  catalogVersion: number | null;
  extractedProductCount: number;
  matchGroupCount: number;
  matchingDurationMs: number | null;
  matchingErrorCode: string | null;
}

export interface RealAnalysisAttemptDiagnostic {
  schemaVersion: SchemaVersion;
  attemptNumber: number;
  jobId: string;
  customerId: string;
  status: RealAnalysisStatus;
  stage: RealAnalysisStage;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  files: RealAnalysisFileDiagnostic[];
  extraction: RealAnalysisExtractionDiagnostic;
  matching: RealAnalysisMatchingDiagnostic;
  failureStage: string | null;
  failureCode: RealAnalysisErrorCode | null;
  safeFailureMessage: string | null;
  statusHistory: Array<{ status: RealAnalysisStatus; stage: RealAnalysisStage; timestamp: string }>;
}

export interface RealAnalysisDiagnostics extends RealAnalysisAttemptDiagnostic {
  previousAttempts: RealAnalysisAttemptDiagnostic[];
}

export interface RealProductMatchGroup {
  schemaVersion: SchemaVersion;
  extractedProductId: string;
  results: ProductMatchResult[];
}

export interface RealAnalysisSnapshot {
  schemaVersion: SchemaVersion;
  jobId: string;
  customerId: string;
  status: RealAnalysisStatus;
  stage: RealAnalysisStage;
  progress: RealAnalysisProgress;
  files: RealAnalysisFileSummary[];
  parserWarnings: ParseWarning[];
  extractedProducts: ExtractedProductV1[];
  extractionWarnings: ExtractionWarning[];
  extractionMetrics: ProductExtractionMetrics | null;
  matchGroups: RealProductMatchGroup[];
  catalogVersion: number | null;
  error: RealAnalysisError | null;
  diagnostics: RealAnalysisDiagnostics;
  startedAt: string | null;
  finishedAt: string | null;
}

export type MatchDecision = 'accepted' | 'changed' | 'not-found' | 'pending';

export interface ConfirmedMatchResult {
  schemaVersion: SchemaVersion;
  extractedProductId: string;
  selectedProductId: string | null;
  originalMatchResult: ProductMatchResult | null;
  decision: MatchDecision;
  confirmedBy: 'local-user';
  confirmedAt: string | null;
  note: string;
}

export interface RealQuoteDraftItem {
  extractedProductId: string;
  productId: string;
  productName: string;
  model: string;
  quantity: number | null;
  quantityUnit: string | null;
  configuration: string;
  unitPrice: null;
  audit: {
    originalModel: string | null;
    originalMatchResult: ProductMatchResult | null;
    humanDecision: ConfirmedMatchResult;
  };
}

export interface RealQuoteDraftHandoff {
  schemaVersion: SchemaVersion;
  quoteId: string;
  customerId: string;
  sourceAnalysisJobId: string;
  items: RealQuoteDraftItem[];
  createdAt: string;
  pricingStatus: 'manual-input-required';
}

export interface CatalogReadiness {
  schemaVersion: SchemaVersion;
  ready: boolean;
  catalogVersion: number | null;
  productCount: number;
  message: string;
}
