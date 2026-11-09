import type { ProductRecord, ProductSpecification } from '../catalog';
import { normalizeSpecificationName, normalizeUnicode, parseSpecification } from '../catalog';
import type { ExtractedProductV1 } from '../extraction';
import { SCHEMA_VERSION } from '../types';
import type { DimensionAssessment, MatchEvidence, MatchPolicy, MatchRule, SpecificationRule } from './contracts';

interface ComparableValue {
  raw: string;
  normalized: string;
  min: number | null;
  max: number | null;
  baseUnit: string | null;
}

export interface SpecificationComparisonResult {
  name: string;
  status: 'matched' | 'missing' | 'conflicting' | 'not-comparable';
  customerValue: string;
  catalogValue: string | null;
  rule: SpecificationRule;
}

function stripApproximation(value: string): string {
  return normalizeUnicode(value).replace(/^(?:约|大约|大概|approximately|approx\.?)[\s:]*/i, '');
}

function fallbackComparable(value: string): ComparableValue {
  const normalized = stripApproximation(value).replace(/\s+/g, '');
  const range = normalized.match(/^(-?\d+(?:\.\d+)?)(?:-|~|～|至)(-?\d+(?:\.\d+)?)(.*)$/);
  const single = normalized.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
  if (range) {
    const left = parseSpecification('value', `${range[1]}${range[3]}`);
    const right = parseSpecification('value', `${range[2]}${range[3]}`);
    if (left.baseValue !== null && right.baseValue !== null && left.baseUnit === right.baseUnit) {
      return { raw: value, normalized, min: Math.min(left.baseValue, right.baseValue), max: Math.max(left.baseValue, right.baseValue), baseUnit: left.baseUnit };
    }
    return { raw: value, normalized, min: Number(range[1]), max: Number(range[2]), baseUnit: normalizeUnicode(range[3]).toLowerCase() || null };
  }
  if (single) {
    const parsed = parseSpecification('value', normalized);
    if (parsed.baseValue !== null) return { raw: value, normalized: parsed.normalizedValue, min: parsed.baseValue, max: parsed.baseValue, baseUnit: parsed.baseUnit };
    return { raw: value, normalized, min: Number(single[1]), max: Number(single[1]), baseUnit: normalizeUnicode(single[2]).toLowerCase() || null };
  }
  return { raw: value, normalized: normalized.toLocaleUpperCase('en-US'), min: null, max: null, baseUnit: null };
}

function detailValue(candidate: ProductRecord, name: string): ProductSpecification | undefined {
  return candidate.specificationDetails.find((entry) => entry.normalizedName === name);
}

function comparableCatalogValue(candidate: ProductRecord, name: string, value: string): ComparableValue {
  const detail = detailValue(candidate, name);
  if (detail?.baseValue !== null && detail?.baseValue !== undefined) {
    return { raw: value, normalized: detail.normalizedValue, min: detail.baseValue, max: detail.baseValue, baseUnit: detail.baseUnit };
  }
  return fallbackComparable(value);
}

function sameUnit(left: ComparableValue, right: ComparableValue): boolean {
  return left.baseUnit === right.baseUnit || (!left.baseUnit && !right.baseUnit);
}

function numericMatch(customer: ComparableValue, catalog: ComparableValue, rule: SpecificationRule): boolean | null {
  if (customer.min === null || customer.max === null || catalog.min === null || catalog.max === null || !sameUnit(customer, catalog)) return null;
  const tolerance = Math.max(Math.abs(customer.max), Math.abs(catalog.max), 1) * rule.toleranceRatio;
  if (rule.comparison === 'candidate-minimum') return catalog.max + tolerance >= customer.max;
  if (rule.comparison === 'candidate-maximum') return catalog.min - tolerance <= customer.min;
  const customerIsRange = customer.min !== customer.max;
  const catalogIsRange = catalog.min !== catalog.max;
  if (customerIsRange && !catalogIsRange) return catalog.min >= customer.min - tolerance && catalog.max <= customer.max + tolerance;
  if (!customerIsRange && catalogIsRange) return customer.min >= catalog.min - tolerance && customer.max <= catalog.max + tolerance;
  if (customerIsRange && catalogIsRange) return customer.max >= catalog.min - tolerance && catalog.max >= customer.min - tolerance;
  return Math.abs(customer.min - catalog.min) <= tolerance;
}

function customerSpecifications(product: ExtractedProductV1): Record<string, string> {
  const specifications: Record<string, string> = {};
  for (const [name, value] of Object.entries(product.specifications)) specifications[normalizeSpecificationName(name)] = value;
  if (product.material && !specifications['材质']) specifications['材质'] = product.material;
  return specifications;
}

