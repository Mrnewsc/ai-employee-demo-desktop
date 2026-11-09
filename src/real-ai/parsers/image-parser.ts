/// <reference types="node" />

import { loadImage } from '@napi-rs/canvas';
import Tesseract from 'tesseract.js';
import type {
  DocumentBlock,
  ImageSourceLocation,
  ParseWarning,
  ParsedDocument,
  ParsedImage,
  SourceLocation,
} from '../types';
import { SCHEMA_VERSION } from '../types';
import { FileParseError } from './errors';
import type { FileParser, InspectedFile, ParseFileOptions } from './parser-types';
import { normalizeWhitespace, sha256Buffer } from './utils';

interface OcrOutput {
  text: string;
  confidence: number;
  blocks: DocumentBlock[];
  warnings: ParseWarning[];
}

function imageLocation(imageId: string, bbox?: [number, number, number, number]): ImageSourceLocation {
  return { schemaVersion: SCHEMA_VERSION, kind: 'image', imageId, bbox };
}

function mapOcrLines(
  blocks: Tesseract.Block[] | null,
  sourceFactory: (bbox?: [number, number, number, number]) => SourceLocation,
): DocumentBlock[] {
  if (!blocks) return [];
  const result: DocumentBlock[] = [];
  let index = 0;
  for (const block of blocks) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        const text = normalizeWhitespace(line.text);
        if (!text) continue;
        const bbox: [number, number, number, number] = [
          line.bbox.x0,
          line.bbox.y0,
          line.bbox.x1,
          line.bbox.y1,
        ];
        index += 1;
        result.push({
          schemaVersion: SCHEMA_VERSION,
          id: `ocr-line-${index}`,
          type: 'ocr-line',
          text,
          confidence: line.confidence / 100,
          source: sourceFactory(bbox),
        });
      }
    }
  }
  return result;
}

export async function recognizeImage(
  input: string | Buffer,
  languages: string[],
  sourceFactory: (bbox?: [number, number, number, number]) => SourceLocation,
  onProgress: ParseFileOptions['onProgress'],
): Promise<OcrOutput> {
  let worker: Tesseract.Worker | undefined;
  try {
    const workerOptions: Partial<Tesseract.WorkerOptions> = {
      logger: (message) => {
        if (message.status.includes('recognizing')) {
          onProgress?.({
            stage: 'ocr',
            progress: message.progress,
            message: `OCR：${message.status}`,
          });
        }
      },
    };
    const tessdataPath = process.env.REAL_AI_TESSDATA_PATH;
    const tesseractWorkerPath = process.env.REAL_AI_TESSERACT_WORKER_PATH;
    if (tesseractWorkerPath) workerOptions.workerPath = tesseractWorkerPath;
    if (tessdataPath) {
      workerOptions.langPath = tessdataPath;
      workerOptions.cachePath = process.env.REAL_AI_TESSDATA_CACHE ?? tessdataPath;
      workerOptions.cacheMethod = 'none';
      workerOptions.gzip = true;
    }
    worker = await Tesseract.createWorker(
      languages.join('+'),
      Tesseract.OEM.LSTM_ONLY,
      workerOptions,
    );
    const result = await worker.recognize(input, { rotateAuto: false }, { text: true, blocks: true });
    const text = normalizeWhitespace(result.data.text);
    const confidence = result.data.confidence / 100;
    const warnings: ParseWarning[] = [];

    if (confidence < 0.7) {
      warnings.push({
        schemaVersion: SCHEMA_VERSION,
        code: 'ocr_low_confidence',
        severity: 'warning',
        message: `OCR平均置信度${Math.round(confidence * 100)}%，结果需要人工核验`,
      });
    }
    if (/[A-Z0-9-]{4,}/i.test(text) && /[O0I1S5]/i.test(text)) {
      warnings.push({
        schemaVersion: SCHEMA_VERSION,
        code: 'ocr_character_ambiguity',
        severity: 'info',
        message: '型号文本可能包含0/O、1/I、5/S易混字符',
      });
    }

    return {
      text,
      confidence,
      blocks: mapOcrLines(result.data.blocks, sourceFactory),
      warnings,
    };
  } catch (error) {
    throw new FileParseError(
      'OCR_FAILED',
      'OCR识别失败',
      { originalMessage: error instanceof Error ? error.message : String(error) },
      { cause: error },
    );
  } finally {
    if (worker) await worker.terminate();
  }
}

export const imageParser: FileParser = {
  fileTypes: ['image'],

  async parse(file: InspectedFile, options): Promise<ParsedDocument> {
    const startedAt = performance.now();
    options.onProgress({ stage: 'read', progress: 0.05, message: '读取图片' });
    const sourceId = `image-${file.sha256.slice(0, 12)}`;
    const image = await loadImage(file.filePath);
    const ocr = options.enableOcr
      ? await recognizeImage(
          file.filePath,
          options.ocrLanguages,
          (bbox) => imageLocation(sourceId, bbox),
          options.onProgress,
        )
      : { text: '', confidence: 0, blocks: [], warnings: [] };

    const parsedImage: ParsedImage = {
      schemaVersion: SCHEMA_VERSION,
      id: sourceId,
      mimeType: file.mimeType,
      width: image.width,
      height: image.height,
      byteSize: file.size,
      sha256: file.sha256,
      role: 'source-image',
      source: imageLocation(sourceId),
      ocrText: ocr.text,
      ocrConfidence: ocr.confidence,
    };

    options.onProgress({ stage: 'complete', progress: 1, message: '图片解析完成' });
    return {
      schemaVersion: SCHEMA_VERSION,
      fileId: file.sha256.slice(0, 16),
      fileName: file.fileName,
      fileType: 'image',
      mimeType: file.mimeType,
      size: file.size,
      sha256: file.sha256,
      rawText: ocr.text,
      blocks: ocr.blocks,
      tables: [],
      images: [parsedImage],
      metadata: {
        schemaVersion: SCHEMA_VERSION,
        parser: 'tesseract.js',
        parseDurationMs: Math.round(performance.now() - startedAt),
        peakRssBytes: process.memoryUsage().rss,
        width: image.width,
        height: image.height,
      },
      warnings: ocr.warnings,
    };
  },
};

export function embeddedImageRecord(
  id: string,
  mimeType: string,
  data: Uint8Array,
  source: SourceLocation,
): ParsedImage {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    mimeType,
    byteSize: data.byteLength,
    sha256: sha256Buffer(data),
    role: 'embedded',
    source,
  };
}
