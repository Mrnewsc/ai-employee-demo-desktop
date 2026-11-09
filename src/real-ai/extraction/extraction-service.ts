import type {
  ExtractDocumentsOptions,
  ProductExtractionProvider,
  ProductExtractionResult,
} from './contracts';
import { ProductExtractionError } from './errors';
import { ProductExtractionJob } from './extraction-job';
import { ExtractionMergeService } from './merge-service';
import type { ParsedDocument } from '../types';

export class ProductExtractionService {
  constructor(
    private readonly provider: ProductExtractionProvider,
    private readonly mergeService = new ExtractionMergeService(),
  ) {}

  async extract(documents: ParsedDocument[], options: ExtractDocumentsOptions = {}): Promise<ProductExtractionResult> {
    const job = this.createJob(documents, options);
    const outcome = await job.run();
    if (outcome.status === 'completed' && outcome.result) return outcome.result;
    if (outcome.status === 'cancelled') throw cancelledError();
    throw new ProductExtractionError('AI_EXTRACTION_FAILED', '部分Chunk提取失败，未发布不完整产品结果');
  }

  createJob(documents: ParsedDocument[], options: ExtractDocumentsOptions = {}): ProductExtractionJob {
    return new ProductExtractionJob(this.provider, documents, this.mergeService, options);
  }
}

function cancelledError(): ProductExtractionError {
  return new ProductExtractionError('AI_EXTRACTION_CANCELLED', 'AI结构化提取已取消');
}
