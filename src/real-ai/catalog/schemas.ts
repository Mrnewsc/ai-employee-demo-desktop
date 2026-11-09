import { z } from 'zod';

const schemaVersion = z.literal('1.0');

export const ProductSpecificationSchema = z.object({
  schemaVersion,
  rawName: z.string().min(1).max(200),
  normalizedName: z.string().min(1).max(200),
  rawValue: z.string().max(1000),
  normalizedValue: z.string().max(1000),
  unit: z.string().max(20).nullable(),
  baseValue: z.number().finite().nullable(),
  baseUnit: z.string().max(20).nullable(),
  valueType: z.enum(['number', 'text']),
  parseStatus: z.enum(['normalized', 'raw']),
});

export const ProductRecordSchema = z.object({
  schemaVersion,
  productId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/),
  productName: z.string().min(1).max(200),
  model: z.string().max(120),
  category: z.string().max(120),
  specifications: z.record(z.string(), z.string().max(1000)),
  specificationDetails: z.array(ProductSpecificationSchema).max(100),
  applications: z.array(z.string().max(300)).max(100),
  keywords: z.array(z.string().max(100)).max(100),
  synonyms: z.array(z.string().max(200)).max(100),
  description: z.string().max(5000),
  status: z.enum(['active', 'inactive']),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  source: z.object({
    schemaVersion,
    type: z.enum(['excel', 'manual', 'system']),
    importId: z.string().min(1).max(100),
    fileName: z.string().min(1).max(260),
    sheet: z.string().min(1).max(200),
  }),
  sourceRow: z.number().int().positive(),
  normalizedName: z.string().min(1).max(200),
  normalizedModel: z.string().max(120),
});

export const CatalogSnapshotSchema = z.object({
  schemaVersion,
  catalogVersion: z.number().int().positive(),
  createdAt: z.string().datetime(),
  source: z.object({
    type: z.enum(['import', 'rollback']),
    importId: z.string().min(1).max(100),
    sourceFile: z.string().min(1).max(260),
    restoredFromVersion: z.number().int().positive().optional(),
  }),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  products: z.array(ProductRecordSchema),
});

export const CatalogManifestSchema = z.object({
  schemaVersion,
  currentVersion: z.number().int().positive().nullable(),
  previousVersion: z.number().int().positive().nullable(),
  updatedAt: z.string().datetime().nullable(),
});
