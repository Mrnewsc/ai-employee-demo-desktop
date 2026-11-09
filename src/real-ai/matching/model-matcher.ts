import type { ExtractedProductV1 } from '../extraction';
import type { ProductRecord } from '../catalog';
import { SCHEMA_VERSION } from '../types';
import type { DimensionAssessment, MatchEvidence, MatchRule } from './contracts';
import { normalizeModel } from './normalizer';

function customerEvidence(product: ExtractedProductV1, model: string): MatchEvidence[] {
  return product.evidence.filter((entry) => entry.field === 'model').map((entry) => ({
    schemaVersion: SCHEMA_VERSION,
    side: 'customer',
    dimension: 'model',
    field: 'model',
    value: model,
    description: `客户资料型号：${model}`,
    sourceFile: 'sourceFile' in entry ? String(entry.sourceFile) : product.sourceFile,
    source: entry.source,
    catalogProductId: null,
    catalogVersion: null,
  }));
}

export function matchModel(product: ExtractedProductV1, candidate: ProductRecord, catalogVersion: number | null): DimensionAssessment {
  const customerModel = normalizeModel(product.model);
  const catalogModel = candidate.normalizedModel || normalizeModel(candidate.model);
  if (!customerModel) return { dimension: 'model', available: false, score: 0, matchedRules: [], conflictingRules: [], evidence: [], hasHardConflict: false, hasMissingHardSpecification: false };
  const evidence = [
    ...customerEvidence(product, product.model ?? ''),
    {
      schemaVersion: SCHEMA_VERSION,
      side: 'catalog' as const,
      dimension: 'model' as const,
      field: 'model',
      value: candidate.model,
      description: `产品库型号：${candidate.model}`,
      sourceFile: candidate.source.fileName,
      source: null,
      catalogProductId: candidate.productId,
      catalogVersion,
    },
  ];
  const exact = customerModel === catalogModel;
  const rule: MatchRule = {
    schemaVersion: SCHEMA_VERSION,
    code: exact ? 'MODEL_EXACT' : 'MODEL_MISMATCH',
    dimension: 'model',
    description: exact ? `型号 ${product.model} 标准化后精确一致` : `客户型号 ${product.model} 与候选型号 ${candidate.model} 不一致`,
    customerValue: product.model,
    catalogValue: candidate.model,
    importance: 'hard',
  };
  return {
    dimension: 'model',
    available: true,
    score: exact ? 1 : 0,
    matchedRules: exact ? [rule] : [],
    conflictingRules: exact ? [] : [rule],
    evidence,
    hasHardConflict: !exact,
    hasMissingHardSpecification: false,
  };
}
