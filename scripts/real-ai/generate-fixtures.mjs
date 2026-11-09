import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import PDFDocument from 'pdfkit';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import * as XLSX from 'xlsx';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..', '..');
const fixtureRoot = path.join(rootDir, 'src', 'real-ai', 'fixtures');
const fontPath = 'C:\\Windows\\Fonts\\simhei.ttf';
GlobalFonts.registerFromPath(fontPath, 'Fixture Chinese');

async function ensureSample(category, name) {
  const dir = path.join(fixtureRoot, category, name);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writeExpected(dir, input, expected) {
  await writeFile(
    path.join(dir, 'expected.json'),
    `${JSON.stringify({ schemaVersion: '1.0', input, expected }, null, 2)}\n`,
    'utf8',
  );
}

function canvasImage({ width = 1600, height = 900, background = '#ffffff', lines, lowQuality = false }) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.fillStyle = lowQuality ? '#969696' : '#111827';
  context.font = `${lowQuality ? 30 : 46}px "Microsoft YaHei"`;
  context.textBaseline = 'top';
  const startY = lowQuality ? 44 : 70;
  const gap = lowQuality ? 48 : 78;
  lines.forEach((line, index) => context.fillText(line, 70, startY + index * gap));
  return canvas;
}

async function generateImages() {
  const productCanvas = canvasImage({
    lines: [
      '客户产品清单（脱敏测试）',
      '产品名称：自动喷涂设备',
      '型号：SP-3000',
      '数量：1套',
      '材质：不锈钢',
      '产能：3000件/天',
    ],
  });
  const productDir = await ensureSample('images', 'product-list');
  const productBuffer = productCanvas.toBuffer('image/png');
  await writeFile(path.join(productDir, 'input.png'), productBuffer);
  await writeExpected(productDir, 'input.png', {
    fileType: 'image',
    includesAny: ['SP-3000', 'SP—3000', '3000'],
    minBlocks: 1,
    minTables: 0,
    minImages: 1,
  });

  const nameplateCanvas = canvasImage({
    background: '#e9edf2',
    lines: [
      'SHUYUAN INDUSTRIAL',
      'AUTOMATIC SPRAY SYSTEM',
      'MODEL: SP-3000',
      'POWER: 18.5 kW',
      'VOLTAGE: 380 V',
      'SERIAL: SOI5-2026-001',
    ],
  });
  const nameplateDir = await ensureSample('images', 'nameplate');
  await writeFile(path.join(nameplateDir, 'input.jpg'), nameplateCanvas.toBuffer('image/jpeg', 92));
  await writeExpected(nameplateDir, 'input.jpg', {
    fileType: 'image',
    includesAny: ['SP-3000', 'SP—3000'],
    minBlocks: 1,
    minTables: 0,
    minImages: 1,
  });

  const packageCanvas = canvasImage({
    lines: [
      '包装标签 / PACKAGE LABEL',
      '产品：输送模块 Conveyor Module',
      '型号 MODEL: CV-1200',
      '数量 QTY: 2 SETS',
      '批次 BATCH: 2026-A15',
    ],
  });
  const packageDir = await ensureSample('images', 'package-label');
  await writeFile(path.join(packageDir, 'input.jpeg'), packageCanvas.toBuffer('image/jpeg', 90));
  await writeExpected(packageDir, 'input.jpeg', {
    fileType: 'image',
    includesAny: ['CV-1200', 'CV—1200'],
    minBlocks: 1,
    minTables: 0,
    minImages: 1,
  });

  const lowQualityCanvas = canvasImage({
    width: 700,
    height: 360,
    background: '#d8d8d8',
    lowQuality: true,
    lines: ['低质量铭牌', 'M0DEL: SOI5-1I0O', 'P0WER: 5.5KW', '需要人工核验'],
  });
  const lowQualityDir = await ensureSample('images', 'low-quality');
  await writeFile(path.join(lowQualityDir, 'input.jpg'), lowQualityCanvas.toBuffer('image/jpeg', 38));
  await writeExpected(lowQualityDir, 'input.jpg', {
    fileType: 'image',
    includesAny: ['M0DEL', 'SOI5', '5.5'],
    minBlocks: 1,
    minTables: 0,
    minImages: 1,
    warningAny: ['ocr_low_confidence', 'ocr_character_ambiguity'],
  });

  return { productBuffer };
}

function pdfBuffer(builder, options = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, ...options });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    builder(doc);
    doc.end();
  });
}

