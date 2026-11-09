import { SCHEMA_VERSION } from '../../types';
import type { ParsedCell, ParsedDocument, SourceLocation } from '../../types';
import type {
  ExtractionInput,
  ExtractionField,
  ProviderExtractionPayload,
  ProviderWireProductDraft,
} from '../contracts';

interface GoldenEvidence {
  field: ExtractionField;
  quote: string;
}

interface GoldenDraft extends Omit<ProviderWireProductDraft, 'evidenceRefs'> {
  sourceFile: string;
  evidence: GoldenEvidence[];
}

export interface GoldenCase {
  id: string;
  description: string;
  documents: ParsedDocument[];
  drafts: GoldenDraft[];
  expected: {
    productCount: number;
    models?: Array<string | null>;
    needsHumanReview?: boolean;
    conflictField?: ExtractionField;
  };
}

const quantityNull = () => ({ value: null, unit: null, raw: null });

function draft(
  sourceFile: string,
  values: Partial<Omit<ProviderWireProductDraft, 'quantity' | 'evidenceRefs'>> & {
    quantity?: ProviderWireProductDraft['quantity'];
  },
  evidence: GoldenEvidence[],
): GoldenDraft {
  return {
    sourceFile,
    productName: values.productName ?? null,
    model: values.model ?? null,
    specifications: values.specifications ?? {},
    quantity: values.quantity ?? quantityNull(),
    material: values.material ?? null,
    process: values.process ?? null,
    application: values.application ?? null,
    notes: values.notes ?? [],
    evidence,
  };
}

function pdf(fileName: string, pages: string[]): ParsedDocument {
  return documentBase(fileName, 'pdf', pages.join('\n'), pages.map((text, index) => ({
    schemaVersion: SCHEMA_VERSION,
    id: `pdf-${index + 1}`,
    type: 'paragraph' as const,
    text,
    source: { schemaVersion: SCHEMA_VERSION, kind: 'pdf' as const, page: index + 1 },
    confidence: 1,
  })));
}

function docx(fileName: string, paragraphs: string[]): ParsedDocument {
  return documentBase(fileName, 'docx', paragraphs.join('\n'), paragraphs.map((text, index) => ({
    schemaVersion: SCHEMA_VERSION,
    id: `docx-${index + 1}`,
    type: index === 0 ? 'heading' as const : 'paragraph' as const,
    text,
    source: { schemaVersion: SCHEMA_VERSION, kind: 'docx' as const, paragraph: index + 1 },
    confidence: 1,
  })));
}

function image(fileName: string, text: string, confidence: number): ParsedDocument {
  const source = { schemaVersion: SCHEMA_VERSION, kind: 'image' as const, imageId: 'source-1', bbox: [0, 0, 800, 500] as [number, number, number, number] };
  const document = documentBase(fileName, 'image', text, [{
    schemaVersion: SCHEMA_VERSION,
    id: 'ocr-1',
    type: 'ocr-line',
    text,
    source,
    confidence,
  }]);
  document.images = [{
    schemaVersion: SCHEMA_VERSION,
    id: 'source-1',
    mimeType: 'image/jpeg',
    role: 'source-image',
    source,
    ocrText: text,
    ocrConfidence: confidence,
  }];
  document.warnings = confidence < 0.75 ? [{
    schemaVersion: SCHEMA_VERSION,
    code: 'ocr_low_confidence',
    severity: 'warning',
    message: '脱敏测试图OCR置信度较低',
    source,
  }] : [];
  return document;
}

function sheet(fileName: string, sheetName: string, rows: string[][]): ParsedDocument {
  const parsedRows: ParsedCell[][] = rows.map((row, rowIndex) => row.map((value, columnIndex) => ({
    schemaVersion: SCHEMA_VERSION,
    value,
    displayValue: value,
    source: sheetSource(sheetName, rowIndex + 1, columnIndex + 1),
  })));
  const document = documentBase(fileName, 'xlsx', rows.flat().join(' '), []);
  document.tables = [{
    schemaVersion: SCHEMA_VERSION,
    id: `sheet-${sheetName}`,
    title: sheetName,
    rows: parsedRows,
    source: { schemaVersion: SCHEMA_VERSION, kind: 'sheet', sheet: sheetName, range: `A1:H${rows.length}` },
    confidence: 1,
    headerRowCount: 1,
  }];
  document.metadata.sheetCount = 1;
  document.metadata.sheetNames = [sheetName];
  return document;
}

