/**
 * Engineering Context Lens (v1)
 *
 * Pure, local-first, read-only projection over the authoritative Memory Plane.
 * This module NEVER persists records, crawls files or grants access.
 * The caller MUST enforce tenant auth and supply a fail-closed canRead predicate.
 */
export const ENGINEERING_CONTEXT_VERSION = "engineering-context/v1";

const KINDS = new Set(["decision", "constraint", "incident", "finding", "architecture"]);
const TRUST = new Set(["approved", "verified"]);
const DIGEST = /^[0-9a-f]{64}$/i;
const TOKEN = /[\p{L}\p{N}_-]+/gu;

export class EngineeringContextError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "EngineeringContextError";
    this.code = code;
  }
}

function requireString(value, field, max = 2048) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new EngineeringContextError("INVALID_RECORD", field);
  }
  return value.trim();
}

/** Reject traversal, absolute paths, backslashes, NULs and platform aliases. */
export function normalizeRepositoryPath(input) {
  const path = requireString(input, "file path", 4096);
  if (path.startsWith("/") || path.includes("\\") || path.includes(":") ||
      /[\u0000-\u001f\u007f]/u.test(path)) {
    throw new EngineeringContextError("UNSAFE_PATH", "unsafe repository path");
  }
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..") ||
      segments[0] === ".git") {
    throw new EngineeringContextError("UNSAFE_PATH", "unsafe repository path");
  }
  return path;
}

function boundedPaths(paths, name) {
  if (!Array.isArray(paths) || paths.length > 200) {
    throw new EngineeringContextError("INVALID_RECORD", name);
  }
  return Object.freeze([...new Set(paths.map(normalizeRepositoryPath))].sort());
}

function projectRecord(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new EngineeringContextError("INVALID_RECORD", "record");
  }
  const id = requireString(raw.id, "id", 200);
  const projectId = requireString(raw.projectId, "projectId", 200);
  const repositoryId = requireString(raw.repositoryId, "repositoryId", 300);
  if (!KINDS.has(raw.kind) || !TRUST.has(raw.trust) || raw.status !== "current") {
    throw new EngineeringContextError("INVALID_RECORD", "kind/trust/status");
  }
  if (!raw.source || typeof raw.source !== "object" ||
      !DIGEST.test(raw.source.sha256 ?? "")) {
    throw new EngineeringContextError("MISSING_PROVENANCE", "source digest");
  }
  const source = Object.freeze({
    type: requireString(raw.source.type, "source.type", 100),
    id: requireString(raw.source.id, "source.id", 500),
    sha256: raw.source.sha256.toLowerCase()
  });
  return Object.freeze({
    id, projectId, repositoryId, kind: raw.kind, trust: raw.trust,
    title: requireString(raw.title, "title", 300),
    summary: requireString(raw.summary, "summary", 4000),
    source,
    files: boundedPaths(raw.files ?? [], "files"),
    impactPaths: boundedPaths(raw.impactPaths ?? [], "impactPaths")
  });
}

function tokens(value) {
  return new Set((value.toLowerCase().match(TOKEN) ?? []).filter((word) => word.length >= 2));
}

function scoreRecord(record, queryTokens) {
  const fields = [
    [record.title, 5],
    [record.summary, 2],
    [record.files.join(" "), 3],
    [record.impactPaths.join(" "), 1]
  ];
  let score = 0;
  for (const [value, weight] of fields) {
    const words = tokens(value);
    for (const word of queryTokens) if (words.has(word)) score += weight;
  }
  return score;
}

function limitNumber(value, maximum = 100) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new EngineeringContextError("INVALID_LIMIT");
  }
  return value;
}

/**
 * Create an authorized projection for ONE project and ONE repository.
 * Source trust/status are asserted by Memory Plane, not independently
 * attested here. A missing or async canRead must never grant access.
 *
 * @param {{records: object[], projectId: string, repositoryId: string,
 *          canRead: (record: object) => boolean}} options
 */
export function createEngineeringContextLens({ records, projectId, repositoryId, canRead }) {
  requireString(projectId, "projectId", 200);
  requireString(repositoryId, "repositoryId", 300);
  if (!Array.isArray(records) || records.length > 10000) {
    throw new EngineeringContextError("INVALID_RECORDS");
  }
  if (typeof canRead !== "function") {
    throw new EngineeringContextError("AUTH_REQUIRED");
  }
  const projected = [];
  const seen = new Set();
  for (const record of records) {
    // Scope and authorization BEFORE parsing/content indexing.
    if (record?.projectId !== projectId || record?.repositoryId !== repositoryId ||
        record?.status !== "current" || !TRUST.has(record?.trust)) continue;
    if (canRead(record) !== true) continue;
    const item = projectRecord(record);
    if (seen.has(item.id)) throw new EngineeringContextError("DUPLICATE_MEMORY_ID");
    seen.add(item.id);
    projected.push(item);
  }
  projected.sort((a, b) => a.id.localeCompare(b.id, "en"));
  const current = Object.freeze(projected);

  return Object.freeze({
    version: ENGINEERING_CONTEXT_VERSION,
    projectId,
    repositoryId,
    size: current.length,
    /** Deterministic lexical recall; semantic/vector search is a later adapter. */
    recall(query, { limit = 10 } = {}) {
      const term = requireString(query, "query", 2000);
      limitNumber(limit);
      const words = tokens(term);
      if (!words.size) return [];
      return current
        .map((item) => ({ item, score: scoreRecord(item, words) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id, "en"))
        .slice(0, limit)
        .map(({ item, score }) => Object.freeze({ ...item, score }));
    },
    /**
     * Advisory ONLY: direct file links and human-declared impact paths.
     * It does NOT infer build dependencies, execute code or claim breakage.
     */
    assessChange(changedFiles, { limit = 100 } = {}) {
      limitNumber(limit);
      const changed = boundedPaths(changedFiles, "changedFiles");
      const found = [];
      for (const item of current) {
        const direct = changed.filter((path) => item.files.includes(path));
        const declared = changed.filter((path) => item.impactPaths.includes(path));
        if (!direct.length && !declared.length) continue;
        found.push(Object.freeze({
          memoryId: item.id,
          kind: item.kind,
          title: item.title,
          source: item.source,
          directFiles: Object.freeze(direct),
          declaredImpactFiles: Object.freeze(declared),
          confidence: "advisory"
        }));
      }
      return Object.freeze({
        version: "engineering-impact/v1",
        repositoryId,
        changedFiles: changed,
        advisory: true,
        matches: Object.freeze(found.slice(0, limit)),
        truncated: found.length > limit
      });
    }
  });
}
