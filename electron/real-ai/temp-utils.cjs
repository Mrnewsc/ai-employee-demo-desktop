const fs = require('node:fs/promises');
const path = require('node:path');

async function ensureDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
  return directory;
}

async function removeDirectory(directory) {
  if (!directory) return;
  await fs.rm(directory, { recursive: true, force: true });
}

async function cleanupStaleDirectories(root, staleAfterMs) {
  await ensureDirectory(root);
  const now = Date.now();
  const entries = await fs.readdir(root, { withFileTypes: true });
  let cleaned = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const target = path.resolve(root, entry.name);
    if (path.dirname(target) !== path.resolve(root)) continue;
    const stats = await fs.stat(target);
    if (now - stats.mtimeMs < staleAfterMs) continue;
    await removeDirectory(target);
    cleaned += 1;
  }
  return cleaned;
}

module.exports = { cleanupStaleDirectories, ensureDirectory, removeDirectory };
