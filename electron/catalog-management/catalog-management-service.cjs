const fs = require('node:fs/promises');
const path = require('node:path');
const { JsonProductRepository, ProductCatalogService } = require('../real-ai/catalog/runtime/catalog-runtime.cjs');
const { FileStagingService } = require('../real-ai/file-staging-service.cjs');

function catalogError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeSearch(value) {
  return String(value ?? '').trim().toLocaleLowerCase('zh-CN');
}

function safeName(value) {
  return value ? path.basename(String(value)) : '';
}

function versionLabel(version) {
  return version ? `V${version}` : '未配置';
}

class CatalogManagementService {
  constructor({ repository, catalogService, templatePath }) {
    this.repository = repository;
    this.catalogService = catalogService;
    this.templatePath = path.resolve(templatePath);
    this.writeOperation = null;
    this.lastImportStatus = null;
  }

  async initialize() {
    await this.catalogService.initialize();
  }

  async summary() {
    const [info, products, snapshot] = await Promise.all([
      this.catalogService.getVersionInfo(),
      this.catalogService.list(),
      this.repository.getCurrentSnapshot(),
    ]);
    const activeCount = products.filter((product) => product.status === 'active').length;
    const inactiveCount = products.length - activeCount;
    return {
      schemaVersion: '1.0',
      configured: info.currentVersion !== null,
      productCount: products.length,
      activeCount,
      inactiveCount,
      currentVersion: info.currentVersion,
      currentVersionLabel: versionLabel(info.currentVersion),
      updatedAt: info.updatedAt,
      lastImportStatus: this.lastImportStatus ?? (snapshot?.source.type === 'import' ? 'success' : snapshot?.source.type === 'rollback' ? 'rollback-success' : 'none'),
      matchEngineVersion: info.currentVersion,
      matchEngineVersionLabel: versionLabel(info.currentVersion),
      sourceType: snapshot?.source.type ?? null,
      sourceFile: safeName(snapshot?.source.sourceFile),
    };
  }

