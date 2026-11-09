import type { CandidateValidationIssue, PublicProductCandidate } from './contracts';
import { normalizeText } from './candidate-normalizer';

const evidenceRequiredFields = ['title', 'imageUrl', 'priceText', 'moq', 'supplierName', 'location', 'material', 'specifications'] as const;

function supported(candidate: PublicProductCandidate, field: string): boolean {
  return candidate.sourceEvidence.some((evidence) => evidence.supportsFields.includes(field));
}

export function validateCandidateEvidence(candidate: PublicProductCandidate): CandidateValidationIssue[] {
  const issues: CandidateValidationIssue[] = [];
  let candidateUrl: URL | null = null;
  try {
    candidateUrl = new URL(candidate.url);
    if (!['http:', 'https:'].includes(candidateUrl.protocol)) throw new Error('unsupported protocol');
  } catch {
    issues.push({ schemaVersion: '1.0', code: 'INVALID_URL', field: 'url', message: '候选缺少可公开核验的HTTP(S)地址' });
  }
  if (!candidate.sourceEvidence.length) {
    issues.push({ schemaVersion: '1.0', code: 'MISSING_SOURCE_EVIDENCE', field: null, message: '候选没有公开来源证据' });
    return issues;
  }
  if (!supported(candidate, 'title') || !candidate.sourceEvidence.some((evidence) => normalizeText(evidence.title).includes(candidate.normalizedTitle))) {
    issues.push({ schemaVersion: '1.0', code: 'TITLE_NOT_SUPPORTED', field: 'title', message: '候选标题无法由公开来源证据支持' });
  }
  if (candidateUrl && !candidate.sourceEvidence.some((evidence) => {
    if (evidence.evidenceType === 'search-result') return true;
    try { return sameSite(new URL(evidence.sourceUrl).hostname, candidateUrl?.hostname ?? ''); } catch { return false; }
  })) {
    issues.push({ schemaVersion: '1.0', code: 'EVIDENCE_URL_MISMATCH', field: 'url', message: '候选URL与来源证据域名不一致' });
  }
  for (const field of evidenceRequiredFields) {
    const value = candidate[field];
    const present = field === 'specifications' ? Object.keys(value as Record<string, string>).length > 0 : value !== null;
    if (present && !supported(candidate, field)) {
      issues.push({ schemaVersion: '1.0', code: 'FIELD_NOT_SUPPORTED', field, message: `${field}缺少公开来源证据` });
    }
  }
  return issues;
}

function sameSite(leftHost: string, rightHost: string): boolean {
  if (leftHost === rightHost) return true;
  const base = (host: string) => host.toLocaleLowerCase().split('.').slice(-2).join('.');
  return Boolean(leftHost && rightHost && base(leftHost) === base(rightHost));
}
