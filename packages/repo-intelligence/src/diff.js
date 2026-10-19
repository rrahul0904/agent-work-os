import { canonicalDigest } from "./index.js";

export const REPO_DIFF_SCHEMA = "repo-diff/v1";

export class RepoDiffError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = "RepoDiffError";
    this.code = code;
  }
}

export function diffRepositoryMaps(previous, current) {
  assertRepoMap(previous, "previous");
  assertRepoMap(current, "current");

  const previousFiles = new Map(previous.files.map((file) => [file.path, file]));
  const currentFiles = new Map(current.files.map((file) => [file.path, file]));
  const added = [];
  const removed = [];
  const changed = [];

  for (const [filePath, file] of currentFiles) {
    const before = previousFiles.get(filePath);
    if (!before) {
      added.push(fileSummary(file));
      continue;
    }
    const changes = compareFile(before, file);
    if (changes.length > 0) {
      changed.push(Object.freeze({
        path: filePath,
        before: fileSummary(before),
        after: fileSummary(file),
        changes: Object.freeze(changes)
      }));
    }
  }

  for (const [filePath, file] of previousFiles) {
    if (!currentFiles.has(filePath)) removed.push(fileSummary(file));
  }

  added.sort((a, b) => a.path.localeCompare(b.path));
  removed.sort((a, b) => a.path.localeCompare(b.path));
  changed.sort((a, b) => a.path.localeCompare(b.path));

  const languageDelta = computeLanguageDelta(previous.languages, current.languages);
  const payload = {
    schemaVersion: REPO_DIFF_SCHEMA,
    previousDigest: previous.digest,
    currentDigest: current.digest,
    changed: previous.digest !== current.digest,
    files: Object.freeze({
      added: Object.freeze(added),
      removed: Object.freeze(removed),
      changed: Object.freeze(changed)
    }),
    metricsDelta: Object.freeze({
      lines: current.metrics.lines - previous.metrics.lines,
      files: current.metrics.files - previous.metrics.files,
      directories: current.metrics.directories - previous.metrics.directories,
      estimatedTokens: current.metrics.estimatedTokens - previous.metrics.estimatedTokens
    }),
    languageDelta: Object.freeze(languageDelta),
    summary: Object.freeze({
      addedFiles: added.length,
      removedFiles: removed.length,
      changedFiles: changed.length,
      affectedFiles: added.length + removed.length + changed.length
    })
  };

  return Object.freeze({ ...payload, digest: canonicalDigest(payload) });
}

function compareFile(before, after) {
  const changes = [];
  if (before.language !== after.language) changes.push("language");
  if (before.lines !== after.lines) changes.push("lines");
  if (before.bytes !== after.bytes) changes.push("bytes");
  if (before.estimatedTokens !== after.estimatedTokens) changes.push("estimatedTokens");
  return changes;
}

function fileSummary(file) {
  return Object.freeze({
    path: file.path,
    language: file.language,
    lines: file.lines,
    bytes: file.bytes,
    estimatedTokens: file.estimatedTokens
  });
}

function computeLanguageDelta(previous, current) {
  const names = [...new Set([...Object.keys(previous), ...Object.keys(current)])].sort();
  return names.map((language) => {
    const before = previous[language] ?? { lines: 0, files: 0 };
    const after = current[language] ?? { lines: 0, files: 0 };
    return Object.freeze({
      language,
      lines: after.lines - before.lines,
      files: after.files - before.files
    });
  }).filter((item) => item.lines !== 0 || item.files !== 0);
}

function assertRepoMap(value, label) {
  if (!value || value.schemaVersion !== "repo-map/v1" || !Array.isArray(value.files) || typeof value.digest !== "string" || !value.metrics || !value.languages) {
    throw new RepoDiffError("repo_diff_map_invalid", `Expected repo-map/v1 for ${label}`);
  }
}
