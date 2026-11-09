import { spawnSync } from 'node:child_process';
import { access, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const executablePath = path.resolve('release', 'win-unpacked', '数员科技 AI数字员工.exe');
const fixtureRoot = path.resolve('src', 'real-ai', 'fixtures');
const catalogFixture = path.resolve('src', 'real-ai', 'catalog', 'fixtures', 'standard-product-catalog.xlsx');
const outputPath = path.resolve('src', 'real-ai', 'pipeline', 'tests', 'results', 'windows-packaged-e2e-r1.json');
const runRoot = path.resolve('.tmp', 'real-ai-001f-r1-smoke');

await access(executablePath);
await rm(runRoot, { recursive: true, force: true });
await mkdir(runRoot, { recursive: true });
await rm(outputPath, { force: true });

const phases = [
  { name: 'foundation', userData: 'catalog-ready' },
  { name: 'ocr-only', userData: 'catalog-ready' },
  { name: 'empty-catalog', userData: 'empty-catalog' },
  { name: 'missing-key', userData: 'missing-key' },
  { name: 'cancel', userData: 'cancel' },
];

for (const phase of phases) {
  const args = [
    '--real-ai-pipeline-smoke',
    `--pipeline-user-data=${path.join(runRoot, phase.userData)}`,
    `--pipeline-fixture-root=${fixtureRoot}`,
    `--pipeline-catalog-fixture=${catalogFixture}`,
    `--pipeline-smoke-output=${outputPath}`,
  ];
  if (phase.name !== 'foundation') args.push(`--pipeline-smoke-case=${phase.name}`);
  const result = spawnSync(executablePath, args, {
    cwd: process.cwd(), encoding: 'utf8', timeout: 1_200_000, windowsHide: true,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`R1 packaged smoke stopped at ${phase.name}.\n`);
    if (result.stderr) process.stderr.write(result.stderr);
    else if (result.stdout) process.stderr.write(result.stdout);
    process.exit(result.status || 1);
  }
  process.stdout.write(`R1 packaged smoke phase passed: ${phase.name}\n`);
}

const report = JSON.parse(await readFile(outputPath, 'utf8'));
const automatedCases = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const automatedPassed = automatedCases.every((caseId) => report.caseRecords?.[caseId]?.automatedPipelinePassed === true);
report.automatedPackagedPipelinePassed = automatedPassed;
report.passed = false;
report.pendingEvidence = automatedPassed ? ['Windows packaged UI click-level confirmation and quote handoff'] : ['One or more packaged pipeline cases failed'];
await import('node:fs/promises').then(({ writeFile }) => writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'));
if (!automatedPassed) throw new Error('REAL_AI_001F_R1_PACKAGED_PIPELINE_FAILED');
process.stdout.write(`Packaged pipeline A-H automation passed. Report: ${outputPath}\n`);
