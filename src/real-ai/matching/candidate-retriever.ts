import type { ProductRecord, ProductRepository } from '../catalog';
import { ProductRecordSchema } from '../catalog';
import type { ExtractedProductV1 } from '../extraction';
import type { CandidateRetrievalIssue, CandidateRetrievalResult, MatchPolicy, RetrievedCandidate } from './contracts';
import { applicationScore } from './application-matcher';
import { nameScore } from './name-matcher';
import { normalizeModel } from './normalizer';

function retrievalAssessment(product: ExtractedProductV1, candidate: ProductRecord): Omit<RetrievedCandidate, 'product'> {
  let retrievalScore = 0;
  const retrievalReasons: string[] = [];
  if (product.model && normalizeModel(product.model) === candidate.normalizedModel) {
    retrievalScore += 1000;
    retrievalReasons.push('标准化型号精确命中');
  }
  const name = nameScore(product.productName, candidate);
  if (name.score > 0) {
    retrievalScore += name.score * 400;
    if (name.reason) retrievalReasons.push(name.reason);
  }
  const application = applicationScore(product.application, candidate);
  if (application > 0) {
    retrievalScore += application * 100;
    retrievalReasons.push('应用场景相关');
  }
  const matchedSpecifications = Object.keys(product.specifications).filter((key) => candidate.specifications[key] !== undefined).length;
  if (matchedSpecifications) {
    retrievalScore += matchedSpecifications * 25;
    retrievalReasons.push(`${matchedSpecifications}项规格字段可比较`);
  }
  return { retrievalScore, retrievalReasons };
}

export class CandidateRetriever {
  constructor(private readonly repository: ProductRepository) {}

  async retrieve(product: ExtractedProductV1, policy: MatchPolicy, options: { category?: string; keywords?: string[]; topK?: number } = {}): Promise<CandidateRetrievalResult> {
    const started = performance.now();
    const issues: CandidateRetrievalIssue[] = [];
    const records = new Map<string, ProductRecord>();
    const exact = product.model ? await this.repository.findByNormalizedModel(product.model) : [];
    const activeExact: ProductRecord[] = [];
    for (const record of exact) {
      const parsed = ProductRecordSchema.safeParse(record);
      if (!parsed.success) {
        issues.push({ code: 'INVALID_CATALOG_RECORD', message: `产品库记录 ${record.productId ?? 'unknown'} 结构无效，已跳过`, productIds: [record.productId ?? 'unknown'] });
        continue;
      }
      if (parsed.data.status !== 'active') {
        issues.push({ code: 'INACTIVE_PRODUCT_SKIPPED', message: `停用产品 ${parsed.data.productId} 不参与匹配`, productIds: [parsed.data.productId] });
        continue;
      }
      activeExact.push(parsed.data);
      records.set(parsed.data.productId, parsed.data);
    }
    if (activeExact.length > 1) {
      issues.push({
        code: 'DUPLICATE_NORMALIZED_MODEL',
        message: `标准化型号 ${normalizeModel(product.model)} 对应多个启用产品，禁止静默选择第一条`,
        productIds: activeExact.map((record) => record.productId),
      });
    }

    const searchLimit = Math.min(Math.max((options.topK ?? policy.topK) * 4, 10), 100);
    const searched = await this.repository.searchCandidates({
      productName: product.productName ?? undefined,
      model: product.model ?? undefined,
      category: options.category,
      keywords: [...(options.keywords ?? []), ...(product.application ? [product.application] : [])],
      limit: searchLimit,
    });
    for (const record of searched) {
      const parsed = ProductRecordSchema.safeParse(record);
      if (!parsed.success) {
        issues.push({ code: 'INVALID_CATALOG_RECORD', message: `候选产品 ${record.productId ?? 'unknown'} 结构无效，已跳过`, productIds: [record.productId ?? 'unknown'] });
        continue;
      }
      if (parsed.data.status !== 'active') {
        issues.push({ code: 'INACTIVE_PRODUCT_SKIPPED', message: `停用产品 ${parsed.data.productId} 不参与匹配`, productIds: [parsed.data.productId] });
        continue;
      }
      records.set(parsed.data.productId, parsed.data);
    }

    const topK = Math.min(Math.max(options.topK ?? policy.topK, 1), 20);
    const candidates = [...records.values()]
      .map((candidate) => ({ product: candidate, ...retrievalAssessment(product, candidate) }))
      .filter((candidate) => candidate.retrievalScore > 0)
      .sort((left, right) => right.retrievalScore - left.retrievalScore || left.product.productId.localeCompare(right.product.productId))
      .slice(0, topK);
    return { candidates, issues, durationMs: Math.max(0, Math.round(performance.now() - started)) };
  }
}
