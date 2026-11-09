/// <reference types="node" />

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { importProductCatalogExcel, JsonProductRepository } from '../../src/real-ai/catalog';
import { runMatchingValidation } from '../../src/real-ai/matching/validation';

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'real-ai-001e-validation-'));
try {
  const repository = new JsonProductRepository(path.join(temporaryRoot, 'catalog'));
  await repository.initialize();
  const fixturePath = path.resolve('src', 'real-ai', 'catalog', 'fixtures', 'standard-product-catalog.xlsx');
  const imported = await importProductCatalogExcel(fixturePath, 'standard-product-catalog.xlsx', {
    namespace: 'real-ai-001e-validation',
    now: '2026-08-09T00:00:00.000Z',
  });
  if (imported.status !== 'ready' || imported.previewRecords.length !== 24) throw new Error('001D产品库Fixture未能加载24条有效产品');
  await repository.import(imported.previewRecords, {
    importId: imported.importId,
    sourceFile: imported.sourceFile,
    importedAt: imported.createdAt,
  });
  const report = await runMatchingValidation(repository);
  const outputDirectory = path.resolve('src', 'real-ai', 'matching', 'tests', 'results');
  const outputPath = path.join(outputDirectory, 'matching-validation.json');
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    outputPath,
    cases: report.caseCount,
    passed: report.passedCount,
    failed: report.failedCount,
    top1Accuracy: report.top1Accuracy,
    top3Recall: report.top3Recall,
    exactPrecision: report.exactPrecision,
    humanReviewRecall: report.humanReviewRecall,
    p0Passed: report.p0.passed,
  }, null, 2));
  if (report.failedCount || !report.p0.passed) process.exitCode = 1;
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
