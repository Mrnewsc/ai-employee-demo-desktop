import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublicProductSearchRequest, PublicSearchQuery } from '../contracts';
import { SoWebSearchProvider } from '../providers/so-web-search-provider';

const request: PublicProductSearchRequest = {
  schemaVersion: '1.0', requestId: 'r', extractedProductId: 'p', productName: '车载手机支架', model: null,
  specifications: {}, material: 'ABS 硅胶', application: '汽车内使用', category: '汽车用品', keywords: [],
  customerEvidence: [], imageReferences: [], searchReason: 'test-harness',
};
const query: PublicSearchQuery = { schemaVersion: '1.0', queryId: 'q', text: '车载手机支架 ABS 硅胶', sourceFields: ['productName', 'material'] };

const html = `<!doctype html><html><body><ul class="result">
  <li class="res-list">
    <h3 class="res-title"><a href="https://e.so.com/redirect" data-mdurl="https://detail.1688.com/offer/674805668692.html">YESIDO硅胶+ABS电动车手机导航支架 车载便携式自行车手机支架-阿里巴巴</a></h3>
    <p class="item">价格：￥35.10</p>
    <p class="detail">公开索引摘要：ABS硅胶车载手机支架</p>
    <img src="https://so.360tres.com/product.jpg">
  </li>
</ul></body></html>`;

test('360公开索引保留真实目标URL和独立索引证据URL', async () => {
  const provider = new SoWebSearchProvider({
    fetch: async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }),
    now: () => new Date('2026-08-10T00:00:00.000Z'),
  });
  const result = await provider.search(request, query);
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].url, 'https://detail.1688.com/offer/674805668692.html');
  assert.equal(result.candidates[0].priceText, '¥35.10');
  assert.equal(result.candidates[0].sourceEvidence[0].evidenceType, 'search-result');
  assert.ok(result.candidates[0].sourceEvidence[0].sourceUrl.startsWith('https://www.so.com/s?'));
});

test('360公开索引被限制时返回受限状态且不生成候选', async () => {
  const provider = new SoWebSearchProvider({ fetch: async () => new Response('blocked', { status: 429 }) });
  const result = await provider.search(request, query);
  assert.equal(result.status, 'SOURCE_BLOCKED');
  assert.deepEqual(result.candidates, []);
});
