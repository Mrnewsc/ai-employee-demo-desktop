import type {
  CatalogVersionInfo,
  ExcelImportOptions,
  ImportReport,
  ProductCandidateQuery,
  ProductListFilter,
  ProductRecord,
  ProductRepository,
} from './contracts';
import { importProductCatalogExcel } from './excel-importer';

interface StagedFileDescriptor {
  fileId: string;
  displayName: string;
  detectedType: 'pdf' | 'docx' | 'xlsx' | 'xls' | 'image';
  stagedPath: string;
}

export interface CatalogStagingService {
  getDescriptor(fileId: string): StagedFileDescriptor;
  cleanup(fileIds: string[]): Promise<void>;
}

interface PendingImport {
  report: ImportReport;
  expiresAt: number;
}

function serviceError(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

export class ProductCatalogService {
  private readonly pendingImports = new Map<string, PendingImport>();

  constructor(
    private readonly repository: ProductRepository,
    private readonly stagingService: CatalogStagingService,
    private readonly namespace: string,
    private readonly previewRetentionMs = 15 * 60 * 1000,
  ) {}

  async initialize(): Promise<void> {
    await this.repository.initialize();
  }

  async previewImport(fileId: string, fieldMapping?: ExcelImportOptions['fieldMapping']): Promise<ImportReport> {
    this.cleanupExpiredPreviews();
    const descriptor = this.stagingService.getDescriptor(fileId);
    if (descriptor.detectedType !== 'xlsx' && descriptor.detectedType !== 'xls') {
      throw serviceError('CATALOG_EXCEL_REQUIRED', '产品库仅支持XLSX或XLS文件');
    }
    try {
      const report = await importProductCatalogExcel(descriptor.stagedPath, descriptor.displayName, {
        namespace: this.namespace,
        fieldMapping,
      });
      this.pendingImports.set(report.importId, {
        report,
        expiresAt: Date.now() + this.previewRetentionMs,
      });
      return structuredClone(report);
    } finally {
      await this.stagingService.cleanup([fileId]);
    }
  }

  getImportReport(importId: string): ImportReport {
    this.cleanupExpiredPreviews();
    const pending = this.pendingImports.get(importId);
    if (!pending) throw serviceError('IMPORT_PREVIEW_NOT_FOUND', '导入预览不存在或已过期');
    return structuredClone(pending.report);
  }

  async confirmImport(importId: string): Promise<{ report: ImportReport; version: CatalogVersionInfo }> {
    this.cleanupExpiredPreviews();
    const pending = this.pendingImports.get(importId);
    if (!pending) throw serviceError('IMPORT_PREVIEW_NOT_FOUND', '导入预览不存在或已过期');
    if (pending.report.status !== 'ready' || pending.report.errors.length || pending.report.failedRows) {
      throw serviceError('IMPORT_HAS_ERRORS', '导入预览包含错误，当前产品库保持不变');
    }
    const committedAt = new Date().toISOString();
    const version = await this.repository.import(pending.report.previewRecords, {
      importId,
      sourceFile: pending.report.sourceFile,
      importedAt: committedAt,
    });
    pending.report = {
      ...pending.report,
      status: 'committed',
      committedAt,
      catalogVersion: version.currentVersion,
    };
    this.pendingImports.delete(importId);
    return { report: structuredClone(pending.report), version };
  }

  discardImport(importId: string): void {
    this.pendingImports.delete(importId);
  }

  list(filter?: ProductListFilter): Promise<ProductRecord[]> {
    return this.repository.list(filter);
  }

  getById(productId: string): Promise<ProductRecord | null> {
    return this.repository.getById(productId);
  }

  findByNormalizedModel(model: string): Promise<ProductRecord[]> {
    return this.repository.findByNormalizedModel(model);
  }

  searchCandidates(query: ProductCandidateQuery): Promise<ProductRecord[]> {
    return this.repository.searchCandidates(query);
  }

  getVersionInfo(): Promise<CatalogVersionInfo> {
    return this.repository.getVersionInfo();
  }

  rollbackPrevious(): Promise<CatalogVersionInfo> {
    return this.repository.rollbackPrevious();
  }

  private cleanupExpiredPreviews(): void {
    const now = Date.now();
    for (const [importId, pending] of this.pendingImports) {
      if (pending.expiresAt <= now) this.pendingImports.delete(importId);
    }
  }
}