function configurePdfPage(doc, title) {
  doc.addPage({ size: 'A4', margin: 56 });
  doc.font(fontPath).fontSize(20).fillColor('#111827').text(title);
  doc.moveDown(0.8).fontSize(12);
}

async function generatePdfs(productBuffer) {
  const nativeDir = await ensureSample('pdf', 'native-text');
  await writeFile(
    path.join(nativeDir, 'input.pdf'),
    await pdfBuffer((doc) => {
      configurePdfPage(doc, '客户需求说明（脱敏测试）');
      doc.text('产品名称：自动喷涂设备');
      doc.text('型号：SP-3000');
      doc.text('数量：1套');
      doc.text('Application: metal parts coating');
      doc.text('备注：需要接入现有生产线。');
    }),
  );
  await writeExpected(nativeDir, 'input.pdf', {
    fileType: 'pdf',
    includes: ['自动喷涂设备', 'SP-3000'],
    minBlocks: 3,
    minTables: 0,
    minImages: 0,
    pageCount: 1,
    pageMode: 'native',
  });

  const tableDir = await ensureSample('pdf', 'simple-table');
  await writeFile(
    path.join(tableDir, 'input.pdf'),
    await pdfBuffer((doc) => {
      configurePdfPage(doc, '产品参数表（简单坐标表格）');
      const x = [60, 210, 350, 465];
      const rows = [
        ['产品名称', '型号', '规格', '数量'],
        ['喷涂主机', 'SP-3000', '18.5kW', '1套'],
        ['输送模块', 'CV-1200', '1200mm', '2套'],
        ['控制系统', 'CTRL-A1', 'PLC', '1套'],
      ];
      rows.forEach((row, rowIndex) => {
        const y = 145 + rowIndex * 36;
        row.forEach((value, column) => doc.text(value, x[column], y, { width: 130, lineBreak: false }));
      });
    }),
  );
  await writeExpected(tableDir, 'input.pdf', {
    fileType: 'pdf',
    includes: ['SP-3000', 'CV-1200'],
    minBlocks: 4,
    minTables: 1,
    minImages: 0,
    pageCount: 1,
    warningAny: ['table_structure_low_confidence'],
  });

  const scannedDir = await ensureSample('pdf', 'scanned');
  await writeFile(
    path.join(scannedDir, 'input.pdf'),
    await pdfBuffer((doc) => {
      doc.addPage({ size: 'A4', margin: 32 });
      doc.image(productBuffer, 32, 80, { fit: [530, 720], align: 'center', valign: 'center' });
    }),
  );
  await writeExpected(scannedDir, 'input.pdf', {
    fileType: 'pdf',
    includesAny: ['SP-3000', 'SP—3000', '3000'],
    minBlocks: 1,
    minTables: 0,
    minImages: 1,
    pageCount: 1,
    pageMode: 'scanned',
  });

  const multipageDir = await ensureSample('pdf', 'multipage-mixed');
  await writeFile(
    path.join(multipageDir, 'input.pdf'),
    await pdfBuffer((doc) => {
      configurePdfPage(doc, '第一页：中文产品说明');
      doc.text('自动化生产线基础方案');
      doc.text('型号：LINE-A200');
      doc.text('产能：每小时200件');
      configurePdfPage(doc, 'Page 2: Bilingual Specifications');
      doc.text('Product: Conveyor Module / 输送模块');
      doc.text('Model: CV-1200');
      doc.text('Material: Stainless Steel / 不锈钢');
    }),
  );
  await writeExpected(multipageDir, 'input.pdf', {
    fileType: 'pdf',
    includes: ['LINE-A200', 'CV-1200'],
    minBlocks: 6,
    minTables: 0,
    minImages: 0,
    pageCount: 2,
    pageMode: 'native',
  });

  const passwordDir = await ensureSample('errors', 'password-pdf');
  await writeFile(
    path.join(passwordDir, 'input.pdf'),
    await pdfBuffer(
      (doc) => {
        configurePdfPage(doc, '密码保护PDF');
        doc.text('该文件仅用于密码错误验证。');
      },
      { userPassword: 'demo123', ownerPassword: 'owner456' },
    ),
  );
  await writeExpected(passwordDir, 'input.pdf', { errorCode: 'PDF_PASSWORD_REQUIRED' });
}

function docxTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (row) =>
        new TableRow({
          children: row.map(
            (value) =>
              new TableCell({
                children: [new Paragraph({ children: [new TextRun(String(value))] })],
              }),
          ),
        }),
    ),
  });
}

