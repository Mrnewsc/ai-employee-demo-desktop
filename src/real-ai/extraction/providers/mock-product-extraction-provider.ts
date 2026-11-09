import { materializeProviderPayload } from '../materializer';
import type {
  ExtractionInput,
  ExtractionOptions,
  ProductExtractionProvider,
  ProductExtractionResult,
  ProviderExtractionPayload,
} from '../contracts';
import { ProductExtractionError } from '../errors';
import { parseProviderPayload } from '../provider-utils';

export type MockExtractionResponder = (
  input: ExtractionInput,
  callIndex: number,
) => ProviderExtractionPayload | string | Error | Promise<ProviderExtractionPayload | string | Error>;

export class MockProductExtractionProvider implements ProductExtractionProvider {
  readonly provider = 'mock';
  readonly model: string;
  private callIndex = 0;

  constructor(
    private readonly responder: MockExtractionResponder = () => ({ schemaVersion: '1.0', products: [] }),
    model = 'mock-structured-extractor-v1',
  ) {
    this.model = model;
  }

  async extract(input: ExtractionInput, options: ExtractionOptions = {}): Promise<ProductExtractionResult> {
    if (options.signal?.aborted) {
      throw new ProductExtractionError('AI_EXTRACTION_CANCELLED', 'AI结构化提取已取消');
    }
    const startedAt = performance.now();
    const response = await this.responder(input, this.callIndex++);
    if (response instanceof Error) throw response;
    if (options.signal?.aborted) {
      throw new ProductExtractionError('AI_EXTRACTION_CANCELLED', 'AI结构化提取已取消');
    }
    const serialized = typeof response === 'string' ? response : JSON.stringify(response);
    if (!serialized.trim()) throw new ProductExtractionError('AI_EMPTY_RESPONSE', 'Mock Provider返回空响应');
    const payload = parseProviderPayload(serialized);
    options.onValidatedPayload?.({
      jobId: input.jobId,
      chunkId: input.chunkId,
      repaired: false,
      payload: structuredClone(payload),
    });
    return materializeProviderPayload(input, payload, {
      provider: this.provider,
      model: this.model,
      repaired: false,
      durationMs: Math.round(performance.now() - startedAt),
      outputCharacters: serialized.length,
    });
  }
}
