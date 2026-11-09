/// <reference types="node" />

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { parseDocument } from '../../parsers';
import { createExtractionChunks } from '../chunker';
import type { ExpectedSmokeSample } from '../smoke/validation';

const realAiRoot = path.resolve('src', 'real-ai');
const fixtureRoot = path.join(realAiRoot, 'fixtures');
const expectedPath = path.join(realAiRoot, 'extraction', 'fixtures', 'real-smoke', 'expected-extraction.json');

const resolveFixturePath = (sourcePath: string) => sourcePath.startsWith('extraction/')
  ? path.join(realAiRoot, sourcePath)
  : path.join(fixtureRoot, sourcePath);
const isImageFixture = (sourcePath: string) => sourcePath.split('/').includes('images');

test('R1全部真实Smoke fixture可本地解析且不依赖DeepSeek', async () => {
  const fixture = JSON.parse(await readFile(expectedPath, 'utf8')) as { samples: ExpectedSmokeSample[] };
  assert.equal(fixture.samples.length, 9);
  const uniquePaths = [...new Set(fixture.samples.flatMap((sample) => sample.sourcePaths))];
  for (const sourcePath of uniquePaths) {
    const document = await parseDocument(resolveFixturePath(sourcePath), {
      enableOcr: isImageFixture(sourcePath),
      timeoutMs: 180_000,
    });
    assert.ok(
      document.rawText.length > 0 || document.tables.length > 0 || document.images.some((image) => image.ocrText),
      `${sourcePath}应包含可解析内容`,
    );
    assert.ok(createExtractionChunks(document, `fixture-${sourcePath}`).length > 0);
  }
});

test('低质量OCR真实输出保留9P-3000且去重后只有一个Chunk', async () => {
  const document = await parseDocument(path.join(fixtureRoot, 'images', 'product-list', 'input.png'), {
    enableOcr: true,
    timeoutMs: 180_000,
  });
  assert.match(document.rawText, /9P-3000/);
  const chunks = createExtractionChunks(document, 'fixture-low-ocr');
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].evidenceItems.some((item) => item.text.includes('9P-3000')));
  assert.equal(chunks[0].evidenceItems.some((item) => item.text.includes('SP-3000')), false);
  assert.ok(chunks[0].evidenceItems.every((item) => item.source.kind === 'image' && item.source.bbox));
});

test('缺字段、冲突和合并fixture包含预期的原始事实边界', async () => {
  const files = ['missing-fields.xlsx', 'conflict-a.xlsx', 'conflict-b.xlsx', 'merge-specs.xlsx'];
  const documents = await Promise.all(files.map((fileName) => parseDocument(
    path.join(realAiRoot, 'extraction', 'fixtures', 'real-smoke', fileName),
    { enableOcr: false, timeoutMs: 30_000 },
  )));
  assert.match(documents[0].rawText, /自动喷涂设备[\s\S]*SP-3000/);
  assert.equal(/数量|材质|规格/.test(documents[0].rawText), false);
  assert.match(documents[1].rawText, /SP-3000[\s\S]*10套/);
  assert.match(documents[2].rawText, /SP-3200[\s\S]*12套/);
  assert.match(documents[3].rawText, /SP-3000[\s\S]*18\.5kW/);
});
