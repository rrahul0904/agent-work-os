import os from "node:os";
import path from "node:path";
import { open, lstat, readdir, readFile, realpath } from "node:fs/promises";

const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_MAX_SESSIONS = 40;
const DEFAULT_ACTIVE_WINDOW_MS = 12 * 60 * 60 * 1000;
const APPROVAL_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const QUESTION_TOOLS = new Set(["AskUserQuestion", "ExitPlanMode"]);
const DELEGATION_TOOLS = new Set(["Agent", "Task"]);

export function defaultClaudeProjectsRoot(env = process.env, home = os.homedir()) {
  if (env.AGENT_WORK_OS_CLAUDE_PROJECTS) return path.resolve(env.AGENT_WORK_OS_CLAUDE_PROJECTS);
  const config = env.CLAUDE_CONFIG_DIR ? path.resolve(env.CLAUDE_CONFIG_DIR) : path.join(home, ".claude");
  return path.join(config, "projects");
}

export class ClaudeTranscriptObserver {
  constructor({ root = defaultClaudeProjectsRoot(), maxBytes = DEFAULT_MAX_BYTES, maxSessions = DEFAULT_MAX_SESSIONS, activeWindowMs = DEFAULT_ACTIVE_WINDOW_MS, now = () => Date.now() } = {}) {
    this.root = path.resolve(root);
    this.maxBytes = Math.max(16 * 1024, Math.min(Number(maxBytes) || DEFAULT_MAX_BYTES, 2 * 1024 * 1024));
    this.maxSessions = Math.max(1, Math.min(Number(maxSessions) || DEFAULT_MAX_SESSIONS, 100));
    this.activeWindowMs = Math.max(60_000, Number(activeWindowMs) || DEFAULT_ACTIVE_WINDOW_MS);
    this.now = now;
  }

  async isAvailable() {
    try {
      const stat = await lstat(this.root);
      if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
      const resolved = await realpath(this.root);
      return path.resolve(resolved) === this.root;
    } catch {
      return false;
    }
  }

  async scan(machineId) {
    if (!(await this.isAvailable())) return [];
    const candidates = await this.#discoverMainSessions();
    const snapshots = [];
    for (const candidate of candidates.slice(0, this.maxSessions)) {
      const main = await this.#readSession(candidate, machineId, "main", null);
      if (main) snapshots.push(main);
      const subagents = await this.#discoverSubagents(candidate);
      for (const sub of subagents) {
        const child = await this.#readSession({ ...candidate, file: sub.file, mtimeMs: sub.mtimeMs }, machineId, sub.agentId, main?.id || null, sub.meta);
        if (child) snapshots.push(child);
      }
    }
    return snapshots;
  }

