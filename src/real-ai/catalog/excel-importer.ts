/// <reference types="node" />

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import { SCHEMA_VERSION } from '../types';
import type {
  CatalogColumnTarget,
  CatalogField,
  CatalogFieldMapping,
  ExcelImportOptions,
  ImportIssue,
  ImportReport,
  ImportRowResult,
  ProductRecord,
} from './contracts';
import {
  isValidProductId,
  normalizeModel,
  normalizeProductName,
  normalizeSpecificationName,
  normalizeStatus,
  normalizeUnicode,
  parseSpecification,
  splitList,
  stableProductId,
} from './normalization';
import { ProductRecordSchema } from './schemas';

const FIELD_ALIASES: Record<CatalogField, string[]> = {
  productId: ['产品id', '产品编号', '商品编号', 'productid', 'product_id', 'sku'],
  productName: ['产品名称', '品名', '商品名称', '产品', 'productname', 'product_name', 'name'],
  model: ['型号', '规格型号', '产品型号', 'model', 'modelno', 'modelnumber'],
  category: ['分类', '产品分类', '类别', 'category', 'type'],
  applications: ['应用场景', '应用', '适用场景', '适用行业', 'applications', 'application'],
  keywords: ['关键词', '标签', '关键字', 'keywords', 'keyword', 'tags'],
  synonyms: ['同义词', '别名', '其他名称', 'synonyms', 'synonym', 'aliases'],
  description: ['产品说明', '描述', '产品描述', '介绍', 'description', 'details'],
  status: ['状态', '产品状态', 'status', 'enabled'],
};

const ALIAS_LOOKUP = new Map<string, CatalogField>();
for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [CatalogField, string[]][]) {
  for (const alias of aliases) ALIAS_LOOKUP.set(normalizeHeader(alias), field);
}

interface HeaderDetection {
  rowIndex: number;
  depth: 1 | 2;
  headers: string[];
  mappings: CatalogFieldMapping[];
  score: number;
}

function normalizeHeader(value: unknown): string {
  return normalizeUnicode(value).toLocaleLowerCase('en-US').replace(/[\s._-]+/g, '');
}

function issue(
  severity: 'warning' | 'error',
  sheet: string,
  row: number,
  column: string,
  field: string,
  code: string,
  message: string,
): ImportIssue {
  return { schemaVersion: SCHEMA_VERSION, severity, sheet, row, column, field, code, message };
}

function columnTarget(header: string, manualMapping?: Record<string, CatalogColumnTarget>): CatalogFieldMapping | null {
  const manual = manualMapping?.[header] ?? manualMapping?.[normalizeHeader(header)];
  if (manual) return { sourceColumn: header, target: manual, confidence: 'manual' };

  const specificationMatch = normalizeUnicode(header).match(/^(?:规格|参数|specifications?|spec)[.．:：_-](.+)$/i);
  if (specificationMatch) {
    const specificationName = normalizeSpecificationName(specificationMatch[1]);
    if (!specificationName) return null;
    return { sourceColumn: header, target: `specification.${specificationName}`, confidence: 'exact' };
  }

  const field = ALIAS_LOOKUP.get(normalizeHeader(header));
  if (!field) return null;
  const canonical = FIELD_ALIASES[field][0];
  return {
    sourceColumn: header,
    target: field,
    confidence: normalizeHeader(header) === normalizeHeader(canonical) ? 'exact' : 'alias',
  };
}

function mergedCellValue(sheet: XLSX.WorkSheet, row: number, column: number): unknown {
  const direct = sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.v;
  if (direct !== undefined && direct !== null && direct !== '') return direct;
  for (const merge of sheet['!merges'] ?? []) {
    if (row < merge.s.r || row > merge.e.r || column < merge.s.c || column > merge.e.c) continue;
    return sheet[XLSX.utils.encode_cell(merge.s)]?.v ?? '';
  }
  return '';
}

function candidateHeaders(sheet: XLSX.WorkSheet, rowIndex: number, depth: 1 | 2, width: number): string[] {
  const headers: string[] = [];
  for (let column = 0; column < width; column += 1) {
    const parent = normalizeUnicode(mergedCellValue(sheet, rowIndex, column));
    if (depth === 1) {
      headers.push(parent);
      continue;
    }
    const child = normalizeUnicode(mergedCellValue(sheet, rowIndex + 1, column));
    if (/^(规格|参数|specifications?|spec)$/i.test(parent) && child && !/^(规格|参数)$/i.test(child)) {
      headers.push(`规格.${child}`);
    } else {
      headers.push(child || parent);
    }
  }
  return headers;
}

