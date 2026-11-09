import type { ExtractedProductV1, ExtractionWarning, ProductFieldConflict } from '../../extraction';
import { SCHEMA_VERSION } from '../../types';
import type { MatchOptions, ProductMatchLevel } from '../contracts';

export interface MatchingGoldenCase {
  id: string;
  description: string;
  input: Partial<ExtractedProductV1>;
  extractionWarnings?: ExtractionWarning[];
  options?: MatchOptions;
  expectedProductId: string | null;
  expectedLevels: ProductMatchLevel[];
  expectedHumanReview: boolean;
}

function warning(code: ExtractionWarning['code'], message: string, field: ExtractionWarning['field']): ExtractionWarning {
  return { schemaVersion: SCHEMA_VERSION, code, message, field, productId: null, sourceFile: 'customer-input.pdf', sourceLocations: [] };
}

function conflict(field: ProductFieldConflict['field'], values: string[]): ProductFieldConflict {
  return {
    schemaVersion: SCHEMA_VERSION,
    field,
    message: `${field}存在多来源冲突`,
    values: values.map((value, index) => ({
      schemaVersion: SCHEMA_VERSION,
      value,
      evidence: [{
        schemaVersion: SCHEMA_VERSION,
        field,
        text: value,
        file: `source-${index + 1}.pdf`,
        sourceFile: `source-${index + 1}.pdf`,
        source: { schemaVersion: SCHEMA_VERSION, kind: 'pdf', page: index + 1 },
        evidenceId: `evidence-${field}-${index}`,
        chunkId: `chunk-${index}`,
        confidence: 0.95,
        originKind: 'text',
      }],
    })),
  };
}

export function createExtractedProduct(id: string, partial: Partial<ExtractedProductV1>): ExtractedProductV1 {
  const productName = partial.productName === undefined ? '自动喷涂设备' : partial.productName;
  const model = partial.model === undefined ? 'SP-3000' : partial.model;
  const specifications = partial.specifications ?? {};
  const material = partial.material ?? null;
  const application = partial.application ?? null;
  const sourceFile = partial.sourceFile ?? 'customer-input.pdf';
  const evidence = partial.evidence ?? [
    ...(productName ? [{ field: 'productName', text: productName }] : []),
    ...(model ? [{ field: 'model', text: model }] : []),
    ...Object.entries(specifications).map(([name, value]) => ({ field: `specifications.${name}`, text: value })),
    ...(material ? [{ field: 'material', text: material }] : []),
    ...(application ? [{ field: 'application', text: application }] : []),
  ].map((entry, index) => ({
    schemaVersion: SCHEMA_VERSION,
    field: entry.field,
    text: entry.text,
    file: sourceFile,
    sourceFile,
    source: { schemaVersion: SCHEMA_VERSION, kind: 'pdf' as const, page: index + 1 },
    evidenceId: `${id}-evidence-${index + 1}`,
    chunkId: `${id}-chunk-1`,
    confidence: 0.95,
    originKind: 'text' as const,
  }));
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    productName,
    model,
    specifications,
    quantity: partial.quantity ?? { schemaVersion: SCHEMA_VERSION, value: null, unit: null, raw: null },
    material,
    process: partial.process ?? null,
    application,
    notes: partial.notes ?? [],
    sourceFile,
    sourceLocations: partial.sourceLocations ?? evidence.map((entry) => entry.source),
    evidence,
    confidence: partial.confidence ?? 0.95,
    fieldConfidence: partial.fieldConfidence ?? {},
    needsHumanReview: partial.needsHumanReview ?? false,
    conflicts: partial.conflicts ?? [],
    reviewReasons: partial.reviewReasons ?? [],
  };
}

const hardWidthPolicy: MatchOptions = {
  policy: {
    specificationRules: {
      工作宽度: { name: '工作宽度', importance: 'hard', comparison: 'candidate-minimum', toleranceRatio: 0, requiredForReview: true },
    },
  },
};

