import type {
  ExtractedProduct,
  ParseWarning,
  ParseWarningCode,
  ParsedDocument,
  ParsedFileType,
  ProductEvidence,
  SourceLocation,
  VersionedContract,
} from '../types';
import type { RepairDiffDiagnostics } from './repair-diff';
import type { SchemaIssue } from './schema-validation-diagnostics';
import type { CanonicalizationAuditEntry } from './safe-canonicalization';

export type ExtractionField =
  | 'productName'
  | 'model'
  | 'quantity'
  | 'material'
  | 'process'
  | 'application'
  | 'notes'
  | `specifications.${string}`;

export interface ExtractionEvidenceItem extends VersionedContract {
  evidenceId: string;
  text: string;
  sourceFile: string;
  source: SourceLocation;
  confidence: number | null;
  kind: 'text' | 'table-cell' | 'ocr';
  warningCodes: ParseWarningCode[];
}

export interface ExtractionTextBlock extends VersionedContract {
  blockId: string;
  evidenceId: string;
  text: string;
  source: SourceLocation;
  confidence: number | null;
}

export interface ExtractionTableCell extends VersionedContract {
  evidenceId: string;
  displayValue: string;
  source: SourceLocation;
  confidence: number | null;
}

export interface ExtractionTable extends VersionedContract {
  tableId: string;
  title: string | null;
  headerRowCount: number;
  rows: ExtractionTableCell[][];
  source: SourceLocation;
}

export interface ExtractionInput extends VersionedContract {
  jobId: string;
  chunkId: string;
  documentId: string;
  fileName: string;
  fileType: ParsedFileType;
  textBlocks: ExtractionTextBlock[];
  tables: ExtractionTable[];
  evidenceItems: ExtractionEvidenceItem[];
  sourceLocations: SourceLocation[];
  parserWarnings: ParseWarning[];
  optionalContext: Record<string, string>;
}

export interface ProviderEvidenceReference {
  evidenceId: string;
  quote: string;
}

export interface ProviderWireProductDraft {
  productName: string | null;
  model: string | null;
  specifications: Record<string, string>;
  quantity: {
    value: number | null;
    unit: string | null;
    raw: string | null;
  };
  material: string | null;
  process: string | null;
  application: string | null;
  notes: string[];
  evidenceRefs: Record<string, ProviderEvidenceReference[]>;
}

export interface ProviderWirePayload extends VersionedContract {
  products: ProviderWireProductDraft[];
}

export type ProviderProductDraft = ProviderWireProductDraft;
export type ProviderExtractionPayload = ProviderWirePayload;

export interface ExtractionEvidence extends ProductEvidence {
  evidenceId: string;
  chunkId: string;
  sourceFile: string;
  confidence: number | null;
  originKind: 'text' | 'table-cell' | 'ocr';
}

export interface ConflictingValue extends VersionedContract {
  value: string;
  evidence: ExtractionEvidence[];
}

export interface ProductFieldConflict extends VersionedContract {
  field: ExtractionField;
  values: ConflictingValue[];
  message: string;
}

export type ExtractionWarningCode =
  | 'MISSING_CRITICAL_FIELD'
  | 'MISSING_FIELD_EVIDENCE'
  | 'UNKNOWN_EVIDENCE_REFERENCE'
  | 'EVIDENCE_REFERENCE_REPAIRED'
  | 'EVIDENCE_TEXT_MISMATCH'
  | 'MODEL_RESTORED_FROM_EVIDENCE'
  | 'OCR_LOW_CONFIDENCE'
  | 'OCR_MODEL_UNCERTAIN'
  | 'FIELD_CONFLICT'
  | 'UNCERTAIN_MERGE'
  | 'REPAIRED_MODEL_OUTPUT'
  | 'APPLICATION_RECLASSIFIED'
  | 'UNRESOLVED_PRODUCT_CANDIDATE'
  | 'EMPTY_PRODUCT_DROPPED'
  | 'CHUNK_LIMIT_REACHED';

export interface ExtractionWarning extends VersionedContract {
  code: ExtractionWarningCode;
  message: string;
  field: ExtractionField | null;
  productId: string | null;
  sourceFile: string | null;
  sourceLocations: SourceLocation[];
}

