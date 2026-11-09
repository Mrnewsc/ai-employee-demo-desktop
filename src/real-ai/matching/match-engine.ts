import { SCHEMA_VERSION } from '../types';
import type { ProductRecord } from '../catalog';
import type { ExtractedProductV1 } from '../extraction';
import { matchApplication } from './application-matcher';
import { CandidateRetriever } from './candidate-retriever';
import { resolveMatchPolicy } from './config';
import type {
  CandidateProductSnapshot,
  DimensionAssessment,
  ExtractedProductSnapshot,
  InputQualityAssessment,
  MatchEngineDependencies,
  MatchEngineOutput,
  MatchEvidence,
  MatchPolicy,
  MatchRequest,
  MatchRule,
  ProductMatchLevel,
  ProductMatchResult,
  RetrievedCandidate,
  SemanticCandidateAssessment,
} from './contracts';
import { detectConflicts } from './conflict-detector';
import { assessInputQuality } from './input-quality';
import { matchModel } from './model-matcher';
import { matchName } from './name-matcher';
import { deterministicScore, scoreLevel } from './scorer';
import { ProductMatchResultSchema } from './schemas';
import { matchSpecifications } from './spec-matcher';

interface EvaluatedCandidate {
  retrieved: RetrievedCandidate;
  assessments: DimensionAssessment[];
  score: number;
  semantic: SemanticCandidateAssessment | null;
}

function extractedSnapshot(product: ExtractedProductV1, warnings: MatchRequest['extractionWarnings'] = []): ExtractedProductSnapshot {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: product.id,
    productName: product.productName,
    model: product.model,
    specifications: structuredClone(product.specifications),
    material: product.material,
    process: product.process,
    application: product.application,
    sourceFile: product.sourceFile,
    needsHumanReview: product.needsHumanReview,
    warnings: structuredClone(warnings),
    conflicts: product.conflicts.map((conflict) => ({
      field: conflict.field,
      message: conflict.message,
      values: conflict.values.map((entry) => entry.value),
    })),
  };
}

function inputConflictRules(product: ExtractedProductV1): MatchRule[] {
  return product.conflicts.map((conflict) => ({
    schemaVersion: SCHEMA_VERSION,
    code: 'INPUT_FIELD_CONFLICT',
    dimension: conflict.field === 'model' ? 'model' : conflict.field.startsWith('specifications.') ? 'specification' : 'input',
    description: conflict.message,
    customerValue: conflict.values.map((entry) => entry.value).join(' / '),
    catalogValue: null,
    importance: conflict.field === 'model' || conflict.field.startsWith('specifications.') ? 'hard' : 'soft',
  }));
}

function candidateSnapshot(product: ProductRecord): CandidateProductSnapshot {
  return {
    schemaVersion: SCHEMA_VERSION,
    productId: product.productId,
    productName: product.productName,
    model: product.model,
    category: product.category,
    specifications: structuredClone(product.specifications),
    applications: [...product.applications],
    keywords: [...product.keywords],
    synonyms: [...product.synonyms],
    status: product.status,
    version: product.version,
  };
}

