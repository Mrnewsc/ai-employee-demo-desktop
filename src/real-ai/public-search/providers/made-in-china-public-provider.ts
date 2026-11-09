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

export interface MadeInChinaProviderOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxRawCandidates?: number;
  now?: () => Date;
}

function attribute(node: HtmlNode | null | undefined, name: string): string | null {
  return node?.attrs?.find((item) => item.name === name)?.value ?? null;
}

function classList(node: HtmlNode): string[] {
  return (attribute(node, 'class') ?? '').split(/\s+/).filter(Boolean);
}

function descendants(node: HtmlNode, predicate: (candidate: HtmlNode) => boolean, output: HtmlNode[] = []): HtmlNode[] {
  if (predicate(node)) output.push(node);
  for (const child of node.childNodes ?? []) descendants(child, predicate, output);
  return output;
}

function first(node: HtmlNode, predicate: (candidate: HtmlNode) => boolean): HtmlNode | null {
  if (predicate(node)) return node;
  for (const child of node.childNodes ?? []) {
    const result = first(child, predicate);
    if (result) return result;
  }
  return null;
}

function textContent(node: HtmlNode | null): string {
  if (!node) return '';
  if (node.nodeName === '#text') return node.value ?? '';
  return (node.childNodes ?? []).map(textContent).join('');
}

function cleanText(value: string | null | undefined): string | null {
  const cleaned = value?.normalize('NFKC').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned : null;
}

function sourceStatus(response: Response, body: string): PublicSourceStatus {
  if ([401, 407].includes(response.status)) return 'SOURCE_REQUIRES_AUTH';
  if ([403, 429].includes(response.status)) return 'SOURCE_BLOCKED';
  if (!response.ok) return 'SOURCE_UNAVAILABLE';
  const hasPublicProducts = /class=["'][^"']*products-item[^"']*["']/i.test(body)
    && /class=["'][^"']*product-name[^"']*["']/i.test(body);
  if (hasPublicProducts) return 'AVAILABLE';
  if (/captcha|verify you are human|access denied/i.test(body)) return 'SOURCE_BLOCKED';
  if (/sign in to continue|login required/i.test(body)) return 'SOURCE_REQUIRES_AUTH';
  return 'AVAILABLE';
}

function searchUrl(query: string): string {
  const slug = query.normalize('NFKC').trim().replace(/\s+/g, '_');
  return `https://www.made-in-china.com/products-search/hot-china-products/${encodeURIComponent(slug)}.html`;
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function toAbsoluteUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value, 'https://www.made-in-china.com').href;
  } catch {
    return null;
  }
}

function parseProducts(html: string, query: PublicSearchQuery, searchPageUrl: string, retrievedAt: string, maxCandidates: number): ProviderCandidate[] {
  const document = parse5.parse(html) as HtmlNode;
  const productNodes = descendants(document, (node) => node.tagName === 'div' && classList(node).includes('products-item'));
  return productNodes.flatMap((node, index) => {
    const nameNode = first(node, (candidate) => candidate.tagName === 'h2' && classList(candidate).includes('product-name'));
    const linkNode = nameNode ? first(nameNode, (candidate) => candidate.tagName === 'a') : null;
    const title = cleanText(attribute(linkNode, 'title') ?? textContent(linkNode));
    const url = toAbsoluteUrl(attribute(linkNode, 'href'));
    if (!title || !url) return [];
    const imageNode = first(node, (candidate) => candidate.tagName === 'img' && Boolean(attribute(candidate, 'data-original') ?? attribute(candidate, 'src')));
    const imageUrl = toAbsoluteUrl(attribute(imageNode, 'data-original') ?? attribute(imageNode, 'src'));
    const descriptionNode = first(node, (candidate) => candidate.tagName === 'div' && (classList(candidate).includes('property') || classList(candidate).includes('prod-desc')));
    const supplierNode = first(node, (candidate) => candidate.tagName === 'a' && classList(candidate).some((name) => /company|supplier/.test(name)));
    const priceNode = first(node, (candidate) => candidate.tagName === 'div' && classList(candidate).some((name) => /price/.test(name)));
    const description = cleanText(textContent(descriptionNode));
    const supplierName = cleanText(textContent(supplierNode));
    const priceText = cleanText(textContent(priceNode));
    const supportsFields = ['title'];
    if (imageUrl) supportsFields.push('imageUrl');
    if (description) supportsFields.push('description');
    if (supplierName) supportsFields.push('supplierName');
    if (priceText) supportsFields.push('priceText');
    const evidence: PublicSourceEvidence = {
      schemaVersion: SCHEMA_VERSION,
      evidenceId: `mic_${stableId(`${url}|${retrievedAt}`)}`,
      evidenceType: 'search-result',
      sourceUrl: searchPageUrl,
      retrievedAt,
      title,
      snippet: description,
      imageUrl,
      supportsFields,
    };
    return [{
      schemaVersion: SCHEMA_VERSION,
      providerCandidateId: `mic_candidate_${stableId(url)}`,
      title,
      source: 'Made-in-China.com',
      sourceType: 'supplier-directory',
      url,
      imageUrl,
      priceText,
      currency: null,
      moq: null,
      supplierName,
      location: null,
      specifications: {},
      material: null,
      description,
      searchQuery: query.text,
      sourceEvidence: [evidence],
    } satisfies ProviderCandidate];
  }).slice(0, maxCandidates);
}

