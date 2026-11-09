import { SCHEMA_VERSION } from '../types';
import { deduplicateCandidates } from './candidate-deduplicator';
import { normalizeProviderCandidate } from './candidate-normalizer';
import { rankCandidate } from './candidate-ranker';
import type {
  CandidateSearchProvider,
  PublicProductCandidate,
  PublicProductSearchRequest,
  PublicProductSearchResult,
  PublicSourceStatus,
} from './contracts';
import { validateCandidateEvidence } from './evidence-validator';
import { QueryBuilder } from './query-builder';
import { PublicProductCandidateSchema, PublicProductSearchRequestSchema } from './schemas';

export interface PublicSearchServiceOptions {
  topK?: number;
  maxQueries?: number;
  minScore?: number;
  now?: () => Date;
}

export class PublicSearchService {
  private readonly queryBuilder = new QueryBuilder();
  private readonly topK: number;
  private readonly maxQueries: number;
  private readonly minScore: number;
  private readonly now: () => Date;

  constructor(
    private readonly providers: CandidateSearchProvider[],
    options: PublicSearchServiceOptions = {},
  ) {
    this.topK = Math.min(5, Math.max(1, options.topK ?? 5));
    this.maxQueries = Math.min(5, Math.max(1, options.maxQueries ?? 3));
    this.minScore = Math.min(1, Math.max(0, options.minScore ?? 0.15));
    this.now = options.now ?? (() => new Date());
  }

  async search(input: PublicProductSearchRequest, signal?: AbortSignal): Promise<PublicProductSearchResult> {
    const request = PublicProductSearchRequestSchema.parse(input) as PublicProductSearchRequest;
    const startedAt = performance.now();
    const queries = this.queryBuilder.build(request).slice(0, this.maxQueries);
    const normalized: PublicProductCandidate[] = [];
    const providerStatuses: Array<{ provider: string; status: PublicSourceStatus; message: string | null }> = [];
    let rawResultCount = 0;
    let rejectedCandidateCount = 0;

    for (const provider of this.providers) {
      for (const query of queries) {
        if (signal?.aborted) throw signal.reason;
        let result;
        try {
          result = await provider.search(request, query, signal);
        } catch (error) {
          providerStatuses.push({
            provider: provider.provider,
            status: 'SOURCE_UNAVAILABLE',
            message: error instanceof Error ? error.message : '公开来源Provider执行失败',
          });
          continue;
        }
        providerStatuses.push({ provider: result.provider, status: result.status, message: result.message });
        rawResultCount += result.rawResultCount;
        for (const rawCandidate of result.candidates) {
          try {
            const candidate = normalizeProviderCandidate(rawCandidate);
            const issues = validateCandidateEvidence(candidate);
            if (issues.length) {
              rejectedCandidateCount += 1;
              continue;
            }
            normalized.push(rankCandidate(request, PublicProductCandidateSchema.parse(candidate) as PublicProductCandidate));
          } catch {
            rejectedCandidateCount += 1;
          }
        }
      }
    }

    const deduplicated = deduplicateCandidates(normalized)
      .filter((candidate) => candidate.score >= this.minScore)
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));
    const candidates = deduplicated.slice(0, this.topK).map((candidate) => ({ ...candidate, needsHumanReview: true as const }));
    return {
      schemaVersion: SCHEMA_VERSION,
      requestId: request.requestId,
      extractedProductId: request.extractedProductId,
      searchReason: request.searchReason,
      queries,
      candidates,
      diagnostics: {
        schemaVersion: SCHEMA_VERSION,
        providerStatuses,
        queryCount: queries.length,
        rawResultCount,
        normalizedCandidateCount: normalized.length,
        rejectedCandidateCount,
        deduplicatedCandidateCount: deduplicated.length,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      },
      needsHumanReview: true,
      createdAt: this.now().toISOString(),
    };
  }
}
