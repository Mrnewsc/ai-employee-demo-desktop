const { z } = require('zod');

const schemaVersion = z.literal('1.0');
const idSchema = (prefix) => z.string().regex(new RegExp(`^${prefix}_[a-f0-9-]{12,}$`));
const bboxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

const SourceLocationSchema = z.discriminatedUnion('kind', [
  z.object({
    schemaVersion,
    kind: z.literal('pdf'),
    page: z.number().int().positive(),
    bbox: bboxSchema.optional(),
  }),
  z.object({
    schemaVersion,
    kind: z.literal('docx'),
    paragraph: z.number().int().positive().optional(),
    table: z.number().int().positive().optional(),
    row: z.number().int().positive().optional(),
    cell: z.number().int().positive().optional(),
    image: z.number().int().positive().optional(),
  }),
  z.object({
    schemaVersion,
    kind: z.literal('sheet'),
    sheet: z.string().min(1),
    cell: z.string().optional(),
    range: z.string().optional(),
    row: z.number().int().positive().optional(),
    column: z.number().int().positive().optional(),
  }),
  z.object({
    schemaVersion,
    kind: z.literal('image'),
    imageId: z.string().min(1),
    bbox: bboxSchema.optional(),
  }),
]);

const ParseWarningSchema = z.object({
  schemaVersion,
  code: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(['info', 'warning']),
  source: SourceLocationSchema.optional(),
});

const ParsedCellSchema = z.object({
  schemaVersion,
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  displayValue: z.string(),
  formula: z.string().optional(),
  source: SourceLocationSchema,
});

const ParsedTableSchema = z.object({
  schemaVersion,
  id: z.string().min(1),
  title: z.string().optional(),
  rows: z.array(z.array(ParsedCellSchema)),
  source: SourceLocationSchema,
  confidence: z.number().min(0).max(1),
  headerRowCount: z.number().int().nonnegative().optional(),
});

const ParsedImageSchema = z.object({
  schemaVersion,
  id: z.string().min(1),
  mimeType: z.string().min(1),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  byteSize: z.number().int().nonnegative().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  role: z.enum(['embedded', 'page-render', 'source-image']),
  source: SourceLocationSchema,
  ocrText: z.string().optional(),
  ocrConfidence: z.number().min(0).max(1).optional(),
});

const DocumentBlockSchema = z.object({
  schemaVersion,
  id: z.string().min(1),
  type: z.enum(['heading', 'paragraph', 'list-item', 'table-caption', 'ocr-line']),
  text: z.string(),
  source: SourceLocationSchema,
  confidence: z.number().min(0).max(1).optional(),
});

const ParsedDocumentSchema = z.object({
  schemaVersion,
  fileId: z.string().min(1),
  fileName: z.string().min(1),
  fileType: z.enum(['pdf', 'docx', 'xlsx', 'xls', 'image']),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  rawText: z.string(),
  blocks: z.array(DocumentBlockSchema),
  tables: z.array(ParsedTableSchema),
  images: z.array(ParsedImageSchema),
  metadata: z.object({
    schemaVersion,
    parser: z.string().min(1),
    parserVersion: z.string().optional(),
    parseDurationMs: z.number().nonnegative(),
    peakRssBytes: z.number().nonnegative().optional(),
    pageCount: z.number().int().nonnegative().optional(),
    sheetCount: z.number().int().nonnegative().optional(),
    sheetNames: z.array(z.string()).optional(),
    paragraphCount: z.number().int().nonnegative().optional(),
  }).catchall(z.unknown()),
  warnings: z.array(ParseWarningSchema),
});

const FileSourceDescriptorSchema = z.object({
  schemaVersion,
  fileId: idSchema('file'),
  displayName: z.string().min(1).max(260),
  size: z.number().int().positive(),
  declaredMimeType: z.string().max(200),
  detectedType: z.enum(['pdf', 'docx', 'xlsx', 'xls', 'image']),
  detectedMimeType: z.string().min(1),
  stagedPath: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
});

const StagedFileTokenSchema = FileSourceDescriptorSchema.omit({
  detectedMimeType: true,
  stagedPath: true,
});

const AnalysisErrorResultSchema = z.object({
  schemaVersion,
  code: z.enum([
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
  ]),
  message: z.string().min(1).max(500),
  retryable: z.boolean(),
});

const AnalysisProgressSchema = z.object({
  schemaVersion,
  completedFiles: z.number().int().nonnegative(),
  totalFiles: z.number().int().positive(),
  currentFile: z.string().max(260).optional(),
});

const AnalysisJobSnapshotSchema = z.object({
  schemaVersion,
  jobId: idSchema('job'),
  fileIds: z.array(idSchema('file')).min(1),
  status: z.enum([
    'queued',
    'staging',
    'parsing',
    'ocr',
    'normalizing',
    'completed',
    'failed',
    'cancelled',
  ]),
  stage: z.enum([
    'queued',
    'copying-files',
    'reading-file',
    'parsing-document',
    'rendering-page',
    'recognizing-text',
    'validating-result',
    'cleaning-up',
    'complete',
    'failed',
    'cancelled',
  ]),
  progress: AnalysisProgressSchema,
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  warnings: z.array(ParseWarningSchema),
  error: AnalysisErrorResultSchema.nullable(),
  documents: z.array(ParsedDocumentSchema).optional(),
  resourcesCleaned: z.boolean(),
});

const StagePathEntriesSchema = z.array(z.object({
  sourcePath: z.string().min(1).max(32_767),
  displayName: z.string().min(1).max(260).optional(),
  declaredMimeType: z.string().max(200).default(''),
})).min(1).max(10);

const FileIdsRequestSchema = z.object({
  fileIds: z.array(idSchema('file')).min(1).max(10),
});

const JobIdRequestSchema = z.object({
  jobId: idSchema('job'),
});

function validate(schema, value, label) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const error = new Error(`${label}运行时Schema验证失败`);
  error.code = 'INVALID_REQUEST';
  error.validationIssues = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
  throw error;
}

module.exports = {
  AnalysisErrorResultSchema,
  AnalysisJobSnapshotSchema,
  FileIdsRequestSchema,
  FileSourceDescriptorSchema,
  JobIdRequestSchema,
  ParsedDocumentSchema,
  StagePathEntriesSchema,
  StagedFileTokenSchema,
  validate,
};