export interface ExtractedProductV1 extends ExtractedProduct {
  evidence: ExtractionEvidence[];
  conflicts: ProductFieldConflict[];
  reviewReasons: string[];
}

export interface ExtractionUsage extends VersionedContract {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface ProductExtractionMetrics extends VersionedContract {
  documentCount: number;
  chunkCount: number;
  requestCount: number;
  repairAttempts: number;
  inputCharacters: number;
  outputCharacters: number;
  durationMs: number;
  usage: ExtractionUsage;
}

export interface ProductExtractionResult extends VersionedContract {
  jobId: string;
  provider: string;
  model: string;
  products: ExtractedProductV1[];
  conflicts: ProductFieldConflict[];
  warnings: ExtractionWarning[];
  metrics: ProductExtractionMetrics;
  needsHumanReview: boolean;
  createdAt: string;
}

export type AIExtractionErrorCode =
  | 'AI_REQUEST_FAILED'
  | 'AI_HTTP_ERROR'
  | 'AI_INVALID_CONTENT_TYPE'
  | 'AI_EMPTY_HTTP_RESPONSE'
  | 'AI_INVALID_HTTP_RESPONSE'
  | 'AI_PROVIDER_ERROR'
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_EMPTY_RESPONSE'
  | 'AI_INVALID_JSON'
  | 'AI_SCHEMA_INVALID'
  | 'AI_REAL_PROVIDER_BLOCKED'
  | 'REPAIR_SEMANTIC_DRIFT'
  | 'AI_OUTPUT_TRUNCATED'
  | 'AI_EXTRACTION_FAILED'
  | 'AI_EXTRACTION_CANCELLED';

export interface ExtractionOptions {
  signal?: AbortSignal;
  optionalContext?: Record<string, string>;
  requestContext?: ExtractionRequestContext;
  onRequestRecord?: ExtractionRequestLogger;
  providerAttemptHooks?: ProviderAttemptHooks;
  onValidatedPayload?: ValidatedProviderPayloadLogger;
}

export interface ExtractionRequestContext {
  attemptId: string;
  requestAttempt: number;
  chunkIndex: number;
  totalChunks: number;
}

export interface ProviderAttemptStart {
  attemptId: string;
  jobId: string;
  chunkId: string;
  chunkIndex: number;
  requestAttempt: number;
  repairAttempt: number;
  provider: string;
  model: string;
  startedAt: string;
}

export interface ProviderAttemptFinish extends ProviderAttemptStart {
  status: 'completed' | 'failed';
  completedAt: string;
  durationMs: number;
  providerRequestId: string | null;
  errorCode: AIExtractionErrorCode | null;
}

export interface ProviderAttemptHooks {
  onStarted(attempt: ProviderAttemptStart): void | Promise<void>;
  onFinished(attempt: ProviderAttemptFinish): void | Promise<void>;
}

export interface ValidatedProviderPayloadRecord {
  jobId: string;
  chunkId: string;
  repaired: boolean;
  payload: ProviderExtractionPayload;
}

export type ValidatedProviderPayloadLogger = (record: ValidatedProviderPayloadRecord) => void;

export interface ProductExtractionProvider {
  readonly provider: string;
  readonly model: string;
  extract(input: ExtractionInput, options?: ExtractionOptions): Promise<ProductExtractionResult>;
}

export interface AIProviderConfig {
  provider: 'deepseek';
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  maxRepairAttempts: 0 | 1;
  maxOutputTokens: number;
  thinkingMode?: 'enabled' | 'disabled';
}

export interface ExtractionAuditEvent extends VersionedContract {
  timestamp: string;
  jobId: string;
  chunkId: string | null;
  provider: string;
  model: string;
  event: 'request-started' | 'request-completed' | 'canonicalization-applied' | 'canonicalization-rejected' | 'repair-started' | 'repair-completed' | 'repair-rejected' | 'request-failed';
  durationMs: number | null;
  productCount: number | null;
  errorCode: AIExtractionErrorCode | null;
  repairAttempts: number;
  schemaIssues: SchemaIssue[];
  repairDiagnostics: RepairDiffDiagnostics | null;
  canonicalizationRules: CanonicalizationAuditEntry[];
  canonicalizationRejectedCount: number;
}

export type ExtractionAuditLogger = (event: ExtractionAuditEvent) => void;

export interface ExtractionRequestRecord extends VersionedContract {
  requestId: string;
  sampleId: string;
  chunkId: string;
  startedAt: string;
  durationMs: number;
  inputChars: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  schemaValid: boolean;
  repairAttempt: number;
  productCount: number | null;
  errorCode: AIExtractionErrorCode | null;
  attemptId: string | null;
  requestAttempt: number;
  httpStatus: number | null;
  responseContentType: string | null;
  responseBodyLength: number | null;
  responseKind: ProviderResponseKind | null;
  providerRequestId: string | null;
  errorStage: ExtractionErrorStage | null;
  thinkingMode: 'enabled' | 'disabled';
  schemaIssues: SchemaIssue[];
}

export type ExtractionRequestLogger = (record: ExtractionRequestRecord) => void;

export interface ExtractDocumentsOptions extends ExtractionOptions {
  jobId?: string;
  chunkConfig?: Partial<ExtractionChunkConfig>;
  executionConfig?: Partial<ExtractionExecutionConfig>;
  chunkAuditLogger?: ChunkAuditLogger;
}

export interface ExtractionChunkConfig {
  maxTextCharacters: number;
  maxTableRows: number;
  maxChunksPerDocument: number;
  maxConcurrentRequests: number;
}

export interface ExtractionExecutionConfig {
  maxConcurrentExtractionRequests: number;
  maxProviderRetries: number;
  providerRetryDelayMs: number;
  attemptTimeoutMs: number | null;
}

export type ExtractionJobStatus = 'queued' | 'running' | 'completed' | 'partial-failed' | 'failed' | 'cancelled';
export type ExtractionChunkStatus = 'queued' | 'running' | 'completed' | 'retrying' | 'failed' | 'cancelled';
export type ProviderResponseKind = 'json' | 'html' | 'text/plain' | 'empty' | 'unknown';
export type ExtractionErrorStage = 'transport' | 'http' | 'response-envelope' | 'provider' | 'schema' | 'repair' | 'cancel' | 'unknown';

export interface SafeProviderDiagnostics {
  httpStatus: number | null;
  responseContentType: string | null;
  responseBodyLength: number | null;
  responseKind: ProviderResponseKind | null;
  providerRequestId: string | null;
  errorStage: ExtractionErrorStage;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
}

export interface ChunkAttemptAudit extends VersionedContract {
  jobId: string;
  attemptId: string;
  chunkId: string;
  chunkIndex: number;
  totalChunks: number;
  status: ExtractionChunkStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  provider: string;
  model: string;
  inputChars: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  requestAttempt: number;
  repairAttempt: number;
  httpStatus: number | null;
  responseContentType: string | null;
  responseBodyLength: number | null;
  responseKind: ProviderResponseKind | null;
  providerRequestId: string | null;
  schemaValid: boolean | null;
  productCount: number | null;
  errorCode: AIExtractionErrorCode | null;
  errorStage: ExtractionErrorStage | null;
  thinkingMode: 'enabled' | 'disabled' | null;
  schemaIssues: SchemaIssue[];
}

export interface ChunkExtractionAudit extends VersionedContract {
  jobId: string;
  chunkId: string;
  chunkIndex: number;
  totalChunks: number;
  status: ExtractionChunkStatus;
  requestAttemptCount: number;
  providerRetryCount: number;
  repairAttemptCount: number;
  attempts: ChunkAttemptAudit[];
}

export interface LargeDocumentExtractionAudit extends VersionedContract {
  jobId: string;
  status: ExtractionJobStatus;
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  retriedChunks: number;
  peakConcurrency: number;
  providerRequestCount: number;
  totalDurationMs: number;
  usage: ExtractionUsage;
  failedChunkIds: string[];
  errorCodes: AIExtractionErrorCode[];
  chunks: ChunkExtractionAudit[];
}

export interface ExtractionJobOutcome extends VersionedContract {
  jobId: string;
  status: ExtractionJobStatus;
  successfulChunkCount: number;
  failedChunkCount: number;
  failedChunkIds: string[];
  result: ProductExtractionResult | null;
  audit: LargeDocumentExtractionAudit;
}

export type ChunkAuditLogger = (audit: ChunkExtractionAudit) => void;

export interface ExtractionServiceInput {
  documents: ParsedDocument[];
  provider: ProductExtractionProvider;
  options?: ExtractDocumentsOptions;
}
