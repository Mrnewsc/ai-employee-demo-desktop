import type { ExtractedProductV1, ExtractionWarning } from '../extraction';
import { SCHEMA_VERSION } from '../types';
import type { InputQualityAssessment, MatchEvidence } from './contracts';

const OCR_WARNING_CODES = new Set(['OCR_MODEL_UNCERTAIN', 'OCR_LOW_CONFIDENCE']);

export function assessInputQuality(product: ExtractedProductV1, warnings: ExtractionWarning[] = []): InputQualityAssessment {
  const reviewReasons = [...product.reviewReasons];
  const hasOcrModelAmbiguity = warnings.some((warning) => OCR_WARNING_CODES.has(warning.code) && (warning.field === 'model' || warning.field === null));
  const hasProductConflict = product.conflicts.length > 0;
  const criticalFields = [
    product.productName ? 'productName' : null,
    product.model ? 'model' : null,
    ...Object.keys(product.specifications).map((name) => `specifications.${name}`),
  ].filter((value): value is string => Boolean(value));
  const hasMissingEvidence = criticalFields.some((field) => !product.evidence.some((entry) => entry.field === field));
  if (hasOcrModelAmbiguity) reviewReasons.push(`OCR型号存在字符歧义：客户原始识别为${product.model ?? '空值'}，需要人工确认。`);
  if (hasProductConflict) reviewReasons.push('客户资料包含多来源字段冲突，需要人工确认。');
  if (hasMissingEvidence) reviewReasons.push('部分关键提取字段缺少可追溯Evidence，需要人工确认。');
  if (product.needsHumanReview) reviewReasons.push('上游结构化提取已标记需要人工确认。');
  const evidence: MatchEvidence[] = warnings.map((warning) => ({
    schemaVersion: SCHEMA_VERSION,
    side: 'rule',
    dimension: 'input',
    field: warning.field ?? '',
    value: warning.code,
    description: warning.message,
    sourceFile: warning.sourceFile,
    source: warning.sourceLocations[0] ?? null,
    catalogProductId: null,
    catalogVersion: null,
  }));
  return {
    usable: Boolean(product.productName || product.model || Object.keys(product.specifications).length || product.application),
    hasOcrModelAmbiguity,
    hasProductConflict,
    hasMissingEvidence,
    reviewReasons: [...new Set(reviewReasons)],
    evidence,
  };
}
