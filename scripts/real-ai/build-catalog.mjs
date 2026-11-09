import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const outputDirectory = path.resolve('electron', 'real-ai', 'catalog', 'runtime');
await mkdir(outputDirectory, { recursive: true });

await build({
  entryPoints: [path.resolve('src', 'real-ai', 'catalog', 'index.ts')],
  outfile: path.join(outputDirectory, 'catalog-runtime.cjs'),
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
});
