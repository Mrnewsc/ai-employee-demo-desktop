import { normalizeModel, normalizeProductName, normalizeSpecificationName, normalizeUnicode } from '../catalog';

export { normalizeModel, normalizeProductName, normalizeSpecificationName, normalizeUnicode };

export function compactName(value: unknown): string {
  return normalizeProductName(value).replace(/\s+/g, '');
}

export function characterBigrams(value: unknown): Set<string> {
  const normalized = compactName(value);
  if (!normalized) return new Set();
  if (normalized.length === 1) return new Set([normalized]);
  const result = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) result.add(normalized.slice(index, index + 2));
  return result;
}

export function setSimilarity(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

export function textSimilarity(left: unknown, right: unknown): number {
  const a = compactName(left);
  const b = compactName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.9;
  return setSimilarity(characterBigrams(a), characterBigrams(b));
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => normalizeUnicode(value)).filter(Boolean))];
}
