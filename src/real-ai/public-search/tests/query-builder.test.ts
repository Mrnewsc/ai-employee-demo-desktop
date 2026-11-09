import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublicProductSearchRequest } from '../contracts';
import { QueryBuilder } from '../query-builder';

const request: PublicProductSearchRequest = {
  schemaVersion: '1.0',
  requestId: 'request-1',
  extractedProductId: 'product-1',
  productName: '车载手机支架',
  model: null,
  specifications: { color: '黑色' },
  material: 'ABS塑料 + 硅胶',
  application: '汽车内使用',
  category: '汽车配件',
  keywords: ['car phone holder'],
  customerEvidence: [],
  imageReferences: [],
  searchReason: 'test-harness',
};

test('QueryBuilder只使用输入字段且不创造型号', () => {
  const queries = new QueryBuilder().build(request);
  assert.ok(queries.length >= 3);
  assert.equal(queries.some((query) => query.sourceFields.includes('model')), false);
  assert.equal(queries.some((query) => query.text.includes('SP-3000')), false);
  assert.ok(queries.some((query) => query.text.includes('ABS塑料 + 硅胶')));
  assert.ok(queries.some((query) => query.text.includes('car phone holder')));
});

