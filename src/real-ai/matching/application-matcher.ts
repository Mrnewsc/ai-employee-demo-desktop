import type { ProductRecord } from '../catalog';
import type { ExtractedProductV1 } from '../extraction';
import { SCHEMA_VERSION } from '../types';
import type { DimensionAssessment, MatchEvidence, MatchRule } from './contracts';
import { textSimilarity } from './normalizer';

export function applicationScore(application: string | null, candidate: ProductRecord): number {
  if (!application) return 0;
  return Math.max(0, ...candidate.applications.map((entry) => textSimilarity(application, entry)), ...candidate.keywords.map((entry) => textSimilarity(application, entry)));
}

export function matchApplication(product: ExtractedProductV1, candidate: ProductRecord, catalogVersion: number | null): DimensionAssessment {
  if (!product.application) return { dimension: 'application', available: false, score: 0, matchedRules: [], conflictingRules: [], evidence: [], hasHardConflict: false, hasMissingHardSpecification: false };
  const score = applicationScore(product.application, candidate);
  const best = [...candidate.applications, ...candidate.keywords].sort((left, right) => textSimilarity(product.application, right) - textSimilarity(product.application, left))[0] ?? '';
  const matchedRules: MatchRule[] = score >= 0.5 ? [{
    schemaVersion: SCHEMA_VERSION,
    code: 'APPLICATION_SIMILAR',
    dimension: 'application',
    description: `应用场景与产品库“${best}”相关`,
    customerValue: product.application,
    catalogValue: best,
    importance: 'soft',
  }] : [];
  const evidence: MatchEvidence[] = [
    ...product.evidence.filter((entry) => entry.field === 'application').map((entry) => ({
      schemaVersion: SCHEMA_VERSION,
      side: 'customer' as const,
      dimension: 'application' as const,
      field: 'application',
      value: product.application ?? '',
      description: `客户资料应用场景：${product.application}`,
      sourceFile: 'sourceFile' in entry ? String(entry.sourceFile) : product.sourceFile,
      source: entry.source,
      catalogProductId: null,
      catalogVersion: null,
    })),
    ...(best ? [{
      schemaVersion: SCHEMA_VERSION,
      side: 'catalog' as const,
      dimension: 'application' as const,
      field: 'applications',
      value: best,
      description: `产品库应用依据：${best}`,
      sourceFile: candidate.source.fileName,
      source: null,
      catalogProductId: candidate.productId,
      catalogVersion,
    }] : []),
  ];
  return { dimension: 'application', available: true, score, matchedRules, conflictingRules: [], evidence, hasHardConflict: false, hasMissingHardSpecification: false };
}
