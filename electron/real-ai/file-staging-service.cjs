const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const yauzl = require('yauzl');
const config = require('./config.cjs');
const { normalizeError } = require('./errors.cjs');
const {
  FileSourceDescriptorSchema,
  StagePathEntriesSchema,
  StagedFileTokenSchema,
  validate,
} = require('./runtime-schemas.cjs');
const { ensureDirectory, removeDirectory } = require('./temp-utils.cjs');

const EXTENSION_TYPES = Object.freeze({
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.xls': 'xls',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
});

const DETECTED_TYPES = Object.freeze({
  pdf: 'pdf',
  docx: 'docx',
  xlsx: 'xlsx',
  xls: 'xls',
  cfb: 'xls',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
});

const MIME_TYPES = Object.freeze({
  pdf: new Set(['application/pdf']),
  docx: new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip']),
  xlsx: new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip']),
  xls: new Set(['application/vnd.ms-excel', 'application/x-cfb']),
  image: new Set(['image/jpeg', 'image/png']),
});

function stagingError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

function validateOfficeArchive(filePath, expectedType, limits) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: true }, (openError, archive) => {
      if (openError || !archive) {
        reject(stagingError('FILE_CORRUPTED', 'Office文件ZIP结构损坏'));
        return;
      }

      let entries = 0;
      let totalUncompressed = 0;
      let hasContentTypes = false;
      let hasPrimaryDocument = false;
      let settled = false;

      const finish = (error) => {
        if (settled) return;
        settled = true;
        archive.close();
        if (error) reject(error);
        else resolve();
      };

      archive.on('error', () => finish(stagingError('FILE_CORRUPTED', 'Office文件ZIP目录无法读取')));
      archive.on('entry', (entry) => {
        entries += 1;
        totalUncompressed += entry.uncompressedSize;
        const ratio = entry.compressedSize === 0
          ? (entry.uncompressedSize === 0 ? 1 : Number.POSITIVE_INFINITY)
          : entry.uncompressedSize / entry.compressedSize;

        if (
          entries > limits.maxArchiveEntries
          || totalUncompressed > limits.maxArchiveUncompressedBytes
          || ratio > limits.maxArchiveCompressionRatio
        ) {
          finish(stagingError('FILE_CORRUPTED', 'Office压缩包结构超过安全限制'));
          return;
        }

        const normalized = entry.fileName.replace(/\\/g, '/');
        if (normalized === '[Content_Types].xml') hasContentTypes = true;
        if (expectedType === 'docx' && normalized === 'word/document.xml') hasPrimaryDocument = true;
        if (expectedType === 'xlsx' && normalized === 'xl/workbook.xml') hasPrimaryDocument = true;
        archive.readEntry();
      });
      archive.on('end', () => {
        if (!hasContentTypes || !hasPrimaryDocument) {
          finish(stagingError('FILE_CORRUPTED', 'Office文件缺少必要的内部结构'));
          return;
        }
        finish();
      });
      archive.readEntry();
    });
  });
}

class FileStagingService {
  constructor({ stagingRoot, limits = config.limits } = {}) {
    if (!stagingRoot) throw new Error('stagingRoot is required');
    this.stagingRoot = path.resolve(stagingRoot);
    this.limits = limits;
    this.descriptors = new Map();
  }

  async initialize() {
    await ensureDirectory(this.stagingRoot);
  }

  async stagePathEntries(entries) {
    const requests = validate(StagePathEntriesSchema, entries, '文件暂存请求');
    const stagedIds = [];
    try {
      const tokens = [];
      for (const request of requests) {
        const token = await this.stageOne(request);
        stagedIds.push(token.fileId);
        tokens.push(token);
      }
      return tokens;
    } catch (error) {
      await this.cleanup(stagedIds);
      throw error;
    }
  }

  async stageOne(request) {
    const sourcePath = path.resolve(request.sourcePath);
    const displayName = path.basename(request.displayName || sourcePath);
    const extension = path.extname(displayName).toLowerCase();
    const expectedType = EXTENSION_TYPES[extension];
    if (!expectedType) throw stagingError('UNSUPPORTED_FILE_TYPE', '不支持该文件类型');

    let stats;
    try {
      stats = await fsp.stat(sourcePath);
    } catch {
      throw stagingError('FILE_NOT_FOUND', '所选文件不存在');
    }
    if (!stats.isFile()) throw stagingError('FILE_NOT_FOUND', '所选对象不是文件');
    if (stats.size === 0) throw stagingError('FILE_EMPTY', '文件为空');
    if (stats.size > this.limits.maxFileSizeBytes) {
      throw stagingError('FILE_TOO_LARGE', '文件超过允许大小');
    }

    const { fileTypeFromFile } = await import('file-type');
    const detected = await fileTypeFromFile(sourcePath);
    const detectedType = detected ? DETECTED_TYPES[detected.ext] : undefined;
    if (!detectedType) throw stagingError('FILE_CORRUPTED', '无法识别文件签名');
    if (detectedType !== expectedType) {
      throw stagingError('FILE_SIGNATURE_MISMATCH', '扩展名与文件真实类型不一致');
    }

    const declaredMimeType = request.declaredMimeType.trim().toLowerCase();
    if (declaredMimeType && !MIME_TYPES[expectedType].has(declaredMimeType)) {
      throw stagingError('FILE_SIGNATURE_MISMATCH', '声明MIME与文件真实类型不一致');
    }
    if (expectedType === 'docx' || expectedType === 'xlsx') {
      await validateOfficeArchive(sourcePath, expectedType, this.limits);
    }

    const fileId = `file_${crypto.randomUUID()}`;
    const fileDirectory = path.join(this.stagingRoot, fileId);
    const stagedPath = path.join(fileDirectory, `source${extension}`);
    await ensureDirectory(fileDirectory);
    try {
      await fsp.copyFile(sourcePath, stagedPath, fs.constants.COPYFILE_EXCL);
      const descriptor = validate(FileSourceDescriptorSchema, {
        schemaVersion: config.schemaVersion,
        fileId,
        displayName,
        size: stats.size,
        declaredMimeType,
        detectedType,
        detectedMimeType: detected.mime,
        stagedPath,
        sha256: await sha256File(stagedPath),
        createdAt: new Date().toISOString(),
      }, '文件来源描述');
      this.descriptors.set(fileId, descriptor);
      return validate(StagedFileTokenSchema, descriptor, '文件令牌');
    } catch (error) {
      await removeDirectory(fileDirectory);
      throw error;
    }
  }

  getDescriptor(fileId) {
    const descriptor = this.descriptors.get(fileId);
    if (!descriptor) throw stagingError('FILE_TOKEN_NOT_FOUND', '文件令牌不存在或已失效');
    return descriptor;
  }

  async cleanup(fileIds) {
    const ids = Array.isArray(fileIds) ? fileIds : [];
    await Promise.all(ids.map(async (fileId) => {
      if (!/^file_[a-f0-9-]{12,}$/.test(fileId)) return;
      const descriptor = this.descriptors.get(fileId);
      this.descriptors.delete(fileId);
      if (descriptor) await removeDirectory(path.dirname(descriptor.stagedPath));
    }));
  }

  async dispose() {
    await this.cleanup([...this.descriptors.keys()]);
  }
}

function toStagingError(error) {
  return normalizeError(error);
}

module.exports = { FileStagingService, toStagingError, validateOfficeArchive };
