import type { AnalysisJobSnapshot, StagedFileToken } from '../types';

export interface RealAIFileApi {
  select(): Promise<StagedFileToken[]>;
  stage(files: File[] | FileList): Promise<StagedFileToken[]>;
  cleanup(fileIds: string[]): Promise<{ cleaned: number }>;
}

export interface RealAIAnalysisApi {
  start(fileIds: string[]): Promise<AnalysisJobSnapshot>;
  cancel(jobId: string): Promise<AnalysisJobSnapshot>;
  status(jobId: string): Promise<AnalysisJobSnapshot>;
  cleanup(jobId: string): Promise<{ cleaned: boolean }>;
  onProgress(listener: (job: AnalysisJobSnapshot) => void): () => void;
}

export interface RealAIWindowApi {
  files: RealAIFileApi;
  analysis: RealAIAnalysisApi;
}

function getApi(): RealAIWindowApi {
  const api = (window as Window & { realAI?: RealAIWindowApi }).realAI;
  if (!api) throw new Error('REAL_AI_DESKTOP_API_UNAVAILABLE');
  return api;
}

export const electronFileAnalysisClient: RealAIWindowApi = {
  files: {
    select: () => getApi().files.select(),
    stage: (files) => getApi().files.stage(files),
    cleanup: (fileIds) => getApi().files.cleanup(fileIds),
  },
  analysis: {
    start: (fileIds) => getApi().analysis.start(fileIds),
    cancel: (jobId) => getApi().analysis.cancel(jobId),
    status: (jobId) => getApi().analysis.status(jobId),
    cleanup: (jobId) => getApi().analysis.cleanup(jobId),
    onProgress: (listener) => getApi().analysis.onProgress(listener),
  },
};
