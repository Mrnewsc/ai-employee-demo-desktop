/// <reference types="node" />

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { ParsedCell, SourceLocation } from '../types';
import { SCHEMA_VERSION } from '../types';
import { FileParseError } from './errors';

export async function sha256File(filePath: string): Promise<string> {
  const data = await readFile(filePath);
  return createHash('sha256').update(data).digest('hex');
}

export function sha256Buffer(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function createParsedCell(
  value: string | number | boolean | null,
  source: SourceLocation,
  formula?: string,
): ParsedCell {
  return {
    schemaVersion: SCHEMA_VERSION,
    value,
    displayValue: value === null ? '' : String(value),
    formula,
    source,
  };
}

export async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  context: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new FileParseError('PARSE_TIMEOUT', `${context}超过${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
