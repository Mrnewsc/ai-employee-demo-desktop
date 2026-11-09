/// <reference types="node" />

import { readFile } from 'node:fs/promises';
import { createCanvas } from '@napi-rs/canvas';
import {
  getDocument,
  InvalidPDFException,
  OPS,
  PasswordException,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {
  DocumentBlock,
  ParseWarning,
  ParsedCell,
  ParsedDocument,
  ParsedImage,
  ParsedTable,
  PdfSourceLocation,
} from '../types';
import { SCHEMA_VERSION } from '../types';
import { FileParseError } from './errors';
import { recognizeImage } from './image-parser';
import type { FileParser, InspectedFile } from './parser-types';
import { createParsedCell, normalizeWhitespace } from './utils';

interface TextItemLite {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextLine {
  y: number;
  items: TextItemLite[];
}

function pdfLocation(
  page: number,
  bbox?: [number, number, number, number],
): PdfSourceLocation {
  return { schemaVersion: SCHEMA_VERSION, kind: 'pdf', page, bbox };
}

function groupTextLines(items: TextItemLite[]): TextLine[] {
  const lines: TextLine[] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 3);
    if (line) {
      line.items.push(item);
      line.items.sort((a, b) => a.x - b.x);
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }
  return lines.sort((a, b) => b.y - a.y);
}

function lineText(line: TextLine): string {
  let result = '';
  let previousRight = 0;
  for (const item of line.items) {
    const gap = item.x - previousRight;
    if (result && gap > Math.max(3, item.height * 0.35)) result += ' ';
    result += item.text;
    previousRight = item.x + item.width;
  }
  return normalizeWhitespace(result);
}

function lineBounds(line: TextLine): [number, number, number, number] {
  const left = Math.min(...line.items.map((item) => item.x));
  const bottom = Math.min(...line.items.map((item) => item.y));
  const right = Math.max(...line.items.map((item) => item.x + item.width));
  const top = Math.max(...line.items.map((item) => item.y + item.height));
  return [left, bottom, right, top];
}

function findTableCandidate(
  pageNumber: number,
  lines: TextLine[],
  tableIndex: number,
): ParsedTable | null {
  const candidateLines = lines.filter((line) => line.items.length >= 3);
  if (candidateLines.length < 2) return null;

  const referenceColumns = candidateLines[0].items.map((item) => item.x);
  const alignedLines = candidateLines.filter((line) => {
    if (Math.abs(line.items.length - referenceColumns.length) > 1) return false;
    const comparisons = line.items.slice(0, referenceColumns.length);
    return comparisons.filter((item, index) => Math.abs(item.x - referenceColumns[index]) < 28).length >= 2;
  });
  if (alignedLines.length < 2) return null;

  const rows: ParsedCell[][] = alignedLines.map((line) =>
    line.items.map((item) =>
      createParsedCell(
        item.text,
        pdfLocation(pageNumber, [item.x, item.y, item.x + item.width, item.y + item.height]),
      ),
    ),
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    id: `pdf-table-${tableIndex}`,
    rows,
    source: pdfLocation(pageNumber),
    confidence: 0.62,
    headerRowCount: 1,
  };
}

async function renderPageToPng(page: Awaited<ReturnType<Awaited<ReturnType<typeof getDocument>['promise']>['getPage']>>) {
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  const renderTask = page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: context as unknown as CanvasRenderingContext2D,
    viewport,
  });
  await renderTask.promise;
  return {
    buffer: canvas.toBuffer('image/png'),
    width: canvas.width,
    height: canvas.height,
  };
}

