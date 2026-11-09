import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';

const fixtureDirectory = path.resolve('src', 'real-ai', 'catalog', 'fixtures');
const templateDirectory = path.resolve('assets', 'templates');
await Promise.all([mkdir(fixtureDirectory, { recursive: true }), mkdir(templateDirectory, { recursive: true })]);

const products = JSON.parse(await readFile(path.join(fixtureDirectory, 'sample-products.json'), 'utf8'));
const headers = [
  '产品ID', '产品名称', '型号', '分类', '应用场景', '关键词', '同义词', '产品说明', '状态',
  '规格.工作宽度', '规格.功率', '规格.产能', '规格.尺寸', '规格.材质', '规格.重量', '规格.容量',
];

function writeWorkbook(workbook, target, bookType = 'xlsx') {
  const buffer = XLSX.write(workbook, { type: 'buffer', compression: true, bookType });
  return writeFile(target, buffer);
}

function standardWorkbook(rows) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  sheet['!cols'] = headers.map((header) => ({ wch: header.startsWith('规格.') ? 16 : Math.max(12, header.length * 2) }));
  XLSX.utils.book_append_sheet(workbook, sheet, '产品库');
  const instructions = XLSX.utils.aoa_to_sheet([
    ['填写说明'],
    ['产品名称为必填；型号建议填写；列表字段使用逗号、分号或顿号分隔。'],
    ['规格列使用“规格.字段名”，例如“规格.工作宽度”。不要填写公式。'],
    ['本模板不包含报价、库存、客户或销售状态。'],
  ]);
  XLSX.utils.book_append_sheet(workbook, instructions, '填写说明');
  workbook.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] };
  return workbook;
}

await writeWorkbook(standardWorkbook(products), path.join(fixtureDirectory, 'standard-product-catalog.xlsx'));
await writeWorkbook(standardWorkbook(products), path.join(fixtureDirectory, 'standard-product-catalog.xls'), 'xls');
const version2Products = products.map((product, index) => index === 0
  ? { ...product, 产品说明: `${product.产品说明}（V2内部测试变更）` }
  : product);
await writeWorkbook(standardWorkbook(version2Products), path.join(fixtureDirectory, 'standard-product-catalog-v2.xlsx'));

const template = standardWorkbook([{
  产品ID: 'EXAMPLE-SP-1000',
  产品名称: '示例产品（导入前请删除）',
  型号: 'SP-1000',
  分类: '示例分类',
  应用场景: '示例场景',
  关键词: '关键词1；关键词2',
  同义词: '别名1；别名2',
  产品说明: '请填写纯文本产品说明',
  状态: '启用',
  '规格.工作宽度': '1200mm',
  '规格.功率': '15kW',
}]);
await writeWorkbook(template, path.join(templateDirectory, '企业产品库标准导入模板.xlsx'));

const aliasWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(aliasWorkbook, XLSX.utils.aoa_to_sheet([
  ['品名', '规格型号', '类别', '应用', '关键字', '别名', '描述', '产品状态', '规格.工作宽度', '规格.功率'],
  ['自动喷涂设备标准方案', 'SP 3000', '自动喷涂设备', '五金配件', '喷涂；自动化', '自动喷漆设备', '中文别名字段样本', '有效', '120cm', '15 kW'],
]), '中文别名');
XLSX.utils.book_append_sheet(aliasWorkbook, XLSX.utils.aoa_to_sheet([
  ['product_id', 'product_name', 'model_number', 'category', 'applications', 'keywords', 'synonyms', 'description', 'status', 'spec.power'],
  ['EN-AL-2600', '自动化生产线基础方案', 'AL-2600', '自动化生产线', '机械装配', 'automation,line', '自动产线', 'English header fixture', 'active', '22kW'],
]), 'English');
XLSX.utils.book_append_sheet(aliasWorkbook, XLSX.utils.aoa_to_sheet([['隐藏产品'], ['不应导入']]), '隐藏资料');
aliasWorkbook.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 0 }, { Hidden: 1 }] };
await writeWorkbook(aliasWorkbook, path.join(fixtureDirectory, 'alias-multisheet.xlsx'));

const multiHeaderWorkbook = XLSX.utils.book_new();
const multiHeaderSheet = XLSX.utils.aoa_to_sheet([
  ['产品信息', '产品信息', '产品信息', '规格', '规格', '规格'],
  ['产品ID', '产品名称', '型号', '工作宽度', '功率', '材质'],
  ['MERGED-SP-3000', '自动喷涂设备标准方案', 'SP-3000-M', '1200mm', '15kW', '碳钢'],
]);
multiHeaderSheet['!merges'] = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
  { s: { r: 0, c: 3 }, e: { r: 0, c: 5 } },
];
XLSX.utils.book_append_sheet(multiHeaderWorkbook, multiHeaderSheet, '合并表头');
await writeWorkbook(multiHeaderWorkbook, path.join(fixtureDirectory, 'merged-multirow-header.xlsx'));

const invalidWorkbook = XLSX.utils.book_new();
const invalidSheet = XLSX.utils.aoa_to_sheet([
  ['产品ID', '产品名称', '型号', '分类', '产品说明', '状态', '规格.功率'],
  ['DUP-001', '自动喷涂设备标准方案', 'SP-3000', '喷涂设备', '正常行', '启用', '15kW'],
  ['DUP-001', '另一产品', 'OTHER-100', '喷涂设备', '重复ID', '启用', '10kW'],
  ['DUP-003', '型号冲突产品', 'SP 3000', '喷涂设备', '重复标准化型号', '未知状态', '约15千瓦'],
  ['NO-NAME', '', 'EMPTY-100', '喷涂设备', '缺少产品名称', '启用', '5kW'],
  ['', '无型号产品', '', '', '允许导入但应警告', '启用', ''],
  ['DUP-006', '自动喷涂设备标准方案', 'SP-3000', '喷涂设备', '同型号重复', '启用', '15kW'],
  ['DUP-007', '自动喷涂设备标准方案', 'SP-4000', '喷涂设备', '同名不同型号', '启用', '18kW'],
]);
invalidSheet.G2 = { t: 'n', v: 15, f: '1+14' };
XLSX.utils.book_append_sheet(invalidWorkbook, invalidSheet, '异常数据');
await writeWorkbook(invalidWorkbook, path.join(fixtureDirectory, 'invalid-products.xlsx'));

const emptyWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(emptyWorkbook, XLSX.utils.aoa_to_sheet([]), '空Sheet');
await writeWorkbook(emptyWorkbook, path.join(fixtureDirectory, 'empty-catalog.xlsx'));

await writeFile(path.join(fixtureDirectory, 'README.md'), `# 产品库黄金样本\n\n- standard-product-catalog.xlsx / .xls：24条脱敏工业产品。\n- standard-product-catalog-v2.xlsx：用于版本与回滚验证。\n- alias-multisheet.xlsx：中文别名、英文列名、多Sheet、隐藏Sheet。\n- merged-multirow-header.xlsx：合并单元格和两行表头。\n- invalid-products.xlsx：重复ID、重复标准化型号、同名不同型号、缺名称、缺型号、公式和非标准单位。\n- empty-catalog.xlsx：空Excel。\n`, 'utf8');