async function writeDocx(dir, document, expected) {
  await writeFile(path.join(dir, 'input.docx'), await Packer.toBuffer(document));
  await writeExpected(dir, 'input.docx', expected);
}

async function generateDocx(productBuffer) {
  const structuredDir = await ensureSample('docx', 'structured-content');
  await writeDocx(
    structuredDir,
    new Document({
      sections: [{
        children: [
          new Paragraph({ text: '客户采购需求', heading: HeadingLevel.TITLE }),
          new Paragraph('客户需要自动喷涂设备，目标型号SP-3000。'),
          new Paragraph({ text: '要求日产约3000件。', bullet: { level: 0 } }),
          new Paragraph({ text: '需要接入现有生产线。', bullet: { level: 0 } }),
          docxTable([
            ['产品名称', '型号', '数量', '材质'],
            ['自动喷涂设备', 'SP-3000', '1套', '不锈钢'],
            ['输送模块', 'CV-1200', '2套', '碳钢'],
          ]),
        ],
      }],
    }),
    {
      fileType: 'docx',
      includes: ['自动喷涂设备', 'SP-3000'],
      minBlocks: 4,
      minTables: 1,
      minImages: 0,
    },
  );

  const imageDir = await ensureSample('docx', 'embedded-image');
  await writeDocx(
    imageDir,
    new Document({
      sections: [{
        children: [
          new Paragraph({ text: '产品图片附件', heading: HeadingLevel.HEADING_1 }),
          new Paragraph('下图为脱敏产品清单截图：'),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: productBuffer,
                transformation: { width: 640, height: 360 },
                type: 'png',
              }),
            ],
          }),
        ],
      }],
    }),
    {
      fileType: 'docx',
      includes: ['产品图片附件'],
      minBlocks: 2,
      minTables: 0,
      minImages: 1,
    },
  );

  const mixedDir = await ensureSample('docx', 'mixed-language');
  await writeDocx(
    mixedDir,
    new Document({
      sections: [{
        children: [
          new Paragraph({ text: '中英文混合技术说明 / Technical Notes', heading: HeadingLevel.HEADING_1 }),
          new Paragraph('Product: Automatic Coating Line / 自动喷涂生产线'),
          new Paragraph('Model: LINE-A200；Application: Metal Parts / 金属配件'),
          docxTable([
            ['Specification / 规格', 'Value / 参数'],
            ['Line speed / 线速', '12 m/min'],
            ['Power / 功率', '32 kW'],
          ]),
        ],
      }],
    }),
    {
      fileType: 'docx',
      includes: ['LINE-A200', '金属配件'],
      minBlocks: 3,
      minTables: 1,
      minImages: 0,
    },
  );
}

async function writeWorkbookSample(categoryName, workbook, fileName, expected, bookType = 'xlsx') {
  const dir = await ensureSample('excel', categoryName);
  const output = XLSX.write(workbook, { bookType, type: 'buffer' });
  await writeFile(path.join(dir, fileName), output);
  await writeExpected(dir, fileName, expected);
}

