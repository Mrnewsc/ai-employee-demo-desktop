import { SCHEMA_VERSION } from '../types';
import type { SourceLocation } from '../types';
import { recomputeProductConfidence } from './confidence';
import type {
  ExtractedProductV1,
  ExtractionEvidence,
  ExtractionField,
  ExtractionWarning,
  ProductFieldConflict,
} from './contracts';

export interface MergeResult {
  products: ExtractedProductV1[];
  conflicts: ProductFieldConflict[];
  warnings: ExtractionWarning[];
}

export class ExtractionMergeService {
  merge(products: ExtractedProductV1[]): MergeResult {
    const merged: ExtractedProductV1[] = [];
    const warnings: ExtractionWarning[] = [];

    for (const product of products) {
      let targetIndex = -1;
      for (let index = 0; index < merged.length; index += 1) {
        const decision = mergeDecision(merged[index], product);
        if (decision === 'merge') {
          targetIndex = index;
          break;
        }
        if (decision === 'uncertain') {
          merged[index] = markUncertain(merged[index]);
          product.needsHumanReview = true;
          product.reviewReasons = uniqueStrings([...product.reviewReasons, '跨Chunk产品关系不确定，未自动合并']);
          warnings.push({
            schemaVersion: SCHEMA_VERSION,
            code: 'UNCERTAIN_MERGE',
            message: '发现可能属于同一产品的记录，但证据不足，已保留为独立候选',
            field: 'productName',
            productId: product.id,
            sourceFile: product.sourceFile,
            sourceLocations: product.sourceLocations,
          });
        }
      }
      if (targetIndex < 0) merged.push(cloneProduct(product));
      else merged[targetIndex] = mergePair(merged[targetIndex], product, warnings);
    }

    const finalized = merged.map((product) => recomputeProductConfidence(product));
    return {
      products: finalized,
      conflicts: finalized.flatMap((product) => product.conflicts),
      warnings,
    };
  }
}

function mergeDecision(left: ExtractedProductV1, right: ExtractedProductV1): 'merge' | 'uncertain' | 'none' {
  if (left.model && right.model) {
    if (left.model === right.model) return 'merge';
    if (normalizeModel(left.model) === normalizeModel(right.model)) return 'merge';
  }
  const leftName = normalizeName(left.productName);
  const rightName = normalizeName(right.productName);
  if (leftName && leftName === rightName) {
    const strong = hasStrongNameEvidence(left) && hasStrongNameEvidence(right);
    return strong ? 'merge' : 'uncertain';
  }
  if (sameSourceContext(left, right) && namesOverlap(leftName, rightName)) return 'uncertain';
  return 'none';
}

function mergePair(
  left: ExtractedProductV1,
  right: ExtractedProductV1,
  warnings: ExtractionWarning[],
): ExtractedProductV1 {
  const combinedEvidence = uniqueEvidence([...left.evidence, ...right.evidence]);
  const conflicts = [...left.conflicts, ...right.conflicts];
  const reviewReasons = new Set([...left.reviewReasons, ...right.reviewReasons]);

  const productName = mergeScalar('productName', left.productName, right.productName, left, right, conflicts, reviewReasons);
  const model = mergeScalar('model', left.model, right.model, left, right, conflicts, reviewReasons, normalizeModel);
  const material = mergeScalar('material', left.material, right.material, left, right, conflicts, reviewReasons);
  const process = mergeScalar('process', left.process, right.process, left, right, conflicts, reviewReasons);
  const application = mergeScalar('application', left.application, right.application, left, right, conflicts, reviewReasons);
  const quantity = mergeQuantity(left, right, conflicts, reviewReasons);
  const specifications = { ...left.specifications };
  for (const [name, value] of Object.entries(right.specifications)) {
    const field = `specifications.${name}` as const;
    if (!(name in specifications)) specifications[name] = value;
    else if (normalizeValue(specifications[name]) !== normalizeValue(value)) {
      addConflict(field, specifications[name], value, left, right, conflicts);
      reviewReasons.add(`${field}存在多来源冲突`);
    }
  }

  const newConflicts = conflicts.slice(left.conflicts.length + right.conflicts.length);
  for (const conflict of newConflicts) {
    warnings.push({
      schemaVersion: SCHEMA_VERSION,
      code: 'FIELD_CONFLICT',
      message: `${conflict.field}存在多来源冲突，未静默覆盖`,
      field: conflict.field,
      productId: left.id,
      sourceFile: left.sourceFile,
      sourceLocations: uniqueLocations(conflict.values.flatMap((entry) => entry.evidence.map((item) => item.source))),
    });
  }

  return {
    ...left,
    productName,
    model,
    specifications,
    quantity,
    material,
    process,
    application,
    notes: uniqueStrings([...left.notes, ...right.notes]),
    sourceLocations: uniqueLocations([...left.sourceLocations, ...right.sourceLocations]),
    evidence: combinedEvidence,
    conflicts: uniqueConflicts(conflicts),
    reviewReasons: [...reviewReasons],
    needsHumanReview: left.needsHumanReview || right.needsHumanReview || conflicts.length > 0,
  };
}

