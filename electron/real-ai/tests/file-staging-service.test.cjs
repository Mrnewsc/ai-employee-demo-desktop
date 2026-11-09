const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { FileStagingService } = require('../file-staging-service.cjs');

const fixtures = path.resolve('src', 'real-ai', 'fixtures');

test('文件暂存返回Token且不向调用方暴露路径', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'real-ai-stage-test-'));
  const service = new FileStagingService({ stagingRoot: root });
  await service.initialize();
  context.after(async () => fs.rm(root, { recursive: true, force: true }));

  const [token] = await service.stagePathEntries([{
    sourcePath: path.join(fixtures, 'docx', 'structured-content', 'input.docx'),
    displayName: '客户产品清单.docx',
    declaredMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }]);
  assert.match(token.fileId, /^file_[a-f0-9-]+$/);
  assert.equal(token.detectedType, 'docx');
  assert.equal('stagedPath' in token, false);
  assert.equal(JSON.stringify(token).includes(fixtures), false);

  const descriptor = service.getDescriptor(token.fileId);
  await fs.access(descriptor.stagedPath);
  await service.cleanup([token.fileId]);
  await assert.rejects(fs.access(descriptor.stagedPath));
});

test('文件暂存拒绝签名不匹配和损坏Office结构', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'real-ai-stage-errors-'));
  const service = new FileStagingService({ stagingRoot: root });
  await service.initialize();
  context.after(async () => fs.rm(root, { recursive: true, force: true }));

  await assert.rejects(
    service.stagePathEntries([{
      sourcePath: path.join(fixtures, 'errors', 'type-mismatch', 'input.pdf'),
      displayName: '伪装文件.pdf',
      declaredMimeType: 'application/pdf',
    }]),
    (error) => error.code === 'FILE_SIGNATURE_MISMATCH',
  );
  await assert.rejects(
    service.stagePathEntries([{
      sourcePath: path.join(fixtures, 'errors', 'corrupted-docx', 'input.docx'),
      displayName: '损坏文档.docx',
      declaredMimeType: '',
    }]),
    (error) => error.code === 'FILE_CORRUPTED',
  );
});
