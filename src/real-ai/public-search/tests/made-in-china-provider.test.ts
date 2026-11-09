import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublicProductSearchRequest, PublicSearchQuery } from '../contracts';
import { MadeInChinaPublicProvider } from '../providers/made-in-china-public-provider';

const request: PublicProductSearchRequest = {
  schemaVersion: '1.0', requestId: 'r', extractedProductId: 'p', productName: 'Car Phone Holder', model: null,
  specifications: {}, material: 'ABS', application: 'car', category: 'car accessory', keywords: [],
  customerEvidence: [], imageReferences: [], searchReason: 'test-harness',
};
const query: PublicSearchQuery = { schemaVersion: '1.0', queryId: 'q', text: 'Car Phone Holder ABS', sourceFields: ['productName', 'material'] };

const publicHtml = `<!doctype html><html><body>
  <div class="products-item">
    <div class="prod-img"><img data-original="https://image.made-in-china.com/phone-holder.webp"></div>
    <div class="detail">
      <h2 class="product-name"><a href="https://supplier.en.made-in-china.com/product/ABC/Car-Phone-Holder.html" title="ABS Car Phone Holder">ABS Car Phone Holder</a></h2>
      <div class="prod-desc">ABS holder for car vent</div>
      <a class="company-name">Example Supplier</a>
    </div>
  </div>
</body></html>`;

test('公开Provider从公开页面保存真实URL、标题、图片与来源证据', async () => {
  const provider = new MadeInChinaPublicProvider({
    fetch: async () => new Response(publicHtml, { status: 200, headers: { 'content-type': 'text/html' } }),
    now: () => new Date('2026-08-10T00:00:00.000Z'),
  });
  const result = await provider.search(request, query);
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].title, 'ABS Car Phone Holder');
  assert.equal(result.candidates[0].url, 'https://supplier.en.made-in-china.com/product/ABC/Car-Phone-Holder.html');
  assert.equal(result.candidates[0].imageUrl, 'https://image.made-in-china.com/phone-holder.webp');
  assert.ok(result.candidates[0].sourceEvidence[0].sourceUrl.startsWith('https://www.made-in-china.com/products-search/'));
  assert.notEqual(result.candidates[0].sourceEvidence[0].sourceUrl, result.candidates[0].url);
});

test('登录或验证码页面只返回受限状态，不尝试绕过', async () => {
  const provider = new MadeInChinaPublicProvider({
    fetch: async () => new Response('<html><body>captcha - login required</body></html>', { status: 200 }),
  });
  const result = await provider.search(request, query);
  assert.equal(result.status, 'SOURCE_BLOCKED');
  assert.deepEqual(result.candidates, []);
});
