/// <reference types="node" />

import { parentPort, workerData } from 'node:worker_threads';
import { parseDocument } from '../parsers';
import { SCHEMA_VERSION } from '../types';

interface WorkerFile {
  fileId: string;
  displayName: string;
  workPath: string;
  timeoutMs: number;
}

interface ParseRequest {
  type: 'parse';
  jobId: string;
  files: WorkerFile[];
}

interface WorkerBootstrap {
  tessdataPath?: string;
  tessdataCachePath?: string;
  tesseractWorkerPath?: string;
}

const bootstrap = (workerData ?? {}) as WorkerBootstrap;
if (bootstrap.tessdataPath) process.env.REAL_AI_TESSDATA_PATH = bootstrap.tessdataPath;
if (bootstrap.tessdataCachePath) {
  process.env.REAL_AI_TESSDATA_CACHE = bootstrap.tessdataCachePath;
}
if (bootstrap.tesseractWorkerPath) {
  process.env.REAL_AI_TESSERACT_WORKER_PATH = bootstrap.tesseractWorkerPath;
}

if (!parentPort) throw new Error('REAL_AI_WORKER_REQUIRES_PARENT_PORT');

function serializeError(error: unknown) {
  const value = error as {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    code: value.code ?? 'INTERNAL_PARSE_ERROR',
    message: value.message ?? '后台解析失败',
    details: value.details,
  };
}

parentPort.on('message', async (request: ParseRequest) => {
  if (request.type !== 'parse') return;
  try {
    const documents = [];
    for (let index = 0; index < request.files.length; index += 1) {
      const file = request.files[index];
      parentPort?.postMessage({
        type: 'file-start',
        jobId: request.jobId,
        fileId: file.fileId,
        displayName: file.displayName,
        fileIndex: index,
        totalFiles: request.files.length,
      });
      const document = await parseDocument(file.workPath, {
        timeoutMs: file.timeoutMs,
        onProgress: (progress) => {
          parentPort?.postMessage({
            type: 'progress',
            jobId: request.jobId,
            fileId: file.fileId,
            displayName: file.displayName,
            fileIndex: index,
            totalFiles: request.files.length,
            parserStage: progress.stage,
          });
        },
      });
      document.fileId = file.fileId;
      document.fileName = file.displayName;
      documents.push(document);
      parentPort?.postMessage({
        type: 'file-complete',
        jobId: request.jobId,
        fileId: file.fileId,
        displayName: file.displayName,
        fileIndex: index,
        totalFiles: request.files.length,
      });
    }
    parentPort?.postMessage({
      type: 'complete',
      jobId: request.jobId,
      documents,
    });
  } catch (error) {
    parentPort?.postMessage({
      type: 'failed',
      jobId: request.jobId,
      error: serializeError(error),
    });
  }
});
