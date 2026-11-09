/// <reference types="node" />

import { monitorEventLoopDelay } from 'node:perf_hooks';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FileParseError, parseDocument } from '../../src/real-ai/parsers';

interface Manifest {
  schemaVersion: '1.0';
  input: string;
  expected: Record<string, unknown>;
}

interface ValidationRow {
  file: string;
  format: string;
  size: number;
  success: boolean;
  text: string;
  tables: number;
  images: number;
  sourceLocation: boolean;
  durationMs: number;
  eventLoopDelayMaxMs: number;
  rssDeltaMb: number;
  warningOrError: string;
  excerpt: string;
}

const projectRoot = path.resolve('.');
const fixtureRoot = path.join(projectRoot, 'src', 'real-ai', 'fixtures');
const outputDir = path.join(projectRoot, 'src', 'real-ai', 'tests', 'results');

async function fixtureEntries() {
  const rows: Array<{ category: string; sample: string; dir: string; manifest: Manifest }> = [];
  for (const categoryEntry of await readdir(fixtureRoot, { withFileTypes: true })) {
    if (!categoryEntry.isDirectory()) continue;
    const categoryDir = path.join(fixtureRoot, categoryEntry.name);
    for (const sampleEntry of await readdir(categoryDir, { withFileTypes: true })) {
      if (!sampleEntry.isDirectory()) continue;
      const dir = path.join(categoryDir, sampleEntry.name);
      const manifest = JSON.parse(
        await readFile(path.join(dir, 'expected.json'), 'utf8'),
      ) as Manifest;
      rows.push({ category: categoryEntry.name, sample: sampleEntry.name, dir, manifest });
    }
  }
  return rows;
}

async function validateOne(
  fixture: Awaited<ReturnType<typeof fixtureEntries>>[number],
): Promise<ValidationRow> {
  const filePath = path.join(fixture.dir, fixture.manifest.input);
  const beforeRss = process.memoryUsage().rss;
  const loopDelay = monitorEventLoopDelay({ resolution: 10 });
  loopDelay.enable();
  const startedAt = performance.now();

  try {
    const document = await parseDocument(filePath, { timeoutMs: 120_000 });
    await new Promise<void>((resolve) => setImmediate(resolve));
    loopDelay.disable();
    const sourceCount =
      document.blocks.length +
      document.tables.reduce(
        (count, table) => count + 1 + table.rows.reduce((cells, row) => cells + row.length, 0),
        0,
      ) +
      document.images.length;
    return {
      file: `${fixture.category}/${fixture.sample}/${fixture.manifest.input}`,
      format: document.fileType,
      size: document.size,
      success: true,
      text: document.rawText ? '是' : '否',
      tables: document.tables.length,
      images: document.images.length,
      sourceLocation: sourceCount > 0,
      durationMs: Math.round(performance.now() - startedAt),
      eventLoopDelayMaxMs: Number((loopDelay.max / 1_000_000).toFixed(2)),
      rssDeltaMb: Number(((process.memoryUsage().rss - beforeRss) / 1024 / 1024).toFixed(2)),
      warningOrError: document.warnings.map((warning) => warning.code).join(', ') || '-',
      excerpt: document.rawText.slice(0, 160).replace(/\s+/g, ' '),
    };
  } catch (error) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    loopDelay.disable();
    return {
      file: `${fixture.category}/${fixture.sample}/${fixture.manifest.input}`,
      format: path.extname(filePath).slice(1),
      size: (await readFile(filePath)).byteLength,
      success: false,
      text: '否',
      tables: 0,
      images: 0,
      sourceLocation: false,
      durationMs: Math.round(performance.now() - startedAt),
      eventLoopDelayMaxMs: Number((loopDelay.max / 1_000_000).toFixed(2)),
      rssDeltaMb: Number(((process.memoryUsage().rss - beforeRss) / 1024 / 1024).toFixed(2)),
      warningOrError:
        error instanceof FileParseError ? error.code : `UNKNOWN:${String(error)}`,
      excerpt: error instanceof Error ? error.message : String(error),
    };
  }
}

const results: ValidationRow[] = [];
for (const fixture of await fixtureEntries()) {
  results.push(await validateOne(fixture));
  console.log(`${results.at(-1)?.success ? 'PASS' : 'EXPECTED/FAIL'} ${results.at(-1)?.file}`);
}

await mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, 'real-ai-001a-validation.json');
await writeFile(
  outputPath,
  `${JSON.stringify({
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    results,
  }, null, 2)}\n`,
  'utf8',
);
console.log(`Validation results: ${outputPath}`);