export const pdfParser: FileParser = {
  fileTypes: ['pdf'],

  async parse(file: InspectedFile, options): Promise<ParsedDocument> {
    const startedAt = performance.now();
    options.onProgress({ stage: 'read', progress: 0.02, message: '读取PDF' });
    const data = new Uint8Array(await readFile(file.filePath));
    const loadingTask = getDocument({
      data,
      useWorkerFetch: false,
      stopAtErrors: false,
    });

    let pdf;
    try {
      pdf = await loadingTask.promise;
    } catch (error) {
      if (error instanceof PasswordException || (error as { name?: string }).name === 'PasswordException') {
        throw new FileParseError('PDF_PASSWORD_REQUIRED', 'PDF需要密码才能读取', undefined, {
          cause: error,
        });
      }
      if (error instanceof InvalidPDFException || (error as { name?: string }).name === 'InvalidPDFException') {
        throw new FileParseError('FILE_CORRUPTED', 'PDF结构损坏', undefined, { cause: error });
      }
      throw error;
    }

    const blocks: DocumentBlock[] = [];
    const tables: ParsedTable[] = [];
    const images: ParsedImage[] = [];
    const warnings: ParseWarning[] = [];
    const rawPages: string[] = [];
    const pageModes: Array<'native' | 'scanned' | 'blank'> = [];
    let tableIndex = 0;
    let blockIndex = 0;
    let imageIndex = 0;

    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        options.onProgress({
          stage: 'parse',
          progress: (pageNumber - 1) / pdf.numPages,
          message: `解析PDF第${pageNumber}/${pdf.numPages}页`,
        });
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const textItems: TextItemLite[] = textContent.items
          .filter((item): item is typeof item & { str: string; transform: number[]; width: number; height: number } =>
            'str' in item && typeof item.str === 'string',
          )
          .filter((item) => item.str.trim().length > 0)
          .map((item) => ({
            text: item.str,
            x: item.transform[4],
            y: item.transform[5],
            width: item.width,
            height: item.height || Math.abs(item.transform[3]) || 10,
          }));

        const lines = groupTextLines(textItems);
        const nativeText = normalizeWhitespace(lines.map(lineText).filter(Boolean).join('\n'));
        const operatorList = await page.getOperatorList();
        const imageOps = operatorList.fnArray.filter((operator) =>
          operator === OPS.paintImageXObject ||
          operator === OPS.paintInlineImageXObject ||
          operator === OPS.paintImageXObjectRepeat,
        ).length;

        for (let index = 0; index < imageOps; index += 1) {
          imageIndex += 1;
          images.push({
            schemaVersion: SCHEMA_VERSION,
            id: `pdf-image-${imageIndex}`,
            mimeType: 'application/octet-stream',
            role: 'embedded',
            source: pdfLocation(pageNumber),
          });
        }

        if (nativeText.length >= 5) {
          pageModes.push('native');
          rawPages.push(nativeText);
          for (const line of lines) {
            const text = lineText(line);
            if (!text) continue;
            blockIndex += 1;
            blocks.push({
              schemaVersion: SCHEMA_VERSION,
              id: `pdf-block-${blockIndex}`,
              type: 'paragraph',
              text,
              source: pdfLocation(pageNumber, lineBounds(line)),
            });
          }
          const table = findTableCandidate(pageNumber, lines, ++tableIndex);
          if (table) {
            tables.push(table);
            warnings.push({
              schemaVersion: SCHEMA_VERSION,
              code: 'table_structure_low_confidence',
              severity: 'warning',
              message: `第${pageNumber}页表格由文本坐标推断，复杂结构需人工核验`,
              source: pdfLocation(pageNumber),
            });
          }
          continue;
        }

        if (options.enableOcr && imageOps > 0) {
          pageModes.push('scanned');
          options.onProgress({
            stage: 'render',
            progress: pageNumber / pdf.numPages,
            message: `渲染扫描PDF第${pageNumber}页`,
          });
          const rendered = await renderPageToPng(page);
          imageIndex += 1;
          const renderId = `pdf-page-render-${pageNumber}`;
          const ocr = await recognizeImage(
            rendered.buffer,
            options.ocrLanguages,
            (bbox) => pdfLocation(pageNumber, bbox),
            options.onProgress,
          );
          rawPages.push(ocr.text);
          blocks.push(
            ...ocr.blocks.map((block) => ({
              ...block,
              id: `pdf-${renderId}-${block.id}`,
            })),
          );
          images.push({
            schemaVersion: SCHEMA_VERSION,
            id: renderId,
            mimeType: 'image/png',
            width: rendered.width,
            height: rendered.height,
            byteSize: rendered.buffer.byteLength,
            role: 'page-render',
            source: pdfLocation(pageNumber),
            ocrText: ocr.text,
            ocrConfidence: ocr.confidence,
          });
          warnings.push(...ocr.warnings.map((warning) => ({
            ...warning,
            source: pdfLocation(pageNumber),
          })));
          warnings.push({
            schemaVersion: SCHEMA_VERSION,
            code: 'source_location_approximate',
            severity: 'info',
            message: `第${pageNumber}页OCR坐标基于2倍渲染图`,
            source: pdfLocation(pageNumber),
          });
        } else {
          pageModes.push('blank');
          rawPages.push('');
          warnings.push({
            schemaVersion: SCHEMA_VERSION,
            code: 'page_without_text',
            severity: 'warning',
            message: `第${pageNumber}页未提取到文字`,
            source: pdfLocation(pageNumber),
          });
        }
      }
    } finally {
      await loadingTask.destroy();
    }

    options.onProgress({ stage: 'complete', progress: 1, message: 'PDF解析完成' });
    return {
      schemaVersion: SCHEMA_VERSION,
      fileId: file.sha256.slice(0, 16),
      fileName: file.fileName,
      fileType: 'pdf',
      mimeType: file.mimeType,
      size: file.size,
      sha256: file.sha256,
      rawText: normalizeWhitespace(rawPages.join('\n\n')),
      blocks,
      tables,
      images,
      metadata: {
        schemaVersion: SCHEMA_VERSION,
        parser: 'pdfjs-dist',
        parseDurationMs: Math.round(performance.now() - startedAt),
        peakRssBytes: process.memoryUsage().rss,
        pageCount: pdf.numPages,
        pageModes,
      },
      warnings,
    };
  },
};