function mergeScalar(
  field: Exclude<ExtractionField, 'quantity' | 'notes' | `specifications.${string}`>,
  leftValue: string | null,
  rightValue: string | null,
  left: ExtractedProductV1,
  right: ExtractedProductV1,
  conflicts: ProductFieldConflict[],
  reviewReasons: Set<string>,
  normalize: (value: string) => string = normalizeValue,
): string | null {
  if (leftValue === null) return rightValue;
  if (rightValue === null) return leftValue;
  if (normalize(leftValue) === normalize(rightValue)) return leftValue;
  addConflict(field, leftValue, rightValue, left, right, conflicts);
  reviewReasons.add(`${field}存在多来源冲突`);
  return leftValue;
}

function mergeQuantity(
  left: ExtractedProductV1,
  right: ExtractedProductV1,
  conflicts: ProductFieldConflict[],
  reviewReasons: Set<string>,
) {
  if (left.quantity.raw === null) return right.quantity;
  if (right.quantity.raw === null) return left.quantity;
  const same = left.quantity.value === right.quantity.value
    && normalizeValue(left.quantity.unit ?? '') === normalizeValue(right.quantity.unit ?? '')
    && normalizeValue(left.quantity.raw) === normalizeValue(right.quantity.raw);
  if (same) return left.quantity;
  addConflict('quantity', left.quantity.raw, right.quantity.raw, left, right, conflicts);
  reviewReasons.add('quantity存在多来源冲突');
  return left.quantity;
}

function addConflict(
  field: ExtractionField,
  leftValue: string,
  rightValue: string,
  left: ExtractedProductV1,
  right: ExtractedProductV1,
  conflicts: ProductFieldConflict[],
) {
  conflicts.push({
    schemaVersion: SCHEMA_VERSION,
    field,
    values: [
      { schemaVersion: SCHEMA_VERSION, value: leftValue, evidence: evidenceFor(left, field) },
      { schemaVersion: SCHEMA_VERSION, value: rightValue, evidence: evidenceFor(right, field) },
    ],
    message: `${field}存在不同来源值，需要人工确认`,
  });
}

function evidenceFor(product: ExtractedProductV1, field: ExtractionField): ExtractionEvidence[] {
  return product.evidence.filter((evidence) => evidence.field === field);
}

function hasStrongNameEvidence(product: ExtractedProductV1): boolean {
  return evidenceFor(product, 'productName').some((item) => (
    item.source.kind === 'sheet' || (item.confidence ?? 0.85) >= 0.8
  ));
}

function sameSourceContext(left: ExtractedProductV1, right: ExtractedProductV1): boolean {
  if (left.sourceFile !== right.sourceFile) return false;
  return left.sourceLocations.some((leftSource) => right.sourceLocations.some((rightSource) => {
    if (leftSource.kind !== rightSource.kind) return false;
    if (leftSource.kind === 'pdf' && rightSource.kind === 'pdf') return Math.abs(leftSource.page - rightSource.page) <= 1;
    if (leftSource.kind === 'sheet' && rightSource.kind === 'sheet') return leftSource.sheet === rightSource.sheet;
    if (leftSource.kind === 'image' && rightSource.kind === 'image') return leftSource.imageId === rightSource.imageId;
    return leftSource.kind === 'docx' && rightSource.kind === 'docx';
  }));
}

function namesOverlap(left: string, right: string): boolean {
  return Boolean(left && right && (left.includes(right) || right.includes(left)));
}

function normalizeModel(value: string): string {
  return value.normalize('NFKC').toLocaleUpperCase('en-US').replace(/[\s\-_.·•/\\]+/g, '').replace(/[^A-Z0-9\u3400-\u9FFF]/g, '');
}

function normalizeName(value: string | null): string {
  return value ? value.normalize('NFKC').toLocaleUpperCase('en-US').replace(/[\s，,。.;；:：、|｜()[\]{}【】<>《》"']/g, '') : '';
}

function normalizeValue(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleUpperCase('en-US');
}

function markUncertain(product: ExtractedProductV1): ExtractedProductV1 {
  return {
    ...product,
    needsHumanReview: true,
    reviewReasons: uniqueStrings([...product.reviewReasons, '跨Chunk产品关系不确定，未自动合并']),
  };
}

function cloneProduct(product: ExtractedProductV1): ExtractedProductV1 {
  return {
    ...product,
    specifications: { ...product.specifications },
    quantity: { ...product.quantity },
    notes: [...product.notes],
    sourceLocations: [...product.sourceLocations],
    evidence: [...product.evidence],
    fieldConfidence: { ...product.fieldConfidence },
    conflicts: [...product.conflicts],
    reviewReasons: [...product.reviewReasons],
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function uniqueLocations(values: SourceLocation[]): SourceLocation[] {
  return uniqueBy(values, (value) => JSON.stringify(value));
}

function uniqueEvidence(values: ExtractionEvidence[]): ExtractionEvidence[] {
  return uniqueBy(values, (value) => `${value.field}:${value.evidenceId}:${value.text}`);
}

function uniqueConflicts(values: ProductFieldConflict[]): ProductFieldConflict[] {
  return uniqueBy(values, (value) => `${value.field}:${value.values.map((entry) => entry.value).sort().join('|')}`);
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const itemKey = key(value);
    if (seen.has(itemKey)) return false;
    seen.add(itemKey);
    return true;
  });
}

