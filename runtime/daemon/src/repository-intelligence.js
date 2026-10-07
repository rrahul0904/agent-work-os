import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export const REPOSITORY_INTELLIGENCE_VERSION = 'repository-intelligence/v1';

const DEFAULT_IGNORED_DIRECTORIES = [
  '.git', '.hg', '.svn', '.next', '.turbo', 'build', 'coverage', 'dist', 'node_modules', 'target', 'vendor',
];
const SECRET_BASENAME_PATTERNS = [
  /^\.env(?:\..+)?$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)$/i,
  /(?:^|[._-])secrets?(?:[._-]|$)/i,
  /(?:^|[._-])credentials?(?:[._-]|$)/i,
  /(?:^|[._-])private[_-]?key(?:[._-]|$)/i,
];

function positiveInteger(value, field, fallback) {
  const candidate = value ?? fallback;
  if (!Number.isInteger(candidate) || candidate <= 0) throw new TypeError(`${field} must be a positive integer`);
  return candidate;
}

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${field} must be a non-empty string`);
  return value;
}

function normalizeRoot(root) {
  const value = nonEmptyString(root, 'root');
  if (!path.isAbsolute(value)) throw new TypeError('root must be absolute');
  return path.resolve(value);
}

function normalizeDirectoryNames(values) {
  if (!Array.isArray(values)) throw new TypeError('ignoredDirectories must be an array');
  return [...new Set(values.map((value) => nonEmptyString(value, 'ignored directory').trim()))].sort();
}

function isSecretLikeBasename(name) {
  return SECRET_BASENAME_PATTERNS.some((pattern) => pattern.test(name));
}

function normalizeRelativePath(relativePath) {
  const value = nonEmptyString(relativePath, 'relativePath');
  if (value.includes('\0')) throw new Error('path contains a null byte');
  if (path.isAbsolute(value)) throw new Error('absolute paths are not allowed');
  const normalized = path.normalize(value);
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) throw new Error('path escapes repository root');
  return normalized;
}

function resolvedInsideRoot(root, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const resolved = path.resolve(root, normalized);
  const rel = path.relative(root, resolved);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('path escapes repository root');
  return { normalized, resolved, relative: rel || '.' };
}

async function assertNoSymlinkTraversal(root, resolved) {
  const rel = path.relative(root, resolved);
  if (rel === '') return;
  let current = root;
  for (const segment of rel.split(path.sep)) {
    current = path.join(current, segment);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error('symlink traversal is not allowed');
  }
}

function looksBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return sample.includes(0);
}

export function createRepositoryPolicy(input = {}) {
  const root = normalizeRoot(input.root);
  const ignoredDirectories = normalizeDirectoryNames(input.ignoredDirectories ?? DEFAULT_IGNORED_DIRECTORIES);
  return Object.freeze({
    version: REPOSITORY_INTELLIGENCE_VERSION,
    root,
    ignoredDirectories,
    maxFiles: positiveInteger(input.maxFiles, 'maxFiles', 500),
    maxFileBytes: positiveInteger(input.maxFileBytes, 'maxFileBytes', 1_000_000),
    maxBytesScanned: positiveInteger(input.maxBytesScanned, 'maxBytesScanned', 10_000_000),
    maxMatches: positiveInteger(input.maxMatches, 'maxMatches', 100),
    maxReadLines: positiveInteger(input.maxReadLines, 'maxReadLines', 200),
    maxExcerptChars: positiveInteger(input.maxExcerptChars, 'maxExcerptChars', 240),
  });
}

export async function authorizeRepositoryPath(policy, relativePath) {
  if (!policy?.root) throw new TypeError('repository policy is required');
  const target = resolvedInsideRoot(policy.root, relativePath);
  const parts = target.relative.split(path.sep);
  if (parts.some((part) => policy.ignoredDirectories.includes(part))) throw new Error('path is inside an ignored directory');
  if (isSecretLikeBasename(path.basename(target.resolved))) throw new Error('secret-like files are not readable');
  await assertNoSymlinkTraversal(policy.root, target.resolved);
  return Object.freeze({ absolutePath: target.resolved, relativePath: target.relative.split(path.sep).join('/') });
}

export async function readRepositoryWindow({ policy, relativePath, startLine = 1, lineCount = 50 }) {
  if (!Number.isInteger(startLine) || startLine <= 0) throw new TypeError('startLine must be a positive integer');
  if (!Number.isInteger(lineCount) || lineCount <= 0) throw new TypeError('lineCount must be a positive integer');
  const boundedLineCount = Math.min(lineCount, policy.maxReadLines);
  const authorized = await authorizeRepositoryPath(policy, relativePath);
  const info = await lstat(authorized.absolutePath);
  if (!info.isFile()) throw new Error('path is not a regular file');
  if (info.size > policy.maxFileBytes) throw new Error('file exceeds maxFileBytes');
  const buffer = await readFile(authorized.absolutePath);
  if (looksBinary(buffer)) throw new Error('binary files are not readable');
  const lines = buffer.toString('utf8').split(/\r?\n/);
  const startIndex = startLine - 1;
  const endIndex = Math.min(lines.length, startIndex + boundedLineCount);
  const selected = startIndex >= lines.length ? [] : lines.slice(startIndex, endIndex);
  return Object.freeze({
    version: REPOSITORY_INTELLIGENCE_VERSION,
    path: authorized.relativePath,
    startLine,
    endLine: selected.length === 0 ? startLine - 1 : startLine + selected.length - 1,
    requestedLineCount: lineCount,
    returnedLineCount: selected.length,
    totalLines: lines.length,
    truncatedByPolicy: lineCount > boundedLineCount,
    hasMoreAfter: endIndex < lines.length,
    text: selected.join('\n'),
    sourceAnchor: `${authorized.relativePath}:${startLine}-${selected.length === 0 ? startLine - 1 : startLine + selected.length - 1}`,
  });
}

export async function searchRepository({ policy, query, caseSensitive = false }) {
  const needle = nonEmptyString(query, 'query');
  const comparisonNeedle = caseSensitive ? needle : needle.toLowerCase();
  const matches = [];
  let filesVisited = 0;
  let filesSkipped = 0;
  let bytesScanned = 0;
  let stoppedReason = null;

  async function walk(directory, relativeDirectory = '') {
    if (stoppedReason) return;
    let entries = await readdir(directory, { withFileTypes: true });
    entries = entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (stoppedReason) return;
      const relative = relativeDirectory ? path.join(relativeDirectory, entry.name) : entry.name;
      if (entry.isSymbolicLink()) { filesSkipped += 1; continue; }
      if (entry.isDirectory()) {
        if (policy.ignoredDirectories.includes(entry.name)) continue;
        await walk(path.join(directory, entry.name), relative);
        continue;
      }
      if (!entry.isFile()) { filesSkipped += 1; continue; }
      if (isSecretLikeBasename(entry.name)) { filesSkipped += 1; continue; }
      if (filesVisited >= policy.maxFiles) { stoppedReason = 'max_files'; return; }
      const absolute = path.join(directory, entry.name);
      const info = await lstat(absolute);
      if (!info.isFile() || info.size > policy.maxFileBytes) { filesSkipped += 1; continue; }
      if (bytesScanned + info.size > policy.maxBytesScanned) { stoppedReason = 'max_bytes_scanned'; return; }
      const buffer = await readFile(absolute);
      filesVisited += 1;
      bytesScanned += buffer.length;
      if (looksBinary(buffer)) { filesSkipped += 1; continue; }
      const lines = buffer.toString('utf8').split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const haystack = caseSensitive ? lines[index] : lines[index].toLowerCase();
        const columnIndex = haystack.indexOf(comparisonNeedle);
        if (columnIndex === -1) continue;
        const normalizedPath = relative.split(path.sep).join('/');
        const excerpt = lines[index].length <= policy.maxExcerptChars
          ? lines[index]
          : `${lines[index].slice(0, policy.maxExcerptChars - 1)}…`;
        matches.push(Object.freeze({
          path: normalizedPath,
          line: index + 1,
          column: columnIndex + 1,
          excerpt,
          sourceAnchor: `${normalizedPath}:${index + 1}`,
        }));
        if (matches.length >= policy.maxMatches) { stoppedReason = 'max_matches'; return; }
      }
    }
  }

  await walk(policy.root);
  return Object.freeze({
    version: REPOSITORY_INTELLIGENCE_VERSION,
    query: needle,
    caseSensitive,
    matches: Object.freeze(matches),
    receipt: Object.freeze({
      filesVisited,
      filesSkipped,
      bytesScanned,
      matchesReturned: matches.length,
      truncated: stoppedReason !== null,
      stoppedReason,
    }),
  });
}
