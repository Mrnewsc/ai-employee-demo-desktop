/// <reference types="node" />

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { SCHEMA_VERSION } from '../types';
import type {
  CatalogImportContext,
  CatalogSnapshot,
  CatalogVersionInfo,
  ProductCandidateQuery,
  ProductListFilter,
  ProductRecord,
  ProductRepository,
} from './contracts';
import { normalizeModel, normalizeProductName } from './normalization';
import { CatalogManifestSchema, CatalogSnapshotSchema, ProductRecordSchema } from './schemas';

interface CatalogManifest {
  schemaVersion: '1.0';
  currentVersion: number | null;
  previousVersion: number | null;
  updatedAt: string | null;
}

function repositoryError(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function productsChecksum(products: ProductRecord[]): string {
  return createHash('sha256').update(JSON.stringify(products)).digest('hex');
}

async function writeJsonAtomic(targetPath: string, value: unknown): Promise<void> {
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporaryPath, 'wx');
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function contentSignature(product: ProductRecord): string {
  const { version: _version, createdAt: _createdAt, updatedAt: _updatedAt, source: _source, sourceRow: _sourceRow, ...content } = product;
  return JSON.stringify(content);
}

export class JsonProductRepository implements ProductRepository {
  private readonly rootDirectory: string;
  private readonly versionsDirectory: string;
  private readonly manifestPath: string;
  private initialized = false;
  private writeTail: Promise<void> = Promise.resolve();

  constructor(rootDirectory: string) {
    this.rootDirectory = path.resolve(rootDirectory);
    this.versionsDirectory = path.join(this.rootDirectory, 'versions');
    this.manifestPath = path.join(this.rootDirectory, 'manifest.json');
  }

  async initialize(): Promise<void> {
    await mkdir(this.versionsDirectory, { recursive: true });
    try {
      await this.readManifest();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await writeJsonAtomic(this.manifestPath, this.emptyManifest());
    }
    this.initialized = true;
  }

  async list(filter: ProductListFilter = {}): Promise<ProductRecord[]> {
    const products = (await this.getCurrentSnapshot())?.products ?? [];
    return clone(products.filter((product) => (
      (!filter.status || product.status === filter.status)
      && (!filter.category || normalizeProductName(product.category) === normalizeProductName(filter.category))
    )));
  }

  async getById(productId: string): Promise<ProductRecord | null> {
    const product = (await this.list()).find((entry) => entry.productId === productId);
    return product ?? null;
  }

  async findByNormalizedModel(model: string): Promise<ProductRecord[]> {
    const normalized = normalizeModel(model);
    if (!normalized) return [];
    return (await this.list()).filter((product) => product.normalizedModel === normalized);
  }

  async searchCandidates(query: ProductCandidateQuery): Promise<ProductRecord[]> {
    const normalizedModel = normalizeModel(query.model);
    const normalizedName = normalizeProductName(query.productName);
    const normalizedCategory = normalizeProductName(query.category);
    const queryTokens = new Set([
      ...normalizeProductName(query.productName).split(' '),
      ...(query.keywords ?? []).map((keyword) => normalizeProductName(keyword)),
    ].filter(Boolean));
    const scored = (await this.list({ status: 'active' })).map((product) => {
      let score = 0;
      if (normalizedModel && product.normalizedModel === normalizedModel) score += 100;
      if (normalizedName && product.normalizedName === normalizedName) score += 60;
      else if (normalizedName && (product.normalizedName.includes(normalizedName) || normalizedName.includes(product.normalizedName))) score += 35;
      if (normalizedCategory && normalizeProductName(product.category) === normalizedCategory) score += 15;
      const searchable = [product.productName, ...product.keywords, ...product.synonyms, ...product.applications]
        .map((value) => normalizeProductName(value));
      for (const token of queryTokens) {
        if (searchable.some((value) => value.includes(token))) score += 5;
      }
      return { product, score };
    });
    return scored
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || left.product.productId.localeCompare(right.product.productId))
      .slice(0, Math.min(Math.max(query.limit ?? 20, 1), 100))
      .map((entry) => clone(entry.product));
  }

  async import(records: ProductRecord[], context: CatalogImportContext): Promise<CatalogVersionInfo> {
    return this.withWriteLock(() => this.importUnlocked(records, context));
  }

  private async importUnlocked(records: ProductRecord[], context: CatalogImportContext): Promise<CatalogVersionInfo> {
    await this.ensureInitialized();
    if (!records.length) throw repositoryError('CATALOG_EMPTY', '产品库不能保存为空版本');
    const parsedRecords = records.map((record) => ProductRecordSchema.parse(record));
    this.assertUniqueRecords(parsedRecords);

    const manifest = await this.readManifest();
    const current = manifest.currentVersion ? await this.readVersion(manifest.currentVersion) : null;
    const existing = new Map((current?.products ?? []).map((product) => [product.productId, product]));
    const version = (manifest.currentVersion ?? 0) + 1;
    const now = context.importedAt;
    const versionedRecords = parsedRecords.map((record) => {
      const previous = existing.get(record.productId);
      const unchanged = previous && contentSignature(previous) === contentSignature(record);
      return ProductRecordSchema.parse({
        ...record,
        version: previous ? (unchanged ? previous.version : previous.version + 1) : 1,
        createdAt: previous?.createdAt ?? record.createdAt,
        updatedAt: unchanged ? previous.updatedAt : now,
      });
    });
    const snapshot = this.createSnapshot(version, versionedRecords, {
      type: 'import',
      importId: context.importId,
      sourceFile: context.sourceFile,
    }, now);
    await this.commitSnapshot(snapshot, manifest.currentVersion);
    return this.getVersionInfo();
  }

  async getVersionInfo(): Promise<CatalogVersionInfo> {
    await this.ensureInitialized();
    const manifest = await this.readManifest();
    const current = manifest.currentVersion ? await this.readVersion(manifest.currentVersion) : null;
    return {
      schemaVersion: SCHEMA_VERSION,
      currentVersion: manifest.currentVersion,
      previousVersion: manifest.previousVersion,
      productCount: current?.products.length ?? 0,
      updatedAt: manifest.updatedAt,
    };
  }

  async getCurrentSnapshot(): Promise<CatalogSnapshot | null> {
    await this.ensureInitialized();
    const manifest = await this.readManifest();
    return manifest.currentVersion ? clone(await this.readVersion(manifest.currentVersion)) : null;
  }

  async getPreviousSnapshot(): Promise<CatalogSnapshot | null> {
    await this.ensureInitialized();
    const manifest = await this.readManifest();
    return manifest.previousVersion ? clone(await this.readVersion(manifest.previousVersion)) : null;
  }

  async rollbackPrevious(): Promise<CatalogVersionInfo> {
    return this.withWriteLock(() => this.rollbackPreviousUnlocked());
  }

  private async rollbackPreviousUnlocked(): Promise<CatalogVersionInfo> {
    await this.ensureInitialized();
    const manifest = await this.readManifest();
    if (!manifest.currentVersion || !manifest.previousVersion) {
      throw repositoryError('NO_PREVIOUS_CATALOG_VERSION', '没有可回滚的上一版本');
    }
    const previous = await this.readVersion(manifest.previousVersion);
    const nextVersion = manifest.currentVersion + 1;
    const now = new Date().toISOString();
    const snapshot = this.createSnapshot(nextVersion, previous.products, {
      type: 'rollback',
      importId: `rollback_${randomUUID()}`,
      sourceFile: previous.source.sourceFile,
      restoredFromVersion: previous.catalogVersion,
    }, now);
    await this.commitSnapshot(snapshot, manifest.currentVersion);
    return this.getVersionInfo();
  }

  private createSnapshot(
    catalogVersion: number,
    products: ProductRecord[],
    source: CatalogSnapshot['source'],
    createdAt: string,
  ): CatalogSnapshot {
    const normalizedProducts = clone(products);
    return CatalogSnapshotSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      catalogVersion,
      createdAt,
      source,
      checksum: productsChecksum(normalizedProducts),
      products: normalizedProducts,
    });
  }

  private async commitSnapshot(snapshot: CatalogSnapshot, previousVersion: number | null): Promise<void> {
    const versionPath = this.versionPath(snapshot.catalogVersion);
    await writeJsonAtomic(versionPath, snapshot);
    const reread = await this.readVersion(snapshot.catalogVersion);
    if (reread.checksum !== snapshot.checksum) throw repositoryError('CATALOG_WRITE_VERIFICATION_FAILED', '新版本写入校验失败');
    const manifest: CatalogManifest = {
      schemaVersion: SCHEMA_VERSION,
      currentVersion: snapshot.catalogVersion,
      previousVersion,
      updatedAt: snapshot.createdAt,
    };
    await writeJsonAtomic(this.manifestPath, CatalogManifestSchema.parse(manifest));
  }

  private async readVersion(version: number): Promise<CatalogSnapshot> {
    const content = JSON.parse(await readFile(this.versionPath(version), 'utf8')) as unknown;
    const snapshot = CatalogSnapshotSchema.parse(content);
    if (productsChecksum(snapshot.products) !== snapshot.checksum) {
      throw repositoryError('CATALOG_CHECKSUM_MISMATCH', `产品库版本${version}校验失败`);
    }
    return snapshot;
  }

  private async readManifest(): Promise<CatalogManifest> {
    const content = JSON.parse(await readFile(this.manifestPath, 'utf8')) as unknown;
    return CatalogManifestSchema.parse(content);
  }

  private versionPath(version: number): string {
    return path.join(this.versionsDirectory, `catalog-v${version}.json`);
  }

  private emptyManifest(): CatalogManifest {
    return { schemaVersion: SCHEMA_VERSION, currentVersion: null, previousVersion: null, updatedAt: null };
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) await this.initialize();
  }

  private assertUniqueRecords(records: ProductRecord[]): void {
    const ids = new Set<string>();
    const models = new Map<string, string>();
    for (const record of records) {
      if (ids.has(record.productId)) throw repositoryError('DUPLICATE_PRODUCT_ID', `产品ID重复：${record.productId}`);
      ids.add(record.productId);
      if (!record.normalizedModel) continue;
      const existing = models.get(record.normalizedModel);
      if (existing) throw repositoryError('DUPLICATE_MODEL', `型号冲突：${record.model} 与 ${existing}`);
      models.set(record.normalizedModel, record.productName);
    }
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.writeTail;
    let release!: () => void;
    this.writeTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async listStoredVersions(): Promise<number[]> {
    await this.ensureInitialized();
    const entries = await readdir(this.versionsDirectory);
    return entries
      .map((entry) => entry.match(/^catalog-v(\d+)\.json$/)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number)
      .sort((left, right) => left - right);
  }
}