export function compareSpecifications(product: ExtractedProductV1, candidate: ProductRecord, policy: MatchPolicy): SpecificationComparisonResult[] {
  const results: SpecificationComparisonResult[] = [];
  for (const [rawName, customerValue] of Object.entries(customerSpecifications(product))) {
    const name = normalizeSpecificationName(rawName);
    const rule = policy.specificationRules[name] ?? { name, ...policy.defaultSpecificationRule };
    const catalogValue = candidate.specifications[name] ?? null;
    if (catalogValue === null) {
      results.push({ name, status: 'missing', customerValue, catalogValue, rule });
      continue;
    }
    const customer = fallbackComparable(customerValue);
    const catalog = comparableCatalogValue(candidate, name, catalogValue);
    const numeric = numericMatch(customer, catalog, rule);
    if (numeric !== null) {
      results.push({ name, status: numeric ? 'matched' : 'conflicting', customerValue, catalogValue, rule });
      continue;
    }
    const exact = customer.normalized === catalog.normalized || normalizeUnicode(customerValue).toLocaleUpperCase('en-US') === normalizeUnicode(catalogValue).toLocaleUpperCase('en-US');
    results.push({ name, status: exact ? 'matched' : 'not-comparable', customerValue, catalogValue, rule });
  }
  return results;
}

function sourceEvidence(product: ExtractedProductV1, field: string, value: string): MatchEvidence[] {
  const fields = field === '材质' ? ['material', 'specifications.材质'] : [`specifications.${field}`];
  return product.evidence.filter((entry) => fields.includes(entry.field)).map((entry) => ({
    schemaVersion: SCHEMA_VERSION,
    side: 'customer',
    dimension: 'specification',
    field: fields[0],
    value,
    description: `客户资料规格 ${field}：${value}`,
    sourceFile: 'sourceFile' in entry ? String(entry.sourceFile) : product.sourceFile,
    source: entry.source,
    catalogProductId: null,
    catalogVersion: null,
  }));
}

export function matchSpecifications(product: ExtractedProductV1, candidate: ProductRecord, policy: MatchPolicy, catalogVersion: number | null): DimensionAssessment {
  const comparisons = compareSpecifications(product, candidate, policy);
  if (!comparisons.length) return { dimension: 'specification', available: false, score: 0, matchedRules: [], conflictingRules: [], evidence: [], hasHardConflict: false, hasMissingHardSpecification: false };
  const matchedRules: MatchRule[] = [];
  const conflictingRules: MatchRule[] = [];
  const evidence: MatchEvidence[] = [];
  let scored = 0;
  let score = 0;
  let hasHardConflict = false;
  let hasMissingHardSpecification = false;
  for (const comparison of comparisons) {
    const { name, customerValue, catalogValue, rule, status } = comparison;
    const code = status === 'matched' ? 'SPEC_MATCHED' : status === 'missing' ? 'SPEC_MISSING' : status === 'conflicting' ? 'SPEC_CONFLICT' : 'SPEC_NOT_COMPARABLE';
    const description = status === 'matched'
      ? `${name}匹配：客户 ${customerValue}，产品库 ${catalogValue}`
      : status === 'missing'
        ? `${name}无法验证：产品库未提供该规格`
        : status === 'conflicting'
          ? `${name}存在${rule.importance === 'hard' ? '硬' : '软'}冲突：客户 ${customerValue}，产品库 ${catalogValue}`
          : `${name}格式不可安全比较：客户 ${customerValue}，产品库 ${catalogValue}`;
    const matchRule: MatchRule = { schemaVersion: SCHEMA_VERSION, code, dimension: 'specification', description, customerValue, catalogValue, importance: rule.importance };
    if (status === 'matched') matchedRules.push(matchRule);
    else conflictingRules.push(matchRule);
    scored += 1;
    if (status === 'matched') score += 1;
    else if (status === 'not-comparable' && rule.importance === 'informational') score += 0.5;
    if (rule.importance === 'hard' && status === 'conflicting') hasHardConflict = true;
    if (rule.importance === 'hard' && (status === 'missing' || status === 'not-comparable')) hasMissingHardSpecification = true;
    evidence.push(...sourceEvidence(product, name, customerValue));
    if (catalogValue !== null) evidence.push({
      schemaVersion: SCHEMA_VERSION,
      side: 'catalog',
      dimension: 'specification',
      field: `specifications.${name}`,
      value: catalogValue,
      description: `产品库规格 ${name}：${catalogValue}`,
      sourceFile: candidate.source.fileName,
      source: null,
      catalogProductId: candidate.productId,
      catalogVersion,
    });
  }
  return { dimension: 'specification', available: true, score: scored ? score / scored : 0, matchedRules, conflictingRules, evidence, hasHardConflict, hasMissingHardSpecification };
}
