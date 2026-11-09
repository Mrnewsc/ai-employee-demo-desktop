/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { createExtractionChunks } from '../chunker';
import { GOLDEN_CASES } from '../fixtures/golden-cases';

test('PDF按页分块并保留页码', () => {
  const source = GOLDEN_CASES[0].documents[0];
  const document = {
    ...source,
    blocks: [
      { ...source.blocks[0], id: 'p1', source: { schemaVersion: '1.0' as const, kind: 'pdf' as const, page: 1 } },
      { ...source.blocks[0], id: 'p2', source: { schemaVersion: '1.0' as const, kind: 'pdf' as const, page: 2 } },
    ],
  };
  const chunks = createExtractionChunks(document, 'job-pages');
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].sourceLocations[0].kind, 'pdf');
  assert.equal(chunks[1].sourceLocations[0].kind, 'pdf');
});

test('Excel按表头加产品行分块且单元格可追溯', () => {
  const document = GOLDEN_CASES.find((item) => item.id === 'excel-product-list')!.documents[0];
  const chunks = createExtractionChunks(document, 'job-sheet', {}, { maxTableRows: 2 });
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].tables[0].headerRowCount, 1);
  assert.ok(chunks.every((chunk) => chunk.evidenceItems.some((item) => item.source.kind === 'sheet')));
});

test('超过最大Chunk数时明确失败，避免失控请求', () => {
  const document = GOLDEN_CASES[0].documents[0];
  const manyPages = {
    ...document,
    blocks: Array.from({ length: 4 }, (_, index) => ({
      ...document.blocks[0],
      id: `page-${index + 1}`,
      source: { schemaVersion: '1.0' as const, kind: 'pdf' as const, page: index + 1 },
    })),
  };
  assert.throws(
    () => createExtractionChunks(manyPages, 'job-limit', {}, { maxChunksPerDocument: 3 }),
    (error: unknown) => (error as { code?: string }).code === 'AI_EXTRACTION_FAILED',
  );
});

test('相同OCR信息同时存在于逐行blocks和整图ocrText时只发送一次', () => {
  const source = { schemaVersion: '1.0' as const, kind: 'image' as const, imageId: 'ocr-image' };
  const document = {
    ...GOLDEN_CASES[0].documents[0],
    fileName: 'ocr-duplicate.png',
    fileType: 'image' as const,
    rawText: '产品名称 自动喷涂设备 型号 9P-3000 数量 1套',
    blocks: [
      { schemaVersion: '1.0' as const, id: 'line-1', type: 'ocr-line' as const, text: '产品名称：自动喷涂设备', confidence: 0.7, source: { ...source, bbox: [0, 0, 200, 30] as [number, number, number, number] } },
      { schemaVersion: '1.0' as const, id: 'line-2', type: 'ocr-line' as const, text: '型号：9P-3000', confidence: 0.6, source: { ...source, bbox: [0, 40, 200, 70] as [number, number, number, number] } },
      { schemaVersion: '1.0' as const, id: 'line-3', type: 'ocr-line' as const, text: '数量：1套', confidence: 0.8, source: { ...source, bbox: [0, 80, 200, 110] as [number, number, number, number] } },
    ],
    images: [{
      schemaVersion: '1.0' as const,
      id: 'ocr-image',
      mimeType: 'image/png',
      role: 'source-image' as const,
      source,
      ocrText: '产品 名称 自动 喷涂 设备 型号 9P-300O 数量 1 套',
      ocrConfidence: 0.65,
    }],
    tables: [],
  };
  const chunks = createExtractionChunks(document, 'job-ocr-dedup');
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].evidenceItems.length, 3);
  assert.ok(chunks[0].evidenceItems.every((item) => item.source.kind === 'image' && item.source.bbox));
  assert.equal(chunks[0].evidenceItems.some((item) => item.evidenceId.includes(':image:')), false);
});

test('整图OCR包含逐行blocks之外的新信息时仍保留补充Chunk', () => {
  const source = { schemaVersion: '1.0' as const, kind: 'image' as const, imageId: 'partial-image' };
  const document = {
    ...GOLDEN_CASES[0].documents[0],
    fileName: 'ocr-partial.png',
    fileType: 'image' as const,
    blocks: [{ schemaVersion: '1.0' as const, id: 'line-1', type: 'ocr-line' as const, text: '型号：SP-3000', confidence: 0.8, source }],
    images: [{
      schemaVersion: '1.0' as const,
      id: 'partial-image',
      mimeType: 'image/png',
      role: 'source-image' as const,
      source,
      ocrText: '这是一段完全不同且包含大量新增产品说明、数量、材质与应用场景的OCR内容',
      ocrConfidence: 0.8,
    }],
    tables: [],
  };
  assert.equal(createExtractionChunks(document, 'job-ocr-partial').length, 2);
});
