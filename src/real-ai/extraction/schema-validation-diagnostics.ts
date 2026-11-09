import type { z } from 'zod';

export type SchemaIssueCode =
  | 'MISSING_REQUIRED'
  | 'INVALID_TYPE'
  | 'INVALID_ENUM'
  | 'UNKNOWN_FIELD'
  | 'INVALID_ARRAY'
  | 'INVALID_OBJECT'
  | 'INVALID_UNION'
  | 'INVALID_EVIDENCE_REF'
  | 'INVALID_QUANTITY'
  | 'INVALID_SPECIFICATION'
  | 'ROOT_SHAPE_INVALID'
  | 'OTHER_SCHEMA_ERROR';

export interface SchemaIssue {
  fieldPath: string;
  issueCode: SchemaIssueCode;
  expectedType: string | null;
  receivedType: string;
  expectedConstraint: string | null;
  receivedShape: string;
  message: string;
  repairable: boolean;
  repairReason?: string;
}

type RuntimeIssue = z.core.$ZodIssue & Record<string, unknown>;

const KNOWN_KEYS = new Set([
  'schemaVersion', 'products', 'productName', 'model', 'specifications', 'quantity', 'value', 'unit', 'raw',
  'material', 'process', 'application', 'notes', 'evidenceRefs', 'evidenceId', 'quote',
]);

export function mapZodIssues(issues: z.core.$ZodIssue[], input: unknown): SchemaIssue[] {
  return issues.flatMap((issue) => mapIssue(issue as RuntimeIssue, input));
}