function stableMatchId(extractedProductId: string, candidateProductId: string | null, catalogVersion: number | null): string {
  const input = `${extractedProductId}|${candidateProductId ?? 'none'}|${catalogVersion ?? 'none'}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `match_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function ruleEvidence(rule: MatchRule, catalogProductId: string | null, catalogVersion: number | null): MatchEvidence {
  return {
    schemaVersion: SCHEMA_VERSION,
    side: 'rule',
    dimension: rule.dimension,
    field: rule.dimension,
    value: rule.code,
    description: rule.description,
    sourceFile: null,
    source: null,
    catalogProductId,
    catalogVersion,
  };
}

function hasExactModel(assessments: DimensionAssessment[]): boolean {
  return assessments.some((assessment) => assessment.matchedRules.some((rule) => rule.code === 'MODEL_EXACT'));
}

function determineLevel(
  score: number,
  assessments: DimensionAssessment[],
  input: InputQualityAssessment,
  policy: MatchPolicy,
): ProductMatchLevel {
  const conflicts = detectConflicts(assessments, input);
  const hasIdentityOrSpecification = assessments.some((assessment) => (
    assessment.available && ['model', 'name', 'specification'].includes(assessment.dimension)
  ));
  if (!hasIdentityOrSpecification) return score >= policy.thresholds.low ? 'low' : 'none';
  const exactEligible = hasExactModel(assessments)
    && !conflicts.hasHardConflict
    && !conflicts.hasMissingHardSpecification
    && !input.hasOcrModelAmbiguity
    && !input.hasProductConflict
    && !input.hasMissingEvidence
    && !input.reviewReasons.length;
  if (exactEligible) return 'exact';
  let level: ProductMatchLevel = scoreLevel(score, policy);
  if (conflicts.hasHardConflict && level === 'high') level = 'medium';
  if (conflicts.hasModelMismatch && !input.hasOcrModelAmbiguity && (level === 'high' || level === 'medium')) level = 'low';
  if (input.hasOcrModelAmbiguity && conflicts.hasModelMismatch && level === 'high') level = 'medium';
  return level;
}

function noneResult(product: ExtractedProductV1, warnings: MatchRequest['extractionWarnings'], catalogVersion: number | null, createdAt: string, unresolved: boolean, reasons: string[]): ProductMatchResult {
  const rule: MatchRule = {
    schemaVersion: SCHEMA_VERSION,
    code: unresolved ? 'INPUT_UNRESOLVED' : 'NO_REASONABLE_CANDIDATE',
    dimension: 'input',
    description: unresolved ? '客户产品信息不足，当前无法形成可靠候选' : '企业产品库中未找到达到最低阈值的合理候选',
    customerValue: product.productName ?? product.model,
    catalogValue: null,
    importance: null,
  };
  return ProductMatchResultSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    matchId: stableMatchId(product.id, null, catalogVersion),
    extractedProductId: product.id,
    extractedProductSnapshot: extractedSnapshot(product, warnings),
    candidateProductId: null,
    candidateProductSnapshot: null,
    candidateRank: null,
    status: unresolved ? 'unresolved' : 'none',
    level: 'none',
    score: null,
    matchedRules: [],
    conflictingRules: [rule],
    evidence: [ruleEvidence(rule, null, catalogVersion)],
    needsHumanReview: true,
    reviewStatus: 'pending',
    reviewReasons: [...new Set(reasons.length ? reasons : [rule.description])],
    catalogVersion,
    createdAt,
  });
}

export class MatchEngine {
  private readonly retriever: CandidateRetriever;

  constructor(private readonly dependencies: MatchEngineDependencies) {
    this.retriever = new CandidateRetriever(dependencies.repository);
  }

