import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';

const root = path.resolve('src', 'real-ai', 'extraction', 'fixtures', 'real-smoke');
await mkdir(root, { recursive: true });

await writeWorkbook('missing-fields.xlsx', '产品需求', [
  ['产品名称', '型号'],
  ['自动喷涂设备', 'SP-3000'],
]);

await writeWorkbook('conflict-a.xlsx', '需求A', [
  ['产品名称', '型号', '数量'],
  ['自动喷涂设备', 'SP-3000', '10套'],
]);

await writeWorkbook('conflict-b.xlsx', '需求B', [
  ['产品名称', '型号', '数量'],
  ['自动喷涂设备', 'SP-3200', '12套'],
]);

await writeWorkbook('merge-specs.xlsx', '补充参数', [
  ['产品名称', '型号', '规格'],
  ['自动喷涂设备', 'SP-3000', '18.5kW'],
]);

async function writeWorkbook(fileName, sheetName, rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName);
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  await writeFile(path.join(root, fileName), output);
}

