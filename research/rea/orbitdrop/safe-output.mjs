/**
 * REA OrbitDrop-inspired clean-room safety prototype.
 * No upstream application code copied; Node standard library only.
 * This is a cross-platform core proof, NOT a Windows drag/UI implementation.
 */
import { open, lstat, realpath, link, unlink, readFile, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, extname, join } from 'node:path';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const validatePiece = (value, description) => {
  if (typeof value !== 'string' || !value || !/^[a-zA-Z0-9._ -]+$/.test(value) || value.includes('..') || /[\\/]/.test(value)) {
    throw new TypeError(`Unsafe ${description}`);
  }
  return value;
};

/** A collision-safe, copy-producing transform with a recoverable cancellation path. */
export async function createSafeOutput({ source, extension, suffix = '', convert, signal }) {
  if (typeof convert !== 'function') throw new TypeError('convert must be a function');
  const requested = String(source);
  const srcStat = await lstat(requested);
  if (!srcStat.isFile() || srcStat.isSymbolicLink()) throw new TypeError('Source must be a regular, non-symlink file');
  const src = await realpath(requested);
  const parent = dirname(src);
  const srcHashBefore = hash(await readFile(src));
  const ext = validatePiece(extension.replace(/^\./, ''), 'extension').toLowerCase();
  if (suffix) validatePiece(suffix, 'suffix');
  const stem = basename(src, extname(src)) + (suffix ? ` (${suffix})` : '');
  const temp = join(parent, `.rea-output-${randomUUID()}.tmp`);
  let published = null;
  const abort = () => { if (signal?.aborted) throw signal.reason ?? new Error('Cancelled'); };
  try {
    abort();
    const handle = await open(temp, 'wx', 0o600);
    await handle.close();
    // The transform receives a path to a reserved scratch file. It must not mutate source.
    await convert({ source: src, output: temp, signal });
    abort();
    if ((await stat(temp)).size === 0) throw new Error('Output is empty');
    if (hash(await readFile(src)) !== srcHashBefore) throw new Error('Input changed during conversion');
    for (let n = 1; n <= 1000; n++) {
      abort();
      const proposed = join(parent, `${stem}${n === 1 ? '' : ` (${n})`}.${ext}`);
      try {
        // Hard-link creation is atomic with EEXIST; renaming over an existing path is not.
        await link(temp, proposed);
        published = proposed;
        break;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }
    }
    if (!published) throw new Error('No free output name');
    return { output: published, sourceSha256: srcHashBefore, outputSha256: hash(await readFile(published)) };
  } finally {
    await unlink(temp).catch(e => { if (e?.code !== 'ENOENT') throw e; });
  }
}
