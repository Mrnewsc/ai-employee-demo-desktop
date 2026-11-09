import { z } from 'zod';

const schemaVersion = z.literal('1.0');
const extractionWarningCode = z.enum([
  'MISSING_CRITICAL_FIELD', 'MISSING_FIELD_EVIDENCE', 'UNKNOWN_EVIDENCE_REFERENCE',
  'EVIDENCE_REFERENCE_REPAIRED', 'EVIDENCE_TEXT_MISMATCH', 'MODEL_RESTORED_FROM_EVIDENCE',
  'OCR_LOW_CONFIDENCE', 'OCR_MODEL_UNCERTAIN', 'FIELD_CONFLICT', 'UNCERTAIN_MERGE',
  'REPAIRED_MODEL_OUTPUT', 'APPLICATION_RECLASSIFIED', 'UNRESOLVED_PRODUCT_CANDIDATE',
  'EMPTY_PRODUCT_DROPPED', 'CHUNK_LIMIT_REACHED',
]);
const extractionField = z.union([
  z.enum(['productName', 'model', 'quantity', 'material', 'process', 'application', 'notes']),
  z.custom<`specifications.${string}`>((value) => typeof value === 'string' && value.startsWith('specifications.') && value.length > 'specifications.'.length),
]);
const sourceLocation = z.discriminatedUnion('kind', [
  z.object({ schemaVersion, kind: z.literal('pdf'), page: z.number().int().positive(), bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional() }),
  z.object({ schemaVersion, kind: z.literal('docx'), paragraph: z.number().int().positive().optional(), table: z.number().int().positive().optional(), row: z.number().int().positive().optional(), cell: z.number().int().positive().optional(), image: z.number().int().positive().optional() }),
  z.object({ schemaVersion, kind: z.literal('sheet'), sheet: z.string(), cell: z.string().optional(), range: z.string().optional(), row: z.number().int().positive().optional(), column: z.number().int().positive().optional() }),
  z.object({ schemaVersion, kind: z.literal('image'), imageId: z.string(), bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional() }),
]);

const matchRule = z.object({
  schemaVersion,
  code: z.string().min(1),
  dimension: z.enum(['input', 'model', 'name', 'specification', 'application', 'semantic']),
  description: z.string().min(1),
  customerValue: z.string().nullable(),
  catalogValue: z.string().nullable(),
  importance: z.enum(['hard', 'soft', 'informational']).nullable(),
});

const matchEvidence = z.object({
  schemaVersion,
  side: z.enum(['customer', 'catalog', 'rule']),
  dimension: z.enum(['input', 'model', 'name', 'specification', 'application', 'semantic']),
  field: z.string(),
  value: z.string(),
  description: z.string(),
  sourceFile: z.string().nullable(),
  source: sourceLocation.nullable(),
  catalogProductId: z.string().nullable(),
  catalogVersion: z.number().int().positive().nullable(),
});

const extractedSnapshot = z.object({
  schemaVersion,
  id: z.string().min(1),
  productName: z.string().nullable(),
  model: z.string().nullable(),
  specifications: z.record(z.string(), z.string()),
  material: z.string().nullable(),
  process: z.string().nullable(),
  application: z.string().nullable(),
  sourceFile: z.string(),
  needsHumanReview: z.boolean(),
  warnings: z.array(z.object({
    schemaVersion,
    code: extractionWarningCode,
    message: z.string(),
    field: extractionField.nullable(),
    productId: z.string().nullable(),
    sourceFile: z.string().nullable(),
    sourceLocations: z.array(sourceLocation),
  })),
  conflicts: z.array(z.object({
    field: z.string(),
    message: z.string(),
    values: z.array(z.string()),
  })),
});

const candidateSnapshot = z.object({
  schemaVersion,
  productId: z.string(),
  productName: z.string(),
  model: z.string(),
  category: z.string(),
  specifications: z.record(z.string(), z.string()),
  applications: z.array(z.string()),
  keywords: z.array(z.string()),
  synonyms: z.array(z.string()),
  status: z.enum(['active', 'inactive']),
  version: z.number().int().positive(),
});

export const ProductMatchResultSchema = z.object({
  schemaVersion,
  matchId: z.string().min(1),
  extractedProductId: z.string().min(1),
  extractedProductSnapshot: extractedSnapshot,
  candidateProductId: z.string().nullable(),
  candidateProductSnapshot: candidateSnapshot.nullable(),
  candidateRank: z.number().int().positive().nullable(),
  status: z.enum(['matched', 'candidate', 'unresolved', 'none']),
  level: z.enum(['exact', 'high', 'medium', 'low', 'none']),
  score: z.number().min(0).max(1).nullable(),
  matchedRules: z.array(matchRule),
  conflictingRules: z.array(matchRule),
  evidence: z.array(matchEvidence),
  needsHumanReview: z.boolean(),
  reviewStatus: z.enum(['not_required', 'pending']),
  reviewReasons: z.array(z.string()),
  catalogVersion: z.number().int().positive().nullable(),
  createdAt: z.string().datetime(),
}).superRefine((value, context) => {
  if (value.level === 'none' && value.candidateProductId !== null) {
    context.addIssue({ code: 'custom', message: 'none结果不能携带候选产品', path: ['candidateProductId'] });
  }
  if (value.candidateProductId === null && value.candidateProductSnapshot !== null) {
    context.addIssue({ code: 'custom', message: '空候选ID不能携带产品快照', path: ['candidateProductSnapshot'] });
  }
});
