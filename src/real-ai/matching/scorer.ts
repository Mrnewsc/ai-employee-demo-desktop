import type { DimensionAssessment, MatchPolicy } from './contracts';

export function deterministicScore(assessments: DimensionAssessment[], policy: MatchPolicy): number {
  const available = assessments.filter((entry) => entry.available);
  const totalWeight = available.reduce((sum, entry) => sum + policy.weights[entry.dimension as keyof typeof policy.weights], 0);
  if (!totalWeight) return 0;
  const score = available.reduce((sum, entry) => sum + entry.score * policy.weights[entry.dimension as keyof typeof policy.weights], 0) / totalWeight;
  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}

export function scoreLevel(score: number, policy: MatchPolicy): 'high' | 'medium' | 'low' | 'none' {
  if (score >= policy.thresholds.high) return 'high';
  if (score >= policy.thresholds.medium) return 'medium';
  if (score >= policy.thresholds.low) return 'low';
  return 'none';
}
