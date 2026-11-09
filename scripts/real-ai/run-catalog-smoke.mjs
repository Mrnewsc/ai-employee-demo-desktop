import { spawnSync } from 'node:child_process';
import { access, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const modeArgument = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArgument?.slice('--mode='.length) ?? 'development';
const packaged = mode === 'packaged';
const executable = packaged
  ? path.resolve('release', 'win-unpacked', '数员科技 AI数字员工.exe')
  : path.resolve('node_modules', 'electron', 'dist', 'electron.exe');
const fixtureRoot = path.resolve('src', 'real-ai', 'catalog', 'fixtures');
const outputPath = path.resolve('src', 'real-ai', 'catalog', 'tests', 'results', `catalog-${mode}-smoke.json`);
const userDataPath = path.join(os.tmpdir(), `shuyuan-catalog-smoke-userdata-${randomUUID()}`);

await access(executable);
await rm(outputPath, { force: true });

function runPhase(phase) {
  const applicationArguments = [
    '--real-ai-catalog-smoke',
    `--catalog-smoke-phase=${phase}`,
    `--catalog-fixture-root=${fixtureRoot}`,
    `--catalog-smoke-output=${outputPath}`,
    `--catalog-user-data=${userDataPath}`,
  ];
  const args = packaged ? applicationArguments : ['electron/main.cjs', ...applicationArguments];
  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 180_000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`${result.stdout ?? ''}${result.stderr ?? ''}`);
    throw new Error(`产品库Smoke阶段${phase}失败，退出码${result.status}`);
  }
}

try {
  runPhase('1');
  runPhase('2');
  const report = JSON.parse(await readFile(outputPath, 'utf8'));
  if (!report.passed) throw new Error('产品库Smoke报告未通过');
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await rm(userDataPath, { recursive: true, force: true });
}
