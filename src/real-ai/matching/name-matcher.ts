import type { ProductRecord } from '../catalog';
import type { ExtractedProductV1 } from '../extraction';
import { SCHEMA_VERSION } from '../types';
import type { DimensionAssessment, MatchEvidence, MatchRule } from './contracts';
import { compactName, textSimilarity } from './normalizer';

export function nameScore(productName: string | null, candidate: ProductRecord): { score: number; reason: string } {
  if (!productName) return { score: 0, reason: '' };
  const input = compactName(productName);
  const standard = compactName(candidate.productName);
  const category = compactName(candidate.category);
  if (input === standard) return { score: 1, reason: '标准产品名称一致' };
  const synonym = candidate.synonyms.find((entry) => compactName(entry) === input);
  if (synonym) return { score: 0.96, reason: `命中企业同义词“${synonym}”` };
  if (input === category) return { score: 0.9, reason: `名称与产品分类“${candidate.category}”一致` };
  const keyword = candidate.keywords.find((entry) => compactName(entry) === input);
  if (keyword) return { score: 0.86, reason: `命中产品关键词“${keyword}”` };
  const values = [candidate.productName, candidate.category, ...candidate.synonyms, ...candidate.keywords];
  const score = Math.max(...values.map((entry) => textSimilarity(productName, entry)));
  return { score, reason: score >= 0.55 ? '产品名称与企业名称、同义词或关键词部分重合' : '' };
}

export function matchName(product: ExtractedProductV1, candidate: ProductRecord, catalogVersion: number | null): DimensionAssessment {
  if (!product.productName) return { dimension: 'name', available: false, score: 0, matchedRules: [], conflictingRules: [], evidence: [], hasHardConflict: false, hasMissingHardSpecification: false };
  const assessment = nameScore(product.productName, candidate);
  const matchedRules: MatchRule[] = assessment.score >= 0.55 ? [{
    schemaVersion: SCHEMA_VERSION,
    code: assessment.score === 1 ? 'NAME_EXACT' : 'NAME_SIMILAR',
    dimension: 'name',
    description: assessment.reason,
    customerValue: product.productName,
    catalogValue: candidate.productName,
    importance: 'soft',
  }] : [];
  const evidence: MatchEvidence[] = [
    ...product.evidence.filter((entry) => entry.field === 'productName').map((entry) => ({
      schemaVersion: SCHEMA_VERSION,
      side: 'customer' as const,
      dimension: 'name' as const,
      field: 'productName',
      value: product.productName ?? '',
      description: `客户资料产品名称：${product.productName}`,
      sourceFile: 'sourceFile' in entry ? String(entry.sourceFile) : product.sourceFile,
      source: entry.source,
      catalogProductId: null,
      catalogVersion: null,
    })),
    {
      schemaVersion: SCHEMA_VERSION,
      side: 'catalog',
      dimension: 'name',
      field: 'productName',
      value: candidate.productName,
      description: `产品库名称：${candidate.productName}`,
      sourceFile: candidate.source.fileName,
      source: null,
      catalogProductId: candidate.productId,
      catalogVersion,
    },
  ];
  return { dimension: 'name', available: true, score: assessment.score, matchedRules, conflictingRules: [], evidence, hasHardConflict: false, hasMissingHardSpecification: false };
}
