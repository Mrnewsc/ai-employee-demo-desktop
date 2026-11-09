import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const outputDir = path.resolve('electron', 'real-ai', 'workers');
await mkdir(outputDir, { recursive: true });

await build({
  entryPoints: [path.resolve('src', 'real-ai', 'workers', 'parser-worker.ts')],
  outfile: path.join(outputDir, 'parser-worker.mjs'),
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
});
