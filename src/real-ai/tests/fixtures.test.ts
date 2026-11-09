/// <reference types="node" />

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import type { ParsedDocument } from '../types';
import { parseDocument } from '../parsers';

interface FixtureExpectation {
  fileType: ParsedDocument['fileType'];
  includes?: string[];
  includesAny?: string[];
  minBlocks: number;
  minTables: number;
  minImages: number;
  pageCount?: number;
  pageMode?: string;
  sheetNames?: string[];
  minHeaderRows?: number;
  warningAny?: string[];
}

interface FixtureManifest {
  schemaVersion: '1.0';
  input: string;
  expected: FixtureExpectation;
}

const fixtureRoot = path.resolve('src', 'real-ai', 'fixtures');

async function manifestsFor(category: string): Promise<Array<{ dir: string; manifest: FixtureManifest }>> {
  const categoryDir = path.join(fixtureRoot, category);
  const entries = await readdir(categoryDir, { withFileTypes: true });
  const manifests = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(categoryDir, entry.name);
    const manifest = JSON.parse(
      await readFile(path.join(dir, 'expected.json'), 'utf8'),
    ) as FixtureManifest;
    if ('fileType' in manifest.expected) manifests.push({ dir, manifest });
  }
  return manifests;
}

function assertDocument(document: ParsedDocument, expected: FixtureExpectation) {
  assert.equal(document.schemaVersion, '1.0');
  assert.equal(document.fileType, expected.fileType);
  assert.ok(document.sha256.length === 64);
  assert.ok(document.size > 0);
  assert.ok(document.metadata.parseDurationMs >= 0);
  assert.ok(document.blocks.length >= expected.minBlocks);
  assert.ok(document.tables.length >= expected.minTables);
  assert.ok(document.images.length >= expected.minImages);

  for (const text of expected.includes ?? []) {
    assert.ok(document.rawText.includes(text), `未提取到预期文字：${text}`);
  }
  if (expected.includesAny?.length) {
    assert.ok(
      expected.includesAny.some((text) => document.rawText.includes(text)),
      `未提取到任一预期文字：${expected.includesAny.join(', ')}`,
    );
  }
  if (expected.pageCount !== undefined) {
    assert.equal(document.metadata.pageCount, expected.pageCount);
  }
  if (expected.pageMode) {
    assert.ok(
      Array.isArray(document.metadata.pageModes) &&
        document.metadata.pageModes.includes(expected.pageMode),
    );
  }
  if (expected.sheetNames) {
    assert.deepEqual(document.metadata.sheetNames, expected.sheetNames);
  }
  const minHeaderRows = expected.minHeaderRows;
  if (minHeaderRows !== undefined) {
    assert.ok(document.tables.some((table) => (table.headerRowCount ?? 0) >= minHeaderRows));
  }
  if (expected.warningAny?.length) {
    assert.ok(
      document.warnings.some((warning) => expected.warningAny?.includes(warning.code)),
      `未出现预期warning：${expected.warningAny.join(', ')}`,
    );
  }

  const allSources = [
    ...document.blocks.map((block) => block.source),
    ...document.tables.flatMap((table) => [
      table.source,
      ...table.rows.flatMap((row) => row.map((cell) => cell.source)),
    ]),
    ...document.images.map((image) => image.source),
  ];
  assert.ok(allSources.length > 0);
  assert.ok(allSources.every((source) => source.schemaVersion === '1.0'));
}

for (const category of ['pdf', 'docx', 'excel', 'images']) {
  test(`${category}样本输出统一ParsedDocument`, async () => {
    const fixtures = await manifestsFor(category);
    assert.ok(fixtures.length >= 3, `${category}至少需要3个样本`);
    for (const { dir, manifest } of fixtures) {
      const document = await parseDocument(path.join(dir, manifest.input), {
        timeoutMs: 120_000,
      });
      assertDocument(document, manifest.expected);
    }
  });
}