  async listProducts(query = {}) {
    const allProducts = await this.catalogService.list();
    const search = normalizeSearch(query.search);
    const status = query.status ?? 'all';
    const category = String(query.category ?? '').trim();
    const sort = query.sort ?? 'updated-desc';
    const pageSize = query.pageSize ?? 20;
    const page = query.page ?? 1;
    const filtered = allProducts.filter((product) => {
      if (status !== 'all' && product.status !== status) return false;
      if (category && product.category !== category) return false;
      if (!search) return true;
      return [product.productName, product.model, ...product.keywords, ...product.synonyms]
        .some((value) => normalizeSearch(value).includes(search));
    });
    filtered.sort((left, right) => {
      if (sort === 'name-asc') return left.productName.localeCompare(right.productName, 'zh-CN');
      if (sort === 'model-asc') return left.model.localeCompare(right.model, 'zh-CN');
      return right.updatedAt.localeCompare(left.updatedAt) || left.productId.localeCompare(right.productId);
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    return {
      schemaVersion: '1.0',
      items: structuredClone(filtered.slice(start, start + pageSize)),
      total: filtered.length,
      page: safePage,
      pageSize,
      totalPages,
      categories: [...new Set(allProducts.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    };
  }

  async productDetail(productId) {
    const [product, info] = await Promise.all([
      this.catalogService.getById(productId),
      this.catalogService.getVersionInfo(),
    ]);
    if (!product) throw catalogError('CATALOG_NOT_FOUND', '未找到该产品记录');
    return { schemaVersion: '1.0', product: structuredClone(product), catalogVersion: info.currentVersion };
  }

  async previewImport(fileId) {
    const report = await this.catalogService.previewImport(fileId);
    this.lastImportStatus = report.status === 'ready' ? 'preview-ready' : 'invalid';
    return structuredClone(report);
  }

  async commitImport(importId) {
    return this.withWrite('import', async () => {
      try {
        const result = await this.catalogService.confirmImport(importId);
        this.lastImportStatus = 'success';
        return structuredClone(result);
      } catch (error) {
        this.lastImportStatus = 'failed';
        if (error?.code === 'IMPORT_HAS_ERRORS') throw catalogError('CATALOG_IMPORT_VALIDATION_FAILED', '导入预览包含错误，当前产品库未被修改');
        if (error?.code === 'IMPORT_PREVIEW_NOT_FOUND') throw catalogError('CATALOG_IMPORT_VALIDATION_FAILED', '导入预览不存在或已过期，请重新选择文件');
        throw catalogError('CATALOG_WRITE_FAILED', error?.message || '产品库写入失败，当前版本保持不变');
      }
    });
  }

  discardImport(importId) {
    this.catalogService.discardImport(importId);
    return { schemaVersion: '1.0', discarded: true };
  }

  async versions() {
    const [info, current, previous, stored] = await Promise.all([
      this.catalogService.getVersionInfo(),
      this.repository.getCurrentSnapshot(),
      this.repository.getPreviousSnapshot(),
      typeof this.repository.listStoredVersions === 'function' ? this.repository.listStoredVersions() : Promise.resolve([]),
    ]);
    const snapshots = new Map([current, previous].filter(Boolean).map((snapshot) => [snapshot.catalogVersion, snapshot]));
    const items = [...stored].sort((a, b) => b - a).map((version) => {
      const snapshot = snapshots.get(version);
      return {
        schemaVersion: '1.0',
        version,
        versionLabel: versionLabel(version),
        createdAt: snapshot?.createdAt ?? null,
        productCount: snapshot?.products.length ?? null,
        sourceFile: safeName(snapshot?.source.sourceFile) || null,
        operation: snapshot?.source.type ?? null,
        restoredFromVersion: snapshot?.source.restoredFromVersion ?? null,
        isCurrent: version === info.currentVersion,
        isPrevious: version === info.previousVersion,
        canRollback: version === info.previousVersion,
        detailAvailable: Boolean(snapshot),
      };
    });
    return { schemaVersion: '1.0', currentVersion: info.currentVersion, previousVersion: info.previousVersion, items };
  }

  async rollback(targetVersion) {
    return this.withWrite('rollback', async () => {
      const info = await this.catalogService.getVersionInfo();
      if (!info.previousVersion || targetVersion !== info.previousVersion) {
        throw catalogError('CATALOG_VERSION_NOT_FOUND', 'V1仅支持回滚到当前产品库的上一有效版本');
      }
      try {
        const version = await this.catalogService.rollbackPrevious();
        this.lastImportStatus = 'rollback-success';
        return { schemaVersion: '1.0', version, restoredFromVersion: targetVersion };
      } catch (error) {
        throw catalogError('CATALOG_ROLLBACK_FAILED', error?.message || '产品库回滚失败');
      }
    });
  }

  async saveTemplate(destinationPath) {
    try {
      await fs.access(this.templatePath);
      await fs.copyFile(this.templatePath, destinationPath);
      return { schemaVersion: '1.0', saved: true, fileName: safeName(destinationPath) };
    } catch (error) {
      throw catalogError('CATALOG_TEMPLATE_SAVE_FAILED', error?.message || '标准模板保存失败');
    }
  }

  async withWrite(operation, callback) {
    if (this.writeOperation) throw catalogError('CATALOG_BUSY', '产品库正在更新，请稍候');
    this.writeOperation = operation;
    try {
      return await callback();
    } finally {
      this.writeOperation = null;
    }
  }
}

async function createCatalogManagementServices({ app, templatePath }) {
  const root = path.join(app.getPath('userData'), 'real-ai', 'product-catalog');
  const stagingRoot = path.join(app.getPath('temp'), 'shuyuan-catalog-management', 'staged');
  const stagingService = new FileStagingService({ stagingRoot });
  await stagingService.initialize();
  const repository = new JsonProductRepository(root);
  const catalogService = new ProductCatalogService(repository, stagingService, 'enterprise-product-catalog');
  const managementService = new CatalogManagementService({ repository, catalogService, templatePath });
  await managementService.initialize();
  return { repository, catalogService, stagingService, managementService };
}

module.exports = { CatalogManagementService, createCatalogManagementServices, catalogError };
