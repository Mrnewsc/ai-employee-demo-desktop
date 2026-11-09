import type { ExtractedProductV1, ExtractionEvidence, ExtractionField } from './contracts';

const CORE_FIELDS: ExtractionField[] = [
  'productName',
  'model',
  'quantity',
  'material',
  'process',
  'application',
];

export function calculateFieldConfidence(
  field: ExtractionField,
  evidence: ExtractionEvidence[],
  options: { conflict?: boolean; repaired?: boolean; missing?: boolean } = {},
): number {
  if (options.missing || evidence.length === 0) return 0;
  const scores = evidence.map((item) => {
    const sourceBase = item.source.kind === 'sheet' ? 0.94 : item.originKind === 'ocr' ? 0.68 : 0.86;
    return item.confidence === null ? sourceBase : Math.min(sourceBase, item.confidence);
  });
  let score = Math.max(...scores);
  if (new Set(evidence.map((item) => item.sourceFile)).size > 1) score += 0.04;
  if (evidence.length > 1) score += 0.02;
  if (options.conflict) score -= 0.35;
  if (options.repaired) score = Math.min(score, 0.6);
  if (field === 'model' && evidence.some((item) => item.originKind === 'ocr' && (item.confidence ?? 0) < 0.8)) {
    score = Math.min(score, 0.55);
  }
  return roundConfidence(score);
}

export function recomputeProductConfidence(
  product: ExtractedProductV1,
  repaired = false,
): ExtractedProductV1 {
  const evidenceFor = (field: ExtractionField) => product.evidence.filter((item) => item.field === field);
  const conflictFields = new Set(product.conflicts.map((conflict) => conflict.field));
  const fieldConfidence: Record<string, number> = {};
  for (const field of CORE_FIELDS) {
    fieldConfidence[field] = calculateFieldConfidence(field, evidenceFor(field), {
      conflict: conflictFields.has(field),
      repaired,
      missing: isFieldMissing(product, field),
    });
  }
  for (const specificationName of Object.keys(product.specifications)) {
    const field = `specifications.${specificationName}` as const;
    fieldConfidence[field] = calculateFieldConfidence(field, evidenceFor(field), {
      conflict: conflictFields.has(field),
      repaired,
    });
  }
  const weightedFields = Object.entries(fieldConfidence).filter(([field]) => (
    field === 'productName' || field === 'model' || field === 'quantity' || field.startsWith('specifications.')
  ));
  const score = weightedFields.length
    ? weightedFields.reduce((sum, [, value]) => sum + value, 0) / weightedFields.length
    : 0;
  return { ...product, fieldConfidence, confidence: roundConfidence(score) };
}

function isFieldMissing(product: ExtractedProductV1, field: ExtractionField): boolean {
  if (field === 'quantity') return product.quantity.raw === null;
  if (field.startsWith('specifications.')) return !(field.slice('specifications.'.length) in product.specifications);
  const value = product[field as keyof Pick<ExtractedProductV1, 'productName' | 'model' | 'material' | 'process' | 'application'>];
  return value === null;
}

function roundConfidence(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(3));
}
