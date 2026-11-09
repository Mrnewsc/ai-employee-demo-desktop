import type {
  DocumentBlock,
  ParsedDocument,
  ParsedImage,
  ParsedTable,
  ParseWarningCode,
  SourceLocation,
} from '../types';
import { SCHEMA_VERSION } from '../types';
import { EXTRACTION_CHUNK_CONFIG } from './config';
import type {
  ExtractionChunkConfig,
  ExtractionEvidenceItem,
  ExtractionInput,
  ExtractionTable,
  ExtractionTextBlock,
} from './contracts';
import { ProductExtractionError } from './errors';

interface ChunkPart {
  textBlocks: ExtractionTextBlock[];
  tables: ExtractionTable[];
  evidenceItems: ExtractionEvidenceItem[];
}

export function createExtractionChunks(
  document: ParsedDocument,
  jobId: string,
  optionalContext: Record<string, string> = {},
  configOverrides: Partial<ExtractionChunkConfig> = {},
): ExtractionInput[] {
  const config = { ...EXTRACTION_CHUNK_CONFIG, ...configOverrides };
  const parts = [
    ...createTextParts(document, config.maxTextCharacters),
    ...createTableParts(document, config.maxTableRows),
    ...createOcrImageParts(document, config.maxTextCharacters),
  ];
  const chunks = parts.map((part, index) => ({
    schemaVersion: SCHEMA_VERSION,
    jobId,
    chunkId: `${document.fileId}:chunk:${index + 1}`,
    documentId: document.fileId,
    fileName: document.fileName,
    fileType: document.fileType,
    textBlocks: part.textBlocks,
    tables: part.tables,
    evidenceItems: part.evidenceItems,
    sourceLocations: uniqueLocations(part.evidenceItems.map((item) => item.source)),
    parserWarnings: document.warnings,
    optionalContext,
  } satisfies ExtractionInput));

  if (chunks.length > config.maxChunksPerDocument) {
    throw new ProductExtractionError(
      'AI_EXTRACTION_FAILED',
      `文档分块数量${chunks.length}超过安全上限${config.maxChunksPerDocument}`,
    );
  }
  return chunks;
}

function createTextParts(document: ParsedDocument, maxCharacters: number): ChunkPart[] {
  if (!document.blocks.length) return [];
  const parts: ChunkPart[] = [];
  let current: ChunkPart = emptyPart();
  let currentCharacters = 0;
  let currentGroup = '';
  let docxSection = 0;

  const flush = () => {
    if (!current.evidenceItems.length) return;
    parts.push(current);
    current = emptyPart();
    currentCharacters = 0;
  };

  for (const block of document.blocks) {
    if (!block.text.trim()) continue;
    if (document.fileType === 'docx' && block.type === 'heading') docxSection += 1;
    const group = blockGroup(document, block, docxSection);
    const blockCharacters = block.text.length;
    if (current.evidenceItems.length && (group !== currentGroup || currentCharacters + blockCharacters > maxCharacters)) {
      flush();
    }
    currentGroup = group;
    const evidenceId = `${document.fileId}:block:${block.id}`;
    const confidence = block.confidence ?? null;
    current.textBlocks.push({
      schemaVersion: SCHEMA_VERSION,
      blockId: block.id,
      evidenceId,
      text: block.text,
      source: block.source,
      confidence,
    });
    current.evidenceItems.push({
      schemaVersion: SCHEMA_VERSION,
      evidenceId,
      text: block.text,
      sourceFile: document.fileName,
      source: block.source,
      confidence,
      kind: block.type === 'ocr-line' ? 'ocr' : 'text',
      warningCodes: block.type === 'ocr-line' ? warningCodesFor(document, block.source) : [],
    });
    currentCharacters += blockCharacters;
  }
  flush();
  return parts;
}

function createTableParts(document: ParsedDocument, maxTableRows: number): ChunkPart[] {
  return document.tables.flatMap((table) => splitTable(document, table, maxTableRows));
}

function splitTable(document: ParsedDocument, table: ParsedTable, maxTableRows: number): ChunkPart[] {
  const headerCount = Math.min(table.rows.length, Math.max(0, table.headerRowCount ?? 0));
  const headers = table.rows.slice(0, headerCount);
  const dataRows = table.rows.slice(headerCount);
  const rowGroups = dataRows.length
    ? chunkArray(dataRows, Math.max(1, maxTableRows - headerCount)).map((rows) => [...headers, ...rows])
    : table.rows.length ? [table.rows] : [];

  return rowGroups.map((rows, tableChunkIndex) => {
    const evidenceItems: ExtractionEvidenceItem[] = [];
    const extractionRows = rows.map((row) => row.map((cell) => {
      const sourceRow = cell.source.kind === 'sheet' ? cell.source.row ?? 0 : 0;
      const sourceColumn = cell.source.kind === 'sheet' ? cell.source.column ?? 0 : 0;
      const evidenceId = `${document.fileId}:table:${table.id}:r${sourceRow}:c${sourceColumn}:${evidenceItems.length}`;
      const confidence = table.confidence;
      if (cell.displayValue.trim()) {
        evidenceItems.push({
          schemaVersion: SCHEMA_VERSION,
          evidenceId,
          text: cell.displayValue,
          sourceFile: document.fileName,
          source: cell.source,
          confidence,
          kind: 'table-cell',
          warningCodes: [],
        });
      }
      return {
        schemaVersion: SCHEMA_VERSION,
        evidenceId,
        displayValue: cell.displayValue,
        source: cell.source,
        confidence,
      };
    }));
    const extractionTable: ExtractionTable = {
      schemaVersion: SCHEMA_VERSION,
      tableId: `${table.id}:part:${tableChunkIndex + 1}`,
      title: table.title ?? null,
      headerRowCount: Math.min(headerCount, extractionRows.length),
      rows: extractionRows,
      source: table.source,
    };
    return { textBlocks: [], tables: [extractionTable], evidenceItems };
  }).filter((part) => part.evidenceItems.length > 0);
}