function documentBase(
  fileName: string,
  fileType: ParsedDocument['fileType'],
  rawText: string,
  blocks: ParsedDocument['blocks'],
): ParsedDocument {
  const fileId = fileName.replace(/[^A-Za-z0-9]/g, '').slice(0, 20) || 'fixture';
  return {
    schemaVersion: SCHEMA_VERSION,
    fileId,
    fileName,
    fileType,
    mimeType: 'application/octet-stream',
    size: rawText.length,
    sha256: fileId.padEnd(64, '0').slice(0, 64),
    rawText,
    blocks,
    tables: [],
    images: [],
    metadata: { schemaVersion: SCHEMA_VERSION, parser: 'golden-fixture', parseDurationMs: 1 },
    warnings: [],
  };
}

function sheetSource(sheetName: string, row: number, column: number): SourceLocation {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'sheet',
    sheet: sheetName,
    cell: `${columnName(column)}${row}`,
    row,
    column,
  };
}

function columnName(column: number): string {
  let value = column;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

const standardEvidence = (name: string, model: string): GoldenEvidence[] => [
  { field: 'productName', quote: name },
  { field: 'model', quote: model },
];

export const GOLDEN_CASES: GoldenCase[] = [
  {
    id: 'single-product-pdf',
    description: '单产品原生文字PDF',
    documents: [pdf('单产品目录.pdf', ['产品名称：自动喷涂设备 型号：SP-3000 数量：1套 材质：不锈钢'])],
    drafts: [draft('单产品目录.pdf', {
      productName: '自动喷涂设备', model: 'SP-3000', material: '不锈钢',
      quantity: { value: 1, unit: '套', raw: '1套' },
    }, [...standardEvidence('自动喷涂设备', 'SP-3000'), { field: 'quantity', quote: '1套' }, { field: 'material', quote: '不锈钢' }])],
    expected: { productCount: 1, models: ['SP-3000'] },
  },
  {
    id: 'multi-product-pdf',
    description: '多产品PDF',
    documents: [pdf('多产品目录.pdf', ['自动喷涂设备 SP-3000；自动化生产线 AL-2600'])],
    drafts: [
      draft('多产品目录.pdf', { productName: '自动喷涂设备', model: 'SP-3000' }, standardEvidence('自动喷涂设备', 'SP-3000')),
      draft('多产品目录.pdf', { productName: '自动化生产线', model: 'AL-2600' }, standardEvidence('自动化生产线', 'AL-2600')),
    ],
    expected: { productCount: 2, models: ['SP-3000', 'AL-2600'] },
  },
  {
    id: 'excel-product-list',
    description: 'Excel产品清单',
    documents: [sheet('采购产品清单.xlsx', '产品需求', [
      ['产品名称', '型号', '数量', '规格'],
      ['自动喷涂设备', 'SP-3000', '1套', '产能3000件/天'],
      ['输送模块', 'CV-1200', '2套', '宽度1200mm'],
    ])],
    drafts: [
      draft('采购产品清单.xlsx', {
        productName: '自动喷涂设备', model: 'SP-3000', specifications: { 产能: '3000件/天' },
        quantity: { value: 1, unit: '套', raw: '1套' },
      }, [...standardEvidence('自动喷涂设备', 'SP-3000'), { field: 'quantity', quote: '1套' }, { field: 'specifications.产能', quote: '3000件/天' }]),
      draft('采购产品清单.xlsx', {
        productName: '输送模块', model: 'CV-1200', specifications: { 宽度: '1200mm' },
        quantity: { value: 2, unit: '套', raw: '2套' },
      }, [...standardEvidence('输送模块', 'CV-1200'), { field: 'quantity', quote: '2套' }, { field: 'specifications.宽度', quote: '1200mm' }]),
    ],
    expected: { productCount: 2, models: ['SP-3000', 'CV-1200'] },
  },
  {
    id: 'docx-purchase-request',
    description: 'DOCX采购需求',
    documents: [docx('采购需求.docx', ['采购需求', '需要自动喷涂设备，型号SP-3000，用于五金配件水性漆喷涂。'])],
    drafts: [draft('采购需求.docx', {
      productName: '自动喷涂设备', model: 'SP-3000', process: '水性漆喷涂', application: '五金配件',
    }, [...standardEvidence('自动喷涂设备', 'SP-3000'), { field: 'process', quote: '水性漆喷涂' }, { field: 'application', quote: '五金配件' }])],
    expected: { productCount: 1, models: ['SP-3000'] },
  },
  {
    id: 'ocr-nameplate',
    description: '正常置信度OCR铭牌',
    documents: [image('铭牌.jpg', 'AUTOMATIC SPRAYER MODEL SP-3000 POWER 12kW', 0.92)],
    drafts: [draft('铭牌.jpg', {
      productName: 'AUTOMATIC SPRAYER', model: 'SP-3000', specifications: { POWER: '12kW' },
    }, [...standardEvidence('AUTOMATIC SPRAYER', 'SP-3000'), { field: 'specifications.POWER', quote: '12kW' }])],
    expected: { productCount: 1, models: ['SP-3000'] },
  },
  {
    id: 'mixed-language',
    description: '中英文混合字段',
    documents: [docx('mixed.docx', ['Product Request', '产品 Product: 自动喷涂设备 / Automatic Sprayer; Model: SP-3000; Qty: 1 set'])],
    drafts: [draft('mixed.docx', {
      productName: '自动喷涂设备', model: 'SP-3000',
      quantity: { value: 1, unit: 'set', raw: '1 set' },
    }, [...standardEvidence('自动喷涂设备', 'SP-3000'), { field: 'quantity', quote: '1 set' }])],
    expected: { productCount: 1, models: ['SP-3000'] },
  },
  {
    id: 'missing-model',
    description: '缺型号但有复杂规格',
    documents: [pdf('缺型号.pdf', ['自动喷涂设备 工作宽度1200mm 功率12kW'])],
    drafts: [draft('缺型号.pdf', {
      productName: '自动喷涂设备', specifications: { 工作宽度: '1200mm', 功率: '12kW' },
    }, [{ field: 'productName', quote: '自动喷涂设备' }, { field: 'specifications.工作宽度', quote: '1200mm' }, { field: 'specifications.功率', quote: '12kW' }])],
    expected: { productCount: 1, models: [null], needsHumanReview: true },
  },
  {
    id: 'missing-quantity',
    description: '缺数量不得自动补1套',
    documents: [pdf('缺数量.pdf', ['自动喷涂设备 型号SP-3000'])],
    drafts: [draft('缺数量.pdf', { productName: '自动喷涂设备', model: 'SP-3000' }, standardEvidence('自动喷涂设备', 'SP-3000'))],
    expected: { productCount: 1, models: ['SP-3000'] },
  },
  {
    id: 'same-product-multi-file',
    description: '多文件同一产品合并',
    documents: [
      pdf('产品目录.pdf', ['自动喷涂设备 SP-3000']),
      sheet('参数表.xlsx', '参数', [['产品名称', '型号', '功率'], ['自动喷涂设备', 'SP3000', '12kW']]),
    ],
    drafts: [
      draft('产品目录.pdf', { productName: '自动喷涂设备', model: 'SP-3000' }, standardEvidence('自动喷涂设备', 'SP-3000')),
      draft('参数表.xlsx', { productName: '自动喷涂设备', model: 'SP3000', specifications: { 功率: '12kW' } }, [
        ...standardEvidence('自动喷涂设备', 'SP3000'), { field: 'specifications.功率', quote: '12kW' },
      ]),
    ],
    expected: { productCount: 1, models: ['SP-3000'] },
  },
  {
    id: 'conflicting-models',
    description: '多文件型号冲突',
    documents: [
      pdf('目录.pdf', ['自动喷涂设备 SP-3000']),
      sheet('需求.xlsx', '需求', [['产品名称', '型号'], ['自动喷涂设备', 'SP-3200']]),
    ],
    drafts: [
      draft('目录.pdf', { productName: '自动喷涂设备', model: 'SP-3000' }, standardEvidence('自动喷涂设备', 'SP-3000')),
      draft('需求.xlsx', { productName: '自动喷涂设备', model: 'SP-3200' }, standardEvidence('自动喷涂设备', 'SP-3200')),
    ],
    expected: { productCount: 1, models: ['SP-3000'], needsHumanReview: true, conflictField: 'model' },
  },
  {
    id: 'low-confidence-ocr-model',
    description: 'OCR低置信度型号保留9P原值',
    documents: [image('低清铭牌.jpg', '自动喷涂设备 型号 9P-3000', 0.53)],
    drafts: [draft('低清铭牌.jpg', { productName: '自动喷涂设备', model: '9P-3000' }, standardEvidence('自动喷涂设备', '9P-3000'))],
    expected: { productCount: 1, models: ['9P-3000'], needsHumanReview: true },
  },
  {
    id: 'nonstandard-table-headers',
    description: '非标准表头',
    documents: [sheet('非标准表头.xlsx', '清单', [['品名描述', '机器代号', '需求数'], ['自动化生产线', 'AL-2600', '1条']])],
    drafts: [draft('非标准表头.xlsx', {
      productName: '自动化生产线', model: 'AL-2600',
      quantity: { value: 1, unit: '条', raw: '1条' },
    }, [...standardEvidence('自动化生产线', 'AL-2600'), { field: 'quantity', quote: '1条' }])],
    expected: { productCount: 1, models: ['AL-2600'] },
  },
  {
    id: 'three-products-one-file',
    description: '一个文件三个产品',
    documents: [pdf('三产品.pdf', ['自动喷涂设备 SP-3000；自动化生产线 AL-2600；家具配件喷涂设备 FP-980'])],
    drafts: [
      draft('三产品.pdf', { productName: '自动喷涂设备', model: 'SP-3000' }, standardEvidence('自动喷涂设备', 'SP-3000')),
      draft('三产品.pdf', { productName: '自动化生产线', model: 'AL-2600' }, standardEvidence('自动化生产线', 'AL-2600')),
      draft('三产品.pdf', { productName: '家具配件喷涂设备', model: 'FP-980' }, standardEvidence('家具配件喷涂设备', 'FP-980')),
    ],
    expected: { productCount: 3, models: ['SP-3000', 'AL-2600', 'FP-980'] },
  },
  {
    id: 'no-products',
    description: '无产品内容文件',
    documents: [docx('会议通知.docx', ['会议通知', '周五下午三点进行内部培训，请准时参加。'])],
    drafts: [],
    expected: { productCount: 0 },
  },
  {
    id: 'noisy-document',
    description: '噪声很多但仅提取明确产品',
    documents: [pdf('混合资料.pdf', ['页眉 2026 CONFIDENTIAL 联系人已脱敏 广告语 流程说明；明确需求：家具配件喷涂设备 FP-980；页脚 1/20'])],
    drafts: [draft('混合资料.pdf', { productName: '家具配件喷涂设备', model: 'FP-980' }, standardEvidence('家具配件喷涂设备', 'FP-980'))],
    expected: { productCount: 1, models: ['FP-980'] },
  },
];

export function createGoldenResponse(goldenCase: GoldenCase, input: ExtractionInput): ProviderExtractionPayload {
  const products = goldenCase.drafts.filter((item) => item.sourceFile === input.fileName).flatMap((item) => {
    const resolved = item.evidence.map((reference) => {
      const evidenceItem = input.evidenceItems.find((candidate) => candidate.text.includes(reference.quote));
      return evidenceItem ? {
        field: reference.field,
        evidenceId: evidenceItem.evidenceId,
        quote: reference.quote,
      } : null;
    });
    if (resolved.some((item) => item === null)) return [];
    const evidenceRefs = resolved.filter((entry) => entry !== null).reduce<Record<string, Array<{ evidenceId: string; quote: string }>>>((groups, entry) => {
      (groups[entry.field] ??= []).push({ evidenceId: entry.evidenceId, quote: entry.quote });
      return groups;
    }, {});
    const { sourceFile: _sourceFile, evidence: _evidence, ...values } = item;
    return [{
      ...values,
      evidenceRefs,
    }];
  });
  return { schemaVersion: SCHEMA_VERSION, products };
}
