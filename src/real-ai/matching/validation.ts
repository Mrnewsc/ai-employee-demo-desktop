import type { ProductRepository } from '../catalog';
import { MATCHING_GOLDEN_CASES, createExtractedProduct, type MatchingGoldenCase } from './fixtures/golden-cases';
import { MatchEngine } from './match-engine';
import type { ProductMatchResult } from './contracts';

export interface GoldenCaseResult {
  id: string;
  description: string;
  expectedProductId: string | null;
  top1ProductId: string | null;
  top3ProductIds: string[];
  level: ProductMatchResult['level'];
  needsHumanReview: boolean;
  passed: boolean;
  durationMs: number;
}

export interface MatchingValidationReport {
  reportVersion: 'REAL-AI-001E-V1';
  generatedAt: string;
  catalogVersion: number | null;
  catalogProductCount: number;
  caseCount: number;
  passedCount: number;
  failedCount: number;
  top1Accuracy: number;
  top3Recall: number;
  exactPrecision: number;
  wrongMatchCount: number;
  noneCorrectCount: number;
  hardConflictBlockedCount: number;
  humanReviewRecall: number;
  p0: {
    wrongExactMatchCount: number;
    hardConflictPromotedToExact: number;
    ocrAmbiguousPromotedToExact: number;
    noneForcedToCandidate: number;
    unknownProductFabricated: number;
    silentConflictOverwrite: number;
    passed: boolean;
  };
  performance: {
    averageTotalMs: number;
    p95TotalMs: number;
    averageCandidateRetrievalMs: number;
    averageRuleMatchingMs: number;
    semanticCallCount: number;
  };
  cases: GoldenCaseResult[];
}

export async function runMatchingValidation(
  repository: ProductRepository,
  cases: MatchingGoldenCase[] = MATCHING_GOLDEN_CASES,
): Promise<MatchingValidationReport> {
  const engine = new MatchEngine({ repository, now: () => new Date('2026-08-09T08:00:00.000Z') });
  const catalog = await repository.list();
  const catalogIds = new Set(catalog.map((product) => product.productId));
  const version = await repository.getVersionInfo();
  const results: GoldenCaseResult[] = [];
  const raw: Array<{ golden: MatchingGoldenCase; output: Awaited<ReturnType<MatchEngine['match']>> }> = [];
  for (const golden of cases) {
    const output = await engine.match({ extractedProduct: createExtractedProduct(golden.id, golden.input), extractionWarnings: golden.extractionWarnings, options: golden.options });
    raw.push({ golden, output });
    const top = output.results[0];
    const top3 = output.results.slice(0, 3).map((result) => result.candidateProductId).filter((id): id is string => Boolean(id));
    const passed = top.candidateProductId === golden.expectedProductId
      && golden.expectedLevels.includes(top.level)
      && top.needsHumanReview === golden.expectedHumanReview;
    results.push({
      id: golden.id,
      description: golden.description,
      expectedProductId: golden.expectedProductId,
      top1ProductId: top.candidateProductId,
      top3ProductIds: top3,
      level: top.level,
      needsHumanReview: top.needsHumanReview,
      passed,
      durationMs: output.metrics.totalDurationMs,
    });
  }

  const candidateCases = raw.filter(({ golden }) => golden.expectedProductId !== null);
  const noneCases = raw.filter(({ golden }) => golden.expectedProductId === null);
  const expectedReview = raw.filter(({ golden }) => golden.expectedHumanReview);
  const exactPredictions = raw.filter(({ output }) => output.results[0].level === 'exact');
  const durations = raw.map(({ output }) => output.metrics.totalDurationMs).sort((left, right) => left - right);
  const p95Index = Math.min(durations.length - 1, Math.ceil(durations.length * 0.95) - 1);
  const wrongExactMatchCount = exactPredictions.filter(({ golden, output }) => output.results[0].candidateProductId !== golden.expectedProductId).length;
  const hardConflictPromotedToExact = raw.filter(({ golden, output }) => golden.id.startsWith('hard-') && output.results[0].level === 'exact').length;
  const ocrAmbiguousPromotedToExact = raw.filter(({ golden, output }) => golden.id.includes('ocr-ambiguous') && output.results[0].level === 'exact').length;
  const noneForcedToCandidate = noneCases.filter(({ output }) => output.results[0].candidateProductId !== null).length;
  const unknownProductFabricated = raw.flatMap(({ output }) => output.results).filter((result) => result.candidateProductId !== null && !catalogIds.has(result.candidateProductId)).length;
  const silentConflictOverwrite = raw.filter(({ golden, output }) => golden.id === 'source-conflict' && !output.results[0].conflictingRules.some((rule) => rule.code === 'INPUT_FIELD_CONFLICT')).length;
  const p0Values = { wrongExactMatchCount, hardConflictPromotedToExact, ocrAmbiguousPromotedToExact, noneForcedToCandidate, unknownProductFabricated, silentConflictOverwrite };
  const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100 : 0;
  return {
    reportVersion: 'REAL-AI-001E-V1',
    generatedAt: new Date().toISOString(),
    catalogVersion: version.currentVersion,
    catalogProductCount: catalog.length,
    caseCount: cases.length,
    passedCount: results.filter((result) => result.passed).length,
    failedCount: results.filter((result) => !result.passed).length,
    top1Accuracy: candidateCases.length ? candidateCases.filter(({ golden, output }) => output.results[0].candidateProductId === golden.expectedProductId).length / candidateCases.length : 1,
    top3Recall: candidateCases.length ? candidateCases.filter(({ golden, output }) => output.results.slice(0, 3).some((result) => result.candidateProductId === golden.expectedProductId)).length / candidateCases.length : 1,
    exactPrecision: exactPredictions.length ? exactPredictions.filter(({ golden, output }) => output.results[0].candidateProductId === golden.expectedProductId && golden.expectedLevels.includes('exact')).length / exactPredictions.length : 1,
    wrongMatchCount: raw.filter(({ golden, output }) => output.results[0].candidateProductId !== golden.expectedProductId).length,
    noneCorrectCount: noneCases.filter(({ output }) => output.results[0].candidateProductId === null && output.results[0].level === 'none').length,
    hardConflictBlockedCount: raw.filter(({ golden, output }) => golden.id.startsWith('hard-') && output.results[0].level !== 'exact').length,
    humanReviewRecall: expectedReview.length ? expectedReview.filter(({ output }) => output.results[0].needsHumanReview).length / expectedReview.length : 1,
    p0: { ...p0Values, passed: Object.values(p0Values).every((value) => value === 0) },
    performance: {
      averageTotalMs: average(raw.map(({ output }) => output.metrics.totalDurationMs)),
      p95TotalMs: durations[p95Index] ?? 0,
      averageCandidateRetrievalMs: average(raw.map(({ output }) => output.metrics.candidateRetrievalMs)),
      averageRuleMatchingMs: average(raw.map(({ output }) => output.metrics.deterministicMatchingMs)),
      semanticCallCount: 0,
    },
    cases: results,
  };
}
