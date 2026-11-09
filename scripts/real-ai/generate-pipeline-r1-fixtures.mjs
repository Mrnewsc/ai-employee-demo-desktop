import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';

const outputDirectory = path.resolve('src', 'real-ai', 'pipeline', 'fixtures');
await mkdir(outputDirectory, { recursive: true });

const rows = [
  ['产品名称', '型号', '数量', '工作宽度', '应用场景', '备注'],
  ['自动喷涂设备', 'SP-3000', '1套', '', '五金配件喷涂', '标准产品，验证精确匹配'],
  ['自动化生产线', 'AL-2600', '1套', '2000mm', '机械装配', '工作宽度与产品库存在硬冲突'],
  ['专用视觉检测台', 'ZX-9999', '1台', '', '外观检测', '企业产品库无对应产品'],
];

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '客户产品清单');
const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
await writeFile(path.join(outputDirectory, 'case-c-multi.xlsx'), output);

const sameProductWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(sameProductWorkbook, XLSX.utils.aoa_to_sheet([
  ['产品名称', '型号', '数量'],
  ['自动喷涂设备', 'SP-3000', '1套'],
]), '补充产品表');
const sameProductOutput = XLSX.write(sameProductWorkbook, { bookType: 'xlsx', type: 'buffer' });
await writeFile(path.join(outputDirectory, 'case-h-same-product.xlsx'), sameProductOutput);

const splitCases = [
  ['case-c-exact.xlsx', ['产品名称', '型号', '数量', '应用场景'], ['自动喷涂设备', 'SP-3000', '1套', '五金配件喷涂']],
  ['case-c-conflict.xlsx', ['产品名称', '型号', '数量', '工作宽度', '应用场景'], ['自动化生产线', 'AL-2600', '1套', '2000mm', '机械装配']],
  ['case-c-none.xlsx', ['产品名称', '型号', '数量', '应用场景'], ['专用视觉检测台', 'ZX-9999', '1台', '外观检测']],
];
for (const [fileName, header, row] of splitCases) {
  const splitWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(splitWorkbook, XLSX.utils.aoa_to_sheet([header, row]), '客户产品');
  const splitOutput = XLSX.write(splitWorkbook, { bookType: 'xlsx', type: 'buffer' });
  await writeFile(path.join(outputDirectory, fileName), splitOutput);
}