async function generateExcel() {
  const normalBook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    normalBook,
    XLSX.utils.aoa_to_sheet([
      ['产品名称', '型号', '规格', '数量', '材质', '备注'],
      ['自动喷涂设备', 'SP-3000', '18.5kW', 1, '不锈钢', '接现有产线'],
      ['输送模块', 'CV-1200', '1200mm', 2, '碳钢', '待确认长度'],
    ]),
    '产品清单',
  );
  await writeWorkbookSample('normal-products', normalBook, 'input.xlsx', {
    fileType: 'xlsx',
    includes: ['SP-3000', 'CV-1200'],
    minBlocks: 0,
    minTables: 1,
    minImages: 0,
    sheetNames: ['产品清单'],
  });

  const multiBook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    multiBook,
    XLSX.utils.aoa_to_sheet([
      ['产品名称', '型号', '数量'],
      ['自动化生产线', 'LINE-A200', 1],
    ]),
    '设备需求',
  );
  XLSX.utils.book_append_sheet(
    multiBook,
    XLSX.utils.aoa_to_sheet([
      ['参数', '值'],
      ['工件', '五金配件'],
      ['日产量', '3000件'],
    ]),
    '工艺参数',
  );
  XLSX.utils.book_append_sheet(
    multiBook,
    XLSX.utils.aoa_to_sheet([['备注'], ['需要现场技术确认']]),
    '客户备注',
  );
  await writeWorkbookSample('multi-sheet', multiBook, 'input.xlsx', {
    fileType: 'xlsx',
    includes: ['LINE-A200', '五金配件'],
    minBlocks: 0,
    minTables: 3,
    minImages: 0,
    sheetNames: ['设备需求', '工艺参数', '客户备注'],
  });

  const mergedBook = XLSX.utils.book_new();
  const mergedSheet = XLSX.utils.aoa_to_sheet([
    ['产品信息', null, '技术参数', null, '采购信息', null],
    ['产品名称', '型号', '规格', '材质', '数量', '备注'],
    ['喷涂主机', 'SP-3000', '18.5kW', '不锈钢', 1, '标准配置'],
    ['输送模块', 'CV-1200', '1200mm', '碳钢', 2, '长度待确认'],
  ]);
  mergedSheet['!merges'] = [
    XLSX.utils.decode_range('A1:B1'),
    XLSX.utils.decode_range('C1:D1'),
    XLSX.utils.decode_range('E1:F1'),
  ];
  XLSX.utils.book_append_sheet(mergedBook, mergedSheet, '双行表头');
  await writeWorkbookSample('merged-headers', mergedBook, 'input.xlsx', {
    fileType: 'xlsx',
    includes: ['SP-3000', 'CV-1200'],
    minBlocks: 0,
    minTables: 1,
    minImages: 0,
    sheetNames: ['双行表头'],
    minHeaderRows: 2,
  });

  const legacyBook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    legacyBook,
    XLSX.utils.aoa_to_sheet([
      ['产品名称', '型号', '数量', '备注'],
      ['基础控制系统', 'CTRL-A1', 1, 'PLC控制'],
    ]),
    'Legacy',
  );
  await writeWorkbookSample(
    'legacy-products',
    legacyBook,
    'input.xls',
    {
      fileType: 'xls',
      includes: ['CTRL-A1'],
      minBlocks: 0,
      minTables: 1,
      minImages: 0,
      sheetNames: ['Legacy'],
    },
    'biff8',
  );
}

async function generateErrorFixtures(productBuffer) {
  const emptyDir = await ensureSample('errors', 'empty-file');
  await writeFile(path.join(emptyDir, 'input.pdf'), Buffer.alloc(0));
  await writeExpected(emptyDir, 'input.pdf', { errorCode: 'FILE_EMPTY' });

  const brokenPdfDir = await ensureSample('errors', 'corrupted-pdf');
  await writeFile(path.join(brokenPdfDir, 'input.pdf'), Buffer.from('%PDF-1.7\nbroken-object\n%%EOF'));
  await writeExpected(brokenPdfDir, 'input.pdf', { errorCode: 'FILE_CORRUPTED' });

  const brokenDocxDir = await ensureSample('errors', 'corrupted-docx');
  await writeFile(path.join(brokenDocxDir, 'input.docx'), Buffer.from('PK\x03\x04broken-docx'));
  await writeExpected(brokenDocxDir, 'input.docx', { errorCode: 'FILE_CORRUPTED' });

  const brokenExcelDir = await ensureSample('errors', 'corrupted-excel');
  await writeFile(path.join(brokenExcelDir, 'input.xlsx'), Buffer.from('PK\x03\x04broken-xlsx'));
  await writeExpected(brokenExcelDir, 'input.xlsx', { errorCode: 'FILE_CORRUPTED' });

  const mismatchDir = await ensureSample('errors', 'type-mismatch');
  await writeFile(path.join(mismatchDir, 'input.pdf'), productBuffer);
  await writeExpected(mismatchDir, 'input.pdf', { errorCode: 'FILE_TYPE_MISMATCH' });

  const unsupportedDir = await ensureSample('errors', 'unsupported-doc');
  await writeFile(path.join(unsupportedDir, 'input.doc'), Buffer.from('legacy doc placeholder'));
  await writeExpected(unsupportedDir, 'input.doc', { errorCode: 'UNSUPPORTED_FILE_TYPE' });
}

async function main() {
  await mkdir(fixtureRoot, { recursive: true });
  const { productBuffer } = await generateImages();
  await generatePdfs(productBuffer);
  await generateDocx(productBuffer);
  await generateExcel();
  await generateErrorFixtures(productBuffer);
  console.log(`Generated fixtures in ${fixtureRoot}`);
}

await main();
