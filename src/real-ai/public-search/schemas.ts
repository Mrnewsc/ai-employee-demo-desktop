import { z } from 'zod';

const schemaVersion = z.literal('1.0');
const sourceLocation = z.discriminatedUnion('kind', [
  z.object({ schemaVersion, kind: z.literal('pdf'), page: z.number().int().positive(), bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional() }),
  z.object({ schemaVersion, kind: z.literal('docx'), paragraph: z.number().int().positive().optional(), table: z.number().int().positive().optional(), row: z.number().int().positive().optional(), cell: z.number().int().positive().optional(), image: z.number().int().positive().optional() }),
  z.object({ schemaVersion, kind: z.literal('sheet'), sheet: z.string(), cell: z.string().optional(), range: z.string().optional(), row: z.number().int().positive().optional(), column: z.number().int().positive().optional() }),
  z.object({ schemaVersion, kind: z.literal('image'), imageId: z.string(), bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional() }),
]);

export const PublicProductSearchRequestSchema = z.object({
  schemaVersion,
  requestId: z.string().min(1),
  extractedProductId: z.string().min(1),
  productName: z.string().min(1).nullable(),
  model: z.string().min(1).nullable(),
  specifications: z.record(z.string(), z.string()),
  material: z.string().min(1).nullable(),
  application: z.string().min(1).nullable(),
  category: z.string().min(1).nullable(),
  keywords: z.array(z.string().min(1)),
  customerEvidence: z.array(z.object({
    schemaVersion,
    field: z.string().min(1),
    text: z.string().min(1),
    sourceFile: z.string().min(1),
    source: sourceLocation,
  })),
  imageReferences: z.array(z.object({
    schemaVersion,
    imageId: z.string().min(1),
    sourceFile: z.string().min(1),
    mimeType: z.string().min(1).nullable(),
    page: z.number().int().positive().nullable(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
    sha256: z.string().min(1).nullable(),
    availableForVisualSearch: z.boolean(),
  })),
  searchReason: z.enum(['catalog-none', 'manual-search', 'test-harness']),
}).superRefine((value, context) => {
  if (!value.productName && !value.model) {
    context.addIssue({ code: 'custom', path: ['productName'], message: '公开候选检索至少需要产品名称或型号' });
  }
});

const sourceEvidence = z.object({
  schemaVersion,
  evidenceId: z.string().min(1),
  evidenceType: z.enum(['search-result', 'public-page', 'structured-data', 'meta']),
  sourceUrl: z.string().url(),
  retrievedAt: z.string().datetime(),
  title: z.string().min(1),
  snippet: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
  supportsFields: z.array(z.string().min(1)),
});

export const PublicProductCandidateSchema = z.object({
  schemaVersion,
  candidateId: z.string().min(1),
  title: z.string().min(1),
  normalizedTitle: z.string().min(1),
  source: z.string().min(1),
  sourceType: z.enum(['marketplace', 'manufacturer', 'supplier-directory', 'search-engine-index', 'public-web', 'manual']),
  url: z.string().url(),
  domain: z.string().min(1),
  imageUrl: z.string().url().nullable(),
  priceText: z.string().nullable(),
  currency: z.string().nullable(),
  moq: z.string().nullable(),
  supplierName: z.string().nullable(),
  location: z.string().nullable(),
  specifications: z.record(z.string(), z.string()),
  material: z.string().nullable(),
  description: z.string().nullable(),
  searchQuery: z.string().min(1),
  matchedSignals: z.array(z.string()),
  conflictingSignals: z.array(z.string()),
  score: z.number().min(0).max(1),
  retrievedAt: z.string().datetime(),
  needsHumanReview: z.literal(true),
  sourceEvidence: z.array(sourceEvidence).min(1),
});

