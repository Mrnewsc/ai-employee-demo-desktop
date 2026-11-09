/// <reference types="node" />

import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { parseDocument } from '../../parsers';
import { ProductExtractionService } from '../extraction-service';
import type { ExtractionInput, ProviderWireProductDraft } from '../contracts';
import { MockProductExtractionProvider } from '../providers/mock-product-extraction-provider';

const fixtures = path.resolve('src', 'real-ai', 'fixtures');

for (const fixture of [
  ['pdf/native-text/input.pdf', 'SP-3000'],
  ['excel/normal-products/input.xlsx', 'SP-3000'],
  ['docx/structured-content/input.docx', 'SP-3000'],
] as const) {
  test(`001A真实ParsedDocument进入001C：${fixture[0]}`, async () => {
    const document = await parseDocument(path.join(fixtures, fixture[0]), { enableOcr: false, timeoutMs: 30_000 });
    const provider = new MockProductExtractionProvider((input) => responseFor(input, '自动喷涂设备', fixture[1]));
    const result = await new ProductExtractionService(provider).extract([document]);
    assert.equal(result.products[0]?.model, fixture[1]);
    assert.ok(result.products[0]?.evidence.some((evidence) => evidence.sourceFile === document.fileName));
  });
}

function responseFor(input: ExtractionInput, productName: string, model: string) {
  const nameEvidence = input.evidenceItems.find((item) => item.text.includes(productName));
  const modelEvidence = input.evidenceItems.find((item) => item.text.includes(model));
  const products: ProviderWireProductDraft[] = [];
  if (nameEvidence && modelEvidence) {
    products.push({
      productName, model, specifications: {},
      quantity: { value: null, unit: null, raw: null },
      material: null, process: null, application: null, notes: [],
      evidenceRefs: {
        productName: [{ evidenceId: nameEvidence.evidenceId, quote: productName }],
        model: [{ evidenceId: modelEvidence.evidenceId, quote: model }],
      },
    });
  }
  return { schemaVersion: '1.0' as const, products };
}
