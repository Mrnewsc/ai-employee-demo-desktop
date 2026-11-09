/// <reference types="node" />

import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import type {
  ParseWarning,
  ParsedCell,
  ParsedDocument,
  ParsedTable,
  SheetSourceLocation,
} from '../types';
import { SCHEMA_VERSION } from '../types';
import type { FileParser, InspectedFile } from './parser-types';
import { createParsedCell, normalizeWhitespace } from './utils';

const HEADER_TERMS = [
  '产品',
  '名称',
  '品名',
  '型号',
  '规格',
  '数量',
  '材质',
  '材料',
  '备注',
  'product',
  'model',
  'specification',
  'quantity',
];

function sheetLocation(
  sheet: string,
  values: Omit<SheetSourceLocation, 'schemaVersion' | 'kind' | 'sheet'> = {},
): SheetSourceLocation {
  return { schemaVersion: SCHEMA_VERSION, kind: 'sheet', sheet, ...values };
}

function safeCellValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function headerScore(row: ParsedCell[]): number {
  return row.reduce((score, cell) => {
    const value = cell.displayValue.toLowerCase();
    return score + HEADER_TERMS.filter((term) => value.includes(term)).length;
  }, 0);
}

function detectHeaderRows(rows: ParsedCell[][]): number {
  const firstTen = rows.slice(0, 10);
  const firstHeaderIndex = firstTen.findIndex((row) => headerScore(row) >= 2);
  if (firstHeaderIndex < 0) return 0;
  const nextScore = headerScore(firstTen[firstHeaderIndex + 1] ?? []);
  return nextScore >= 2 ? firstHeaderIndex + 2 : firstHeaderIndex + 1;
}

function parseWorksheet(
  sheetName: string,
  worksheet: XLSX.WorkSheet,
  warnings: ParseWarning[],
): ParsedTable {
  const reference = worksheet['!ref'] ?? 'A1:A1';
  const range = XLSX.utils.decode_range(reference);
  const rows: ParsedCell[][] = [];

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const parsedRow: ParsedCell[] = [];
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = worksheet[address];
      const value = safeCellValue(cell?.v);
      const source = sheetLocation(sheetName, {
        cell: address,
        row: row + 1,
        column: column + 1,
      });
      parsedRow.push(createParsedCell(value, source, cell?.f));
      if (cell?.f && value === null) {
        warnings.push({
          schemaVersion: SCHEMA_VERSION,
          code: 'formula_without_cached_value',
          severity: 'warning',
          message: `${sheetName}!${address}包含公式但没有缓存结果`,
          source,
        });
      }
    }
    rows.push(parsedRow);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    id: `sheet-${sheetName}`,
    title: sheetName,
    rows,
    source: sheetLocation(sheetName, { range: reference }),
    confidence: 1,
    headerRowCount: detectHeaderRows(rows),
  };
}

export const excelParser: FileParser = {
  fileTypes: ['xlsx', 'xls'],

  async parse(file: InspectedFile, options): Promise<ParsedDocument> {
    const startedAt = performance.now();
    options.onProgress({ stage: 'read', progress: 0.05, message: '读取Excel工作簿' });
    const buffer = await readFile(file.filePath);
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellFormula: true,
      cellText: true,
      cellDates: false,
      bookVBA: false,
      dense: false,
    });

    const warnings: ParseWarning[] = [];
    const tables = workbook.SheetNames.map((sheetName, index) => {
      options.onProgress({
        stage: 'parse',
        progress: (index + 1) / Math.max(1, workbook.SheetNames.length),
        message: `解析工作表：${sheetName}`,
      });
      return parseWorksheet(sheetName, workbook.Sheets[sheetName], warnings);
    });

    options.onProgress({ stage: 'complete', progress: 1, message: 'Excel解析完成' });
    return {
      schemaVersion: SCHEMA_VERSION,
      fileId: file.sha256.slice(0, 16),
      fileName: file.fileName,
      fileType: file.fileType,
      mimeType: file.mimeType,
      size: file.size,
      sha256: file.sha256,
      rawText: normalizeWhitespace(
        tables
          .map((table) => [
            `[${table.title}]`,
            ...table.rows.map((row) => row.map((cell) => cell.displayValue).join('\t')),
          ].join('\n'))
          .join('\n\n'),
      ),
      blocks: [],
      tables,
      images: [],
      metadata: {
        schemaVersion: SCHEMA_VERSION,
        parser: 'sheetjs',
        parseDurationMs: Math.round(performance.now() - startedAt),
        peakRssBytes: process.memoryUsage().rss,
        sheetCount: workbook.SheetNames.length,
        sheetNames: workbook.SheetNames,
        mergedRanges: Object.fromEntries(
          workbook.SheetNames.map((sheetName) => [
            sheetName,
            (workbook.Sheets[sheetName]['!merges'] ?? []).map(XLSX.utils.encode_range),
          ]),
        ),
      },
      warnings,
    };
  },
};
