import { spawnSync } from 'node:child_process';
import { access, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const executablePath = path.resolve('release', 'win-unpacked', '数员科技 AI数字员工.exe');
const fixtureRoot = path.resolve('src', 'real-ai', 'fixtures');
const outputPath = path.resolve('src', 'real-ai', 'tests', 'results', 'electron-packaged-smoke.json');

await access(executablePath);
await rm(outputPath, { force: true });

const result = spawnSync(executablePath, [
  '--real-ai-smoke',
  `--fixture-root=${fixtureRoot}`,
  `--smoke-output=${outputPath}`,
], {
  cwd: process.cwd(),
  encoding: 'utf8',
  timeout: 300_000,
  windowsHide: true,
});

if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || `打包版Smoke退出码：${result.status}\n`);
  process.exit(result.status || 1);
}

const report = JSON.parse(await readFile(outputPath, 'utf8'));
if (!report.passed) throw new Error('打包版Smoke报告未通过');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
