import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PublicSearchService, SoWebSearchProvider } from '../../src/real-ai/public-search';
import type { PublicProductSearchRequest } from '../../src/real-ai/public-search';

const outputPath = path.resolve('src', 'real-ai', 'public-search', 'tests', 'results', 'provider-smoke.json');
const provider = new SoWebSearchProvider({ maxRawCandidates: 10 });
const request: PublicProductSearchRequest = {
  schemaVersion: '1.0',
  requestId: 'provider-connectivity-smoke',
  extractedProductId: 'connectivity-car-phone-holder',
  productName: '车载手机支架',
  model: null,
  specifications: {},
  material: 'ABS 硅胶',
  application: '汽车内使用',
  category: '汽车用品',
  keywords: [],
  customerEvidence: [],
  imageReferences: [],
  searchReason: 'test-harness',
};

const result = await new PublicSearchService([provider], { maxQueries: 1, topK: 5 }).search(request);
const report = {
  schemaVersion: '1.0',
  scope: 'provider-connectivity-only',
  usesCustomerFile: false,
  usesAiApi: false,
  executedAt: new Date().toISOString(),
  healthCheckSkipped: true,
  healthCheckReason: '避免对公开来源执行与本次候选检索重复的网络请求',
  result,
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (result.candidates.length === 0 || !result.diagnostics.providerStatuses.some((entry) => entry.status === 'AVAILABLE')) {
  throw new Error(`PUBLIC_SOURCE_SMOKE_FAILED: ${result.diagnostics.providerStatuses.map((entry) => entry.status).join(',')}, candidates=${result.candidates.length}`);
}
console.log(`Public source smoke passed: ${outputPath}`);
