import type { CatalogListQuery, CatalogManagementApi } from './contracts';

function desktopApi(): CatalogManagementApi {
  const value = (window as Window & { catalogManagement?: CatalogManagementApi }).catalogManagement;
  if (!value) throw new Error('CATALOG_MANAGEMENT_DESKTOP_API_UNAVAILABLE');
  return value;
}

export class CatalogManagementClient {
  constructor(private readonly apiFactory: () => CatalogManagementApi = desktopApi) {}

  selectImportFile() { return this.apiFactory().selectImportFile(); }
  getSummary() { return this.apiFactory().summary(); }
  listProducts(query: CatalogListQuery) { return this.apiFactory().list(query); }
  getProductDetail(productId: string) { return this.apiFactory().detail(productId); }
  previewImport(fileId: string) { return this.apiFactory().previewImport(fileId); }
  commitImport(importId: string) { return this.apiFactory().commitImport(importId); }
  discardImport(importId: string) { return this.apiFactory().discardImport(importId); }
  getVersions() { return this.apiFactory().versions(); }
  rollback(targetVersion: number) { return this.apiFactory().rollback(targetVersion); }
  saveTemplate() { return this.apiFactory().saveTemplate(); }
}

export const catalogManagementClient = new CatalogManagementClient();