function detectHeaders(
  sheet: XLSX.WorkSheet,
  rows: unknown[][],
  manualMapping?: Record<string, CatalogColumnTarget>,
): HeaderDetection | null {
  const width = Math.max(0, ...rows.slice(0, 6).map((row) => row.length));
  let best: HeaderDetection | null = null;
  const maxStart = Math.min(5, rows.length);
  for (let rowIndex = 0; rowIndex < maxStart; rowIndex += 1) {
    for (const depth of [1, 2] as const) {
      if (rowIndex + depth > rows.length) continue;
      const headers = candidateHeaders(sheet, rowIndex, depth, width);
      const mappings = headers
        .map((header) => columnTarget(header, manualMapping))
        .filter((mapping): mapping is CatalogFieldMapping => Boolean(mapping));
      const targets = new Set(mappings.map((mapping) => mapping.target));
      const score = (targets.has('productName') ? 20 : 0)
        + (targets.has('model') ? 5 : 0)
        + mappings.filter((mapping) => mapping.target.startsWith('specification.')).length * 2
        + mappings.length;
      if (!best || score > best.score) best = { rowIndex, depth, headers, mappings, score };
    }
  }
  return best && best.score > 0 ? best : null;
}

function sheetIsHidden(workbook: XLSX.WorkBook, index: number): boolean {
  return Boolean(workbook.Workbook?.Sheets?.[index]?.Hidden);
}

function cellHasFormula(sheet: XLSX.WorkSheet, row: number, column: number): boolean {
  return typeof sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.f === 'string';
}

function cellText(sheet: XLSX.WorkSheet, rows: unknown[][], row: number, column: number): string {
  if (cellHasFormula(sheet, row, column)) return '';
  return normalizeUnicode(rows[row]?.[column]);
}

function hasContent(row: unknown[]): boolean {
  return row.some((value) => normalizeUnicode(value) !== '');
}

function rowStatus(issues: ImportIssue[]): 'success' | 'warning' | 'failed' {
  if (issues.some((entry) => entry.severity === 'error')) return 'failed';
  return issues.length ? 'warning' : 'success';
}

export async function importProductCatalogExcel(
  filePath: string,
  sourceFile: string,
  options: ExcelImportOptions,
): Promise<ImportReport> {
  const workbook = XLSX.read(await readFile(filePath), {
    type: 'buffer',
    raw: false,
    cellFormula: true,
    cellHTML: false,
    cellNF: false,
    cellStyles: false,
    bookDeps: false,
    bookFiles: false,
    bookVBA: false,
  });
  return importProductCatalogWorkbook(workbook, sourceFile, options);
}

