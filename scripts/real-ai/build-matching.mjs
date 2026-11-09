import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const outputDirectory = path.resolve('electron', 'real-ai', 'matching', 'runtime');
await mkdir(outputDirectory, { recursive: true });

await build({
  entryPoints: [path.resolve('src', 'real-ai', 'matching', 'index.ts')],
  outfile: path.join(outputDirectory, 'matching-runtime.cjs'),
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
});