function createOcrImageParts(document: ParsedDocument, maxCharacters: number): ChunkPart[] {
  return document.images.flatMap((image) => {
    const text = image.ocrText?.trim();
    if (!text) return [];
    const relatedBlockText = document.blocks
      .filter((block) => block.type === 'ocr-line' && belongsToImage(block.source, image.source))
      .map((block) => block.text)
      .join(' ');
    if (isSubstantiallyDuplicateOcr(text, relatedBlockText)) return [];
    return splitText(text, maxCharacters).map((segment, index) => imagePart(document, image, segment, index));
  });
}

function imagePart(document: ParsedDocument, image: ParsedImage, text: string, index: number): ChunkPart {
  const evidenceId = `${document.fileId}:image:${image.id}:ocr:${index + 1}`;
  const confidence = image.ocrConfidence ?? null;
  return {
    textBlocks: [{
      schemaVersion: SCHEMA_VERSION,
      blockId: `${image.id}:ocr:${index + 1}`,
      evidenceId,
      text,
      source: image.source,
      confidence,
    }],
    tables: [],
    evidenceItems: [{
      schemaVersion: SCHEMA_VERSION,
      evidenceId,
      text,
      sourceFile: document.fileName,
      source: image.source,
      confidence,
      kind: 'ocr',
      warningCodes: warningCodesFor(document, image.source),
    }],
  };
}

function blockGroup(document: ParsedDocument, block: DocumentBlock, docxSection: number): string {
  if (document.fileType === 'docx') return `docx:${docxSection}`;
  if (block.source.kind === 'pdf') return `pdf:${block.source.page}`;
  if (block.source.kind === 'sheet') return `sheet:${block.source.sheet}`;
  if (block.source.kind === 'image') return `image:${block.source.imageId}`;
  return `block:${block.id}`;
}

function emptyPart(): ChunkPart {
  return { textBlocks: [], tables: [], evidenceItems: [] };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function splitText(text: string, size: number): string[] {
  const result: string[] = [];
  for (let index = 0; index < text.length; index += size) result.push(text.slice(index, index + size));
  return result;
}

function belongsToImage(blockSource: SourceLocation, imageSource: SourceLocation): boolean {
  if (blockSource.kind !== imageSource.kind) return false;
  if (blockSource.kind === 'image' && imageSource.kind === 'image') {
    return blockSource.imageId === imageSource.imageId;
  }
  if (blockSource.kind === 'pdf' && imageSource.kind === 'pdf') {
    return blockSource.page === imageSource.page;
  }
  if (blockSource.kind === 'docx' && imageSource.kind === 'docx') {
    return blockSource.image === imageSource.image;
  }
  return false;
}

function isSubstantiallyDuplicateOcr(imageText: string, blockText: string): boolean {
  const imageValue = compactOcrText(imageText);
  const blockValue = compactOcrText(blockText);
  if (!imageValue || !blockValue) return false;
  if (imageValue === blockValue || imageValue.includes(blockValue) || blockValue.includes(imageValue)) return true;
  if (Math.min(imageValue.length, blockValue.length) < 20) return false;
  const imageNgrams = createNgrams(imageValue, 3);
  const blockNgrams = createNgrams(blockValue, 3);
  let intersection = 0;
  for (const ngram of imageNgrams) if (blockNgrams.has(ngram)) intersection += 1;
  return intersection / Math.max(1, Math.min(imageNgrams.size, blockNgrams.size)) >= 0.8;
}

function compactOcrText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleUpperCase('en-US')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function createNgrams(value: string, size: number): Set<string> {
  const result = new Set<string>();
  for (let index = 0; index <= value.length - size; index += 1) {
    result.add(value.slice(index, index + size));
  }
  return result;
}

function warningCodesFor(document: ParsedDocument, source: SourceLocation): ParseWarningCode[] {
  return [...new Set(document.warnings.filter((warning) => (
    warning.code.startsWith('ocr_') && (!warning.source || sameSourceContext(warning.source, source))
  )).map((warning) => warning.code))];
}

function sameSourceContext(left: SourceLocation, right: SourceLocation): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'image' && right.kind === 'image') return left.imageId === right.imageId;
  if (left.kind === 'pdf' && right.kind === 'pdf') return left.page === right.page;
  if (left.kind === 'sheet' && right.kind === 'sheet') return left.sheet === right.sheet;
  if (left.kind === 'docx' && right.kind === 'docx') {
    return left.image === undefined || right.image === undefined || left.image === right.image;
  }
  return false;
}

function uniqueLocations(locations: SourceLocation[]): SourceLocation[] {
  const seen = new Set<string>();
  return locations.filter((location) => {
    const key = JSON.stringify(location);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
