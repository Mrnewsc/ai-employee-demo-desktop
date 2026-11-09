import { SCHEMA_VERSION } from '../types';
import type { PublicProductSearchRequest, PublicSearchQuery } from './contracts';

function clean(value: string | null | undefined): string | null {
  const normalized = value?.normalize('NFKC').replace(/\s+/g, ' ').trim();
  return normalized ? normalized : null;
}

function unique(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function queryId(index: number, text: string): string {
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `query_${index + 1}_${(hash >>> 0).toString(16)}`;
}

export class QueryBuilder {
  build(request: PublicProductSearchRequest): PublicSearchQuery[] {
    const name = clean(request.productName);
    const model = clean(request.model);
    const material = clean(request.material);
    const category = clean(request.category);
    const application = clean(request.application);
    const specificationValues = Object.values(request.specifications).map(clean).filter((value): value is string => Boolean(value));
    const keywords = request.keywords.map(clean).filter((value): value is string => Boolean(value));
    const plans: Array<{ parts: Array<string | null>; fields: string[] }> = [];

    if (model) plans.push({ parts: [name, model], fields: ['productName', 'model'] });
    if (name && material) plans.push({ parts: [name, material], fields: ['productName', 'material'] });
    if (name && category) plans.push({ parts: [category, name], fields: ['category', 'productName'] });
    if (name && specificationValues.length) plans.push({ parts: [name, ...specificationValues.slice(0, 2)], fields: ['productName', 'specifications'] });
    if (name && application) plans.push({ parts: [name, application], fields: ['productName', 'application'] });
    if (name && keywords.length) plans.push({ parts: [name, ...keywords.slice(0, 2)], fields: ['productName', 'keywords'] });
    plans.push({ parts: [name ?? model], fields: [name ? 'productName' : 'model'] });

    const seen = new Set<string>();
    return plans.flatMap((plan) => {
      const text = unique(plan.parts.map(clean)).join(' ');
      if (!text || seen.has(text)) return [];
      seen.add(text);
      return [{ schemaVersion: SCHEMA_VERSION, queryId: queryId(seen.size - 1, text), text, sourceFields: plan.fields }];
    }).slice(0, 5);
  }
}

