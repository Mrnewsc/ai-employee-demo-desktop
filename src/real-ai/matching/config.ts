import { normalizeSpecificationName } from '../catalog';
import type { MatchPolicy, SpecificationRule } from './contracts';

const rules: SpecificationRule[] = [
  { name: '工作宽度', importance: 'hard', comparison: 'candidate-minimum', toleranceRatio: 0 },
  { name: '最大工作宽度', importance: 'hard', comparison: 'candidate-minimum', toleranceRatio: 0 },
  { name: '尺寸', importance: 'hard', comparison: 'equal', toleranceRatio: 0.01 },
  { name: '电压', importance: 'hard', comparison: 'equal', toleranceRatio: 0.01 },
  { name: '功率', importance: 'hard', comparison: 'equal', toleranceRatio: 0.02 },
  { name: '最大负载', importance: 'hard', comparison: 'candidate-minimum', toleranceRatio: 0 },
  { name: '产能', importance: 'hard', comparison: 'candidate-minimum', toleranceRatio: 0 },
  { name: '接口规格', importance: 'hard', comparison: 'equal', toleranceRatio: 0 },
  { name: '材质', importance: 'soft', comparison: 'equal', toleranceRatio: 0 },
  { name: '外观', importance: 'soft', comparison: 'equal', toleranceRatio: 0 },
  { name: '可选附件', importance: 'informational', comparison: 'equal', toleranceRatio: 0 },
];

export const DEFAULT_MATCH_POLICY: MatchPolicy = {
  weights: {
    model: 0.45,
    name: 0.25,
    specification: 0.2,
    application: 0.1,
  },
  thresholds: {
    high: 0.82,
    medium: 0.6,
    low: 0.35,
    closeCandidateDelta: 0.05,
  },
  specificationRules: Object.fromEntries(rules.map((rule) => [normalizeSpecificationName(rule.name), rule])),
  defaultSpecificationRule: {
    importance: 'informational',
    comparison: 'equal',
    toleranceRatio: 0,
  },
  topK: 5,
  semanticTopK: 3,
  maxSemanticAdjustment: 0.05,
};

export function resolveMatchPolicy(override?: Partial<MatchPolicy>): MatchPolicy {
  if (!override) return structuredClone(DEFAULT_MATCH_POLICY);
  return {
    ...DEFAULT_MATCH_POLICY,
    ...override,
    weights: { ...DEFAULT_MATCH_POLICY.weights, ...override.weights },
    thresholds: { ...DEFAULT_MATCH_POLICY.thresholds, ...override.thresholds },
    specificationRules: {
      ...DEFAULT_MATCH_POLICY.specificationRules,
      ...override.specificationRules,
    },
    defaultSpecificationRule: {
      ...DEFAULT_MATCH_POLICY.defaultSpecificationRule,
      ...override.defaultSpecificationRule,
    },
  };
}
