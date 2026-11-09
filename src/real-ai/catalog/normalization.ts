/// <reference types="node" />

import { createHash } from 'node:crypto';
import type { ProductSpecification } from './contracts';
import { SCHEMA_VERSION } from '../types';

const DASHES = /[‐‑‒–—―﹘﹣－]/g;
const COMMON_PUNCTUATION = /[，,；;、|｜\n\r]+/g;
const MODEL_SEPARATORS = /[\s\-_.·•/\\]+/g;

const SPECIFICATION_NAMES: Record<string, string> = {
  width: '工作宽度',
  workingwidth: '工作宽度',
  工作宽度: '工作宽度',
  功率: '功率',
  power: '功率',
  产能: '产能',
  capacity: '产能',
  尺寸: '尺寸',
  size: '尺寸',
  dimension: '尺寸',
  材质: '材质',
  material: '材质',
  重量: '重量',
  weight: '重量',
};

const UNIT_RULES: Record<string, { baseUnit: string; factor: number; canonical: string }> = {
  mm: { baseUnit: 'mm', factor: 1, canonical: 'mm' },
  cm: { baseUnit: 'mm', factor: 10, canonical: 'cm' },
  m: { baseUnit: 'mm', factor: 1000, canonical: 'm' },
  g: { baseUnit: 'g', factor: 1, canonical: 'g' },
  kg: { baseUnit: 'g', factor: 1000, canonical: 'kg' },
  w: { baseUnit: 'W', factor: 1, canonical: 'W' },
  kw: { baseUnit: 'W', factor: 1000, canonical: 'kW' },
};

export function normalizeUnicode(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(DASHES, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeProductName(value: unknown): string {
  return normalizeUnicode(value)
    .toLocaleUpperCase('en-US')
    .replace(/[，,。.;；:：、|｜()[\]{}【】<>《》"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeModel(value: unknown): string {
  return normalizeUnicode(value)
    .toLocaleUpperCase('en-US')
    .replace(MODEL_SEPARATORS, '')
    .replace(/[^A-Z0-9\u3400-\u9FFF]/g, '');
}

export function normalizeSpecificationName(value: unknown): string {
  const raw = normalizeUnicode(value);
  const key = raw.toLocaleLowerCase('en-US').replace(/[\s._-]+/g, '');
  return SPECIFICATION_NAMES[key] ?? raw;
}

export function splitList(value: unknown): string[] {
  const normalized = normalizeUnicode(value).replace(COMMON_PUNCTUATION, '|');
  if (!normalized) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of normalized.split('|')) {
    const item = normalizeUnicode(entry);
    const key = normalizeProductName(item);
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

export function parseSpecification(rawName: unknown, rawValue: unknown): ProductSpecification {
  const name = normalizeUnicode(rawName);
  const value = normalizeUnicode(rawValue);
  const match = value.match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|m|g|kg|w|kw)$/i);
  if (!match) {
    return {
      schemaVersion: SCHEMA_VERSION,
      rawName: name,
      normalizedName: normalizeSpecificationName(name),
      rawValue: value,
      normalizedValue: value,
      unit: null,
      baseValue: null,
      baseUnit: null,
      valueType: 'text',
      parseStatus: 'raw',
    };
  }

  const numericValue = Number(match[1]);
  const rule = UNIT_RULES[match[2].toLocaleLowerCase('en-US')];
  const baseValue = numericValue * rule.factor;
  return {
    schemaVersion: SCHEMA_VERSION,
    rawName: name,
    normalizedName: normalizeSpecificationName(name),
    rawValue: value,
    normalizedValue: `${formatNumber(baseValue)}${rule.baseUnit}`,
    unit: rule.canonical,
    baseValue,
    baseUnit: rule.baseUnit,
    valueType: 'number',
    parseStatus: 'normalized',
  };
}

export function stableProductId(namespace: string, productName: string, model: string): string {
  const normalizedNamespace = normalizeProductName(namespace) || 'DEFAULT';
  const normalizedModel = normalizeModel(model);
  const identity = normalizedModel
    ? `${normalizedNamespace}|MODEL:${normalizedModel}`
    : `${normalizedNamespace}|NAME:${normalizeProductName(productName).replace(/\s+/g, '')}`;
  return `prd_${createHash('sha256').update(identity).digest('hex').slice(0, 16)}`;
}

export function isValidProductId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(value);
}

export function normalizeStatus(value: unknown): 'active' | 'inactive' | null {
  const normalized = normalizeUnicode(value).toLocaleLowerCase('en-US');
  if (!normalized || ['active', '启用', '有效', '在售', '1', 'yes', '是'].includes(normalized)) return 'active';
  if (['inactive', '停用', '无效', '停售', '0', 'no', '否'].includes(normalized)) return 'inactive';
  return null;
}
