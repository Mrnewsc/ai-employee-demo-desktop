import type { ParsedDocument, ParsedFileType } from '../types';

export interface ParseProgress {
  stage: 'inspect' | 'read' | 'parse' | 'render' | 'ocr' | 'complete';
  progress: number;
  message: string;
}

export interface ParseFileOptions {
  maxFileSizeBytes?: number;
  timeoutMs?: number;
  enableOcr?: boolean;
  ocrLanguages?: string[];
  onProgress?: (progress: ParseProgress) => void;
}

export interface InspectedFile {
  filePath: string;
  fileName: string;
  fileType: ParsedFileType;
  mimeType: string;
  size: number;
  sha256: string;
}

export interface FileParser {
  readonly fileTypes: readonly ParsedFileType[];
  parse(file: InspectedFile, options: Required<ParseFileOptions>): Promise<ParsedDocument>;
}

export const DEFAULT_PARSE_OPTIONS: Required<ParseFileOptions> = {
  maxFileSizeBytes: 25 * 1024 * 1024,
  timeoutMs: 90_000,
  enableOcr: true,
  ocrLanguages: ['chi_sim'],
  onProgress: () => undefined,
};
