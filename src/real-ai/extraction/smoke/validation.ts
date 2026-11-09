import type { ParsedDocument, SourceLocation } from '../../types';
import { createExtractionChunks } from '../chunker';
import type {
  ExtractedProductV1,
  ExtractionEvidence,
  ExtractionWarning,
  ProductExtractionResult,
} from '../contracts';

export interface ExpectedQuantity {
  value: number | null;
  unit: string | null;
  raw: string | null;
}

export interface ExpectedSmokeProduct {
  productName?: string;
  productNameFromOcr?: boolean;
  model?: string;
  modelFromOcr?: boolean;
  specifications?: Record<string, string>;
  specificationsFromOcr?: boolean;
  quantity?: ExpectedQuantity;
  quantityFromOcr?: boolean;
  material?: string | null;
  materialFromOcr?: boolean;
  process: string | null;
  application: string | null;
  expectedHumanReview: boolean;
  expectedWarnings: string[];
}

export interface ExpectedSmokeSample {
  sampleId: string;
  sampleType: string;
  sourcePaths: string[];
  scoredFields?: FieldCheck['field'][];
  products: ExpectedSmokeProduct[];
  expectedConflictFields: string[];
  expectedSourceFileCount: number;
}

export interface FieldCheck {
  productKey: string;
  field: 'productName' | 'model' | 'quantity' | 'specifications' | 'material' | 'process' | 'application';
  expected: unknown;
  actual: unknown;
  correct: boolean;
}

export interface EvidenceCheck {
  productId: string;
  field: string;
  evidenceId: string;
  valid: boolean;
  reasons: string[];
}

export interface SmokeValidationResult {
  resolvedExpectedProducts: ResolvedExpectedProduct[];
  expectedProductCount: number;
  actualProductCount: number;
  fieldChecks: FieldCheck[];
  evidenceChecks: EvidenceCheck[];
  evidenceTotal: number;
  evidenceValid: number;
  evidenceInvalid: number;
  evidenceAccuracy: number;
  missingExpectedFieldTotal: number;
  missingExpectedFieldCorrect: number;
  hallucinatedFieldCount: number;
  criticalFieldsWithoutEvidence: number;
  expectedConflictFields: string[];
  actualConflictFields: string[];
  silentlyOverwrittenConflictCount: number;
  expectedSourceFileCount: number;
  actualSourceFileCount: number;
  correctMergeCount: number;
  duplicateProductCount: number;
  wrongMergeCount: number;
  missingExpectedProductCount: number;
  invalidProviderEvidenceReferenceCount: number;
  unexpectedProductCount: number;
  humanReviewExpected: number;
  humanReviewActual: number;
  humanReviewReasons: string[];
  expectedWarningCodes: string[];
  actualWarningCodes: string[];
  missingExpectedWarningCodes: string[];
}

