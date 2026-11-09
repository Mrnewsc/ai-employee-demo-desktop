import type { SourceLocation, VersionedContract } from '../types';

export type PublicSearchReason = 'catalog-none' | 'manual-search' | 'test-harness';

export type PublicSourceType =
  | 'marketplace'
  | 'manufacturer'
  | 'supplier-directory'
  | 'search-engine-index'
  | 'public-web'
  | 'manual';

export type PublicSourceStatus =
  | 'AVAILABLE'
  | 'SOURCE_REQUIRES_AUTH'
  | 'SOURCE_BLOCKED'
  | 'SOURCE_UNAVAILABLE';

export interface CustomerSearchEvidence extends VersionedContract {
  field: string;
  text: string;
  sourceFile: string;
  source: SourceLocation;
}

export interface PublicSearchImageReference extends VersionedContract {
  imageId: string;
  sourceFile: string;
  mimeType: string | null;
  page: number | null;
  bbox: [number, number, number, number] | null;
  sha256: string | null;
  availableForVisualSearch: boolean;
}

export interface PublicProductSearchRequest extends VersionedContract {
  requestId: string;
  extractedProductId: string;
  productName: string | null;
  model: string | null;
  specifications: Record<string, string>;
  material: string | null;
  application: string | null;
  category: string | null;
  keywords: string[];
  customerEvidence: CustomerSearchEvidence[];
  imageReferences: PublicSearchImageReference[];
  searchReason: PublicSearchReason;
}

export interface PublicSearchQuery extends VersionedContract {
  queryId: string;
  text: string;
  sourceFields: string[];
}

export interface PublicSourceEvidence extends VersionedContract {
  evidenceId: string;
  evidenceType: 'search-result' | 'public-page' | 'structured-data' | 'meta';
  sourceUrl: string;
  retrievedAt: string;
  title: string;
  snippet: string | null;
  imageUrl: string | null;
  supportsFields: string[];
}

export interface ProviderCandidate extends VersionedContract {
  providerCandidateId: string;
  title: string;
  source: string;
  sourceType: PublicSourceType;
  url: string;
  imageUrl: string | null;
  priceText: string | null;
  currency: string | null;
  moq: string | null;
  supplierName: string | null;
  location: string | null;
  specifications: Record<string, string>;
  material: string | null;
  description: string | null;
  searchQuery: string;
  sourceEvidence: PublicSourceEvidence[];
}

export interface PublicProductCandidate extends VersionedContract {
  candidateId: string;
  title: string;
  normalizedTitle: string;
  source: string;
  sourceType: PublicSourceType;
  url: string;
  domain: string;
  imageUrl: string | null;
  priceText: string | null;
  currency: string | null;
  moq: string | null;
  supplierName: string | null;
  location: string | null;
  specifications: Record<string, string>;
  material: string | null;
  description: string | null;
  searchQuery: string;
  matchedSignals: string[];
  conflictingSignals: string[];
  score: number;
  retrievedAt: string;
  needsHumanReview: true;
  sourceEvidence: PublicSourceEvidence[];
}

export interface ProviderSearchResult extends VersionedContract {
  provider: string;
  status: PublicSourceStatus;
  query: PublicSearchQuery;
  candidates: ProviderCandidate[];
  rawResultCount: number;
  durationMs: number;
  message: string | null;
}

export interface ProviderHealthResult extends VersionedContract {
  provider: string;
  status: PublicSourceStatus;
  checkedAt: string;
  durationMs: number;
  message: string | null;
}

export interface CandidateSearchProvider {
  readonly provider: string;
  search(request: PublicProductSearchRequest, query: PublicSearchQuery, signal?: AbortSignal): Promise<ProviderSearchResult>;
  healthCheck(signal?: AbortSignal): Promise<ProviderHealthResult>;
}

export interface CandidateValidationIssue extends VersionedContract {
  code:
    | 'INVALID_URL'
    | 'MISSING_SOURCE_EVIDENCE'
    | 'TITLE_NOT_SUPPORTED'
    | 'FIELD_NOT_SUPPORTED'
    | 'EVIDENCE_URL_MISMATCH';
  field: string | null;
  message: string;
}

export interface PublicSearchDiagnostics extends VersionedContract {
  providerStatuses: Array<{ provider: string; status: PublicSourceStatus; message: string | null }>;
  queryCount: number;
  rawResultCount: number;
  normalizedCandidateCount: number;
  rejectedCandidateCount: number;
  deduplicatedCandidateCount: number;
  durationMs: number;
}

export interface PublicProductSearchResult extends VersionedContract {
  requestId: string;
  extractedProductId: string;
  searchReason: PublicSearchReason;
  queries: PublicSearchQuery[];
  candidates: PublicProductCandidate[];
  diagnostics: PublicSearchDiagnostics;
  needsHumanReview: true;
  createdAt: string;
}

