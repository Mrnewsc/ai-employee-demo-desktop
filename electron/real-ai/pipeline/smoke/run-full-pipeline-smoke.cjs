const fs = require('node:fs/promises');
const path = require('node:path');
const { ProductCatalogService } = require('../../catalog/runtime/catalog-runtime.cjs');

async function stage(runtime, filePaths) {
  return runtime.stagingService.stagePathEntries(filePaths.map((sourcePath) => ({
    sourcePath,
    displayName: path.basename(sourcePath),
    declaredMimeType: '',
  })));
}

async function readReport(outputPath, packaged, appVersion) {
  try {
    return JSON.parse(await fs.readFile(outputPath, 'utf8'));
  } catch {
    return {
      schemaVersion: '1.0', reportId: 'REAL-AI-001F-R1', appVersion,
      packaged, passed: false, executedAt: new Date().toISOString(),
      cases: {}, caseRecords: {}, statusHistory: [], catalog: null,
    };
  }
}

async function writeReport(outputPath, report) {
  report.executedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function safeDiagnostics(result) {
  return result.diagnostics ?? null;
}

function evidenceSources(product) {
  return [...new Set((product?.evidence ?? []).map((item) => `${item.sourceFile}:${item.source.kind}`))];
}

function caseRecord({ caseId, appVersion, packaged, customerId, inputFixtures, startedAt, result, failedStep = null, humanDecisionSummary = 'not-executed-cli', quoteDraftCreated = false, extra = {} }) {
  const completedAt = new Date().toISOString();
  return {
    caseId, appVersion, packaged, customerId,
    inputFixtures: inputFixtures.map((filePath) => path.basename(filePath)),
    startedAt, completedAt, result: result.status,
    failedStep, errorCode: result.error?.code ?? null,
    extractedProducts: result.extractedProducts.map((product) => ({
      id: product.id, productName: product.productName, model: product.model,
      needsHumanReview: product.needsHumanReview,
      evidenceSourceCount: evidenceSources(product).length,
    })),
    matchSummary: result.matchGroups.map((group) => ({
      extractedProductId: group.extractedProductId,
      candidateProductId: group.results[0]?.candidateProductId ?? null,
      candidateModel: group.results[0]?.candidateProductSnapshot?.model ?? null,
      level: group.results[0]?.level ?? null,
      needsHumanReview: group.results[0]?.needsHumanReview ?? null,
      recallBasis: group.results[0]?.matchedRules?.map((rule) => rule.description) ?? [],
      conflicts: group.results[0]?.conflictingRules?.map((rule) => rule.description) ?? [],
    })),
    humanDecisionSummary, quoteDraftCreated,
    evidenceSourceCount: result.extractedProducts.reduce((sum, product) => sum + evidenceSources(product).length, 0),
    diagnostics: safeDiagnostics(result),
    ...extra,
  };
}

function archiveCaseRecord(report, caseId) {
  const previous = report.caseRecords?.[caseId];
  if (!previous) return;
  report.caseHistory ??= {};
  report.caseHistory[caseId] ??= [];
  report.caseHistory[caseId].push(previous);
}

async function runJob(runtime, customerId, filePaths, history, prefix = '') {
  const tokens = await stage(runtime, filePaths);
  const listener = (snapshot) => {
    const value = `${prefix}${snapshot.status}`;
    if (!history.includes(value)) history.push(value);
  };
  runtime.pipelineManager.on('progress', listener);
  try {
    const startedAt = new Date().toISOString();
    const started = runtime.pipelineManager.start({ customerId, fileIds: tokens.map((token) => token.fileId) });
    const result = await runtime.pipelineManager.waitForTerminal(started.jobId, 900_000);
    return { result, startedAt };
  } finally {
    runtime.pipelineManager.off('progress', listener);
  }
}

async function ensureCatalog(runtime, catalogFixture, report) {
  const existing = await runtime.productRepository.getVersionInfo();
  if (existing.currentVersion && existing.productCount) {
    report.catalog = { importedProducts: existing.productCount, version: existing.currentVersion };
    return;
  }
  const catalogService = new ProductCatalogService(runtime.productRepository, runtime.stagingService, 'real-ai-001f-r1-smoke');
  await catalogService.initialize();
  const [catalogToken] = await stage(runtime, [catalogFixture]);
  const preview = await catalogService.previewImport(catalogToken.fileId);
  const committed = await catalogService.confirmImport(preview.importId);
  report.catalog = { importedProducts: preview.previewRecords.length, version: committed.version.currentVersion };
}

async function runFullPipelineSmoke({ runtime, fixtureRoot, catalogFixture, outputPath, packaged, appVersion = 'unknown' }) {
  const report = await readReport(outputPath, packaged, appVersion);
  await ensureCatalog(runtime, catalogFixture, report);

  let caseAPassed = report.caseRecords.A?.automatedPipelinePassed === true;
  if (!caseAPassed) {
    const caseAFiles = [path.join(fixtureRoot, 'pdf', 'native-text', 'input.pdf')];
    const caseAExecution = await runJob(runtime, 'customer-jinhua-001', caseAFiles, report.statusHistory, 'A:');
    const caseAProduct = caseAExecution.result.extractedProducts.find((product) => product.model === 'SP-3000');
    const caseAGroup = caseAProduct ? caseAExecution.result.matchGroups.find((group) => group.extractedProductId === caseAProduct.id) : null;
    caseAPassed = Boolean(caseAExecution.result.status === 'completed' && caseAProduct && caseAGroup?.results[0]?.level === 'exact' && evidenceSources(caseAProduct).some((source) => source.includes('.pdf:')));
    report.caseRecords.A = caseRecord({ caseId: 'A', appVersion, packaged, customerId: 'customer-jinhua-001', inputFixtures: caseAFiles, startedAt: caseAExecution.startedAt, result: caseAExecution.result, failedStep: caseAPassed ? null : 'pdf-extract-match', extra: { automatedPipelinePassed: caseAPassed } });
  }

  let caseCPassed = report.caseRecords.C?.automatedPipelinePassed === true;
  let caseDPassed = report.caseRecords.D?.automatedPipelinePassed === true;
  if (!caseCPassed || !caseDPassed) {
    const pipelineFixtureRoot = path.join(path.dirname(fixtureRoot), 'pipeline', 'fixtures');
    const multiFiles = ['case-c-exact.xlsx', 'case-c-conflict.xlsx', 'case-c-none.xlsx'].map((fileName) => path.join(pipelineFixtureRoot, fileName));
    const multiExecution = await runJob(runtime, 'customer-jinhua-001', multiFiles, report.statusHistory, 'C-D:');
    const levels = multiExecution.result.matchGroups.map((group) => group.results[0]?.level);
    const hardConflict = multiExecution.result.matchGroups.some((group) => group.results[0]?.conflictingRules?.some((rule) => rule.dimension === 'specification') && group.results[0]?.level !== 'exact' && group.results[0]?.needsHumanReview);
    caseCPassed = Boolean(multiExecution.result.status === 'completed' && levels.some((level) => level === 'exact' || level === 'high') && levels.some((level) => ['medium', 'low'].includes(level)) && levels.includes('none'));
    caseDPassed = Boolean(multiExecution.result.status === 'completed' && hardConflict);
    report.caseRecords.C = caseRecord({ caseId: 'C', appVersion, packaged, customerId: 'customer-jinhua-001', inputFixtures: multiFiles, startedAt: multiExecution.startedAt, result: multiExecution.result, failedStep: caseCPassed ? null : 'multi-product-match-distribution', extra: { automatedPipelinePassed: caseCPassed } });
    report.caseRecords.D = caseRecord({ caseId: 'D', appVersion, packaged, customerId: 'customer-jinhua-001', inputFixtures: multiFiles, startedAt: multiExecution.startedAt, result: multiExecution.result, failedStep: caseDPassed ? null : 'hard-spec-conflict', extra: { automatedPipelinePassed: caseDPassed } });
  }

  let caseHPassed = report.caseRecords.H?.automatedPipelinePassed === true;
  if (!caseHPassed) {
    const crossFileFiles = [
      path.join(fixtureRoot, 'pdf', 'native-text', 'input.pdf'),
      path.join(path.dirname(fixtureRoot), 'pipeline', 'fixtures', 'case-h-same-product.xlsx'),
    ];
    const crossFileExecution = await runJob(runtime, 'customer-jinhua-001', crossFileFiles, report.statusHistory, 'H:');
    const crossFileProduct = crossFileExecution.result.extractedProducts.find((product) => {
      const sources = evidenceSources(product);
      return sources.some((source) => source.includes('.pdf:')) && sources.some((source) => source.includes('.xlsx:'));
    });
    caseHPassed = Boolean(crossFileExecution.result.status === 'completed' && crossFileExecution.result.extractedProducts.length === 1 && crossFileProduct && evidenceSources(crossFileProduct).length >= 2);
    report.caseRecords.H = caseRecord({ caseId: 'H', appVersion, packaged, customerId: 'customer-jinhua-001', inputFixtures: crossFileFiles, startedAt: crossFileExecution.startedAt, result: crossFileExecution.result, failedStep: caseHPassed ? null : 'cross-file-evidence', extra: { automatedPipelinePassed: caseHPassed, mergedProductId: crossFileProduct?.id ?? null, evidenceSources: evidenceSources(crossFileProduct) } });
  }
  report.cases.foundation = { caseA: caseAPassed, caseC: caseCPassed, caseD: caseDPassed, caseH: caseHPassed };
  report.passed = false;
  await writeReport(outputPath, report);
  if (![caseAPassed, caseCPassed, caseDPassed, caseHPassed].every(Boolean)) throw new Error('REAL_AI_001F_R1_FOUNDATION_SMOKE_FAILED');
  return report;
}

async function runOcrOnlySmoke({ runtime, fixtureRoot, catalogFixture, outputPath, packaged, appVersion = 'unknown' }) {
  const report = await readReport(outputPath, packaged, appVersion);
  archiveCaseRecord(report, 'B');
  await ensureCatalog(runtime, catalogFixture, report);
  const files = [path.join(fixtureRoot, 'images', 'product-list', 'input.png')];
  const execution = await runJob(runtime, 'customer-jinhua-001', files, report.statusHistory, 'B:');
  const product = execution.result.extractedProducts.find((entry) => entry.model === '9P-3000');
  const group = product ? execution.result.matchGroups.find((entry) => entry.extractedProductId === product.id) : null;
  const result = group?.results[0];
  const hasOcrEvidence = Boolean(product?.evidence.some((item) => item.sourceFile.endsWith('.png') && item.originKind === 'ocr'));
  const recallBasis = result?.matchedRules?.map((rule) => `${rule.dimension}:${rule.description}`) ?? [];
  const illegalModelGuess = recallBasis.some((value) => value.includes('9P-3000') && value.includes('SP-3000')) || result?.level === 'exact';
  const passed = Boolean(
    execution.result.status === 'completed' && product?.model === '9P-3000' && product.needsHumanReview
    && hasOcrEvidence && result?.candidateProductSnapshot?.model === 'SP-3000'
    && ['medium', 'low'].includes(result.level) && result.needsHumanReview && !illegalModelGuess,
  );
  report.caseRecords.B = caseRecord({
    caseId: 'B', appVersion, packaged, customerId: 'customer-jinhua-001', inputFixtures: files,
    startedAt: execution.startedAt, result: execution.result, failedStep: passed ? null : 'ocr-extract-candidate-recall',
    extra: { automatedPipelinePassed: passed, originalModel: product?.model ?? null, candidateModel: result?.candidateProductSnapshot?.model ?? null, candidateLevel: result?.level ?? null, candidateRecallBasis: recallBasis, illegalModelGuess },
  });
  report.cases.ocr = { passed, originalModel: product?.model ?? null, candidateModel: result?.candidateProductSnapshot?.model ?? null, level: result?.level ?? null, evidence: hasOcrEvidence, needsHumanReview: product?.needsHumanReview ?? null };
  report.passed = false;
  await writeReport(outputPath, report);
  if (!passed) throw new Error('REAL_AI_001F_R1_OCR_SMOKE_FAILED');
  return report;
}

async function runNoCatalogSmoke({ runtime, fixtureRoot, outputPath, packaged, appVersion = 'unknown' }) {
  const report = await readReport(outputPath, packaged, appVersion);
  const files = [path.join(fixtureRoot, 'pdf', 'native-text', 'input.pdf')];
  const execution = await runJob(runtime, 'customer-jinhua-001', files, report.statusHistory, 'E:');
  const passed = execution.result.status === 'catalog-required'
    && execution.result.extractedProducts.length > 0
    && execution.result.matchGroups.length === 0
    && execution.result.error?.code === 'CATALOG_NOT_CONFIGURED';
  report.caseRecords.E = caseRecord({
    caseId: 'E', appVersion, packaged, customerId: 'customer-jinhua-001', inputFixtures: files,
    startedAt: execution.startedAt, result: execution.result, failedStep: passed ? null : 'empty-catalog-boundary',
    extra: { automatedPipelinePassed: passed, demoCandidateInjected: execution.result.matchGroups.length > 0 },
  });
  report.cases.emptyCatalog = { passed, extractedProducts: execution.result.extractedProducts.length, matchGroups: execution.result.matchGroups.length };
  report.passed = false;
  await writeReport(outputPath, report);
  if (!passed) throw new Error('REAL_AI_001F_R1_EMPTY_CATALOG_SMOKE_FAILED');
  return report;
}

async function runNoKeySmoke({ runtime, fixtureRoot, outputPath, packaged, appVersion = 'unknown' }) {
  const report = await readReport(outputPath, packaged, appVersion);
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalModel = process.env.DEEPSEEK_MODEL;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_MODEL;
  try {
    const files = [path.join(fixtureRoot, 'pdf', 'native-text', 'input.pdf')];
    const execution = await runJob(runtime, 'customer-jinhua-001', files, report.statusHistory, 'F:');
    const passed = execution.result.status === 'failed'
      && execution.result.error?.code === 'AI_NOT_CONFIGURED'
      && execution.result.extractedProducts.length === 0
      && execution.result.matchGroups.length === 0;
    report.caseRecords.F = caseRecord({
      caseId: 'F', appVersion, packaged, customerId: 'customer-jinhua-001', inputFixtures: files,
      startedAt: execution.startedAt, result: execution.result, failedStep: passed ? null : 'missing-provider-config',
      extra: { automatedPipelinePassed: passed, demoResultInjected: execution.result.extractedProducts.length > 0 || execution.result.matchGroups.length > 0 },
    });
    report.cases.missingKey = { passed, errorCode: execution.result.error?.code ?? null };
    report.passed = false;
    await writeReport(outputPath, report);
    if (!passed) throw new Error('REAL_AI_001F_R1_NO_KEY_SMOKE_FAILED');
    return report;
  } finally {
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.DEEPSEEK_MODEL; else process.env.DEEPSEEK_MODEL = originalModel;
  }
}

async function runCancelledJob(runtime, customerId, filePath, targetStatus, history) {
  const [token] = await stage(runtime, [filePath]);
  let cancelRequested = false;
  const startedAt = new Date().toISOString();
  const started = runtime.pipelineManager.start({ customerId, fileIds: [token.fileId] });
  const listener = (snapshot) => {
    if (snapshot.jobId !== started.jobId) return;
    const value = `G-${targetStatus}:${snapshot.status}`;
    if (!history.includes(value)) history.push(value);
    if (snapshot.status === targetStatus && !cancelRequested) {
      cancelRequested = true;
      void runtime.pipelineManager.cancel({ jobId: started.jobId });
    }
  };
  runtime.pipelineManager.on('progress', listener);
  try {
    const result = await runtime.pipelineManager.waitForTerminal(started.jobId, 900_000);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const stable = runtime.pipelineManager.status({ jobId: started.jobId });
    return { result, stable, startedAt, cancelRequested };
  } finally {
    runtime.pipelineManager.off('progress', listener);
  }
}

async function runCancellationSmoke({ runtime, fixtureRoot, outputPath, packaged, appVersion = 'unknown' }) {
  const report = await readReport(outputPath, packaged, appVersion);
  const ocrFile = path.join(fixtureRoot, 'images', 'product-list', 'input.png');
  const pdfFile = path.join(fixtureRoot, 'pdf', 'native-text', 'input.pdf');
  const parsing = await runCancelledJob(runtime, 'customer-jinhua-001', ocrFile, 'ocr', report.statusHistory);
  const extracting = await runCancelledJob(runtime, 'customer-jinhua-001', pdfFile, 'extracting', report.statusHistory);
  const parsingPassed = parsing.cancelRequested && parsing.result.status === 'cancelled' && parsing.stable.status === 'cancelled' && parsing.stable.matchGroups.length === 0;
  const extractingPassed = extracting.cancelRequested && extracting.result.status === 'cancelled' && extracting.stable.status === 'cancelled' && extracting.stable.matchGroups.length === 0;
  const passed = parsingPassed && extractingPassed;
  report.caseRecords.G = {
    caseId: 'G', appVersion, packaged, customerId: 'customer-jinhua-001',
    inputFixtures: [path.basename(ocrFile), path.basename(pdfFile)],
    startedAt: parsing.startedAt, completedAt: new Date().toISOString(), result: passed ? 'cancelled-stable' : 'failed',
    failedStep: passed ? null : 'cancel-late-write-protection', errorCode: passed ? null : 'CANCEL_ASSERTION_FAILED',
    extractedProducts: [], matchSummary: [], humanDecisionSummary: 'not-applicable', quoteDraftCreated: false, evidenceSourceCount: 0,
    automatedPipelinePassed: passed,
    parsingCancel: { requested: parsing.cancelRequested, terminal: parsing.result.status, stableAfterDelay: parsing.stable.status, diagnostics: parsing.stable.diagnostics },
    extractingCancel: { requested: extracting.cancelRequested, terminal: extracting.result.status, stableAfterDelay: extracting.stable.status, diagnostics: extracting.stable.diagnostics },
  };
  report.cases.cancel = { passed, parsing: parsingPassed, extracting: extractingPassed };
  report.passed = false;
  await writeReport(outputPath, report);
  if (!passed) throw new Error('REAL_AI_001F_R1_CANCEL_SMOKE_FAILED');
  return report;
}

module.exports = { runFullPipelineSmoke, runOcrOnlySmoke, runNoCatalogSmoke, runNoKeySmoke, runCancellationSmoke };
