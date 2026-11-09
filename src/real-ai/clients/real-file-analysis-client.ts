import type { StagedFileToken } from '../types';
import type {
  CatalogReadiness,
  ConfirmedMatchResult,
  MatchDecision,
  RealAnalysisSnapshot,
  RealQuoteDraftHandoff,
} from '../pipeline';

interface PipelineApi {
  start(customerId: string, fileIds: string[]): Promise<RealAnalysisSnapshot>;
  cancel(jobId: string): Promise<RealAnalysisSnapshot>;
  status(jobId: string): Promise<RealAnalysisSnapshot>;
  retry(jobId: string): Promise<RealAnalysisSnapshot>;
  resume(customerId: string): Promise<RealAnalysisSnapshot | null>;
  catalogStatus(): Promise<CatalogReadiness>;
  onProgress(listener: (snapshot: RealAnalysisSnapshot) => void): () => void;
}

interface DesktopApi {
  files: {
    select(): Promise<StagedFileToken[]>;
    stage(files: File[] | FileList): Promise<StagedFileToken[]>;
    cleanup(fileIds: string[]): Promise<{ cleaned: number }>;
  };
  pipeline: PipelineApi;
}

function api(): DesktopApi {
  const value = (window as Window & { realAI?: DesktopApi }).realAI;
  if (!value?.pipeline) throw new Error('REAL_AI_DESKTOP_API_UNAVAILABLE');
  return value;
}

function storageKey(jobId: string) {
  return `real-ai-confirmations:${jobId}`;
}

function loadConfirmations(jobId: string): Record<string, ConfirmedMatchResult> {
  try {
    return JSON.parse(window.sessionStorage.getItem(storageKey(jobId)) ?? '{}') as Record<string, ConfirmedMatchResult>;
  } catch {
    return {};
  }
}

function saveConfirmations(jobId: string, value: Record<string, ConfirmedMatchResult>) {
  window.sessionStorage.setItem(storageKey(jobId), JSON.stringify(value));
}

export class RealFileAnalysisClient {
  selectFiles() {
    return api().files.select();
  }

  stageFiles(files: File[] | FileList) {
    return api().files.stage(files);
  }

  cleanupFiles(fileIds: string[]) {
    return api().files.cleanup(fileIds);
  }

  startAnalysis(customerId: string, fileIds: string[]) {
    return api().pipeline.start(customerId, fileIds);
  }

  getStatus(jobId: string) {
    return api().pipeline.status(jobId);
  }

  cancel(jobId: string) {
    return api().pipeline.cancel(jobId);
  }

  retry(jobId: string) {
    window.sessionStorage.removeItem(storageKey(jobId));
    return api().pipeline.retry(jobId);
  }

  resume(customerId: string) {
    return api().pipeline.resume(customerId);
  }

  catalogStatus() {
    return api().pipeline.catalogStatus();
  }

  onProgress(listener: (snapshot: RealAnalysisSnapshot) => void) {
    try {
      return api().pipeline.onProgress(listener);
    } catch {
      return () => undefined;
    }
  }

  getConfirmations(jobId: string) {
    return loadConfirmations(jobId);
  }

  confirmMatch(
    jobId: string,
    extractedProductId: string,
    decision: MatchDecision,
    selectedProductId: string | null,
    snapshot: RealAnalysisSnapshot,
    note = '',
  ): ConfirmedMatchResult {
    const group = snapshot.matchGroups.find((entry) => entry.extractedProductId === extractedProductId);
    const selected = selectedProductId
      ? group?.results.find((entry) => entry.candidateProductId === selectedProductId) ?? null
      : group?.results[0] ?? null;
    if ((decision === 'accepted' || decision === 'changed') && !selectedProductId) {
      throw new Error('请选择企业产品库候选后再确认');
    }
    const result: ConfirmedMatchResult = {
      schemaVersion: '1.0',
      extractedProductId,
      selectedProductId: decision === 'not-found' ? null : selectedProductId,
      originalMatchResult: group?.results[0] ?? null,
      decision,
      confirmedBy: 'local-user',
      confirmedAt: decision === 'pending' ? null : new Date().toISOString(),
      note,
    };
    const confirmations = loadConfirmations(jobId);
    confirmations[extractedProductId] = result;
    saveConfirmations(jobId, confirmations);
    return result;
  }

  createQuoteDraft(snapshot: RealAnalysisSnapshot): RealQuoteDraftHandoff {
    const confirmations = loadConfirmations(snapshot.jobId);
    const unresolved = snapshot.extractedProducts.filter((product) => {
      const decision = confirmations[product.id]?.decision ?? 'pending';
      return decision === 'pending';
    });
    if (unresolved.length) throw new Error(`还有${unresolved.length}个产品需要人工确认后才能生成报价`);
    const items = snapshot.extractedProducts.flatMap((product) => {
      const confirmation = confirmations[product.id];
      if (!confirmation || confirmation.decision === 'not-found' || !confirmation.selectedProductId) return [];
      const group = snapshot.matchGroups.find((entry) => entry.extractedProductId === product.id);
      const match = group?.results.find((entry) => entry.candidateProductId === confirmation.selectedProductId);
      const candidate = match?.candidateProductSnapshot;
      if (!candidate) return [];
      return [{
        extractedProductId: product.id,
        productId: candidate.productId,
        productName: candidate.productName,
        model: candidate.model,
        quantity: product.quantity.value,
        quantityUnit: product.quantity.unit,
        configuration: Object.entries(candidate.specifications).map(([key, value]) => `${key}：${value}`).join('；'),
        unitPrice: null as null,
        audit: {
          originalModel: product.model,
          originalMatchResult: confirmation.originalMatchResult,
          humanDecision: confirmation,
        },
      }];
    });
    if (!items.length) throw new Error('没有已人工确认的企业产品可进入报价草案');
    return {
      schemaVersion: '1.0',
      quoteId: `real-quote-${Date.now()}`,
      customerId: snapshot.customerId,
      sourceAnalysisJobId: snapshot.jobId,
      items,
      createdAt: new Date().toISOString(),
      pricingStatus: 'manual-input-required',
    };
  }
}

export const realFileAnalysisClient = new RealFileAnalysisClient();