export function safeReceivedShape(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(length=${value.length})`;
  if (typeof value === 'string') return `string(length=${value.length})`;
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    const known = keys.filter((key) => KNOWN_KEYS.has(key)).sort();
    const dynamicCount = keys.length - known.length;
    const details = [known.length ? `known=[${known.join(',')}]` : '', dynamicCount ? `dynamicKeys=${dynamicCount}` : '']
      .filter(Boolean)
      .join(';');
    return `object(keys=${keys.length}${details ? `;${details}` : ''})`;
  }
  return typeof value;
}

export function classifySchemaIssueRepairability(issue: Omit<SchemaIssue, 'repairable' | 'repairReason'>): Pick<SchemaIssue, 'repairable' | 'repairReason'> {
  if (issue.issueCode === 'UNKNOWN_FIELD') {
    return { repairable: true, repairReason: '可删除不属于Wire DTO的额外结构字段，不涉及业务事实。' };
  }
  if (issue.issueCode === 'MISSING_REQUIRED') {
    const structuralDefault = /(?:notes|specifications|evidenceRefs)$/.test(issue.fieldPath)
      || /(?:productName|model|material|process|application|quantity\.(?:value|unit|raw))$/.test(issue.fieldPath);
    return structuralDefault
      ? { repairable: true, repairReason: '允许补充契约要求的空数组、空对象或null，不得补充业务值。' }
      : { repairable: false, repairReason: '缺少的字段无法在不理解业务事实的情况下安全生成。' };
  }
  if (issue.issueCode === 'INVALID_ARRAY' || issue.issueCode === 'INVALID_OBJECT') {
    return { repairable: true, repairReason: '仅允许修复明确的容器包装，不允许转换容器内业务值。' };
  }
  if (issue.issueCode === 'INVALID_EVIDENCE_REF') {
    return { repairable: false, repairReason: 'Evidence引用结构或目标不明确，禁止自动补造或猜测。' };
  }
  if (issue.issueCode === 'INVALID_ENUM' || issue.issueCode === 'INVALID_UNION') {
    return { repairable: false, repairReason: '无法确定正确允许值或联合分支。' };
  }
  if (issue.issueCode === 'INVALID_QUANTITY' || issue.issueCode === 'INVALID_SPECIFICATION') {
    return { repairable: false, repairReason: '数量或规格涉及业务事实与类型语义，禁止自动强转。' };
  }
  if (issue.issueCode === 'ROOT_SHAPE_INVALID') {
    return { repairable: false, repairReason: '根结构错误可能意味着产品对象边界不清楚。' };
  }
  return { repairable: false, repairReason: '该问题无法确定为无语义变化的结构修复。' };
}

function mapIssue(issue: RuntimeIssue, input: unknown): SchemaIssue[] {
  if (issue.code === 'unrecognized_keys') {
    const keys = Array.isArray(issue.keys) ? issue.keys : [];
    return keys.map((_key, index) => buildIssue(issue, input, [...issue.path, `<unknown-field-${index + 1}>`], 'UNKNOWN_FIELD'));
  }
  return [buildIssue(issue, input, issue.path, classifyIssueCode(issue, input))];
}

function buildIssue(issue: RuntimeIssue, input: unknown, path: PropertyKey[], issueCode: SchemaIssueCode): SchemaIssue {
  const received = valueAtPath(input, issue.path);
  const base = {
    fieldPath: formatFieldPath(path),
    issueCode,
    expectedType: expectedType(issue),
    receivedType: simpleType(received),
    expectedConstraint: expectedConstraint(issue),
    receivedShape: safeReceivedShape(received),
    message: safeIssueMessage(issueCode),
  };
  return { ...base, ...classifySchemaIssueRepairability(base) };
}

function classifyIssueCode(issue: RuntimeIssue, input: unknown): SchemaIssueCode {
  const path = issue.path.map(String);
  const received = valueAtPath(input, issue.path);
  if (path.length === 0 || (path.length === 1 && path[0] === 'products')) return 'ROOT_SHAPE_INVALID';
  if (path.includes('evidenceRefs')) return 'INVALID_EVIDENCE_REF';
  if (path.includes('quantity')) return 'INVALID_QUANTITY';
  if (path.includes('specifications')) return 'INVALID_SPECIFICATION';
  if (issue.code === 'invalid_union') return 'INVALID_UNION';
  if (issue.code === 'invalid_value') return 'INVALID_ENUM';
  if (issue.code === 'invalid_type' && received === undefined) return 'MISSING_REQUIRED';
  if (issue.code === 'invalid_type') {
    if (issue.expected === 'array') return 'INVALID_ARRAY';
    if (issue.expected === 'object' || issue.expected === 'record') return 'INVALID_OBJECT';
    return 'INVALID_TYPE';
  }
  return 'OTHER_SCHEMA_ERROR';
}

function formatFieldPath(path: PropertyKey[]): string {
  if (!path.length) return '$';
  let output = '';
  let dynamic = false;
  for (const segment of path) {
    if (typeof segment === 'number') {
      output += `[${segment}]`;
      continue;
    }
    const value = String(segment);
    const safe = dynamic && !KNOWN_KEYS.has(value) ? '<dynamic-key>' : value;
    output += output ? `.${safe}` : safe;
    dynamic = value === 'specifications' || value === 'evidenceRefs';
  }
  return output;
}

function valueAtPath(input: unknown, path: PropertyKey[]): unknown {
  let current = input;
  for (const segment of path) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<PropertyKey, unknown>)[segment];
  }
  return current;
}

function expectedType(issue: RuntimeIssue): string | null {
  if (typeof issue.expected === 'string') return issue.expected;
  if (issue.code === 'invalid_value') return 'allowed literal or enum';
  if (issue.code === 'unrecognized_keys') return 'known object fields';
  return null;
}

function expectedConstraint(issue: RuntimeIssue): string | null {
  if (issue.code === 'too_small' && typeof issue.minimum === 'number') return `minimum=${issue.minimum}`;
  if (issue.code === 'too_big' && typeof issue.maximum === 'number') return `maximum=${issue.maximum}`;
  if (issue.code === 'invalid_value' && Array.isArray(issue.values)) return `allowedValues=${issue.values.length}`;
  return null;
}

function simpleType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function safeIssueMessage(code: SchemaIssueCode): string {
  return `${code}：字段未通过Provider Wire Runtime Schema。`;
}
