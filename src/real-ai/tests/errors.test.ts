/// <reference types="node" />

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { FileParseError, parseDocument } from '../parsers';
import { withTimeout } from '../parsers/utils';

interface ErrorManifest {
  input: string;
  expected: { errorCode: string };
}

const errorRoot = path.resolve('src', 'real-ai', 'fixtures', 'errors');

async function errorManifests() {
  const entries = await readdir(errorRoot, { withFileTypes: true });
  const manifests = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(errorRoot, entry.name);
    const manifest = JSON.parse(
      await readFile(path.join(dir, 'expected.json'), 'utf8'),
    ) as ErrorManifest;
    if ('errorCode' in manifest.expected) manifests.push({ dir, manifest });
  }
  return manifests;
}

test('损坏、空文件、类型冲突、密码PDF返回明确错误码', async () => {
  for (const { dir, manifest } of await errorManifests()) {
    await assert.rejects(
      parseDocument(path.join(dir, manifest.input), { timeoutMs: 30_000 }),
      (error: unknown) => {
        assert.ok(error instanceof FileParseError);
        assert.equal(error.code, manifest.expected.errorCode);
        assert.ok(error.message.length > 0);
        return true;
      },
    );
  }
});

test('文件大小限制返回FILE_TOO_LARGE', async () => {
  const filePath = path.resolve(
    'src',
    'real-ai',
    'fixtures',
    'pdf',
    'native-text',
    'input.pdf',
  );
  await assert.rejects(
    parseDocument(filePath, { maxFileSizeBytes: 10 }),
    (error: unknown) => error instanceof FileParseError && error.code === 'FILE_TOO_LARGE',
  );
});

test('超时工具返回PARSE_TIMEOUT', async () => {
  await assert.rejects(
    withTimeout(new Promise((resolve) => setTimeout(resolve, 50)), 5, '测试任务'),
    (error: unknown) => error instanceof FileParseError && error.code === 'PARSE_TIMEOUT',
  );
});
