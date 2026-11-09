import { access, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DeepSeekProductExtractionProvider,
  ProductExtractionService,
  deepSeekConfigFromEnvironment,
} from '../../src/real-ai/extraction';
import type { ExtractionJobOutcome } from '../../src/real-ai/extraction';
import { parseDocument } from '../../src/real-ai/parsers';

const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...value] = argument.split('=');
  return [key, value.join('=')];
}));
const pdfArgument = args.get('--pdf');
if (!pdfArgument) throw new Error('MISSING_EXTERNAL_PDF');
if (args.get('--confirm-ai-cost') !== 'true') throw new Error('AI_COST_NOT_CONFIRMED');
const pdfPath = path.resolve(pdfArgument);
await access(pdfPath);

const repositoryRoot = path.resolve('.');
const outputPath = path.resolve(args.get('--output') || path.join(
  os.tmpdir(),
  'shuyuan-real-ai-r3',
  `large-document-extraction-${Date.now()}.json`,
));
if (isInside(pdfPath, repositoryRoot)) throw new Error('CUSTOMER_PDF_MUST_REMAIN_OUTSIDE_REPOSITORY');
if (isInside(outputPath, repositoryRoot)) throw new Error('CUSTOMER_AUDIT_MUST_REMAIN_OUTSIDE_REPOSITORY');

const parsed = await parseDocument(pdfPath, {
  maxFileSizeBytes: 100 * 1024 * 1024,
  timeoutMs: 15 * 60_000,
  enableOcr: true,
});
const baseConfig = deepSeekConfigFromEnvironment(process.env);
const provider = new DeepSeekProductExtractionProvider({
  ...baseConfig,
  maxOutputTokens: Math.max(baseConfig.maxOutputTokens, 6_000),
});
const job = new ProductExtractionService(provider).createJob([parsed], {
  jobId: `real_ai_001c_r3_${Date.now().toString(36)}`,
  optionalContext: { sampleId: 'real-ai-001c-r3-large-document' },
  chunkConfig: { maxChunksPerDocument: 40, maxConcurrentRequests: 2 },
  executionConfig: {
    maxConcurrentExtractionRequests: 2,
    maxProviderRetries: 1,
    providerRetryDelayMs: 1_000,
  },
});

const initial = await job.run();
await saveReport(outputPath, parsed.fileName, parsed.metadata.pageCount ?? null, initial, null);

let final = initial;
if ((initial.status === 'partial-failed' || initial.status === 'failed') && args.get('--retry-failed') === 'true') {
  final = await job.retryFailedChunks();
  await saveReport(outputPath, parsed.fileName, parsed.metadata.pageCount ?? null, final, initial);
}

console.log(JSON.stringify({
  reportPath: outputPath,
  fileName: path.basename(parsed.fileName),
  status: final.status,
  totalChunks: final.audit.totalChunks,
  completedChunks: final.audit.completedChunks,
  failedChunks: final.audit.failedChunks,
  providerRequestCount: final.audit.providerRequestCount,
  peakConcurrency: final.audit.peakConcurrency,
  retriedChunks: final.audit.retriedChunks,
  failedChunkIds: final.audit.failedChunkIds,
  productCount: final.result?.products.length ?? null,
}));

if (final.status !== 'completed') process.exitCode = 2;

async function saveReport(
  target: string,
  fileName: string,
  pageCount: number | null,
  outcome: ExtractionJobOutcome,
  initial: ExtractionJobOutcome | null,
) {
  const report = {
    schemaVersion: '1.0',
    scope: 'REAL-AI-001C-R3-large-document-extraction',
    executedAt: new Date().toISOString(),
    input: {
      fileName: path.basename(fileName),
      pageCount,
      sourceOutsideRepository: true,
    },
    initialStatus: initial ? safeOutcome(initial) : safeOutcome(outcome),
    finalStatus: safeOutcome(outcome),
    audit: outcome.audit,
    privacy: {
      apiKeyRecorded: false,
      promptRecorded: false,
      messagesRecorded: false,
      providerBodyRecorded: false,
      customerRawTextRecorded: false,
    },
  };
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function safeOutcome(outcome: ExtractionJobOutcome) {
  return {
    status: outcome.status,
    successfulChunkCount: outcome.successfulChunkCount,
    failedChunkCount: outcome.failedChunkCount,
    failedChunkIds: outcome.failedChunkIds,
    productCount: outcome.result?.products.length ?? null,
  };
}

function isInside(target: string, root: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