export class MadeInChinaPublicProvider implements CandidateSearchProvider {
  readonly provider = 'made-in-china-public';
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly maxRawCandidates: number;
  private readonly now: () => Date;

  constructor(options: MadeInChinaProviderOptions = {}) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxRawCandidates = options.maxRawCandidates ?? 12;
    this.now = options.now ?? (() => new Date());
  }

  async healthCheck(signal?: AbortSignal): Promise<ProviderHealthResult> {
    const startedAt = performance.now();
    try {
      const response = await this.request('Car Phone Holder', signal);
      const status = sourceStatus(response.response, response.body);
      return {
        schemaVersion: SCHEMA_VERSION,
        provider: this.provider,
        status,
        checkedAt: this.now().toISOString(),
        durationMs: Math.round(performance.now() - startedAt),
        message: status === 'AVAILABLE' ? null : '公开页面当前不可稳定访问',
      };
    } catch (error) {
      return {
        schemaVersion: SCHEMA_VERSION,
        provider: this.provider,
        status: error instanceof PublicSearchProviderError ? error.status : 'SOURCE_UNAVAILABLE',
        checkedAt: this.now().toISOString(),
        durationMs: Math.round(performance.now() - startedAt),
        message: error instanceof Error ? error.message : '公开来源健康检查失败',
      };
    }
  }

  async search(_request: PublicProductSearchRequest, query: PublicSearchQuery, signal?: AbortSignal): Promise<ProviderSearchResult> {
    const startedAt = performance.now();
    try {
      const { response, body } = await this.request(query.text, signal);
      const status = sourceStatus(response, body);
      if (status !== 'AVAILABLE') {
        return { schemaVersion: SCHEMA_VERSION, provider: this.provider, status, query, candidates: [], rawResultCount: 0, durationMs: Math.round(performance.now() - startedAt), message: '公开来源拒绝或限制访问' };
      }
      const retrievedAt = this.now().toISOString();
      const candidates = parseProducts(body, query, response.url || searchUrl(query.text), retrievedAt, this.maxRawCandidates);
      return {
        schemaVersion: SCHEMA_VERSION,
        provider: this.provider,
        status: 'AVAILABLE',
        query,
        candidates,
        rawResultCount: candidates.length,
        durationMs: Math.round(performance.now() - startedAt),
        message: candidates.length ? null : '公开页面可访问，但当前查询未解析到候选',
      };
    } catch (error) {
      const status = error instanceof PublicSearchProviderError ? error.status : 'SOURCE_UNAVAILABLE';
      return { schemaVersion: SCHEMA_VERSION, provider: this.provider, status, query, candidates: [], rawResultCount: 0, durationMs: Math.round(performance.now() - startedAt), message: error instanceof Error ? error.message : '公开来源检索失败' };
    }
  }

  private async request(query: string, signal?: AbortSignal): Promise<{ response: Response; body: string }> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await this.fetchImpl(searchUrl(query), {
        signal: combined,
        redirect: 'follow',
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en-US,en;q=0.8',
          'user-agent': 'Mozilla/5.0 (compatible; ShuyuanProductResearch/0.1; internal-validation)',
        },
      });
    } catch (error) {
      if (combined.aborted) throw new PublicSearchProviderError('SOURCE_UNAVAILABLE', '公开来源请求超时或被取消', { cause: error });
      throw new PublicSearchProviderError('SOURCE_UNAVAILABLE', '公开来源网络请求失败', { cause: error });
    }
    const body = await response.text();
    return { response, body };
  }
}
