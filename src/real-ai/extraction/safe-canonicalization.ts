export interface CanonicalizationAuditEntry {
  ruleId: string;
  targetField: string;
  beforeShape: string;
  afterShape: string;
  semanticSafe: true;
}

export interface SafeCanonicalizationResult {
  value: unknown;
  appliedRules: CanonicalizationAuditEntry[];
  rejectedTransforms: Array<{ targetField: string; beforeShape: string; reason: string }>;
}

const NULLABLE_SCALARS = ['productName', 'model', 'material', 'process', 'application'] as const;
const QUANTITY_SCALARS = ['value', 'unit', 'raw'] as const;

export function safeCanonicalizeProviderPayload(input: unknown): SafeCanonicalizationResult {
  const value = structuredClone(input);
  const appliedRules: CanonicalizationAuditEntry[] = [];
  const rejectedTransforms: SafeCanonicalizationResult['rejectedTransforms'] = [];
  if (!isRecord(value) || !Array.isArray(value.products)) return { value, appliedRules, rejectedTransforms };

  value.products.forEach((product, index) => {
    if (!isRecord(product)) return;
    const base = `products[${index}]`;
    for (const field of NULLABLE_SCALARS) {
      if (product[field] === undefined) apply(product, field, null, 'STRUCTURAL_UNDEFINED_TO_NULL', `${base}.${field}`, appliedRules);
      else trimString(product, field, `${base}.${field}`, appliedRules, rejectedTransforms);
    }
    if (product.notes === undefined) apply(product, 'notes', [], 'STRUCTURAL_DEFAULT_EMPTY_ARRAY', `${base}.notes`, appliedRules);
    else if (Array.isArray(product.notes)) product.notes.forEach((note, noteIndex) => {
      if (typeof note === 'string') {
        if (note.trim() !== note) {
          const beforeShape = shape(note);
          product.notes[noteIndex] = note.trim();
          appliedRules.push({
            ruleId: 'STRUCTURAL_TRIM_STRING',
            targetField: `${base}.notes[${noteIndex}]`,
            beforeShape,
            afterShape: shape(product.notes[noteIndex]),
            semanticSafe: true,
          });
        }
      } else {
        rejectedTransforms.push({ targetField: `${base}.notes[${noteIndex}]`, beforeShape: shape(note), reason: '禁止将非string强制转换为string。' });
      }
    });
    else rejectedTransforms.push({ targetField: `${base}.notes`, beforeShape: shape(product.notes), reason: '禁止将非array自动包装为array。' });
    if (product.specifications === undefined) apply(product, 'specifications', {}, 'STRUCTURAL_DEFAULT_EMPTY_OBJECT', `${base}.specifications`, appliedRules);
    else if (isRecord(product.specifications)) {
      Object.entries(product.specifications).forEach(([name, specification]) => {
        if (typeof specification === 'string' && specification.trim() !== specification) {
          const beforeShape = shape(specification);
          product.specifications[name] = specification.trim();
          appliedRules.push({
            ruleId: 'STRUCTURAL_TRIM_STRING',
            targetField: `${base}.specifications.<dynamic-key>`,
            beforeShape,
            afterShape: shape(product.specifications[name]),
            semanticSafe: true,
          });
        } else if (typeof specification !== 'string') {
          rejectedTransforms.push({
            targetField: `${base}.specifications.<dynamic-key>`,
            beforeShape: shape(specification),
            reason: '禁止将非string规格值自动转换为string。',
          });
        }
      });
    }
    else rejectedTransforms.push({ targetField: `${base}.specifications`, beforeShape: shape(product.specifications), reason: '禁止将非object自动转换为规格对象。' });
    if (product.evidenceRefs === undefined) apply(product, 'evidenceRefs', {}, 'STRUCTURAL_DEFAULT_EMPTY_OBJECT', `${base}.evidenceRefs`, appliedRules);
    else if (!isRecord(product.evidenceRefs)) rejectedTransforms.push({ targetField: `${base}.evidenceRefs`, beforeShape: shape(product.evidenceRefs), reason: '禁止自动包装或补造Evidence引用。' });
    if (product.quantity === null) {
      // Both forms mean "unknown quantity"; this only restores the required empty container and adds no fact.
      apply(
        product,
        'quantity',
        { value: null, unit: null, raw: null },
        'QUANTITY_NULL_TO_EMPTY_OBJECT',
        `${base}.quantity`,
        appliedRules,
        { beforeShape: 'null', afterShape: 'object(keys=[value,unit,raw])' },
      );
    }
    if (isRecord(product.quantity)) {
      const quantityKeys = Object.keys(product.quantity);
      const isLegacyEmptyObject = quantityKeys.length === 0;
      const hasCompleteShape = QUANTITY_SCALARS.every((field) => field in product.quantity);
      if (!isLegacyEmptyObject && !hasCompleteShape) {
        rejectedTransforms.push({
          targetField: `${base}.quantity`,
          beforeShape: shape(product.quantity),
          reason: '非空的部分数量对象必须保留给Schema诊断，禁止自动补齐缺失子字段。',
        });
        return;
      }
      for (const field of QUANTITY_SCALARS) {
        if (product.quantity[field] === undefined) apply(product.quantity, field, null, 'STRUCTURAL_UNDEFINED_TO_NULL', `${base}.quantity.${field}`, appliedRules);
        else if (field !== 'value') trimString(product.quantity, field, `${base}.quantity.${field}`, appliedRules, rejectedTransforms);
        else if (typeof product.quantity[field] === 'string') rejectedTransforms.push({ targetField: `${base}.quantity.value`, beforeShape: shape(product.quantity[field]), reason: '禁止将string数量自动转换为number。' });
      }
    }
    else rejectedTransforms.push({ targetField: `${base}.quantity`, beforeShape: shape(product.quantity), reason: '禁止自动生成或转换数量业务对象。' });
  });
  return { value, appliedRules, rejectedTransforms };
}

function trimString(
  object: Record<string, unknown>,
  field: string,
  targetField: string,
  audit: CanonicalizationAuditEntry[],
  rejected: SafeCanonicalizationResult['rejectedTransforms'],
) {
  const current = object[field];
  if (current === null || current === undefined) return;
  if (typeof current !== 'string') {
    rejected.push({ targetField, beforeShape: shape(current), reason: '禁止将非string业务字段自动转换为string。' });
    return;
  }
  const trimmed = current.trim();
  if (trimmed !== current) apply(object, field, trimmed, 'STRUCTURAL_TRIM_STRING', targetField, audit);
}

function apply(
  object: Record<string, unknown>,
  field: string,
  next: unknown,
  ruleId: string,
  targetField: string,
  audit: CanonicalizationAuditEntry[],
  explicitShape?: { beforeShape: string; afterShape: string },
) {
  const before = object[field];
  object[field] = next;
  audit.push({
    ruleId,
    targetField,
    beforeShape: explicitShape?.beforeShape ?? shape(before),
    afterShape: explicitShape?.afterShape ?? shape(next),
    semanticSafe: true,
  });
}

function shape(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(length=${value.length})`;
  if (typeof value === 'string') return `string(length=${value.length})`;
  if (typeof value === 'object') return `object(keys=${Object.keys(value as object).length})`;
  return typeof value;
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
