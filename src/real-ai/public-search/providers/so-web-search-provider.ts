import * as parse5 from 'parse5';
import { SCHEMA_VERSION } from '../../types';
import type {
  CandidateSearchProvider,
  ProviderCandidate,
  ProviderHealthResult,
  ProviderSearchResult,
  PublicProductSearchRequest,
  PublicSearchQuery,
  PublicSourceEvidence,
  PublicSourceStatus,
} from '../contracts';
import { PublicSearchProviderError } from '../errors';

interface HtmlNode {
  nodeName?: string;
  tagName?: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
}

export interface SoWebSearchProviderOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxRawCandidates?: number;
  now?: () => Date;
}

function attribute(node: HtmlNode | null | undefined, name: string): string | null {
  return node?.attrs?.find((item) => item.name === name)?.value ?? null;
}

function classes(node: HtmlNode): string[] {
  return (attribute(node, 'class') ?? '').split(/\s+/).filter(Boolean);
}

function first(node: HtmlNode, predicate: (candidate: HtmlNode) => boolean): HtmlNode | null {
  if (predicate(node)) return node;
  for (const child of node.childNodes ?? []) {
    const result = first(child, predicate);
    if (result) return result;
  }
  return null;
}

function all(node: HtmlNode, predicate: (candidate: HtmlNode) => boolean, output: HtmlNode[] = []): HtmlNode[] {
  if (predicate(node)) output.push(node);
  for (const child of node.childNodes ?? []) all(child, predicate, output);
  return output;
}

function text(node: HtmlNode | null): string {
  if (!node) return '';
  if (node.nodeName === '#text') return node.value ?? '';
  return (node.childNodes ?? []).map(text).join('');
}

