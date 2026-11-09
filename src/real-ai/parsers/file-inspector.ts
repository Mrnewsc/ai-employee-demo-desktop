/// <reference types="node" />

import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromFile } from 'file-type';
import type { ParsedFileType } from '../types';
import { FileParseError } from './errors';
import type { InspectedFile } from './parser-types';
import { sha256File } from './utils';

const EXTENSION_TYPE: Record<string, ParsedFileType | undefined> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.xls': 'xls',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
};

const DETECTED_TYPE: Record<string, ParsedFileType | undefined> = {
  pdf: 'pdf',
  docx: 'docx',
  xlsx: 'xlsx',
  xls: 'xls',
  cfb: 'xls',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
};

export async function inspectFile(
  filePath: string,
  maxFileSizeBytes: number,
): Promise<InspectedFile> {
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch (error) {
    throw new FileParseError(
      'FILE_NOT_FOUND',
      `文件不存在：${path.basename(filePath)}`,
      undefined,
      { cause: error },
    );
  }

  if (!fileStat.isFile()) {
    throw new FileParseError('FILE_NOT_FOUND', '输入路径不是文件');
  }
  if (fileStat.size === 0) {
    throw new FileParseError('FILE_EMPTY', '文件为空');
  }
  if (fileStat.size > maxFileSizeBytes) {
    throw new FileParseError('FILE_TOO_LARGE', '文件超过允许大小', {
      size: fileStat.size,
      maxFileSizeBytes,
    });
  }

  const extension = path.extname(filePath).toLowerCase();
  const expectedType = EXTENSION_TYPE[extension];
  if (!expectedType) {
    throw new FileParseError('UNSUPPORTED_FILE_TYPE', `不支持的文件类型：${extension || '无扩展名'}`);
  }

  const detected = await fileTypeFromFile(filePath);
  const detectedType = detected ? DETECTED_TYPE[detected.ext] : undefined;

  if (!detectedType) {
    throw new FileParseError('FILE_CORRUPTED', '无法识别文件签名，文件可能已损坏', {
      extension,
      detectedMimeType: detected?.mime,
    });
  }
  if (detectedType !== expectedType) {
    throw new FileParseError('FILE_TYPE_MISMATCH', '扩展名与文件实际类型不一致', {
      extension,
      expectedType,
      detectedType,
      detectedMimeType: detected?.mime,
    });
  }

  return {
    filePath,
    fileName: path.basename(filePath),
    fileType: expectedType,
    mimeType: detected?.mime ?? 'application/octet-stream',
    size: fileStat.size,
    sha256: await sha256File(filePath),
  };
}
