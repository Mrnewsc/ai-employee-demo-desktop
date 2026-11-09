import { access, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  deepSeekConfigFromEnvironment,
  DeepSeekProductExtractionProvider,
  ProductExtractionService,
} from '../../src/real-ai/extraction';
import { parseDocument } from '../../src/real-ai/parsers';
import {
  PublicSearchService,
  SoWebSearchProvider,
} from '../../src/real-ai/public-search';
import type {
  PublicProductSearchRequest,
  PublicSearchImageReference,
} from '../../src/real-ai/public-search';
import type { ExtractedProductV1 } from '../../src/real-ai/extraction';
import type { ParsedDocument, ParsedImage } from '../../src/real-ai/types';

const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...value] = argument.split('=');
  return [key, value.join('=')];
}));
const pdfArgument = args.get('--pdf');
if (!pdfArgument) throw new Error('MISSING_EXTERNAL_PDF: use --pdf=C:\\absolute\\path\\customer-product-list.pdf');
if (args.get('--confirm-ai-cost') !== 'true') throw new Error('AI_COST_NOT_CONFIRMED: add --confirm-ai-cost=true after product manager approval');
const pdfPath = path.resolve(pdfArgument);
if (path.basename(pdfPath) !== 'customer-product-list.pdf') throw new Error('UNEXPECTED_PDF_FILE_NAME');
await access(pdfPath);

const repositoryRoot = path.resolve('.');
const outputPath = path.resolve(args.get('--output') || path.join(os.tmpdir(), 'shuyuan-real-ai-002a', `real-ai-002a-${Date.now()}.json`));
if (isInside(pdfPath, repositoryRoot)) throw new Error('CUSTOMER_PDF_MUST_REMAIN_OUTSIDE_REPOSITORY');
if (isInside(outputPath, repositoryRoot)) throw new Error('CUSTOMER_RESULT_MUST_NOT_BE_WRITTEN_INSIDE_REPOSITORY');

const parsed = await parseDocument(pdfPath, {
  maxFileSizeBytes: 100 * 1024 * 1024,
  timeoutMs: 15 * 60_000,
  enableOcr: true,
});
const config = deepSeekConfigFromEnvironment(process.env);
const extraction = await new ProductExtractionService(new DeepSeekProductExtractionProvider(config)).extract([parsed], {
  jobId: `real_ai_002a_${Date.now().toString(36)}`,
  chunkConfig: { maxChunksPerDocument: 40 },
});
const checkpointPath = outputPath.replace(/\.json$/i, '.extraction-summary.json');
await mkdir(path.dirname(checkpointPath), { recursive: true });
await writeFile(checkpointPath, `${JSON.stringify({
  schemaVersion: '1.0',
  fileName: parsed.fileName,
  extractedAt: extraction.createdAt,
  provider: extraction.provider,
  model: extraction.model,
  productCount: extraction.products.length,
  products: extraction.products.map(safeProduct),
}, null, 2)}\n`, 'utf8');

const selected = selectRepresentativeProducts(extraction.products);
if (selected.length < 8) {
  throw new Error(`INSUFFICIENT_REPRESENTATIVE_PRODUCTS: expected 8 categories, got ${selected.map((entry) => entry.category).join(', ') || 'none'}; checkpoint=${checkpointPath}`);
}

const provider = new SoWebSearchProvider({ maxRawCandidates: 10 });
const service = new PublicSearchService([provider], { maxQueries: 2, topK: 5 });
const searches = [];
for (const product of selected) {
  const request = toSearchRequest(product.product, parsed);
  searches.push({
    selectedCategory: product.category,
    extractedProduct: safeProduct(product.product),
    search: await service.search(request),
  });
}

const metrics = calculateAcceptanceMetrics(searches);

const report = {
  schemaVersion: '1.0',
  scope: 'REAL-AI-002A-real-pdf-smoke',
  executedAt: new Date().toISOString(),
  input: {
    fileName: parsed.fileName,
    sha256: parsed.sha256,
    pageCount: parsed.metadata.pageCount ?? null,
    parsedImageCount: parsed.images.length,
    imageReferencesWithBbox: parsed.images.filter((image) => image.source.kind === 'pdf' && image.source.bbox).length,
    fileCopiedIntoRepository: false,
  },
  extraction: {
    provider: extraction.provider,
    model: extraction.model,
    productCount: extraction.products.length,
    needsHumanReview: extraction.needsHumanReview,
    metrics: extraction.metrics,
  },
  selectedProductCount: selected.length,
  cacheUsed: false,
  providerLimits: [
    '仅使用公开搜索索引，不登录1688或其他平台',
    '索引标题、摘要、图片和价格可能存在时效性，必须人工核验',
    '当前未实现图片向量搜索，也不访问受限商品详情页',
  ],
  acceptanceMetrics: metrics,
  searches,
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`REAL-AI-002A report saved outside repository: ${outputPath}`);

function toSearchRequest(product: ExtractedProductV1, document: ParsedDocument): PublicProductSearchRequest {
  const pages = new Set(product.sourceLocations.flatMap((location) => location.kind === 'pdf' ? [location.page] : []));
  const imageReferences = document.images
    .filter((image) => image.source.kind === 'pdf' && pages.has(image.source.page))
    .map((image) => toImageReference(image, document.fileName));
  return {
    schemaVersion: '1.0',
    requestId: `public_${product.id}`,
    extractedProductId: product.id,
    productName: product.productName,
    model: product.model,
    specifications: structuredClone(product.specifications),
    material: product.material,
    application: product.application,
    category: null,
    keywords: [],
    customerEvidence: product.evidence.map((evidence) => ({
      schemaVersion: '1.0',
      field: evidence.field,
      text: evidence.text,
      sourceFile: product.sourceFile,
      source: evidence.source,
    })),
    imageReferences,
    searchReason: 'test-harness',
  };
}