function clean(value: string | null | undefined): string | null {
  const normalized = value?.normalize('NFKC').replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function searchUrl(query: string): string {
  return `https://www.so.com/s?q=${encodeURIComponent(query.normalize('NFKC').trim())}`;
}

function statusFor(response: Response, body: string): PublicSourceStatus {
  if ([401, 407].includes(response.status)) return 'SOURCE_REQUIRES_AUTH';
  if ([403, 429].includes(response.status)) return 'SOURCE_BLOCKED';
  if (!response.ok) return 'SOURCE_UNAVAILABLE';
  if (/class=["'][^"']*res-list[^"']*["']/i.test(body)) return 'AVAILABLE';
  if (/captcha|verify you are human|access denied/i.test(body)) return 'SOURCE_BLOCKED';
  return 'AVAILABLE';
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function publicUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function parseResults(html: string, query: PublicSearchQuery, evidenceUrl: string, retrievedAt: string, maxCandidates: number): ProviderCandidate[] {
  const document = parse5.parse(html) as HtmlNode;
  const rows = all(document, (node) => node.tagName === 'li' && classes(node).includes('res-list'));
  return rows.flatMap((row) => {
    const heading = first(row, (node) => node.tagName === 'h3' && classes(node).includes('res-title'));
    const link = heading ? first(heading, (node) => node.tagName === 'a') : null;
    const title = clean(text(link));
    const url = publicUrl(attribute(link, 'data-mdurl') ?? attribute(link, 'href'));
    if (!title || !url) return [];
    const descriptionNodes = all(row, (node) => node.tagName === 'p' && !classes(node).includes('g-linkinfo'));
    const description = clean(descriptionNodes.map((node) => text(node)).join(' '));
    const image = first(row, (node) => node.tagName === 'img');
    const imageUrl = publicUrl(attribute(image, 'data-src') ?? attribute(image, 'src'));
    const priceNode = descriptionNodes.find((node) => /价格[:：]/u.test(text(node)));
    const priceText = priceNode ? clean(text(priceNode).replace(/^.*?价格[:：]\s*/u, '')) : null;
    const supportsFields = ['title'];
    if (description) supportsFields.push('description');
    if (imageUrl) supportsFields.push('imageUrl');
    if (priceText) supportsFields.push('priceText');
    const evidence: PublicSourceEvidence = {
      schemaVersion: SCHEMA_VERSION,
      evidenceId: `so_${stableId(`${evidenceUrl}|${url}|${retrievedAt}`)}`,
      evidenceType: 'search-result',
      sourceUrl: evidenceUrl,
      retrievedAt,
      title,
      snippet: description,
      imageUrl,
      supportsFields,
    };
    return [{
      schemaVersion: SCHEMA_VERSION,
      providerCandidateId: `so_candidate_${stableId(url)}`,
      title,
      source: '360搜索公开索引',
      sourceType: 'search-engine-index',
      url,
      imageUrl,
      priceText,
      currency: null,
      moq: null,
      supplierName: null,
      location: null,
      specifications: {},
      material: null,
      description,
      searchQuery: query.text,
      sourceEvidence: [evidence],
    } satisfies ProviderCandidate];
  }).slice(0, maxCandidates);
}

export class SoWebSearchProvider implements CandidateSearchProvider {
  readonly provider = 'so-public-index';
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly maxRawCandidates: number;
  private readonly now: () => Date;

  constructor(options: SoWebSearchProviderOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxRawCandidates = options.maxRawCandidates ?? 12;
    this.now = options.now ?? (() => new Date());
  }

  async healthCheck(signal?: AbortSignal): Promise<ProviderHealthResult> {
    const startedAt = performance.now();
    try {
      const { response, body } = await this.request('手机支架', signal);
      const status = statusFor(response, body);
      return { schemaVersion: SCHEMA_VERSION, provider: this.provider, status, checkedAt: this.now().toISOString(), durationMs: Math.round(performance.now() - startedAt), message: status === 'AVAILABLE' ? null : '公开搜索索引当前不可用' };
    } catch (error) {
      return { schemaVersion: SCHEMA_VERSION, provider: this.provider, status: error instanceof PublicSearchProviderError ? error.status : 'SOURCE_UNAVAILABLE', checkedAt: this.now().toISOString(), durationMs: Math.round(performance.now() - startedAt), message: error instanceof Error ? error.message : '公开搜索索引健康检查失败' };
    }
  }

  async search(_request: PublicProductSearchRequest, query: PublicSearchQuery, signal?: AbortSignal): Promise<ProviderSearchResult> {
    const startedAt = performance.now();
    try {
      const { response, body } = await this.request(query.text, signal);
      const status = statusFor(response, body);
      if (status !== 'AVAILABLE') return { schemaVersion: SCHEMA_VERSION, provider: this.provider, status, query, candidates: [], rawResultCount: 0, durationMs: Math.round(performance.now() - startedAt), message: '公开搜索索引限制访问' };
      const candidates = parseResults(body, query, response.url || searchUrl(query.text), this.now().toISOString(), this.maxRawCandidates);
      return { schemaVersion: SCHEMA_VERSION, provider: this.provider, status: 'AVAILABLE', query, candidates, rawResultCount: candidates.length, durationMs: Math.round(performance.now() - startedAt), message: candidates.length ? null : '公开索引可访问，但当前查询没有候选' };
    } catch (error) {
      return { schemaVersion: SCHEMA_VERSION, provider: this.provider, status: error instanceof PublicSearchProviderError ? error.status : 'SOURCE_UNAVAILABLE', query, candidates: [], rawResultCount: 0, durationMs: Math.round(performance.now() - startedAt), message: error instanceof Error ? error.message : '公开搜索索引请求失败' };
    }
  }

  private async request(query: string, signal?: AbortSignal): Promise<{ response: Response; body: string }> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const response = await this.fetchImpl(searchUrl(query), {
        signal: combined,
        redirect: 'follow',
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'zh-CN,zh;q=0.9',
          'user-agent': 'Mozilla/5.0 (compatible; ShuyuanProductResearch/0.1; internal-validation)',
        },
      });
      return { response, body: await response.text() };
    } catch (error) {
      if (combined.aborted) throw new PublicSearchProviderError('SOURCE_UNAVAILABLE', '公开搜索索引请求超时或被取消', { cause: error });
      throw new PublicSearchProviderError('SOURCE_UNAVAILABLE', '公开搜索索引网络请求失败', { cause: error });
    }
  }
}

