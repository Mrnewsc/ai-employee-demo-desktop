import type { CatalogFieldMapping, ImportIssue, ImportRowResult, ProductRecord } from '../real-ai/catalog/contracts';
import type { StagedFileToken } from '../real-ai/types';

export type CatalogSummary = {
  schemaVersion: '1.0';
  configured: boolean;
  productCount: number;
  activeCount: number;
  inactiveCount: number;
  currentVersion: number | null;
  currentVersionLabel: string;
  updatedAt: string | null;
  lastImportStatus: 'success' | 'preview-ready' | 'invalid' | 'failed' | 'rollback-success' | 'none';
  matchEngineVersion: number | null;
  matchEngineVersionLabel: string;
  sourceType: 'import' | 'rollback' | null;
  sourceFile: string;
};

export type CatalogListQuery = {
  search: string;
  status: 'all' | 'active' | 'inactive';
  category: string;
  sort: 'updated-desc' | 'name-asc' | 'model-asc';
  page: number;
  pageSize: 20 | 50 | 100;
};

export type CatalogProductPage = {
  schemaVersion: '1.0';
  items: ProductRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  categories: string[];
};

export type CatalogProductDetail = { schemaVersion: '1.0'; product: ProductRecord; catalogVersion: number | null };

export type CatalogImportPreview = {
  schemaVersion: '1.0';
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
};

export type CatalogVersionRow = {
  schemaVersion: '1.0';
  version: number;
  versionLabel: string;
  createdAt: string | null;
  productCount: number | null;
  sourceFile: string | null;
  operation: 'import' | 'rollback' | null;
  restoredFromVersion: number | null;
  isCurrent: boolean;
  isPrevious: boolean;
  canRollback: boolean;
  detailAvailable: boolean;
};

export type CatalogVersions = {
  schemaVersion: '1.0';
  currentVersion: number | null;
  previousVersion: number | null;
  items: CatalogVersionRow[];
};

export interface CatalogManagementApi {
  selectImportFile(): Promise<StagedFileToken | null>;
  summary(): Promise<CatalogSummary>;
  list(query: CatalogListQuery): Promise<CatalogProductPage>;
  detail(productId: string): Promise<CatalogProductDetail>;
  previewImport(fileId: string): Promise<CatalogImportPreview>;
  commitImport(importId: string): Promise<{ report: CatalogImportPreview; version: { currentVersion: number; previousVersion: number | null; productCount: number; updatedAt: string } }>;
  discardImport(importId: string): Promise<{ discarded: boolean }>;
  versions(): Promise<CatalogVersions>;
  rollback(targetVersion: number): Promise<{ restoredFromVersion: number; version: { currentVersion: number; previousVersion: number | null; productCount: number; updatedAt: string } }>;
  saveTemplate(): Promise<{ saved: boolean; fileName: string | null }>;
}
