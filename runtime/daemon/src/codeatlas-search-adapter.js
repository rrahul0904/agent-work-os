import { createHash } from "node:crypto";
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, realpathSync, lstatSync, writeFileSync } from "node:fs";
import path from "node:path";

const runFile = promisify(execFile);
const MAX_INDEX_BYTES = 64 * 1024 * 1024;
const MAX_SEARCH_OUTPUT_BYTES = 180_000;

function snapshotRoot(root) {
  if (typeof root !== "string" || !path.isAbsolute(root)) throw new Error("CODEATLAS_ABSOLUTE_ROOT_REQUIRED");
  const actual = realpathSync(root);
  const folder = path.join(actual, ".codeatlas");
  const dbPath = path.join(folder, "index.sqlite3");
  const metadata = lstatSync(dbPath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_INDEX_BYTES) {
    throw new Error("CODEATLAS_INDEX_NOT_SAFE");
  }
  const revision = execFileSync("git", ["-C", actual, "rev-parse", "HEAD"], {
    encoding: "utf8", timeout: 3000, windowsHide: true
  }).trim();
  if (!/^[a-f0-9]{40,64}$/.test(revision)) throw new Error("CODEATLAS_REVISION_INVALID");
  const changes = execFileSync("git", ["-C", actual, "status", "--porcelain", "--untracked-files=no"], {
    encoding: "utf8", timeout: 3000, windowsHide: true
  });
  if (changes.trim()) throw new Error("CODEATLAS_TRACKED_TREE_DIRTY");
  return { actual, folder, dbPath, revision, dbSha256: createHash("sha256").update(readFileSync(dbPath)).digest("hex") };
}

export function sealCodeAtlasIndex(root) {
  const snapshot = snapshotRoot(root);
  const manifest = {
    version: "codeatlas-index-binding/v1", revision: snapshot.revision,
    dbSha256: snapshot.dbSha256,
    provenance: "operator_sealed_after_local_codeatlas_index",
    warning: "This binds bytes and Git revision; it cannot certify the semantics of the indexer."
  };
  writeFileSync(path.join(snapshot.folder, "index-binding.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "w", mode: 0o600 });
  return manifest;
}

export function verifyCodeAtlasIndex(root) {
  const snapshot = snapshotRoot(root);
  const manifestPath = path.join(snapshot.folder, "index-binding.json");
  const state = lstatSync(manifestPath);
  if (!state.isFile() || state.isSymbolicLink() || state.size > 2000) throw new Error("CODEATLAS_BINDING_NOT_SAFE");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.version !== "codeatlas-index-binding/v1" || manifest.revision !== snapshot.revision ||
      manifest.dbSha256 !== snapshot.dbSha256) throw new Error("CODEATLAS_INDEX_STALE_OR_UNBOUND");
  return snapshot;
}

function boundedSymbol(item, root) {
  if (!item || typeof item !== "object") return null;
  const name = String(item.qualified_name ?? "");
  if (!name || name.length > 260) return null;
  const filePath = typeof item.file_path === "string" ? item.file_path : "";
  const relativePath = filePath && path.isAbsolute(filePath) ? path.relative(root, filePath) : filePath;
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return null;
  return {
    qualifiedName: name,
    kind: String(item.kind ?? "unknown").slice(0, 40),
    language: String(item.language ?? "unknown").slice(0, 40),
    file: relativePath.replaceAll("\\", "/").slice(0, 260),
    line: Number.isInteger(item.start_line) && item.start_line >= 1 ? item.start_line : null
  };
}

export class CodeAtlasSearchAdapter {
  name = "codeatlas-search";
  constructor({ env = process.env, execFileImpl = runFile } = {}) {
    this.enabled = env.AGENT_WORK_OS_CODEATLAS_READONLY_ENABLED === "true";
    this.root = env.AGENT_WORK_OS_CODEATLAS_ROOT || "";
    this.execFileImpl = execFileImpl;
    this.active = new Set();
  }

  capability() {
    if (!this.enabled || !path.isAbsolute(this.root)) return null;
    return { name: this.name, version: "codeatlas-search/v1", mode: "read_only", supportedActions: ["search"], executable: "codeatlas" };
  }

  async run(request, emit) {
    if (!this.capability()) throw new Error("CODEATLAS_NOT_CONFIGURED");
    if (!request?.sessionId || this.active.has(request.sessionId)) throw new Error("CODEATLAS_SESSION_BUSY");
    const match = /^search\s+([\p{L}\p{N}_.:$-]{1,100})$/u.exec(request.prompt?.trim() ?? "");
    if (!match) throw new Error("CODEATLAS_SEARCH_ONLY");
    // Remote session clients cannot redirect the local CLI to an arbitrary folder.
    const snapshot = verifyCodeAtlasIndex(this.root);
    if (realpathSync(request.cwd) !== snapshot.actual) throw new Error("CODEATLAS_WORKSPACE_MISMATCH");
    const nativeSessionId = "codeatlas-" + request.sessionId;
    if (request.nativeSessionId && request.nativeSessionId !== nativeSessionId) throw new Error("CODEATLAS_SESSION_MISMATCH");
    this.active.add(request.sessionId);
    try {
      emit({ kind: "status", status: "running", message: "CodeAtlas read-only symbol search", at: new Date().toISOString() });
      if (!request.nativeSessionId) emit({ kind: "thread", nativeSessionId, at: new Date().toISOString() });
      const { stdout } = await this.execFileImpl("codeatlas", ["search", match[1], "--db", snapshot.dbPath], {
        cwd: snapshot.actual, timeout: 5000, maxBuffer: MAX_SEARCH_OUTPUT_BYTES, windowsHide: true,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, VIRTUAL_ENV: process.env.VIRTUAL_ENV, LANG: "C.UTF-8" }
      });
      // Refuse if source changed while the search was executing.
      verifyCodeAtlasIndex(this.root);
      const parsed = JSON.parse(stdout);
      if (!Array.isArray(parsed)) throw new Error("CODEATLAS_RESPONSE_INVALID");
      const sanitized = parsed.slice(0, 10).map((item) => boundedSymbol(item, snapshot.actual)).filter(Boolean);
      emit({ kind: "text", text: JSON.stringify({
        source: "codeatlas", mode: "read_only", revision: snapshot.revision,
        indexDigest: snapshot.dbSha256, indexProvenance: "operator_sealed",
        symbolCount: sanitized.length, symbols: sanitized
      }), at: new Date().toISOString() });
      emit({ kind: "status", status: "completed", at: new Date().toISOString() });
      return { nativeSessionId };
    } catch (error) {
      if (error.message?.startsWith("CODEATLAS_")) throw error;
      throw new Error("CODEATLAS_SEARCH_FAILED");
    } finally { this.active.delete(request.sessionId); }
  }

  async interrupt() {
    // Each bounded read-only query has a hard 5s subprocess timeout.
    // Interrupt of a running query is not implemented; report that accurately.
    throw new Error("CODEATLAS_INTERRUPT_NOT_SUPPORTED");
  }
}