  async #discoverMainSessions() {
    const out = [];
    const projects = await readdir(this.root, { withFileTypes: true }).catch(() => []);
    for (const project of projects) {
      if (!project.isDirectory() || project.isSymbolicLink() || !safeName(project.name)) continue;
      const projectDir = safeJoin(this.root, project.name);
      if (!projectDir || !(await safeDirectory(projectDir, this.root))) continue;
      const files = await readdir(projectDir, { withFileTypes: true }).catch(() => []);
      for (const entry of files) {
        if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".jsonl")) continue;
        const sessionId = entry.name.slice(0, -6);
        if (!safeName(sessionId)) continue;
        const file = safeJoin(projectDir, entry.name);
        if (!file || !(await safeRegularFile(file, this.root))) continue;
        const stat = await lstat(file).catch(() => null);
        if (!stat || this.now() - stat.mtimeMs > this.activeWindowMs) continue;
        out.push({ project: project.name, projectDir, sessionId, file, mtimeMs: stat.mtimeMs });
      }
    }
    return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  }

  async #discoverSubagents(candidate) {
    const subDir = safeJoin(candidate.projectDir, candidate.sessionId, "subagents");
    if (!subDir || !(await safeDirectory(subDir, this.root))) return [];
    const entries = await readdir(subDir, { withFileTypes: true }).catch(() => []);
    const out = [];
    for (const entry of entries) {
      if (!entry.isFile() || entry.isSymbolicLink() || !/^agent-[A-Za-z0-9._-]+\.jsonl$/.test(entry.name)) continue;
      const file = safeJoin(subDir, entry.name);
      if (!file || !(await safeRegularFile(file, this.root))) continue;
      const stat = await lstat(file).catch(() => null);
      if (!stat) continue;
      const agentId = entry.name.slice("agent-".length, -6);
      const metaFile = safeJoin(subDir, `agent-${agentId}.meta.json`);
      const meta = metaFile ? await readSmallJson(metaFile, this.root) : {};
      out.push({ file, agentId, meta, mtimeMs: stat.mtimeMs });
    }
    return out.sort((a, b) => a.agentId.localeCompare(b.agentId));
  }

  async #readSession(candidate, machineId, agentId, parentSessionId, meta = {}) {
    const tail = await readBoundedTail(candidate.file, this.maxBytes);
    if (!tail) return null;
    const parsed = normalizeClaudeTranscript(tail.text, {
      nowMs: this.now(),
      fileMtimeMs: candidate.mtimeMs,
      agentId,
      meta
    });
    const id = observedId(candidate.project, candidate.sessionId, agentId);
    const title = parsed.title || meta.description || meta.agentType || (agentId === "main" ? candidate.sessionId : `Agent ${agentId}`);
    return {
      id,
      machineId,
      cwd: parsed.cwd || `claude://${candidate.project}/${candidate.sessionId}`,
      agent: agentId === "main" ? "claude" : "claude-subagent",
      model: parsed.model || undefined,
      status: parsed.status,
      nativeSessionId: candidate.sessionId,
      observedParentSessionId: parentSessionId || undefined,
      observedRole: agentId === "main" ? "Lead" : (meta.description || meta.agentType || "Sub-agent"),
      source: { kind: "claude-jsonl", project: candidate.project, sessionId: candidate.sessionId, agentId },
      createdAt: parsed.createdAt || new Date(candidate.mtimeMs).toISOString(),
      updatedAt: parsed.updatedAt || new Date(candidate.mtimeMs).toISOString(),
      messages: parsed.messages.slice(-12),
      events: parsed.events.slice(-100)
    };
  }
}

export function normalizeClaudeTranscript(text, { nowMs = Date.now(), fileMtimeMs = nowMs, agentId = "main", meta = {} } = {}) {
  const records = parseCompleteJsonLines(text);
  const pending = new Map();
  const events = [];
  const messages = [];
  let createdAt = null;
  let updatedAt = null;
  let model = null;
  let cwd = null;
  let title = meta.description || null;
  let lastType = null;

  for (const record of records) {
    const timestamp = normalizeTimestamp(record.timestamp, fileMtimeMs);
    createdAt ||= timestamp;
    updatedAt = timestamp;
    if (typeof record.cwd === "string" && record.cwd.trim()) cwd = record.cwd.trim();
    const content = contentBlocks(record);
    if (record.type === "assistant") {
      lastType = "assistant";
      if (record.message?.model) model = String(record.message.model);
      for (const block of content) {
        if (block?.type === "text" && typeof block.text === "string" && block.text.trim()) {
          const value = clip(block.text.trim(), 6000);
          events.push({ kind: "text", text: value, at: timestamp, observedAgentId: agentId });
          messages.push({ id: messageId(record, messages.length), role: "assistant", text: value, createdAt: timestamp });
        } else if (block?.type === "tool_use" && typeof block.id === "string") {
          const name = String(block.name || "tool");
          pending.set(block.id, { name, at: timestamp, atMs: Date.parse(timestamp) || fileMtimeMs });
          events.push({ kind: "tool", name, phase: "started", payload: boundedPayload(block.input), toolUseId: block.id, at: timestamp, observedAgentId: agentId });
        }
      }
    } else if (record.type === "user") {
      lastType = "user";
      for (const block of content) {
        if (block?.type === "text" && typeof block.text === "string" && block.text.trim() && !record.isMeta) {
          const value = clip(block.text.trim(), 6000);
          if (!title && !value.startsWith("<")) title = compact(value, 100);
          messages.push({ id: messageId(record, messages.length), role: "user", text: value, createdAt: timestamp });
        } else if (block?.type === "tool_result" && typeof block.tool_use_id === "string") {
          const prior = pending.get(block.tool_use_id);
          const output = clip(resultText(block.content), 5000);
          events.push({ kind: block.is_error ? "error" : "tool", name: prior?.name || "tool", phase: block.is_error ? "failed" : "completed", message: block.is_error ? output || `${prior?.name || "Tool"} failed` : undefined, payload: block.is_error ? undefined : { output }, toolUseId: block.tool_use_id, at: timestamp, observedAgentId: agentId });
          pending.delete(block.tool_use_id);
        }
      }
    }
  }

  const mtimeIso = new Date(fileMtimeMs).toISOString();
  createdAt ||= mtimeIso;
  updatedAt ||= mtimeIso;
  const status = deriveStatus({ pending, lastType, updatedAt, nowMs, agentId });
  return { title, model, cwd, status, createdAt, updatedAt, messages, events, pending: [...pending.values()] };
}