export function importProductCatalogWorkbook(
  workbook: XLSX.WorkBook,
  sourceFile: string,
  options: ExcelImportOptions,
): ImportReport {
  const importId = `import_${randomUUID()}`;
  const now = options.now ?? new Date().toISOString();
  const records: ProductRecord[] = [];
  const rowResults: ImportRowResult[] = [];
  const globalErrors: ImportIssue[] = [];
  const globalWarnings: ImportIssue[] = [];
  const allMappings: CatalogFieldMapping[] = [];
  const ids = new Map<string, { sheet: string; row: number }>();
  const models = new Map<string, { name: string; sheet: string; row: number }>();
  const names = new Map<string, string>();

  if (!workbook.SheetNames.length) {
    globalErrors.push(issue('error', '', 0, '', '', 'WORKBOOK_HAS_NO_SHEETS', '工作簿不包含任何Sheet'));
  }

  for (let sheetIndex = 0; sheetIndex < workbook.SheetNames.length; sheetIndex += 1) {
    const sheetName = workbook.SheetNames[sheetIndex];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    if (sheetIsHidden(workbook, sheetIndex)) {
      globalWarnings.push(issue('warning', sheetName, 0, '', '', 'HIDDEN_SHEET_SKIPPED', '隐藏Sheet已跳过，不参与导入'));
      continue;
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: true,
    });
    if (!rows.length || !rows.some(hasContent)) {
      globalWarnings.push(issue('warning', sheetName, 0, '', '', 'EMPTY_SHEET_SKIPPED', '空Sheet已跳过'));
      continue;
    }

    const detection = detectHeaders(sheet, rows, options.fieldMapping);
    if (!detection || !detection.mappings.some((mapping) => mapping.target === 'productName')) {
      globalErrors.push(issue('error', sheetName, 1, '', 'productName', 'PRODUCT_NAME_COLUMN_MISSING', '未找到产品名称列，请使用标准模板或提供字段映射'));
      continue;
    }
    allMappings.push(...detection.mappings);
    const mappedColumns = detection.headers.map((header) => columnTarget(header, options.fieldMapping));
    const firstDataRow = detection.rowIndex + detection.depth;

    for (let rowIndex = firstDataRow; rowIndex < rows.length; rowIndex += 1) {
      const sourceRow = rowIndex + 1;
      if (!hasContent(rows[rowIndex] ?? [])) continue;
      const values = new Map<CatalogColumnTarget, { value: string; column: string }>();
      const rowIssues: ImportIssue[] = [];

      for (let columnIndex = 0; columnIndex < mappedColumns.length; columnIndex += 1) {
        const mapping = mappedColumns[columnIndex];
        if (!mapping) continue;
        const columnName = detection.headers[columnIndex] || XLSX.utils.encode_col(columnIndex);
        if (cellHasFormula(sheet, rowIndex, columnIndex)) {
          rowIssues.push(issue('warning', sheetName, sourceRow, columnName, mapping.target, 'FORMULA_VALUE_IGNORED', '公式不会执行，该单元格按空值处理'));
        }
        values.set(mapping.target, { value: cellText(sheet, rows, rowIndex, columnIndex), column: columnName });
      }

      const productName = values.get('productName')?.value ?? '';
      const model = values.get('model')?.value ?? '';
      const rawProductId = values.get('productId')?.value ?? '';
      const category = values.get('category')?.value ?? '';
      const description = values.get('description')?.value ?? '';

      if (!productName) {
        rowIssues.push(issue('error', sheetName, sourceRow, values.get('productName')?.column ?? '', 'productName', 'PRODUCT_NAME_REQUIRED', '产品名称不能为空'));
      } else if (productName.length > 200) {
        rowIssues.push(issue('error', sheetName, sourceRow, values.get('productName')?.column ?? '', 'productName', 'PRODUCT_NAME_TOO_LONG', '产品名称不能超过200个字符'));
      }
      if (!model) {
        rowIssues.push(issue('warning', sheetName, sourceRow, values.get('model')?.column ?? '', 'model', 'MODEL_MISSING', '型号为空，允许导入，但后续匹配准确性可能降低'));
      } else if (model.length > 120) {
        rowIssues.push(issue('error', sheetName, sourceRow, values.get('model')?.column ?? '', 'model', 'MODEL_TOO_LONG', '型号不能超过120个字符'));
      }
      if (!category) {
        rowIssues.push(issue('warning', sheetName, sourceRow, values.get('category')?.column ?? '', 'category', 'CATEGORY_MISSING', '分类为空，建议补充以提高候选查询质量'));
      }
      if (description.length > 5000) {
        rowIssues.push(issue('error', sheetName, sourceRow, values.get('description')?.column ?? '', 'description', 'DESCRIPTION_TOO_LONG', '产品说明不能超过5000个字符'));
      }

      const statusValue = values.get('status')?.value ?? '';
      const status = normalizeStatus(statusValue);
      if (!status) {
        rowIssues.push(issue('warning', sheetName, sourceRow, values.get('status')?.column ?? '', 'status', 'STATUS_UNKNOWN', '无法识别状态，已按启用处理'));
      }

      let productId = rawProductId;
      if (productId && !isValidProductId(productId)) {
        rowIssues.push(issue('error', sheetName, sourceRow, values.get('productId')?.column ?? '', 'productId', 'PRODUCT_ID_INVALID', '产品ID仅允许2至64位字母、数字、点、下划线或连字符'));
      }
      if (!productId && productName) productId = stableProductId(options.namespace, productName, model);

      const normalizedName = normalizeProductName(productName);
      const normalizedModel = normalizeModel(model);
      if (productId && ids.has(productId)) {
        const previous = ids.get(productId)!;
        rowIssues.push(issue('error', sheetName, sourceRow, values.get('productId')?.column ?? '', 'productId', 'DUPLICATE_PRODUCT_ID', `产品ID与${previous.sheet}第${previous.row}行重复`));
      }
      if (normalizedModel && models.has(normalizedModel)) {
        const previous = models.get(normalizedModel)!;
        const code = previous.name === normalizedName ? 'DUPLICATE_MODEL' : 'MODEL_PRODUCT_CONFLICT';
        rowIssues.push(issue('error', sheetName, sourceRow, values.get('model')?.column ?? '', 'model', code, `标准化型号与${previous.sheet}第${previous.row}行冲突`));
      }
      if (normalizedName && names.has(normalizedName) && names.get(normalizedName) !== normalizedModel) {
        rowIssues.push(issue('warning', sheetName, sourceRow, values.get('productName')?.column ?? '', 'productName', 'SAME_NAME_DIFFERENT_MODEL', '存在同名不同型号产品，请确认这是有意配置'));
      }

      const specificationDetails = [...values.entries()]
        .filter(([target, entry]) => target.startsWith('specification.') && entry.value)
        .map(([target, entry]) => parseSpecification(target.slice('specification.'.length), entry.value));
      const specifications: Record<string, string> = {};
      for (const specification of specificationDetails) {
        if (specification.parseStatus === 'raw' && /\d/.test(specification.rawValue)) {
          rowIssues.push(issue('warning', sheetName, sourceRow, '', `specification.${specification.normalizedName}`, 'SPECIFICATION_VALUE_UNNORMALIZED', `规格“${specification.rawName}”无法安全换算，已保留原值`));
        }
        if (specifications[specification.normalizedName] !== undefined) {
          rowIssues.push(issue('warning', sheetName, sourceRow, '', `specification.${specification.normalizedName}`, 'DUPLICATE_SPECIFICATION', '同一规格字段重复，已保留最后一个值'));
        }
        specifications[specification.normalizedName] = specification.normalizedValue;
      }

      const currentStatus = rowStatus(rowIssues);
      const recordCandidate: ProductRecord | null = currentStatus === 'failed' || !productId || !productName
        ? null
        : {
            schemaVersion: SCHEMA_VERSION,
            productId,
            productName,
            model,
            category,
            specifications,
            specificationDetails,
            applications: splitList(values.get('applications')?.value),
            keywords: splitList(values.get('keywords')?.value),
            synonyms: splitList(values.get('synonyms')?.value),
            description,
            status: status ?? 'active',
            version: 1,
            createdAt: now,
            updatedAt: now,
            source: {
              schemaVersion: SCHEMA_VERSION,
              type: 'excel',
              importId,
              fileName: sourceFile,
              sheet: sheetName,
            },
            sourceRow,
            normalizedName,
            normalizedModel,
          };

      if (recordCandidate) {
        const parsed = ProductRecordSchema.safeParse(recordCandidate);
        if (!parsed.success) {
          rowIssues.push(issue('error', sheetName, sourceRow, '', '', 'PRODUCT_SCHEMA_INVALID', parsed.error.issues[0]?.message ?? '产品数据结构无效'));
        } else {
          records.push(parsed.data);
          ids.set(productId, { sheet: sheetName, row: sourceRow });
          if (normalizedModel) models.set(normalizedModel, { name: normalizedName, sheet: sheetName, row: sourceRow });
          if (normalizedName) names.set(normalizedName, normalizedModel);
        }
      }

      const finalStatus = rowStatus(rowIssues);
      if (finalStatus === 'failed' && recordCandidate) {
        const index = records.findIndex((record) => record.productId === recordCandidate.productId && record.sourceRow === sourceRow);
        if (index >= 0) records.splice(index, 1);
      }
      rowResults.push({
        schemaVersion: SCHEMA_VERSION,
        sheet: sheetName,
        row: sourceRow,
        status: finalStatus,
        productId: finalStatus === 'failed' ? null : productId || null,
        productName,
        model,
        issues: rowIssues,
      });
    }
  }

  if (!rowResults.length && !globalErrors.length) {
    globalErrors.push(issue('error', '', 0, '', '', 'NO_PRODUCT_ROWS', '工作簿中没有可导入的产品行'));
  }

  const rowIssues = rowResults.flatMap((row) => row.issues);
  const errors = [...globalErrors, ...rowIssues.filter((entry) => entry.severity === 'error')];
  const warnings = [...globalWarnings, ...rowIssues.filter((entry) => entry.severity === 'warning')];
  const uniqueMappings = [...new Map(allMappings.map((mapping) => [`${mapping.sourceColumn}|${mapping.target}`, mapping])).values()];
  return {
    schemaVersion: SCHEMA_VERSION,
    importId,
    sourceFile,
    status: errors.length ? 'invalid' : 'ready',
    totalRows: rowResults.length,
    successRows: rowResults.filter((row) => row.status === 'success').length,
    warningRows: rowResults.filter((row) => row.status === 'warning').length,
    failedRows: rowResults.filter((row) => row.status === 'failed').length,
    errors,
    warnings,
    rows: rowResults,
    fieldMappings: uniqueMappings,
    previewRecords: records,
    createdAt: now,
    committedAt: null,
    catalogVersion: null,
  };
}

export const PRODUCT_CATALOG_FIELD_ALIASES = FIELD_ALIASES;