  async match(request: MatchRequest): Promise<MatchEngineOutput> {
    const started = performance.now();
    const policy = resolveMatchPolicy(request.options?.policy);
    const input = assessInputQuality(request.extractedProduct, request.extractionWarnings);
    const versionInfo = await this.dependencies.repository.getVersionInfo();
    const catalogVersion = versionInfo.currentVersion;
    const createdAt = (this.dependencies.now?.() ?? new Date()).toISOString();
    const retrieval = await this.retriever.retrieve(request.extractedProduct, policy, {
      category: request.options?.category,
      keywords: request.options?.keywords,
      topK: request.options?.topK,
    });
    if (request.catalogVersion !== undefined && request.catalogVersion !== catalogVersion) {
      retrieval.issues.push({
        code: 'CATALOG_VERSION_MISMATCH',
        message: `请求产品库版本 ${request.catalogVersion} 与当前版本 ${catalogVersion ?? '空'} 不一致`,
        productIds: [],
      });
      input.reviewReasons.push('匹配请求指定的产品库版本与当前版本不一致。');
    }
    if (!input.usable || !catalogVersion) {
      return {
        schemaVersion: SCHEMA_VERSION,
        results: [noneResult(request.extractedProduct, request.extractionWarnings, catalogVersion, createdAt, true, input.reviewReasons)],
        retrievalIssues: retrieval.issues,
        metrics: { catalogVersion, candidateRetrievalMs: retrieval.durationMs, deterministicMatchingMs: 0, semanticReviewMs: 0, totalDurationMs: Math.round(performance.now() - started), candidateCount: 0 },
      };
    }

    const deterministicStarted = performance.now();
    const evaluated: EvaluatedCandidate[] = retrieval.candidates.map((retrieved) => {
      const assessments = [
        matchModel(request.extractedProduct, retrieved.product, catalogVersion),
        matchName(request.extractedProduct, retrieved.product, catalogVersion),
        matchSpecifications(request.extractedProduct, retrieved.product, policy, catalogVersion),
        matchApplication(request.extractedProduct, retrieved.product, catalogVersion),
      ];
      return { retrieved, assessments, score: deterministicScore(assessments, policy), semantic: null };
    });
    const deterministicMatchingMs = Math.max(0, Math.round(performance.now() - deterministicStarted));
    evaluated.sort((left, right) => right.score - left.score || right.retrieved.retrievalScore - left.retrieved.retrievalScore || left.retrieved.product.productId.localeCompare(right.retrieved.product.productId));

    let semanticReviewMs = 0;
    if (request.options?.useSemanticReview && this.dependencies.semanticProvider && evaluated.length) {
      const response = await this.dependencies.semanticProvider.review({
        extractedProduct: extractedSnapshot(request.extractedProduct, request.extractionWarnings),
        candidates: evaluated.slice(0, policy.semanticTopK).map((entry) => ({
          product: candidateSnapshot(entry.retrieved.product),
          deterministicScore: entry.score,
          matchedRules: entry.assessments.flatMap((assessment) => assessment.matchedRules),
          conflictingRules: entry.assessments.flatMap((assessment) => assessment.conflictingRules),
        })),
      });
      semanticReviewMs = response.durationMs;
      for (const entry of evaluated) {
        const semantic = response.assessments.find((assessment) => assessment.candidateProductId === entry.retrieved.product.productId) ?? null;
        if (!semantic) continue;
        entry.semantic = semantic;
        const adjustment = Math.max(-policy.maxSemanticAdjustment, Math.min(policy.maxSemanticAdjustment, semantic.adjustment));
        entry.score = Number(Math.max(0, Math.min(1, entry.score + adjustment)).toFixed(4));
      }
      evaluated.sort((left, right) => right.score - left.score || right.retrieved.retrievalScore - left.retrieved.retrievalScore || left.retrieved.product.productId.localeCompare(right.retrieved.product.productId));
    }

    const duplicateModel = retrieval.issues.some((issue) => issue.code === 'DUPLICATE_NORMALIZED_MODEL');
    const versionMismatch = retrieval.issues.some((issue) => issue.code === 'CATALOG_VERSION_MISMATCH');
    const usableCandidates = evaluated
      .map((entry) => ({ entry, level: determineLevel(entry.score, entry.assessments, input, policy) }))
      .filter(({ level }) => level !== 'none');
    if (!usableCandidates.length) {
      return {
        schemaVersion: SCHEMA_VERSION,
        results: [noneResult(request.extractedProduct, request.extractionWarnings, catalogVersion, createdAt, false, input.reviewReasons)],
        retrievalIssues: retrieval.issues,
        metrics: { catalogVersion, candidateRetrievalMs: retrieval.durationMs, deterministicMatchingMs, semanticReviewMs, totalDurationMs: Math.round(performance.now() - started), candidateCount: evaluated.length },
      };
    }

    const topScore = usableCandidates[0].entry.score;
    const closeCandidates = usableCandidates.filter(({ entry }) => topScore - entry.score <= policy.thresholds.closeCandidateDelta);
    const results = usableCandidates.map(({ entry, level }, index) => {
      const product = entry.retrieved.product;
      const conflicts = detectConflicts(entry.assessments, input);
      const matchedRules = entry.assessments.flatMap((assessment) => assessment.matchedRules);
      const conflictingRules = [...inputConflictRules(request.extractedProduct), ...entry.assessments.flatMap((assessment) => assessment.conflictingRules)];
      const evidence = [...input.evidence, ...entry.assessments.flatMap((assessment) => assessment.evidence)];
      if (entry.semantic) {
        const semanticRule: MatchRule = {
          schemaVersion: SCHEMA_VERSION,
          code: entry.semantic.conflictsWithRules ? 'SEMANTIC_RULE_CONFLICT' : 'SEMANTIC_REVIEW',
          dimension: 'semantic',
          description: entry.semantic.explanation,
          customerValue: null,
          catalogValue: product.productId,
          importance: 'informational',
        };
        (entry.semantic.conflictsWithRules ? conflictingRules : matchedRules).push(semanticRule);
        evidence.push(ruleEvidence(semanticRule, product.productId, catalogVersion));
      }
      for (const rule of [...matchedRules, ...conflictingRules]) evidence.push(ruleEvidence(rule, product.productId, catalogVersion));
      const reviewReasons = [...conflicts.reviewReasons];
      if (level === 'high') reviewReasons.push('高匹配候选仍需销售人工确认后方可作为正式结果。');
      if (level === 'medium' || level === 'low') reviewReasons.push(`${level === 'medium' ? '中等' : '低'}匹配候选需要人工复核。`);
      if (duplicateModel) reviewReasons.push('产品库存在重复标准化型号，禁止自动选择。');
      if (versionMismatch) reviewReasons.push('产品库版本不一致，需要按当前版本重新确认。');
      if (closeCandidates.length > 1 && closeCandidates.some((candidate) => candidate.entry.retrieved.product.productId === product.productId)) reviewReasons.push('多个候选分数接近，无法自动唯一确定。');
      if (entry.semantic?.conflictsWithRules) reviewReasons.push('AI语义建议与确定性规则存在分歧，以规则结果为准并需人工确认。');
      if (input.hasOcrModelAmbiguity && product.model !== request.extractedProduct.model) {
        reviewReasons.push(`OCR型号存在字符歧义：客户原始识别为${request.extractedProduct.model ?? '空值'}，企业候选型号${product.model}，需要人工确认。`);
      }
      const needsHumanReview = level !== 'exact' || Boolean(reviewReasons.length);
      return ProductMatchResultSchema.parse({
        schemaVersion: SCHEMA_VERSION,
        matchId: stableMatchId(request.extractedProduct.id, product.productId, catalogVersion),
        extractedProductId: request.extractedProduct.id,
        extractedProductSnapshot: extractedSnapshot(request.extractedProduct, request.extractionWarnings),
        candidateProductId: product.productId,
        candidateProductSnapshot: candidateSnapshot(product),
        candidateRank: index + 1,
        status: level === 'exact' && !needsHumanReview ? 'matched' : 'candidate',
        level,
        score: entry.score,
        matchedRules,
        conflictingRules,
        evidence,
        needsHumanReview,
        reviewStatus: needsHumanReview ? 'pending' : 'not_required',
        reviewReasons: [...new Set(reviewReasons)],
        catalogVersion,
        createdAt,
      });
    });
    return {
      schemaVersion: SCHEMA_VERSION,
      results,
      retrievalIssues: retrieval.issues,
      metrics: { catalogVersion, candidateRetrievalMs: retrieval.durationMs, deterministicMatchingMs, semanticReviewMs, totalDurationMs: Math.max(0, Math.round(performance.now() - started)), candidateCount: evaluated.length },
    };
  }
}