export function parseCompleteJsonLines(text) {
  const source = String(text || "");
  const lines = source.split("\n");
  if (source && !source.endsWith("\n")) lines.pop();
  const records = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object") records.push(parsed);
    } catch {}
  }
  return records;
}

function deriveStatus({ pending, lastType, updatedAt, nowMs, agentId }) {
  const lastPending = [...pending.values()].at(-1);
  const activityMs = Date.parse(updatedAt) || nowMs;
  const age = Math.max(0, nowMs - activityMs);
  if (lastPending) {
    const pendingAge = Math.max(0, nowMs - lastPending.atMs);
    if (DELEGATION_TOOLS.has(lastPending.name)) return "waiting";
    if (QUESTION_TOOLS.has(lastPending.name) && pendingAge >= 4000) return "blocked";
    if (APPROVAL_TOOLS.has(lastPending.name) && pendingAge >= 15000) return "blocked";
    return "running";
  }
  if (agentId !== "main" && lastType === "assistant") return "completed";
  if (age >= 30 * 60_000) return "completed";
  if (age <= 30_000 && lastType === "user") return "running";
  return "waiting";
}

async function readBoundedTail(file, maxBytes) {
  const handle = await open(file, "r").catch(() => null);
  if (!handle) return null;
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) return null;
    const length = Math.min(stat.size, maxBytes);
    const start = stat.size - length;
    const buffer = Buffer.alloc(length);
    if (length) await handle.read(buffer, 0, length, start);
    let text = buffer.toString("utf8");
    if (start > 0) {
      const newline = text.indexOf("\n");
      text = newline < 0 ? "" : text.slice(newline + 1);
    }
    return { text, size: stat.size };
  } finally {
    await handle.close();
  }
}

async function safeDirectory(candidate, root) {
  try {
    if (!inside(root, candidate)) return false;
    const stat = await lstat(candidate);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
    const resolved = await realpath(candidate);
    return inside(root, resolved);
  } catch {
    return false;
  }
}

async function safeRegularFile(candidate, root) {
  try {
    if (!inside(root, candidate)) return false;
    const stat = await lstat(candidate);
    if (stat.isSymbolicLink() || !stat.isFile()) return false;
    const resolved = await realpath(candidate);
    return inside(root, resolved);
  } catch {
    return false;
  }
}

async function readSmallJson(file, root) {
  if (!(await safeRegularFile(file, root))) return {};
  try {
    const stat = await lstat(file);
    if (stat.size > 64 * 1024) return {};
    const value = JSON.parse(await readFile(file, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function contentBlocks(record) {
  const content = record?.message?.content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? content : [];
}

function resultText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(item => typeof item?.text === "string" ? item.text : "").filter(Boolean).join("\n");
  return content == null ? "" : String(content);
}

function boundedPayload(value) {
  if (value == null) return null;
  try {
    const raw = JSON.stringify(value);
    if (raw.length <= 5000) return value;
    return { truncated: true, preview: raw.slice(0, 5000) };
  } catch {
    return { preview: clip(value, 5000) };
  }
}

function messageId(record, index) {
  const base = record?.uuid || record?.message?.id || record?.timestamp || "message";
  return `observed:${base}:${index}`;
}

function normalizeTimestamp(value, fallbackMs) {
  const parsed = Date.parse(value);
  return new Date(Number.isFinite(parsed) ? parsed : fallbackMs).toISOString();
}

function observedId(project, sessionId, agentId) {
  return `observed:claude:${project}:${sessionId}:${agentId}`;
}

function safeName(value) {
  return typeof value === "string" && /^[A-Za-z0-9._-]+$/.test(value) && value !== "." && value !== "..";
}

function safeJoin(base, ...parts) {
  const candidate = path.resolve(base, ...parts);
  return inside(base, candidate) ? candidate : null;
}

function inside(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

function clip(value, max) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function compact(value, max) {
  return clip(String(value).replace(/\s+/g, " ").trim(), max);
}