function toImageReference(image: ParsedImage, sourceFile: string): PublicSearchImageReference {
  const pdfSource = image.source.kind === 'pdf' ? image.source : null;
  return {
    schemaVersion: '1.0',
    imageId: image.id,
    sourceFile,
    mimeType: image.mimeType || null,
    page: pdfSource?.page ?? null,
    bbox: pdfSource?.bbox ?? null,
    sha256: image.sha256 ?? null,
    availableForVisualSearch: Boolean(image.sha256 && pdfSource?.bbox),
  };
}

function productSelectionText(product: ExtractedProductV1): string {
  return [product.productName, product.application, product.material, ...Object.values(product.specifications), ...product.notes]
    .filter(Boolean)
    .join(' ')
    .normalize('NFKC')
    .toLocaleLowerCase();
}

function selectRepresentativeProducts(products: ExtractedProductV1[]): Array<{ category: string; product: ExtractedProductV1 }> {
  const rules: Array<{ category: string; expression: RegExp }> = [
    { category: '车载手机支架', expression: /车载.*手机.*支架|手机.*车载.*支架|car.*phone.*holder|phone.*mount.*car/iu },
    { category: '便携启动电源', expression: /便携.*启动电源|汽车.*应急.*启动|jump starter|battery booster|portable.*starter/iu },
    { category: '旋转电动清洁刷', expression: /旋转.*(?:电动)?.*清洁.*刷|电动.*清洁.*刷|electric.*cleaning.*brush|spin.*scrubber|rotating.*brush/iu },
    { category: '折叠晾衣架', expression: /折叠.*晾衣架|折叠.*衣架|folding.*drying.*rack|foldable.*clothes.*rack|laundry.*rack/iu },
    { category: '折叠餐桌/家具', expression: /折叠.*餐桌|折叠.*桌|folding.*dining.*table|foldable.*table|folding.*furniture/iu },
    { category: '圣诞装饰品', expression: /圣诞.*(?:装饰|饰品)|christmas.*(?:decoration|ornament)|xmas.*(?:decoration|ornament)/iu },
    { category: '浴室用品', expression: /浴室|卫浴|bathroom|shower|toilet|soap dish|bath mat/iu },
    { category: '家居收纳', expression: /家居.*收纳|收纳.*(?:盒|架|篮|柜)|home.*storage|storage.*organizer|organizer.*rack/iu },
  ];
  const chosen = new Map<string, ExtractedProductV1>();
  const used = new Set<string>();
  for (const rule of rules) {
    const product = products.find((candidate) => !used.has(candidate.id) && rule.expression.test(productSelectionText(candidate)));
    if (product) {
      chosen.set(rule.category, product);
      used.add(product.id);
    }
  }
  const outputOrder = ['浴室用品', '车载手机支架', '便携启动电源', '圣诞装饰品', '家居收纳', '旋转电动清洁刷', '折叠晾衣架', '折叠餐桌/家具'];
  return outputOrder.flatMap((category) => {
    const product = chosen.get(category);
    return product ? [{ category, product }] : [];
  });
}

function safeProduct(product: ExtractedProductV1) {
  return {
    id: product.id,
    productName: product.productName,
    model: product.model,
    specifications: structuredClone(product.specifications),
    quantity: structuredClone(product.quantity),
    material: product.material,
    process: product.process,
    application: product.application,
    sourceFile: path.basename(product.sourceFile),
    sourceLocations: structuredClone(product.sourceLocations),
    confidence: product.confidence,
    needsHumanReview: product.needsHumanReview,
    reviewReasons: [...product.reviewReasons],
  };
}

function calculateAcceptanceMetrics(searchResults: Array<{ search: Awaited<ReturnType<PublicSearchService['search']>> }>) {
  const relevant = (candidate: Awaited<ReturnType<PublicSearchService['search']>>['candidates'][number]) => (
    candidate.score >= 0.25
    && candidate.conflictingSignals.length === 0
    && candidate.matchedSignals.some((signal) => signal.includes('型号') || signal.includes('产品名称'))
  );
  const productCount = searchResults.length;
  const allCandidates = searchResults.flatMap((entry) => entry.search.candidates);
  const hitProducts = searchResults.filter((entry) => entry.search.candidates.length > 0).length;
  const top1Relevant = searchResults.filter((entry) => entry.search.candidates[0] && relevant(entry.search.candidates[0])).length;
  const top3Relevant = searchResults.filter((entry) => entry.search.candidates.slice(0, 3).some(relevant)).length;
  const wrongCandidates = allCandidates.filter((candidate) => !relevant(candidate)).length;
  return {
    productCount,
    candidateHitRate: productCount ? hitProducts / productCount : 0,
    top1RelevantRate: productCount ? top1Relevant / productCount : 0,
    top3RelevantRate: productCount ? top3Relevant / productCount : 0,
    wrongCandidateRate: allCandidates.length ? wrongCandidates / allCandidates.length : 0,
    totalCandidateCount: allCandidates.length,
    noResultCount: productCount - hitProducts,
    totalSearchDurationMs: searchResults.reduce((sum, entry) => sum + entry.search.diagnostics.durationMs, 0),
    relevanceRule: 'score>=0.25、无冲突且至少命中型号或产品名称；仍需人工核验',
  };
}

function isInside(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
