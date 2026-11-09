import type { DimensionAssessment, InputQualityAssessment } from './contracts';

export interface ConflictSummary {
  hasHardConflict: boolean;
  hasModelMismatch: boolean;
  hasMissingHardSpecification: boolean;
  reviewReasons: string[];
}

export function detectConflicts(assessments: DimensionAssessment[], input: InputQualityAssessment): ConflictSummary {
  const model = assessments.find((entry) => entry.dimension === 'model');
  const specification = assessments.find((entry) => entry.dimension === 'specification');
  const hasModelMismatch = Boolean(model?.conflictingRules.some((rule) => rule.code === 'MODEL_MISMATCH'));
  const hasMissingHardSpecification = Boolean(specification?.hasMissingHardSpecification);
  const hasHardConflict = hasModelMismatch || Boolean(specification?.hasHardConflict);
  const reviewReasons = [...input.reviewReasons];
  if (hasModelMismatch) reviewReasons.push('客户型号与候选产品型号不一致。');
  if (specification?.hasHardConflict) reviewReasons.push('候选产品存在关键硬规格冲突。');
  if (hasMissingHardSpecification) reviewReasons.push('产品库缺少客户提出的关键规格，当前无法完整验证。');
  return { hasHardConflict, hasModelMismatch, hasMissingHardSpecification, reviewReasons: [...new Set(reviewReasons)] };
}
