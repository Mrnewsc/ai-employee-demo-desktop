export interface RepairDiffDiagnostics {
  repairAttempt: number;
  schemaIssueCountBefore: number;
  schemaIssueCountAfter: number;
  productCountBefore: number;
  productCountAfter: number;
  evidenceRefCountBefore: number;
  evidenceRefCountAfter: number;
  nonEmptyFactCountBefore: number;
  nonEmptyFactCountAfter: number;
  semanticDriftDetected: boolean;
  driftReasons: Array<'PRODUCT_COUNT_CHANGED' | 'EVIDENCE_REFS_CHANGED' | 'EXISTING_FACTS_CHANGED'>;
}

export function analyzeRepairDiff(
  before: unknown,
  after: unknown,
  values: { repairAttempt: number; schemaIssueCountBefore: number; schemaIssueCountAfter: number },
): RepairDiffDiagnostics {
  const beforeSummary = summarize(before);
  const afterSummary = summarize(after);
  const driftReasons: RepairDiffDiagnostics['driftReasons'] = [];
  if (beforeSummary.productCount !== afterSummary.productCount) driftReasons.push('PRODUCT_COUNT_CHANGED');
  if (!sameSet(beforeSummary.evidenceRefs, afterSummary.evidenceRefs)) driftReasons.push('EVIDENCE_REFS_CHANGED');
  if (!sameSet(beforeSummary.facts, afterSummary.facts)) driftReasons.push('EXISTING_FACTS_CHANGED');
  return {
    ...values,
    productCountBefore: beforeSummary.productCount,
    productCountAfter: afterSummary.productCount,
    evidenceRefCountBefore: beforeSummary.evidenceRefs.size,
    evidenceRefCountAfter: afterSummary.evidenceRefs.size,
    nonEmptyFactCountBefore: beforeSummary.facts.size,
    nonEmptyFactCountAfter: afterSummary.facts.size,
    semanticDriftDetected: driftReasons.length > 0,
    driftReasons,
  };
}

function summarize(value: unknown) {
  const root = isRecord(value) ? value : {};
  const products = Array.isArray(root.products) ? root.products : [];
  const facts = new Set<string>();
  const evidenceRefs = new Set<string>();
  products.forEach((product, productIndex) => {
    if (!isRecord(product)) return;
    collectScalar(facts, productIndex, 'productName', product.productName);
    collectScalar(facts, productIndex, 'model', product.model);
    collectScalar(facts, productIndex, 'material', product.material);
    collectScalar(facts, productIndex, 'process', product.process);
    collectScalar(facts, productIndex, 'application', product.application);
    if (isRecord(product.quantity)) {
      collectScalar(facts, productIndex, 'quantity.value', product.quantity.value);
      collectScalar(facts, productIndex, 'quantity.unit', product.quantity.unit);
      collectScalar(facts, productIndex, 'quantity.raw', product.quantity.raw);
    }
    if (isRecord(product.specifications)) {
      Object.entries(product.specifications).forEach(([name, fieldValue]) => collectScalar(facts, productIndex, `specifications.${name}`, fieldValue));
    }
    if (Array.isArray(product.notes)) {
      product.notes.forEach((note, index) => collectScalar(facts, productIndex, `notes.${index}`, note));
    }
    if (isRecord(product.evidenceRefs)) {
      Object.entries(product.evidenceRefs).forEach(([field, refs]) => {
        if (!Array.isArray(refs)) return;
        refs.forEach((ref) => {
          if (!isRecord(ref) || typeof ref.evidenceId !== 'string' || typeof ref.quote !== 'string') return;
          evidenceRefs.add(`${productIndex}:${field}:${ref.evidenceId}:${ref.quote}`);
        });
      });
    }
  });
  return { productCount: products.length, facts, evidenceRefs };
}

function collectScalar(target: Set<string>, productIndex: number, field: string, value: unknown) {
  if ((typeof value === 'string' && value.length > 0) || typeof value === 'number') {
    target.add(`${productIndex}:${field}:${String(value)}`);
  }
}

function sameSet(left: Set<string>, right: Set<string>) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
