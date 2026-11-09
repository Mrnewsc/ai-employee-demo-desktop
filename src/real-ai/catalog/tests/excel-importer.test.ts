/// <reference types="node" />

import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { importProductCatalogExcel, importProductCatalogWorkbook } from '../excel-importer';

const fixtures = path.resolve('src', 'real-ai', 'catalog', 'fixtures');
const load = (name: string) => importProductCatalogExcel(path.join(fixtures, name), name, { namespace: 'catalog-test' });

test('标准模板导入24条产品并保留规格原始值', async () => {
  const report = await load('standard-product-catalog.xlsx');
  assert.equal(report.status, 'ready');
  assert.equal(report.totalRows, 24);
  assert.equal(report.previewRecords.length, 24);
  const product = report.previewRecords.find((entry) => entry.model === 'SP-3000');
  assert.equal(product?.specificationDetails.find((entry) => entry.normalizedName === '工作宽度')?.rawValue, '1200mm');
});

test('旧版XLS标准模板可以导入', async () => {
  const report = await load('standard-product-catalog.xls');
  assert.equal(report.status, 'ready');
  assert.equal(report.previewRecords.length, 24);
});

test('中文别名、英文列名和多Sheet可自动映射', async () => {
  const report = await load('alias-multisheet.xlsx');
  assert.equal(report.status, 'ready');
  assert.equal(report.previewRecords.length, 2);
  assert.ok(report.fieldMappings.some((mapping) => mapping.sourceColumn === '品名' && mapping.target === 'productName'));
  assert.ok(report.fieldMappings.some((mapping) => mapping.sourceColumn === 'product_name' && mapping.target === 'productName'));
  assert.ok(report.warnings.some((warning) => warning.code === 'HIDDEN_SHEET_SKIPPED'));
});

test('合并单元格和多行表头能够识别动态规格列', async () => {
  const report = await load('merged-multirow-header.xlsx');
  assert.equal(report.status, 'ready');
  assert.equal(report.previewRecords[0]?.specifications['工作宽度'], '1200mm');
  assert.equal(report.previewRecords[0]?.specifications['功率'], '15000W');
});

test('异常数据区分重复ID、型号冲突、缺名称、公式和缺型号', async () => {
  const report = await load('invalid-products.xlsx');
  const codes = new Set([...report.errors, ...report.warnings].map((entry) => entry.code));
  assert.equal(report.status, 'invalid');
  assert.equal(report.failedRows, 4);
  for (const code of ['DUPLICATE_PRODUCT_ID', 'DUPLICATE_MODEL', 'MODEL_PRODUCT_CONFLICT', 'SAME_NAME_DIFFERENT_MODEL', 'PRODUCT_NAME_REQUIRED', 'FORMULA_VALUE_IGNORED', 'MODEL_MISSING', 'SPECIFICATION_VALUE_UNNORMALIZED']) {
    assert.ok(codes.has(code), `missing ${code}`);
  }
});

test('无Sheet工作簿和超长字段返回明确错误码', () => {
  const noSheet = importProductCatalogWorkbook({ SheetNames: [], Sheets: {} }, 'no-sheet.xlsx', { namespace: 'catalog-test' });
  assert.ok(noSheet.errors.some((entry) => entry.code === 'WORKBOOK_HAS_NO_SHEETS'));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['产品名称', '型号', '产品说明'],
    ['超'.repeat(201), 'LONG-001', '说明'.repeat(2600)],
  ]), '超长字段');
  const report = importProductCatalogWorkbook(workbook, 'long.xlsx', { namespace: 'catalog-test' });
  const codes = report.errors.map((entry) => entry.code);
  assert.ok(codes.includes('PRODUCT_NAME_TOO_LONG'));
  assert.ok(codes.includes('DESCRIPTION_TOO_LONG'));
});

test('非标准列可以通过显式字段映射导入', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['字段A', '字段B'],
    ['映射产品', 'MAP-100'],
  ]), '自定义');
  const report = importProductCatalogWorkbook(workbook, 'mapped.xlsx', {
    namespace: 'catalog-test',
    fieldMapping: { 字段A: 'productName', 字段B: 'model' },
  });
  assert.equal(report.status, 'ready');
  assert.equal(report.previewRecords[0]?.normalizedModel, 'MAP100');
});

test('空Excel返回逐项报告而不是覆盖产品库', async () => {
  const report = await load('empty-catalog.xlsx');
  assert.equal(report.status, 'invalid');
  assert.equal(report.totalRows, 0);
  assert.ok(report.errors.some((entry) => entry.code === 'NO_PRODUCT_ROWS'));
});
