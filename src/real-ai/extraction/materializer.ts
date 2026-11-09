import { SCHEMA_VERSION } from '../types';
import type { SourceLocation } from '../types';
import { recomputeProductConfidence } from './confidence';
import { EvidenceResolver } from './evidence-resolver';
import { guardApplicationSemantic } from './semantic-guard';
import type {
  ExtractedProductV1,
  ExtractionEvidence,
  ExtractionField,
  ExtractionInput,
  ExtractionWarning,
  ProductExtractionResult,
  ProviderExtractionPayload,
  ProviderProductDraft,
} from './contracts';

export interface MaterializeOptions {
  provider: string;
  model: string;
  repaired: boolean;
  durationMs: number;
  outputCharacters: number;
  usage?: { promptTokens?: number | null; completionTokens?: number | null; totalTokens?: number | null };
}

export function materializeProviderPayload(
  input: ExtractionInput,
  payload: ProviderExtractionPayload,
  options: MaterializeOptions,
): ProductExtractionResult {
  const warnings: ExtractionWarning[] = [];
  const products: ExtractedProductV1[] = [];
  for (const [index, draft] of payload.products.entries()) {
    const materialized = materializeProduct(input, draft, index, options.repaired, warnings);
    if (materialized) products.push(materialized);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    jobId: input.jobId,
    provider: options.provider,
    model: options.model,
    products,
    conflicts: [],
    warnings,
    metrics: {
      schemaVersion: SCHEMA_VERSION,
      documentCount: 1,
      chunkCount: 1,
      requestCount: 1 + (options.repaired ? 1 : 0),
      repairAttempts: options.repaired ? 1 : 0,
      inputCharacters: input.evidenceItems.reduce((sum, item) => sum + item.text.length, 0),
      outputCharacters: options.outputCharacters,
      durationMs: options.durationMs,
      usage: {
        schemaVersion: SCHEMA_VERSION,
        promptTokens: options.usage?.promptTokens ?? null,
        completionTokens: options.usage?.completionTokens ?? null,
        totalTokens: options.usage?.totalTokens ?? null,
      },
    },
    needsHumanReview: products.some((product) => product.needsHumanReview),
    createdAt: new Date().toISOString(),
  };
}

