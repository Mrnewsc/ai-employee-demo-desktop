import type { ProductRecord, ProductRepository } from '../catalog';
import type { ExtractedProductV1, ExtractionField, ExtractionWarning } from '../extraction';
import type { ProductEvidence, SchemaVersion, SourceLocation, VersionedContract } from '../types';

export type ProductMatchLevel = 'exact' | 'high' | 'medium' | 'low' | 'none';
export type MatchResultStatus = 'matched' | 'candidate' | 'unresolved' | 'none';
export type MatchReviewStatus = 'not_required' | 'pending';
export type MatchDimension = 'input' | 'model' | 'name' | 'specification' | 'application' | 'semantic';
export type SpecificationImportance = 'hard' | 'soft' | 'informational';
export type SpecificationComparison = 'equal' | 'candidate-minimum' | 'candidate-maximum';

export interface MatchWeights {
  model: number;
  name: number;
  specification: number;
  application: number;
}

export interface MatchThresholds {
  high: number;
  medium: number;
  low: number;
  closeCandidateDelta: number;
}

export interface SpecificationRule {
  name: string;
  importance: SpecificationImportance;
  comparison: SpecificationComparison;
  toleranceRatio: number;
  requiredForReview?: boolean;
}

export interface MatchPolicy {
  weights: MatchWeights;
  thresholds: MatchThresholds;
  specificationRules: Record<string, SpecificationRule>;
  defaultSpecificationRule: Omit<SpecificationRule, 'name'>;
  topK: number;
  semanticTopK: number;
  maxSemanticAdjustment: number;
}

export interface MatchOptions {
  topK?: number;
  category?: string;
  keywords?: string[];
  useSemanticReview?: boolean;
  policy?: Partial<MatchPolicy>;
}

export interface MatchRequest {
  extractedProduct: ExtractedProductV1;
  extractionWarnings?: ExtractionWarning[];
  catalogVersion?: number;
  options?: MatchOptions;
}

export interface ExtractedProductSnapshot extends VersionedContract {
  id: string;
  productName: string | null;
  model: string | null;
  specifications: Record<string, string>;
  material: string | null;
  process: string | null;
  application: string | null;
  sourceFile: string;
  needsHumanReview: boolean;
  warnings: ExtractionWarning[];
  conflicts: Array<{
    field: string;
    message: string;
    values: string[];
  }>;
}

export interface CandidateProductSnapshot extends VersionedContract {
  productId: string;
  productName: string;
  model: string;
  category: string;
  specifications: Record<string, string>;
  applications: string[];
  keywords: string[];
  synonyms: string[];
  status: ProductRecord['status'];
  version: number;
}

export interface MatchRule extends VersionedContract {
  code: string;
  dimension: MatchDimension;
  description: string;
  customerValue: string | null;
  catalogValue: string | null;
  importance: SpecificationImportance | null;
}

export interface MatchEvidence extends VersionedContract {
  side: 'customer' | 'catalog' | 'rule';
  dimension: MatchDimension;
  field: string;
  value: string;
  description: string;
  sourceFile: string | null;
  source: SourceLocation | null;
  catalogProductId: string | null;
  catalogVersion: number | null;
}

export interface ProductMatchResult extends VersionedContract {
  matchId: string;
  extractedProductId: string;
  extractedProductSnapshot: ExtractedProductSnapshot;
  candidateProductId: string | null;
  candidateProductSnapshot: CandidateProductSnapshot | null;
  candidateRank: number | null;
  status: MatchResultStatus;
  level: ProductMatchLevel;
  score: number | null;
  matchedRules: MatchRule[];
  conflictingRules: MatchRule[];
  evidence: MatchEvidence[];
  needsHumanReview: boolean;
  reviewStatus: MatchReviewStatus;
  reviewReasons: string[];
  catalogVersion: number | null;
  createdAt: string;
}

export interface CandidateRetrievalIssue {
  code: 'DUPLICATE_NORMALIZED_MODEL' | 'INVALID_CATALOG_RECORD' | 'INACTIVE_PRODUCT_SKIPPED' | 'CATALOG_VERSION_MISMATCH';
  message: string;
  productIds: string[];
}

export interface RetrievedCandidate {
  product: ProductRecord;
  retrievalScore: number;
  retrievalReasons: string[];
}

export interface CandidateRetrievalResult {
  candidates: RetrievedCandidate[];
  issues: CandidateRetrievalIssue[];
  durationMs: number;
}

export interface DimensionAssessment {
  dimension: MatchDimension;
  available: boolean;
  score: number;
  matchedRules: MatchRule[];
  conflictingRules: MatchRule[];
  evidence: MatchEvidence[];
  hasHardConflict: boolean;
  hasMissingHardSpecification: boolean;
}

export interface InputQualityAssessment {
  usable: boolean;
  hasOcrModelAmbiguity: boolean;
  hasProductConflict: boolean;
  hasMissingEvidence: boolean;
  reviewReasons: string[];
  evidence: MatchEvidence[];
}

export interface SemanticCandidateInput {
  product: CandidateProductSnapshot;
  deterministicScore: number;
  matchedRules: MatchRule[];
  conflictingRules: MatchRule[];
}

export interface SemanticMatchRequest {
  extractedProduct: ExtractedProductSnapshot;
  candidates: SemanticCandidateInput[];
}

export interface SemanticCandidateAssessment {
  candidateProductId: string;
  adjustment: number;
  explanation: string;
  conflictsWithRules: boolean;
}

export interface SemanticMatchResponse {
  provider: string;
  model: string;
  assessments: SemanticCandidateAssessment[];
  durationMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface SemanticMatchProvider {
  readonly provider: string;
  readonly model: string;
  review(request: SemanticMatchRequest, signal?: AbortSignal): Promise<SemanticMatchResponse>;
}

export interface MatchEngineMetrics {
  catalogVersion: number | null;
  candidateRetrievalMs: number;
  deterministicMatchingMs: number;
  semanticReviewMs: number;
  totalDurationMs: number;
  candidateCount: number;
}

export interface MatchEngineOutput {
  schemaVersion: SchemaVersion;
  results: ProductMatchResult[];
  retrievalIssues: CandidateRetrievalIssue[];
  metrics: MatchEngineMetrics;
}

export interface MatchEngineDependencies {
  repository: ProductRepository;
  semanticProvider?: SemanticMatchProvider;
  now?: () => Date;
}

export interface CustomerFieldEvidence {
  field: ExtractionField | string;
  value: string;
  evidence: ProductEvidence[];
}
