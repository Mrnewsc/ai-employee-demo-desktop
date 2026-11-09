import assert from 'node:assert/strict';
import test from 'node:test';
import { PublicProductSearchRequestSchema } from '../schemas';

test('请求必须来自已识别产品，不能同时缺少名称和型号', () => {
  const result = PublicProductSearchRequestSchema.safeParse({
    schemaVersion: '1.0', requestId: 'r', extractedProductId: 'p', productName: null, model: null,
    specifications: {}, material: null, application: null, category: null, keywords: [], customerEvidence: [], imageReferences: [], searchReason: 'test-harness',
  });
  assert.equal(result.success, false);
});

test('图片引用保留imageId、page和缺失bbox状态', () => {
  const result = PublicProductSearchRequestSchema.parse({
    schemaVersion: '1.0', requestId: 'r', extractedProductId: 'p', productName: '浴室置物架', model: null,
    specifications: {}, material: null, application: null, category: '浴室用品', keywords: [], customerEvidence: [],
    imageReferences: [{ schemaVersion: '1.0', imageId: 'pdf-image-1', sourceFile: 'external.pdf', mimeType: 'application/octet-stream', page: 1, bbox: null, sha256: null, availableForVisualSearch: false }],
    searchReason: 'test-harness',
  });
  assert.equal(result.imageReferences[0].page, 1);
  assert.equal(result.imageReferences[0].bbox, null);
  assert.equal(result.imageReferences[0].availableForVisualSearch, false);
});

