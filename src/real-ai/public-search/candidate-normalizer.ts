import { SCHEMA_VERSION } from '../types';
import type { ProviderCandidate, PublicProductCandidate } from './contracts';

export function normalizeText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `public_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function normalizeProviderCandidate(candidate: ProviderCandidate): PublicProductCandidate {
  const url = new URL(candidate.url);
  const retrievedAt = candidate.sourceEvidence
    .map((evidence) => evidence.retrievedAt)
    .sort()
    .at(-1) ?? new Date(0).toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    candidateId: stableId(`${url.href}|${candidate.title}`),
    title: candidate.title.normalize('NFKC').replace(/\s+/g, ' ').trim(),
    normalizedTitle: normalizeText(candidate.title),
    source: candidate.source,
    sourceType: candidate.sourceType,
    url: url.href,
    domain: url.hostname.toLocaleLowerCase(),
    imageUrl: candidate.imageUrl,
    priceText: candidate.priceText,
    currency: candidate.currency,
    moq: candidate.moq,
    supplierName: candidate.supplierName,
    location: candidate.location,
    specifications: structuredClone(candidate.specifications),
    material: candidate.material,
    description: candidate.description,
    searchQuery: candidate.searchQuery,
    matchedSignals: [],
    conflictingSignals: [],
    score: 0,
    retrievedAt,
    needsHumanReview: true,
    sourceEvidence: candidate.sourceEvidence.map((evidence) => ({ ...evidence, supportsFields: [...evidence.supportsFields] })),
  };
}

