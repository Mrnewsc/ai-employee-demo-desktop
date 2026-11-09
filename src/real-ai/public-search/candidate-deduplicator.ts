import type { PublicProductCandidate } from './contracts';

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|spm|from|ref)/i.test(key)) url.searchParams.delete(key);
  }
  return url.href.replace(/\/$/, '');
}

export function deduplicateCandidates(candidates: PublicProductCandidate[]): PublicProductCandidate[] {
  const byKey = new Map<string, PublicProductCandidate>();
  for (const candidate of candidates) {
    const key = canonicalUrl(candidate.url);
    const existing = byKey.get(key);
    if (!existing || candidate.score > existing.score) {
      byKey.set(key, candidate);
      continue;
    }
    const evidenceIds = new Set(existing.sourceEvidence.map((evidence) => evidence.evidenceId));
    for (const evidence of candidate.sourceEvidence) {
      if (!evidenceIds.has(evidence.evidenceId)) existing.sourceEvidence.push(evidence);
    }
  }
  return [...byKey.values()];
}