function materializeProduct(
  input: ExtractionInput,
  draft: ProviderProductDraft,
  index: number,
  repaired: boolean,
  warnings: ExtractionWarning[],
): ExtractedProductV1 | null {
  const reviewReasons = new Set<string>();
  const productSeed = `${input.chunkId}:${index}:${draft.model ?? ''}:${draft.productName ?? ''}`;
  const productId = `ext_${stableHash(productSeed)}`;
  const resolved = new EvidenceResolver(input).resolve(draft.evidenceRefs);
  let evidence = resolved.evidence;
  for (const issue of resolved.issues) {
    const issueEvidence = evidence.filter((item) => item.field === issue.field);
    addWarning(
      warnings,
      issue.code,
      issue.message,
      issue.field,
      productId,
      input.fileName,
      issueEvidence.map((item) => item.source),
    );
    if (!issue.recovered || issue.field !== 'notes') {
      reviewReasons.add(issue.recovered ? `${issue.field}的Evidence ID已确定性恢复` : `${issue.field}无法定位来源证据`);
    }
  }

  let productName = validateTextField('productName', draft.productName, evidence, warnings, productId, input.fileName, reviewReasons);
  let model = validateTextField('model', draft.model, evidence, warnings, productId, input.fileName, reviewReasons);
  if (draft.model && !model) {
    const modelEvidence = evidence.find((item) => item.field === 'model');
    if (modelEvidence && modelEvidence.text.length <= 300) {
      model = modelEvidence.text;
      addWarning(warnings, 'MODEL_RESTORED_FROM_EVIDENCE', '型号已按来源证据原字形保留，需人工复核', 'model', productId, input.fileName, [modelEvidence.source]);
      reviewReasons.add('AI型号与证据不一致，已恢复证据原值');
    }
  }

  const specifications: Record<string, string> = {};
  for (const [name, value] of Object.entries(draft.specifications)) {
    const field = `specifications.${name}` as const;
    const validated = validateTextField(field, value, evidence, warnings, productId, input.fileName, reviewReasons);
    if (validated !== null) specifications[name] = validated;
  }
  const material = validateTextField('material', draft.material, evidence, warnings, productId, input.fileName, reviewReasons);
  const process = validateTextField('process', draft.process, evidence, warnings, productId, input.fileName, reviewReasons);
  let application = validateTextField('application', draft.application, evidence, warnings, productId, input.fileName, reviewReasons);
  let notes = draft.notes.filter((note) => validateTextField(
    'notes', note, evidence, warnings, productId, input.fileName, reviewReasons,
  ) !== null);

  const semantic = guardApplicationSemantic(application, notes, evidence);
  if (semantic.reclassified) {
    application = semantic.application;
    notes = semantic.notes;
    evidence = semantic.evidence;
    addWarning(
      warnings,
      'APPLICATION_RECLASSIFIED',
      '实施、安装或兼容要求已从application保守转入notes',
      'application',
      productId,
      input.fileName,
      semantic.movedEvidence.map((item) => item.source),
    );
  }

  const quantityEvidence = evidence.filter((item) => item.field === 'quantity');
  const quantity = draft.quantity.raw && valueHasEvidence(draft.quantity.raw, quantityEvidence)
    ? { schemaVersion: SCHEMA_VERSION, ...draft.quantity }
    : { schemaVersion: SCHEMA_VERSION, value: null, unit: null, raw: null };
  if ((draft.quantity.raw !== null || draft.quantity.value !== null) && quantity.raw === null) {
    addWarning(warnings, 'MISSING_FIELD_EVIDENCE', '数量缺少可核对的来源证据，已置空', 'quantity', productId, input.fileName, []);
    reviewReasons.add('数量缺少来源证据');
  }

  if (!productName && !model && !Object.keys(specifications).length && !quantity.raw && !material && !process && !application) {
    addWarning(warnings, 'UNRESOLVED_PRODUCT_CANDIDATE', '候选产品没有可验证关键字段，已进入拒绝候选告警而未作为确定事实输出', null, productId, input.fileName, []);
    return null;
  }
  if (!productName) {
    addWarning(warnings, 'MISSING_CRITICAL_FIELD', '产品名称缺失，需要人工确认', 'productName', productId, input.fileName, []);
    reviewReasons.add('产品名称缺失');
  }
  if (!model && Object.keys(specifications).length >= 2) {
    addWarning(warnings, 'MISSING_CRITICAL_FIELD', '复杂规格缺少型号，需要人工确认', 'model', productId, input.fileName, []);
    reviewReasons.add('型号缺失但规格信息较多');
  }

  const modelEvidence = evidence.filter((item) => item.field === 'model');
  const modelHasOcrAmbiguity = modelEvidence.some((item) => (
    item.originKind === 'ocr' && warningCodesForEvidence(input, item).includes('ocr_character_ambiguity')
  ));
  if (modelHasOcrAmbiguity || modelEvidence.some((item) => item.originKind === 'ocr' && (item.confidence ?? 0) < 0.8)) {
    addWarning(warnings, 'OCR_MODEL_UNCERTAIN', '型号来自低置信度或字符歧义OCR结果，必须人工核对原图', 'model', productId, input.fileName, modelEvidence.map((item) => item.source));
    reviewReasons.add('型号可能存在OCR识别不确定性');
  } else if (evidence.some((item) => (
    item.originKind === 'ocr'
    && ((item.confidence ?? 0) < 0.75 || warningCodesForEvidence(input, item).includes('ocr_low_confidence'))
  ))) {
    addWarning(warnings, 'OCR_LOW_CONFIDENCE', '产品字段包含低置信度OCR证据', null, productId, input.fileName, evidence.map((item) => item.source));
    reviewReasons.add('包含低置信度OCR证据');
  }
  if (repaired) {
    addWarning(warnings, 'REPAIRED_MODEL_OUTPUT', '模型输出经过一次受控JSON修复，必须人工复核', null, productId, input.fileName, []);
    reviewReasons.add('模型输出经过JSON修复');
  }

  let product: ExtractedProductV1 = {
    schemaVersion: SCHEMA_VERSION,
    id: productId,
    productName,
    model,
    specifications,
    quantity,
    material,
    process,
    application,
    notes,
    sourceFile: input.fileName,
    sourceLocations: uniqueLocations(evidence.map((item) => item.source)),
    evidence,
    confidence: 0,
    fieldConfidence: {},
    needsHumanReview: reviewReasons.size > 0,
    conflicts: [],
    reviewReasons: [...reviewReasons],
  };
  product = recomputeProductConfidence(product, repaired);
  return product;
}

function validateTextField(
  field: ExtractionField,
  value: string | null,
  evidence: ExtractionEvidence[],
  warnings: ExtractionWarning[],
  productId: string,
  sourceFile: string,
  reviewReasons: Set<string>,
): string | null {
  if (value === null) return null;
  const fieldEvidence = evidence.filter((item) => item.field === field);
  if (!fieldEvidence.length) {
    addWarning(warnings, 'MISSING_FIELD_EVIDENCE', '非空字段缺少来源证据，已置空', field, productId, sourceFile, []);
    reviewReasons.add(`${field}缺少来源证据`);
    return null;
  }
  if (!valueHasEvidence(value, fieldEvidence)) {
    addWarning(warnings, 'EVIDENCE_TEXT_MISMATCH', '字段值未在引用原文中出现，已置空', field, productId, sourceFile, fieldEvidence.map((item) => item.source));
    reviewReasons.add(`${field}与来源原文不一致`);
    return null;
  }
  return value;
}

function valueHasEvidence(value: string, evidence: ExtractionEvidence[]): boolean {
  return evidence.some((item) => containsExactText(item.text, value));
}

function containsExactText(container: string, value: string): boolean {
  const normalizedContainer = container.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const normalizedValue = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  return normalizedValue.length > 0 && normalizedContainer.includes(normalizedValue);
}

function warningCodesForEvidence(input: ExtractionInput, evidence: ExtractionEvidence) {
  return input.evidenceItems.find((item) => item.evidenceId === evidence.evidenceId)?.warningCodes ?? [];
}

function addWarning(
  warnings: ExtractionWarning[],
  code: ExtractionWarning['code'],
  message: string,
  field: ExtractionField | null,
  productId: string | null,
  sourceFile: string | null,
  sourceLocations: SourceLocation[],
) {
  warnings.push({ schemaVersion: SCHEMA_VERSION, code, message, field, productId, sourceFile, sourceLocations });
}

function uniqueLocations(locations: SourceLocation[]): SourceLocation[] {
  const seen = new Set<string>();
  return locations.filter((location) => {
    const key = JSON.stringify(location);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
