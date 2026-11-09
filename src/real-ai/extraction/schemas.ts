import { z } from 'zod';

const schemaVersion = z.literal('1.0');
const bbox = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const SourceLocationSchema = z.discriminatedUnion('kind', [
  z.object({ schemaVersion, kind: z.literal('pdf'), page: z.number().int().positive(), bbox: bbox.optional() }).strict(),
  z.object({
    schemaVersion,
    kind: z.literal('docx'),
    paragraph: z.number().int().nonnegative().optional(),
    table: z.number().int().nonnegative().optional(),
    row: z.number().int().nonnegative().optional(),
    cell: z.number().int().nonnegative().optional(),
    image: z.number().int().nonnegative().optional(),
  }).strict(),
  z.object({
    schemaVersion,
    kind: z.literal('sheet'),
    sheet: z.string().min(1),
    cell: z.string().optional(),
    range: z.string().optional(),
    row: z.number().int().positive().optional(),
    column: z.number().int().positive().optional(),
  }).strict(),
  z.object({ schemaVersion, kind: z.literal('image'), imageId: z.string().min(1), bbox: bbox.optional() }).strict(),
]);

const ProviderEvidenceReferenceSchema = z.object({
  evidenceId: z.string().min(1).max(300),
  quote: z.string().min(1).max(4_000),
}).strict();

const ProviderProductDraftSchema = z.object({
  productName: z.string().min(1).max(500).nullable(),
  model: z.string().min(1).max(300).nullable(),
  specifications: z.record(z.string().min(1).max(200), z.string().max(2_000)),
  quantity: z.object({
    value: z.number().finite().nullable(),
    unit: z.string().min(1).max(100).nullable(),
    raw: z.string().min(1).max(500).nullable(),
  }).strict(),
  material: z.string().min(1).max(1_000).nullable(),
  process: z.string().min(1).max(1_000).nullable(),
  application: z.string().min(1).max(2_000).nullable(),
  notes: z.array(z.string().min(1).max(2_000)).max(50),
  evidenceRefs: z.record(
    z.string().regex(/^(productName|model|quantity|material|process|application|notes|specifications\..+)$/),
    z.array(ProviderEvidenceReferenceSchema).max(20),
  ),
}).strict();

export const ProviderExtractionPayloadSchema = z.object({
  schemaVersion,
  products: z.array(ProviderProductDraftSchema).max(100),
}).strict();

const ExtractionEvidenceSchema = z.object({
  schemaVersion,
  field: z.string().min(1),
  text: z.string().min(1),
  source: SourceLocationSchema,
  evidenceId: z.string().min(1),
  chunkId: z.string().min(1),
  sourceFile: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable(),
  originKind: z.enum(['text', 'table-cell', 'ocr']),
}).strict();

const ProductFieldConflictSchema = z.object({
  schemaVersion,
  field: z.string().min(1),
  values: z.array(z.object({
    schemaVersion,
    value: z.string(),
    evidence: z.array(ExtractionEvidenceSchema),
  }).strict()).min(2),
  message: z.string().min(1),
}).strict();

const ExtractedProductSchema = z.object({
  schemaVersion,
  id: z.string().min(1),
  productName: z.string().min(1).nullable(),
  model: z.string().min(1).nullable(),
  specifications: z.record(z.string(), z.string()),
  quantity: z.object({ schemaVersion, value: z.number().finite().nullable(), unit: z.string().nullable(), raw: z.string().nullable() }).strict(),
  material: z.string().nullable(),
  process: z.string().nullable(),
  application: z.string().nullable(),
  notes: z.array(z.string()),
  sourceFile: z.string().min(1),
  sourceLocations: z.array(SourceLocationSchema),
  evidence: z.array(ExtractionEvidenceSchema),
  confidence: z.number().min(0).max(1),
  fieldConfidence: z.record(z.string(), z.number().min(0).max(1)),
  needsHumanReview: z.boolean(),
  conflicts: z.array(ProductFieldConflictSchema),
  reviewReasons: z.array(z.string()),
}).strict();

const ExtractionWarningSchema = z.object({
  schemaVersion,
  code: z.enum([
    'MISSING_CRITICAL_FIELD',
    'MISSING_FIELD_EVIDENCE',
    'UNKNOWN_EVIDENCE_REFERENCE',
    'EVIDENCE_REFERENCE_REPAIRED',
    'EVIDENCE_TEXT_MISMATCH',
    'MODEL_RESTORED_FROM_EVIDENCE',
    'OCR_LOW_CONFIDENCE',
    'OCR_MODEL_UNCERTAIN',
    'FIELD_CONFLICT',
    'UNCERTAIN_MERGE',
    'REPAIRED_MODEL_OUTPUT',
    'APPLICATION_RECLASSIFIED',
    'UNRESOLVED_PRODUCT_CANDIDATE',
    'EMPTY_PRODUCT_DROPPED',
    'CHUNK_LIMIT_REACHED',
  ]),
  message: z.string().min(1),
  field: z.string().nullable(),
  productId: z.string().nullable(),
  sourceFile: z.string().nullable(),
  sourceLocations: z.array(SourceLocationSchema),
}).strict();

export const ProductExtractionResultSchema = z.object({
  schemaVersion,
  jobId: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  products: z.array(ExtractedProductSchema),
  conflicts: z.array(ProductFieldConflictSchema),
  warnings: z.array(ExtractionWarningSchema),
  metrics: z.object({
    schemaVersion,
    documentCount: z.number().int().nonnegative(),
    chunkCount: z.number().int().nonnegative(),
    requestCount: z.number().int().nonnegative(),
    repairAttempts: z.number().int().nonnegative(),
    inputCharacters: z.number().int().nonnegative(),
    outputCharacters: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
    usage: z.object({
      schemaVersion,
      promptTokens: z.number().int().nonnegative().nullable(),
      completionTokens: z.number().int().nonnegative().nullable(),
      totalTokens: z.number().int().nonnegative().nullable(),
    }).strict(),
  }).strict(),
  needsHumanReview: z.boolean(),
  createdAt: z.string().datetime(),
}).strict();
