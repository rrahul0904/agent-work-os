import path from "node:path";
import { constants } from "node:fs";
import { lstat, realpath, readdir, open } from "node:fs/promises";

const MAX_FILE_BYTES = 32 * 1024;
const MAX_OUTPUT_CHARS = 8_000;
const EXTENSIONS = new Set([".txt", ".md", ".csv", ".json"]);

function validRelativeFile(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240 ||
      path.isAbsolute(value) || value.includes("\\") || value.includes("\0")) {
    return false;
  }
  const segments = value.split("/");
  return segments.every((s) => s && s !== "." && s !== ".." && !s.startsWith(".") &&
    /^[\p{L}\p{N}_ .()-]+$/u.test(s));
}

async function checkedFilePath(root, relative) {
  if (!validRelativeFile(relative) || !EXTENSIONS.has(path.extname(relative).toLowerCase())) {
    throw new Error("COWORK_FILE_PATH_DENIED");
  }
  let cursor = root;
  const segments = relative.split("/");
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    const stat = await lstat(cursor);
    if (stat.isSymbolicLink()) throw new Error("COWORK_SYMLINK_DENIED");
  }
  const resolved = await realpath(cursor);
  if (resolved === root || !resolved.startsWith(root + path.sep)) throw new Error("COWORK_FILE_OUTSIDE_ROOT");
  return resolved;
}

export class CoworkReadOnlyFilesAdapter {
  name = "cowork-files";
  constructor({ env = process.env } = {}) {
    this.enabled = env.AGENT_WORK_OS_COWORK_FILES_READONLY_ENABLED === "true";
    this.root = env.AGENT_WORK_OS_COWORK_FILES_ROOT || "";
    this.active = new Set();
  }
  capability() {
    if (!this.enabled || !path.isAbsolute(this.root)) return null;
    return { name: this.name, version: "cowork-files/v1", mode: "read_only", actions: ["list", "read"] };
  }

  async run(request, emit) {
    if (!this.capability()) throw new Error("COWORK_FILES_NOT_CONFIGURED");
    if (!request?.sessionId || this.active.has(request.sessionId)) throw new Error("COWORK_FILES_SESSION_BUSY");
    const action = typeof request.prompt === "string" ? request.prompt.trim() : "";
    if (action !== "list" && !/^read\s+\S[\s\S]*$/u.test(action)) throw new Error("COWORK_ACTION_DENIED");
    const root = await realpath(this.root);
    const rootStatus = await lstat(root);
    if (!rootStatus.isDirectory()) throw new Error("COWORK_ROOT_NOT_DIRECTORY");
    if (request.cwd && (await realpath(request.cwd)) !== root) throw new Error("COWORK_WORKSPACE_MISMATCH");
    const nativeSessionId = "cowork-files-" + request.sessionId;
    if (request.nativeSessionId && request.nativeSessionId !== nativeSessionId) throw new Error("COWORK_SESSION_MISMATCH");
    this.active.add(request.sessionId);
    emit({ kind: "status", status: "running", message: "Cowork read-only file inspection", at: new Date().toISOString() });
    if (!request.nativeSessionId) emit({ kind: "thread", nativeSessionId, at: new Date().toISOString() });
    try {
      let result;
      if (action === "list") {
        const entries = await readdir(root, { withFileTypes: true });
        result = {
          source: "cowork-files", action: "list", root: "approved_workspace",
          files: entries.filter((e) => e.isFile() && !e.isSymbolicLink() &&
            !e.name.startsWith(".") && EXTENSIONS.has(path.extname(e.name).toLowerCase()))
            .map((e) => e.name).sort().slice(0, 100)
        };
      } else {
        const relative = action.slice(5).trim();
        const filePath = await checkedFilePath(root, relative);
        const fileStat = await lstat(filePath);
        if (!fileStat.isFile() || fileStat.size > MAX_FILE_BYTES) throw new Error("COWORK_FILE_TYPE_OR_SIZE_DENIED");
        // O_NOFOLLOW protects the final component against a symlink race on Unix.
        const handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
        let content;
        try {
          const stat = await handle.stat();
          if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error("COWORK_FILE_TYPE_OR_SIZE_DENIED");
          content = await handle.readFile({ encoding: "utf8" });
        } finally { await handle.close(); }
        if (content.includes("\0")) throw new Error("COWORK_BINARY_FILE_DENIED");
        result = { source: "cowork-files", action: "read", file: relative,
          truncated: content.length > MAX_OUTPUT_CHARS, text: content.slice(0, MAX_OUTPUT_CHARS) };
      }
      emit({ kind: "text", text: JSON.stringify(result), at: new Date().toISOString() });
      emit({ kind: "status", status: "completed", at: new Date().toISOString() });
      return { nativeSessionId };
    } catch (error) {
      if (error.message?.startsWith("COWORK_")) throw error;
      throw new Error("COWORK_FILE_READ_FAILED");
    } finally { this.active.delete(request.sessionId); }
  }
  async interrupt() {}
}
