import type { PublicProductCandidate, PublicProductSearchRequest } from './contracts';
import { normalizeText } from './candidate-normalizer';

function tokens(value: string | null | undefined): string[] {
  if (!value) return [];
  const normalized = normalizeText(value);
  const words = normalized.split(/\s+/).filter((word) => word.length > 1);
  const chinese = normalized.match(/[\p{Script=Han}]{2,}/gu)?.flatMap((segment) => {
    const grams: string[] = [];
    for (let size = 2; size <= Math.min(4, segment.length); size += 1) {
      for (let index = 0; index <= segment.length - size; index += 1) grams.push(segment.slice(index, index + size));
    }
    return grams;
  }) ?? [];
  return [...new Set([...words, ...chinese])];
}

function overlap(left: string | null | undefined, right: string | null | undefined): number {
  const leftTokens = tokens(left);
  const rightSet = new Set(tokens(right));
  if (!leftTokens.length || !rightSet.size) return 0;
  return leftTokens.filter((token) => rightSet.has(token)).length / leftTokens.length;
}

function candidateText(candidate: PublicProductCandidate): string {
  return [candidate.title, candidate.description, candidate.material, ...Object.values(candidate.specifications)].filter(Boolean).join(' ');
}

function exactContains(container: string, value: string | null): boolean {
  return Boolean(value && normalizeText(container).includes(normalizeText(value)));
}

export function rankCandidate(request: PublicProductSearchRequest, candidate: PublicProductCandidate): PublicProductCandidate {
  const text = candidateText(candidate);
  const matchedSignals: string[] = [];
  const conflictingSignals: string[] = [];
  let score = 0;

  if (request.model && exactContains(text, request.model)) {
    score += 0.45;
    matchedSignals.push('型号一致');
  }

  const nameScore = overlap(request.productName, candidate.title);
  score += nameScore * 0.3;
  if (nameScore >= 0.5) matchedSignals.push('产品名称高度相关');
  else if (nameScore > 0) matchedSignals.push('产品名称部分相关');

  const categoryScore = overlap(request.category, text);
  score += categoryScore * 0.08;
  if (categoryScore > 0) matchedSignals.push('类别相关');

  const applicationScore = overlap(request.application, text);
  score += applicationScore * 0.07;
  if (applicationScore > 0) matchedSignals.push('应用场景相关');

  if (request.material) {
    const materialScore = overlap(request.material, candidate.material ?? text);
    if (candidate.material && materialScore === 0) {
      score -= 0.3;
      conflictingSignals.push(`材料不一致：客户为${request.material}，候选为${candidate.material}`);
    } else if (materialScore > 0 || exactContains(text, request.material)) {
      score += 0.08;
      matchedSignals.push('材料相关');
    }
  }

  const specificationEntries = Object.entries(request.specifications);
  let specificationMatches = 0;
  let specificationConflicts = 0;
  for (const [key, value] of specificationEntries) {
    const candidateValue = candidate.specifications[key];
    if (candidateValue) {
      if (normalizeText(candidateValue) === normalizeText(value)) specificationMatches += 1;
      else {
        specificationConflicts += 1;
        conflictingSignals.push(`规格不一致：${key}`);
      }
    } else if (exactContains(text, value)) specificationMatches += 1;
  }
  if (specificationEntries.length) {
    score += (specificationMatches / specificationEntries.length) * 0.12;
    score -= (specificationConflicts / specificationEntries.length) * 0.18;
    if (specificationMatches) matchedSignals.push(`${specificationEntries.length}项规格中${specificationMatches}项相关`);
  }

  return {
    ...candidate,
    matchedSignals,
    conflictingSignals,
    score: Number(Math.max(0, Math.min(1, score)).toFixed(4)),
    needsHumanReview: true,
  };
}

