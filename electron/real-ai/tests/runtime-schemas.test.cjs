const assert = require('node:assert/strict');
const test = require('node:test');
const {
  AnalysisJobSnapshotSchema,
  JobIdRequestSchema,
  ParsedDocumentSchema,
  validate,
} = require('../runtime-schemas.cjs');

test('运行时Schema拒绝路径穿越式jobId', () => {
  assert.throws(
    () => validate(JobIdRequestSchema, { jobId: '../../client.pdf' }, '任务ID'),
    (error) => error.code === 'INVALID_REQUEST',
  );
});

test('ParsedDocument保留OCR原文、置信度、bbox和warning', () => {
  const document = validate(ParsedDocumentSchema, {
    schemaVersion: '1.0',
    fileId: 'file_123456789abc',
    fileName: '铭牌.png',
    fileType: 'image',
    mimeType: 'image/png',
    size: 128,
    sha256: 'a'.repeat(64),
    rawText: '9P-3000',
    blocks: [{
      schemaVersion: '1.0',
      id: 'line-1',
      type: 'ocr-line',
      text: '9P-3000',
      confidence: 0.61,
      source: { schemaVersion: '1.0', kind: 'image', imageId: 'image-1', bbox: [1, 2, 30, 12] },
    }],
    tables: [],
    images: [{
      schemaVersion: '1.0',
      id: 'image-1',
      mimeType: 'image/png',
      role: 'source-image',
      source: { schemaVersion: '1.0', kind: 'image', imageId: 'image-1' },
      ocrText: '9P-3000',
      ocrConfidence: 0.61,
    }],
    metadata: { schemaVersion: '1.0', parser: 'test', parseDurationMs: 1 },
    warnings: [{
      schemaVersion: '1.0',
      code: 'ocr_character_ambiguity',
      message: '型号字符需要人工核验',
      severity: 'warning',
    }],
  }, 'OCR结果');
  assert.equal(document.rawText, '9P-3000');
  assert.equal(document.images[0].ocrConfidence, 0.61);
  assert.deepEqual(document.blocks[0].source.bbox, [1, 2, 30, 12]);
  assert.equal(document.warnings[0].code, 'ocr_character_ambiguity');
});

test('AnalysisJob不允许Worker返回任意状态', () => {
  const result = AnalysisJobSnapshotSchema.safeParse({
    schemaVersion: '1.0',
    jobId: 'job_123456789abc',
    fileIds: ['file_123456789abc'],
    status: 'executing-shell',
  });
  assert.equal(result.success, false);
});