export function validateSmokeSample(
  expectedSample: ExpectedSmokeSample,
  documents: ParsedDocument[],
  result: ProductExtractionResult,
): SmokeValidationResult {
  const resolvedExpected = expectedSample.products.map((product) => resolveDynamicExpected(product, documents));
  const evidenceCatalog = new Map(documents.flatMap((document) => createExtractionChunks(
    document,
    `validate-${expectedSample.sampleId}`,
    { sampleId: expectedSample.sampleId },
  ).flatMap((chunk) => chunk.evidenceItems.map((item) => [`${item.sourceFile}|${item.evidenceId}`, item] as const))));
  const evidenceChecks = result.products.flatMap((product) => product.evidence.map((evidence) => (
    validateEvidence(product.id, evidence, documents, evidenceCatalog)
  )));
  const validEvidenceKeys = new Set(evidenceChecks.filter((check) => check.valid).map((check) => (
    `${check.productId}|${check.field}|${check.evidenceId}`
  )));

  const fieldChecks: FieldCheck[] = [];
  const unmatchedActual = new Set(result.products.map((_, index) => index));
  let missingExpectedFieldTotal = 0;
  let missingExpectedFieldCorrect = 0;
  let missingExpectedProductCount = 0;

  for (const expectedProduct of resolvedExpected) {
    const actualIndex = findActualProduct(expectedProduct, result.products, unmatchedActual);
    if (actualIndex < 0) {
      missingExpectedProductCount += 1;
      for (const field of expectedSample.scoredFields ?? FIELD_NAMES) {
        fieldChecks.push({ productKey: expectedProduct.model ?? expectedProduct.productName ?? 'missing', field, expected: expectedProduct[field], actual: undefined, correct: false });
      }
      continue;
    }
    unmatchedActual.delete(actualIndex);
    const actual = result.products[actualIndex];
    const productKey = expectedProduct.model ?? expectedProduct.productName ?? actual.id;
    const checks = compareProduct(productKey, expectedProduct, actual, expectedSample.scoredFields ?? FIELD_NAMES);
    fieldChecks.push(...checks);
    for (const check of checks) {
      if (isExpectedEmpty(check.expected)) {
        missingExpectedFieldTotal += 1;
        if (check.correct) missingExpectedFieldCorrect += 1;
      }
    }
  }

  let hallucinatedFieldCount = 0;
  let criticalFieldsWithoutEvidence = 0;
  for (const product of result.products) {
    for (const field of criticalNonEmptyFields(product)) {
      const hasValidEvidence = product.evidence.some((evidence) => (
        evidence.field === field
        && validEvidenceKeys.has(`${product.id}|${evidence.field}|${evidence.evidenceId}`)
      ));
      if (!hasValidEvidence) {
        hallucinatedFieldCount += 1;
        criticalFieldsWithoutEvidence += 1;
      }
    }
  }

  const actualConflictFields: string[] = [...new Set(result.conflicts.map((conflict) => String(conflict.field)))];
  const silentlyOverwrittenConflictCount = expectedSample.expectedConflictFields.filter((field) => !actualConflictFields.includes(field)).length;
  const actualSourceFileCount = new Set(result.products.flatMap((product) => product.evidence.map((evidence) => evidence.sourceFile))).size;
  const duplicateProductCount = countDuplicateProducts(result.products);
  const wrongMergeCount = countWrongMerges(resolvedExpected, result.products);
  const invalidProviderEvidenceReferenceCount = result.warnings.filter((warning) => (
    warning.code === 'UNKNOWN_EVIDENCE_REFERENCE' || warning.code === 'EVIDENCE_REFERENCE_REPAIRED'
  )).length;
  const evidenceValid = evidenceChecks.filter((check) => check.valid).length;
  const expectedMerged = expectedSample.expectedSourceFileCount > 1 && expectedSample.products.length === 1;
  const expectedWarningCodes = [...new Set(resolvedExpected.flatMap((product) => product.expectedWarnings))];
  const actualWarningCodes = [...new Set(result.warnings.map((warning) => warning.code))];

  return {
    resolvedExpectedProducts: resolvedExpected,
    expectedProductCount: resolvedExpected.length,
    actualProductCount: result.products.length,
    fieldChecks,
    evidenceChecks,
    evidenceTotal: evidenceChecks.length,
    evidenceValid,
    evidenceInvalid: evidenceChecks.length - evidenceValid,
    evidenceAccuracy: evidenceChecks.length ? evidenceValid / evidenceChecks.length : 1,
    missingExpectedFieldTotal,
    missingExpectedFieldCorrect,
    hallucinatedFieldCount,
    criticalFieldsWithoutEvidence,
    expectedConflictFields: expectedSample.expectedConflictFields,
    actualConflictFields,
    silentlyOverwrittenConflictCount,
    expectedSourceFileCount: expectedSample.expectedSourceFileCount,
    actualSourceFileCount,
    correctMergeCount: expectedMerged && result.products.length === 1 && actualSourceFileCount === expectedSample.expectedSourceFileCount ? 1 : 0,
    duplicateProductCount,
    wrongMergeCount,
    missingExpectedProductCount,
    invalidProviderEvidenceReferenceCount,
    unexpectedProductCount: unmatchedActual.size,
    humanReviewExpected: resolvedExpected.filter((product) => product.expectedHumanReview).length,
    humanReviewActual: result.products.filter((product) => product.needsHumanReview).length,
    humanReviewReasons: [...new Set(result.products.flatMap((product) => product.reviewReasons))],
    expectedWarningCodes,
    actualWarningCodes,
    missingExpectedWarningCodes: expectedWarningCodes.filter((code) => !actualWarningCodes.includes(code as ExtractionWarning['code'])),
  };
}

export function serializeExtractedProduct(product: ExtractedProductV1, warnings: ExtractionWarning[]) {
  return {
    id: product.id,
    productName: product.productName,
    model: product.model,
    specifications: product.specifications,
    quantity: product.quantity,
    material: product.material,
    process: product.process,
    application: product.application,
    notes: product.notes,
    confidence: product.confidence,
    fieldConfidence: product.fieldConfidence,
    needsHumanReview: product.needsHumanReview,
    warnings: warnings.filter((warning) => warning.productId === product.id || warning.productId === null),
    conflicts: product.conflicts,
    evidence: product.evidence.map((evidence) => ({
      field: evidence.field,
      text: evidence.text,
      file: evidence.sourceFile,
      source: evidence.source,
      evidenceId: evidence.evidenceId,
      chunkId: evidence.chunkId,
      confidence: evidence.confidence,
      originKind: evidence.originKind,
    })),
  };
}

