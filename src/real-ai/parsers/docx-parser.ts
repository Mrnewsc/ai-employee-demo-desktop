/// <reference types="node" />

import { readFile } from 'node:fs/promises';
import mammoth from 'mammoth';
import { parseFragment } from 'parse5';
import type {
  DocxSourceLocation,
  DocumentBlock,
  ParseWarning,
  ParsedDocument,
  ParsedImage,
  ParsedTable,
} from '../types';
import { SCHEMA_VERSION } from '../types';
import { embeddedImageRecord } from './image-parser';
import type { FileParser, InspectedFile } from './parser-types';
import { createParsedCell, normalizeWhitespace } from './utils';

interface HtmlNode {
  nodeName: string;
  tagName?: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
}

function docxLocation(
  values: Omit<DocxSourceLocation, 'schemaVersion' | 'kind'> = {},
): DocxSourceLocation {
  return { schemaVersion: SCHEMA_VERSION, kind: 'docx', ...values };
}

function nodeText(node: HtmlNode): string {
  if (node.nodeName === '#text') return node.value ?? '';
  return normalizeWhitespace((node.childNodes ?? []).map(nodeText).join(' '));
}

function descendants(node: HtmlNode, tagName: string): HtmlNode[] {
  const result: HtmlNode[] = [];
  for (const child of node.childNodes ?? []) {
    if (child.tagName === tagName) result.push(child);
    result.push(...descendants(child, tagName));
  }
  return result;
}

function hasAncestorTag(ancestors: HtmlNode[], tagName: string): boolean {
  return ancestors.some((ancestor) => ancestor.tagName === tagName);
}

function collectBlocks(root: HtmlNode): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  let paragraph = 0;

  function visit(node: HtmlNode, ancestors: HtmlNode[]) {
    const tag = node.tagName;
    const isTextBlock =
      tag === 'p' ||
      tag === 'li' ||
      tag === 'h1' ||
      tag === 'h2' ||
      tag === 'h3' ||
      tag === 'h4' ||
      tag === 'h5' ||
      tag === 'h6';

    if (isTextBlock && !hasAncestorTag(ancestors, 'table') && !hasAncestorTag(ancestors, 'li')) {
      const text = nodeText(node);
      if (text) {
        paragraph += 1;
        blocks.push({
          schemaVersion: SCHEMA_VERSION,
          id: `docx-block-${paragraph}`,
          type: tag?.startsWith('h') ? 'heading' : tag === 'li' ? 'list-item' : 'paragraph',
          text,
          source: docxLocation({ paragraph }),
        });
      }
    }

    for (const child of node.childNodes ?? []) visit(child, [...ancestors, node]);
  }

  visit(root, []);
  return blocks;
}

function collectTables(root: HtmlNode): ParsedTable[] {
  return descendants(root, 'table').map((tableNode, tableIndex) => {
    const rowNodes = descendants(tableNode, 'tr').filter((row) =>
      row.childNodes?.some((child) => child.tagName === 'td' || child.tagName === 'th'),
    );
    const rows = rowNodes.map((rowNode, rowIndex) =>
      (rowNode.childNodes ?? [])
        .filter((cellNode) => cellNode.tagName === 'td' || cellNode.tagName === 'th')
        .map((cellNode, cellIndex) =>
          createParsedCell(
            nodeText(cellNode),
            docxLocation({ table: tableIndex + 1, row: rowIndex + 1, cell: cellIndex + 1 }),
          ),
        ),
    );

    return {
      schemaVersion: SCHEMA_VERSION,
      id: `docx-table-${tableIndex + 1}`,
      rows,
      source: docxLocation({ table: tableIndex + 1 }),
      confidence: 0.95,
      headerRowCount: rowNodes[0]?.childNodes?.some((cell) => cell.tagName === 'th') ? 1 : 0,
    };
  });
}

export const docxParser: FileParser = {
  fileTypes: ['docx'],

  async parse(file: InspectedFile, options): Promise<ParsedDocument> {
    const startedAt = performance.now();
    const buffer = await readFile(file.filePath);
    const images: ParsedImage[] = [];
    let imageIndex = 0;

    options.onProgress({ stage: 'parse', progress: 0.2, message: '提取DOCX正文与表格' });
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        externalFileAccess: false,
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
        ],
        convertImage: mammoth.images.imgElement(async (image) => {
          imageIndex += 1;
          const id = `docx-image-${imageIndex}`;
          const imageBuffer = await image.readAsBuffer();
          images.push(
            embeddedImageRecord(
              id,
              image.contentType,
              imageBuffer,
              docxLocation({ image: imageIndex }),
            ),
          );
          return { src: `real-ai-image://${id}` };
        }),
      },
    );

    const fragment = parseFragment(result.value) as unknown as HtmlNode;
    const blocks = collectBlocks(fragment);
    const tables = collectTables(fragment);
    const warnings: ParseWarning[] = result.messages.map((message) => ({
      schemaVersion: SCHEMA_VERSION,
      code: 'parser_message',
      severity: message.type === 'error' ? 'warning' : 'info',
      message: message.message,
    }));

    options.onProgress({ stage: 'complete', progress: 1, message: 'DOCX解析完成' });
    return {
      schemaVersion: SCHEMA_VERSION,
      fileId: file.sha256.slice(0, 16),
      fileName: file.fileName,
      fileType: 'docx',
      mimeType: file.mimeType,
      size: file.size,
      sha256: file.sha256,
      rawText: normalizeWhitespace([
        ...blocks.map((block) => block.text),
        ...tables.flatMap((table) =>
          table.rows.map((row) => row.map((cell) => cell.displayValue).join('\t')),
        ),
      ].join('\n')),
      blocks,
      tables,
      images,
      metadata: {
        schemaVersion: SCHEMA_VERSION,
        parser: 'mammoth',
        parseDurationMs: Math.round(performance.now() - startedAt),
        peakRssBytes: process.memoryUsage().rss,
        paragraphCount: blocks.length,
        tableCount: tables.length,
        imageCount: images.length,
      },
      warnings,
    };
  },
};
