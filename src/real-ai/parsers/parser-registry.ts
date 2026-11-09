import type { ParsedDocument } from '../types';
import { docxParser } from './docx-parser';
import { FileParseError } from './errors';
import { excelParser } from './excel-parser';
import { imageParser } from './image-parser';
import { inspectFile } from './file-inspector';
import type { FileParser, ParseFileOptions } from './parser-types';
import { DEFAULT_PARSE_OPTIONS } from './parser-types';
import { pdfParser } from './pdf-parser';
import { withTimeout } from './utils';

const PARSERS: FileParser[] = [pdfParser, docxParser, excelParser, imageParser];

export async function parseDocument(
  filePath: string,
  userOptions: ParseFileOptions = {},
): Promise<ParsedDocument> {
  const options = { ...DEFAULT_PARSE_OPTIONS, ...userOptions };
  options.onProgress({ stage: 'inspect', progress: 0, message: '检查文件类型与大小' });
  const file = await inspectFile(filePath, options.maxFileSizeBytes);
  const parser = PARSERS.find((candidate) => candidate.fileTypes.includes(file.fileType));

  if (!parser) {
    throw new FileParseError('UNSUPPORTED_FILE_TYPE', `没有可用解析器：${file.fileType}`);
  }

  try {
    return await withTimeout(
      parser.parse(file, options),
      options.timeoutMs,
      `${file.fileName}解析`,
    );
  } catch (error) {
    if (error instanceof FileParseError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (file.fileType === 'pdf' || file.fileType === 'docx' || file.fileType === 'xlsx' || file.fileType === 'xls') {
      throw new FileParseError(
        'FILE_CORRUPTED',
        `${file.fileName}无法解析，文件结构可能已损坏`,
        { originalMessage: message },
        { cause: error },
      );
    }
    throw new FileParseError(
      'PARSER_FAILED',
      `${file.fileName}解析失败`,
      { originalMessage: message },
      { cause: error },
    );
  }
}