const FIELD_NAMES: FieldCheck['field'][] = [
  'productName', 'model', 'quantity', 'specifications', 'material', 'process', 'application',
];

function compareProduct(
  productKey: string,
  expected: ResolvedExpectedProduct,
  actual: ExtractedProductV1,
  fields: FieldCheck['field'][],
): FieldCheck[] {
  return fields.map((field) => ({
    productKey,
    field,
    expected: expected[field],
    actual: field === 'quantity' ? stripSchemaVersion(actual.quantity) : actual[field],
    correct: compareField(field, expected[field], field === 'quantity' ? stripSchemaVersion(actual.quantity) : actual[field]),
  }));
}

function compareField(field: FieldCheck['field'], expected: unknown, actual: unknown): boolean {
  if (field === 'quantity') {
    const left = expected as ExpectedQuantity;
    const right = actual as ExpectedQuantity;
    return left.value === right.value && normalized(left.unit) === normalized(right.unit) && normalized(left.raw) === normalized(right.raw);
  }
  if (field === 'specifications') {
    const left = expected as Record<string, string>;
    const right = actual as Record<string, string>;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return JSON.stringify(leftKeys) === JSON.stringify(rightKeys)
      && leftKeys.every((key) => normalized(left[key]) === normalized(right[key]));
  }
  return normalized(expected as string | null) === normalized(actual as string | null);
}

function findActualProduct(expected: ResolvedExpectedProduct, products: ExtractedProductV1[], available: Set<number>): number {
  for (const index of available) {
    const product = products[index];
    if (expected.model && normalizedModel(expected.model) === normalizedModel(product.model)) return index;
  }
  for (const index of available) {
    if (normalized(expected.productName) === normalized(products[index].productName)) return index;
  }
  return -1;
}

export interface ResolvedExpectedProduct {
  productName: string | null;
  model: string | null;
  specifications: Record<string, string>;
  quantity: ExpectedQuantity;
  material: string | null;
  process: string | null;
  application: string | null;
  expectedHumanReview: boolean;
  expectedWarnings: string[];
}

function resolveDynamicExpected(product: ExpectedSmokeProduct, documents: ParsedDocument[]): ResolvedExpectedProduct {
  const ocrText = documents.find((document) => document.fileType === 'image')?.rawText ?? '';
  return {
    productName: product.productNameFromOcr ? captureOcr(ocrText, /产\s*品\s*名\s*称\s*[:：]?\s*(.+?)\s*型\s*号/i) : product.productName ?? null,
    model: product.modelFromOcr ? captureOcr(ocrText, /(?:型\s*号|MODEL)\s*[:：]?\s*([A-Z0-9]+[-—][A-Z0-9]+)/i) : product.model ?? null,
    specifications: product.specificationsFromOcr
      ? { 产能: captureOcr(ocrText, /产\s*能\s*[:：]?\s*(.+)$/i) ?? '' }
      : product.specifications ?? {},
    quantity: product.quantityFromOcr
      ? parseOcrQuantity(captureOcr(ocrText, /数\s*量\s*[:：]?\s*([0-9]+\s*套)/i))
      : product.quantity ?? { value: null, unit: null, raw: null },
    material: product.materialFromOcr ? captureOcr(ocrText, /材\s*质\s*[:：]?\s*(.+?)\s*产\s*能/i) : product.material ?? null,
    process: product.process,
    application: product.application,
    expectedHumanReview: product.expectedHumanReview,
    expectedWarnings: product.expectedWarnings,
  };
}

function parseOcrQuantity(raw: string | null): ExpectedQuantity {
  if (!raw) return { value: null, unit: null, raw: null };
  const value = Number(raw.match(/\d+/)?.[0]);
  return { value: Number.isFinite(value) ? value : null, unit: raw.includes('套') ? '套' : null, raw };
}

function captureOcr(value: string, pattern: RegExp): string | null {
  return value.match(pattern)?.[1]?.trim() ?? null;
}

