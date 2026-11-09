import type { SchemaVersion, VersionedContract } from '../types';

export type ProductStatus = 'active' | 'inactive';

export interface ProductSource extends VersionedContract {
  type: 'excel' | 'manual' | 'system';
  importId: string;
  fileName: string;
  sheet: string;
}

export interface ProductSpecification extends VersionedContract {
  rawName: string;
  normalizedName: string;
  rawValue: string;
  normalizedValue: string;
  unit: string | null;
  baseValue: number | null;
  baseUnit: string | null;
  valueType: 'number' | 'text';
  parseStatus: 'normalized' | 'raw';
}

export interface ProductRecord extends VersionedContract {
  productId: string;
  productName: string;
  model: string;
  category: string;
  specifications: Record<string, string>;
  specificationDetails: ProductSpecification[];
  applications: string[];
  keywords: string[];
  synonyms: string[];
  description: string;
  status: ProductStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  source: ProductSource;
  sourceRow: number;
  normalizedName: string;
  normalizedModel: string;
}

export type CatalogField =
  | 'productId'
  | 'productName'
  | 'model'
  | 'category'
  | 'applications'
  | 'keywords'
  | 'synonyms'
  | 'description'
  | 'status';

export type CatalogColumnTarget = CatalogField | `specification.${string}`;

export interface CatalogFieldMapping {
  sourceColumn: string;
  target: CatalogColumnTarget;
  confidence: 'exact' | 'alias' | 'manual';
}

export type ImportIssueSeverity = 'warning' | 'error';

export interface ImportIssue extends VersionedContract {
  severity: ImportIssueSeverity;
  sheet: string;
  row: number;
  column: string;
  field: string;
  code: string;
  message: string;
}

export interface ImportRowResult extends VersionedContract {
  sheet: string;
  row: number;
  status: 'success' | 'warning' | 'failed';
  productId: string | null;
  productName: string;
  model: string;
  issues: ImportIssue[];
}

export interface ImportReport extends VersionedContract {
  importId: string;
  sourceFile: string;
  status: 'ready' | 'invalid' | 'committed';
  totalRows: number;
  successRows: number;
  warningRows: number;
  failedRows: number;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  rows: ImportRowResult[];
  fieldMappings: CatalogFieldMapping[];
  previewRecords: ProductRecord[];
  createdAt: string;
  committedAt: string | null;
  catalogVersion: number | null;
}

export interface ProductCandidateQuery {
  productName?: string;
  model?: string;
  category?: string;
  keywords?: string[];
  limit?: number;
}

export interface ProductListFilter {
  category?: string;
  status?: ProductStatus;
}

export interface CatalogImportContext {
  importId: string;
  sourceFile: string;
  importedAt: string;
}

export interface CatalogVersionInfo extends VersionedContract {
  currentVersion: number | null;
  previousVersion: number | null;
  productCount: number;
  updatedAt: string | null;
}

export interface CatalogSnapshot {
  schemaVersion: SchemaVersion;
  catalogVersion: number;
  createdAt: string;
  source: {
    type: 'import' | 'rollback';
    importId: string;
    sourceFile: string;
    restoredFromVersion?: number;
  };
  checksum: string;
  products: ProductRecord[];
}

export interface ProductRepository {
  initialize(): Promise<void>;
  list(filter?: ProductListFilter): Promise<ProductRecord[]>;
  getById(productId: string): Promise<ProductRecord | null>;
  findByNormalizedModel(model: string): Promise<ProductRecord[]>;
  searchCandidates(query: ProductCandidateQuery): Promise<ProductRecord[]>;
  import(records: ProductRecord[], context: CatalogImportContext): Promise<CatalogVersionInfo>;
  getVersionInfo(): Promise<CatalogVersionInfo>;
  getCurrentSnapshot(): Promise<CatalogSnapshot | null>;
  getPreviousSnapshot(): Promise<CatalogSnapshot | null>;
  rollbackPrevious(): Promise<CatalogVersionInfo>;
}

export interface ExcelImportOptions {
  namespace: string;
  fieldMapping?: Record<string, CatalogColumnTarget>;
  now?: string;
}
