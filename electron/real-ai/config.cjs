module.exports = Object.freeze({
  schemaVersion: '1.0',
  limits: {
    maxFileSizeBytes: 25 * 1024 * 1024,
    maxFilesPerBatch: 10,
    maxArchiveEntries: 5_000,
    maxArchiveUncompressedBytes: 250 * 1024 * 1024,
    maxArchiveCompressionRatio: 1_000,
  },
  jobs: {
    maxConcurrent: 3,
    retentionMs: 15 * 60 * 1_000,
    timeoutsMs: {
      pdf: 180_000,
      docx: 60_000,
      xlsx: 120_000,
      xls: 120_000,
      image: 180_000,
    },
  },
  temp: {
    staleAfterMs: 24 * 60 * 60 * 1_000,
  },
});