function validateEvidence(
  productId: string,
  evidence: ExtractionEvidence,
  documents: ParsedDocument[],
  catalog: Map<string, { text: string; source: SourceLocation }>,
): EvidenceCheck {
  const reasons: string[] = [];
  const document = documents.find((item) => item.fileName === evidence.sourceFile);
  if (!document) reasons.push('source-file-not-found');
  const sourceItem = catalog.get(`${evidence.sourceFile}|${evidence.evidenceId}`);
  if (!sourceItem) reasons.push('evidence-id-not-found');
  if (sourceItem && JSON.stringify(sourceItem.source) !== JSON.stringify(evidence.source)) reasons.push('source-location-mismatch');
  if (sourceItem && !normalized(sourceItem.text)?.includes(normalized(evidence.text) ?? '')) reasons.push('evidence-text-not-found');
  if (document && !validLocation(document, evidence.source)) reasons.push('invalid-source-location');
  return { productId, field: evidence.field, evidenceId: evidence.evidenceId, valid: reasons.length === 0, reasons };
}

function validLocation(document: ParsedDocument, source: SourceLocation): boolean {
  if (source.kind === 'pdf') {
    const maxPage = document.metadata.pageCount ?? Math.max(0, ...document.blocks.filter((block) => block.source.kind === 'pdf').map((block) => block.source.kind === 'pdf' ? block.source.page : 0));
    return source.page > 0 && source.page <= maxPage && validBbox(source.bbox);
  }
  if (source.kind === 'sheet') {
    const table = document.tables.find((item) => item.title === source.sheet || (item.source.kind === 'sheet' && item.source.sheet === source.sheet));
    return Boolean(table && (!source.cell || table.rows.flat().some((cell) => cell.source.kind === 'sheet' && cell.source.cell === source.cell)));
  }
  if (source.kind === 'docx') {
    return document.blocks.some((block) => JSON.stringify(block.source) === JSON.stringify(source))
      || document.tables.some((table) => table.rows.flat().some((cell) => JSON.stringify(cell.source) === JSON.stringify(source)));
  }
  return document.images.some((image) => image.id === source.imageId) && validBbox(source.bbox);
}

function validBbox(bbox: [number, number, number, number] | undefined): boolean {
  return !bbox || (bbox.every(Number.isFinite) && bbox[2] >= bbox[0] && bbox[3] >= bbox[1]);
}

function criticalNonEmptyFields(product: ExtractedProductV1): string[] {
  const fields: string[] = [];
  if (product.productName) fields.push('productName');
  if (product.model) fields.push('model');
  if (product.quantity.raw) fields.push('quantity');
  if (product.material) fields.push('material');
  if (product.process) fields.push('process');
  if (product.application) fields.push('application');
  for (const key of Object.keys(product.specifications)) fields.push(`specifications.${key}`);
  return fields;
}

function countDuplicateProducts(products: ExtractedProductV1[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const product of products) {
    const key = normalizedModel(product.model) || normalized(product.productName) || product.id;
    if (seen.has(key)) duplicates += 1;
    else seen.add(key);
  }
  return duplicates;
}

function countWrongMerges(expected: ResolvedExpectedProduct[], products: ExtractedProductV1[]): number {
  if (expected.length < 2) return 0;
  return products.filter((product) => {
    const observedModels = [
      ...product.evidence.filter((item) => item.field === 'model').map((item) => item.text),
      ...product.conflicts.filter((item) => item.field === 'model').flatMap((item) => item.values.map((value) => value.value)),
    ].map((value) => normalizedModel(value));
    const observedNames = product.evidence
      .filter((item) => item.field === 'productName')
      .map((item) => normalized(item.text));
    const matchedExpected = expected.filter((candidate) => {
      const expectedModel = normalizedModel(candidate.model);
      if (expectedModel) return observedModels.some((value) => value.includes(expectedModel));
      const expectedName = normalized(candidate.productName);
      return Boolean(expectedName && observedNames.some((value) => value?.includes(expectedName)));
    });
    return matchedExpected.length > 1;
  }).length;
}

function stripSchemaVersion(quantity: ExtractedProductV1['quantity']): ExpectedQuantity {
  return { value: quantity.value, unit: quantity.unit, raw: quantity.raw };
}

function normalized(value: string | null | undefined): string | null {
  return value === null || value === undefined
    ? null
    : value.normalize('NFKC').replace(/\s+/g, '').toLocaleUpperCase('en-US');
}

function normalizedModel(value: string | null): string {
  return normalized(value)?.replace(/[\-_.·•/\\]+/g, '') ?? '';
}

function isExpectedEmpty(value: unknown): boolean {
  if (value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object' && value !== null) {
    if ('value' in value && 'unit' in value && 'raw' in value) {
      const quantity = value as ExpectedQuantity;
      return quantity.value === null && quantity.unit === null && quantity.raw === null;
    }
    return Object.keys(value).length === 0;
  }
  return false;
}