export const MATCHING_GOLDEN_CASES: MatchingGoldenCase[] = [
  { id: 'exact-sp3000', description: '型号与名称精确匹配', input: { specifications: { 工作宽度: '1200mm' } }, expectedProductId: 'JG-SP-3000', expectedLevels: ['exact'], expectedHumanReview: false },
  { id: 'model-format-dash', description: '型号无连字符可归一', input: { model: 'SP3000' }, expectedProductId: 'JG-SP-3000', expectedLevels: ['exact'], expectedHumanReview: false },
  { id: 'model-format-space', description: '型号空格差异可归一', input: { model: 'SP 3000' }, expectedProductId: 'JG-SP-3000', expectedLevels: ['exact'], expectedHumanReview: false },
  { id: 'model-format-fullwidth', description: '全角型号可归一', input: { model: 'ＳＰ－３０００' }, expectedProductId: 'JG-SP-3000', expectedLevels: ['exact'], expectedHumanReview: false },
  { id: 'exact-conveyor', description: '输送模块型号精确匹配', input: { productName: '输送模块', model: 'CV-1200' }, expectedProductId: 'YW-CV-1200', expectedLevels: ['exact'], expectedHumanReview: false },
  { id: 'exact-line', description: '自动化生产线型号精确匹配', input: { productName: '自动化生产线', model: 'AL-2600' }, expectedProductId: 'YW-AL-2600', expectedLevels: ['exact'], expectedHumanReview: false },
  { id: 'exact-enhanced', description: '同系列不同型号精确区分', input: { model: 'SP-3200', specifications: { 工作宽度: '1.5m' } }, expectedProductId: 'JG-SP-3200', expectedLevels: ['exact'], expectedHumanReview: false },
  { id: 'exact-furniture', description: '家具喷涂型号精确匹配', input: { productName: '家具配件喷涂方案', model: 'FP-980' }, expectedProductId: 'FS-FP-980', expectedLevels: ['exact'], expectedHumanReview: false },
  { id: 'synonym-spray', description: '自动喷涂机同义词召回', input: { productName: '自动喷涂机', model: null, specifications: { 工作宽度: '1200mm', 功率: '15kW' }, application: '五金配件' }, expectedProductId: 'JG-SP-3000', expectedLevels: ['high'], expectedHumanReview: true },
  { id: 'synonym-powder', description: '喷粉设备同义词召回', input: { productName: '自动喷粉设备', model: null, specifications: { 工作宽度: '1200mm' }, application: '粉末涂装' }, expectedProductId: 'JG-SP-3000P', expectedLevels: ['high'], expectedHumanReview: true },
  { id: 'synonym-line', description: '自动产线同义词召回', input: { productName: '自动产线', model: null, specifications: { 工作宽度: '1200mm', 产能: '2600件/天' }, application: '机械装配' }, expectedProductId: 'YW-AL-2600', expectedLevels: ['high'], expectedHumanReview: true },
  { id: 'synonym-conveyor', description: '输送机同义词召回', input: { productName: '输送机', model: null, specifications: { 工作宽度: '1200mm', 功率: '3kW' }, application: '喷涂产线' }, expectedProductId: 'YW-CV-1200', expectedLevels: ['high'], expectedHumanReview: true },
  { id: 'synonym-furniture', description: '家具喷漆线同义词召回', input: { productName: '家具喷漆线', model: null, specifications: { 工作宽度: '980mm' }, application: '家具配件' }, expectedProductId: 'FS-FP-980', expectedLevels: ['high'], expectedHumanReview: true },
  { id: 'synonym-reciprocating', description: '往复式喷涂机同义词召回', input: { productName: '往复式喷涂机', model: null, specifications: { 工作宽度: '1.2m' }, application: '门板' }, expectedProductId: 'FS-WD-1200', expectedLevels: ['high'], expectedHumanReview: true },
  { id: 'keyword-pretreatment', description: '前处理关键词和别名召回', input: { productName: '涂装前处理线', model: null, specifications: { 工作宽度: '1200mm' }, application: '金属件清洗' }, expectedProductId: 'PRE-1200', expectedLevels: ['high'], expectedHumanReview: true },
  { id: 'keyword-powder-line', description: '喷粉生产线同义词召回', input: { productName: '喷粉生产线', model: null, specifications: { 工作宽度: '1400mm' }, application: '批量粉末涂装' }, expectedProductId: 'PC-2400', expectedLevels: ['high'], expectedHumanReview: true },
  { id: 'unit-meter', description: '工作宽度m与mm换算', input: { model: null, specifications: { 工作宽度: '1.2m', 功率: '15kW' }, application: '五金配件' }, expectedProductId: 'JG-SP-3000', expectedLevels: ['high'], expectedHumanReview: true },
  { id: 'unit-centimeter', description: '工作宽度cm与mm换算', input: { model: null, specifications: { 工作宽度: '120cm', 功率: '15kW' }, application: '五金配件' }, expectedProductId: 'JG-SP-3000', expectedLevels: ['high'], expectedHumanReview: true },
  { id: 'unit-watt', description: '功率W与kW换算', input: { model: null, specifications: { 工作宽度: '1200mm', 功率: '15000W' }, application: '五金配件' }, expectedProductId: 'JG-SP-3000', expectedLevels: ['high'], expectedHumanReview: true },
  { id: 'hard-width-conflict', description: '型号一致但工作宽度硬冲突', input: { specifications: { 工作宽度: '2000mm' } }, expectedProductId: 'JG-SP-3000', expectedLevels: ['medium'], expectedHumanReview: true },
  { id: 'hard-power-conflict', description: '型号一致但功率硬冲突', input: { specifications: { 功率: '18.5kW' } }, expectedProductId: 'JG-SP-3000', expectedLevels: ['medium'], expectedHumanReview: true },
  { id: 'soft-material-conflict', description: '软规格冲突不等同硬冲突', input: { material: '不锈钢' }, expectedProductId: 'JG-SP-3000', expectedLevels: ['exact'], expectedHumanReview: false },
  { id: 'ocr-ambiguous-model', description: 'OCR 9P不得修正为SP', input: { model: '9P-3000', specifications: { 工作宽度: '1200mm', 功率: '15kW' }, application: '五金配件', needsHumanReview: true, reviewReasons: ['型号存在OCR字符歧义'] }, extractionWarnings: [warning('OCR_MODEL_UNCERTAIN', '型号存在OCR字符歧义', 'model')], expectedProductId: 'JG-SP-3000', expectedLevels: ['medium', 'low'], expectedHumanReview: true },
  { id: 'unknown-model-none', description: '未知型号且无名称时返回none', input: { productName: null, model: 'XYZ-9999' }, expectedProductId: null, expectedLevels: ['none'], expectedHumanReview: true },
  { id: 'unrelated-none', description: '完全无关产品返回none', input: { productName: '激光切割机', model: null, application: '钢板切割' }, expectedProductId: null, expectedLevels: ['none'], expectedHumanReview: true },
  { id: 'multiple-close', description: '名称宽泛导致多候选接近', input: { productName: '自动喷涂设备', model: null, specifications: {}, application: null }, expectedProductId: 'JG-SP-2800', expectedLevels: ['high'], expectedHumanReview: true },
  { id: 'missing-product-name', description: '缺产品名称但型号命中仍需人工确认', input: { productName: null, needsHumanReview: true, reviewReasons: ['产品名称缺失'] }, extractionWarnings: [warning('MISSING_CRITICAL_FIELD', '产品名称缺失', 'productName')], expectedProductId: 'JG-SP-3000', expectedLevels: ['high'], expectedHumanReview: true },
  { id: 'source-conflict', description: 'ExtractedProduct自身冲突必须人工确认', input: { conflicts: [conflict('model', ['SP-3000', 'SP-3200'])], needsHumanReview: true, reviewReasons: ['型号存在多来源冲突'] }, expectedProductId: 'JG-SP-3000', expectedLevels: ['high'], expectedHumanReview: true },
  { id: 'cross-file-merged', description: '跨文件合并产品保留客户Evidence', input: { sourceFile: 'merged:request.pdf|specs.xlsx', evidence: undefined, specifications: { 工作宽度: '1200mm', 功率: '15kW' } }, expectedProductId: 'JG-SP-3000', expectedLevels: ['exact'], expectedHumanReview: false },
  { id: 'application-only', description: '仅应用场景不能形成高等级', input: { productName: null, model: null, specifications: {}, application: '复杂曲面' }, expectedProductId: 'RB-600', expectedLevels: ['low'], expectedHumanReview: true },
  { id: 'keyword-robot', description: '关键词别名召回机器人单元', input: { productName: '六轴喷涂', model: null, specifications: { 工作宽度: '600mm' }, application: '复杂曲面' }, expectedProductId: 'RB-600', expectedLevels: ['high'], expectedHumanReview: true },
  { id: 'inactive-product', description: '停用产品不得成为候选', input: { productName: null, model: 'MIX-200' }, expectedProductId: null, expectedLevels: ['none'], expectedHumanReview: true },
  { id: 'missing-hard-catalog-spec', description: '候选缺关键规格必须人工确认', input: { specifications: { 接口规格: 'PLC-Ethernet' } }, options: hardWidthPolicy, expectedProductId: 'JG-SP-3000', expectedLevels: ['medium', 'high'], expectedHumanReview: true },
  { id: 'same-name-different-model', description: '同名系列通过型号稳定区分', input: { productName: '自动喷涂设备', model: 'SP-2800', specifications: { 工作宽度: '1000mm' } }, expectedProductId: 'JG-SP-2800', expectedLevels: ['exact'], expectedHumanReview: false },
];
