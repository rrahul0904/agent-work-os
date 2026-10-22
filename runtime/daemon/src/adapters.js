import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import readline from "node:readline";
import { codexExecArgs, projectCodexExecEvent } from "./codex-activity.js";

const now = () => new Date().toISOString();

export function findCommand(command) {
  const finder = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(finder, [command], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const executable = result.stdout.trim().split(/\r?\n/)[0] || command;
  const version = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 3000 });
  return { executable, version: version.status === 0 ? version.stdout.trim().split(/\r?\n/)[0] : undefined };
}

export class EchoAdapter {
  name = "echo";
  capability() { return { name: "echo", executable: "builtin", version: "1" }; }
  async run(request, emit) {
    emit({ kind: "status", status: "running", message: "Echo adapter started", at: now() });
    const nativeSessionId = request.nativeSessionId ?? `echo-${request.sessionId}`;
    if (!request.nativeSessionId) emit({ kind: "thread", nativeSessionId, at: now() });
    await new Promise((resolve) => setTimeout(resolve, 60));
    emit({ kind: "text", text: `Echo: ${request.prompt}`, at: now() });
    emit({ kind: "status", status: "completed", at: now() });
    return { nativeSessionId };
  }
  async interrupt() {}
}

export class CodexAdapter {
  name = "codex";
  children = new Map();
  constructor() { this.found = findCommand("codex"); }
  capability() { return this.found ? { name: "codex", executable: this.found.executable, version: this.found.version } : null; }

  async run(request, emit) {
    if (!this.found) throw new Error("Codex CLI is not installed");
    if (this.children.has(request.sessionId)) throw new Error("A Codex turn is already running for this session");
    const traceId = randomUUID();
    const model = request.model || process.env.AGENT_WORK_OS_CODEX_MODEL;
    const extra = parseJsonArgs(process.env.AGENT_WORK_OS_CODEX_ARGS);
    const args = codexExecArgs(request, { model, extra });

    emit({ kind: "status", status: "running", message: "Codex turn started", at: now() });
    const child = spawn(this.found.executable, args, { cwd: request.cwd, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
    this.children.set(request.sessionId, child);
    let nativeSessionId = request.nativeSessionId;
    let terminal = false;

    const stdout = readline.createInterface({ input: child.stdout });
    stdout.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        if (event.type === "thread.started" && typeof event.thread_id === "string") {
          nativeSessionId = event.thread_id; emit({ kind: "thread", nativeSessionId, at: now() }); return;
        }
        if (event.type === "item.started" || event.type === "item.updated" || event.type === "item.completed") {
          const projected = projectCodexExecEvent(event, now());
          if (projected) emit({ ...projected, traceId });
          const item = event.item ?? {};
          if (item.type === "agent_message" && typeof item.text === "string" && event.type === "item.completed") {
            emit({ kind: "text", text: item.text, at: now() });
          }
          if (item.type === "error" && event.type === "item.completed") {
            emit({ kind: "error", message: String(item.message ?? "Codex item error"), at: now() });
          }
          return;
        }
        if (event.type === "turn.completed") {
          emit({ kind: "usage", usage: normalizeCodexUsage(event.usage), at: now() }); emit({ kind: "status", status: "completed", at: now() }); terminal = true; return;
        }
        if (event.type === "turn.failed" || event.type === "error") {
          emit({ kind: "error", message: String(event.error?.message ?? event.message ?? "Codex turn failed"), at: now() });
          if (event.type === "turn.failed") { emit({ kind: "status", status: "failed", at: now() }); terminal = true; }
          return;
        }
        emit({ kind: "log", stream: "stdout", text: line, at: now() });
      } catch { emit({ kind: "log", stream: "stdout", text: line, at: now() }); }
    });
    const stderr = readline.createInterface({ input: child.stderr });
    stderr.on("line", (line) => line.trim() && emit({ kind: "log", stream: "stderr", text: line, at: now() }));
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); })
      .finally(() => { this.children.delete(request.sessionId); stdout.close(); stderr.close(); });
    if (code !== 0 || !terminal) {
      emit({ kind: "error", message: code !== 0
        ? `Codex exited with code ${code ?? "unknown"}`
        : "Codex exited without a terminal turn event", at: now() });
      emit({ kind: "status", status: "failed", at: now() });
    }
    return { nativeSessionId };
  }

  async interrupt(sessionId) {
    const child = this.children.get(sessionId); if (!child) return;
    child.kill("SIGINT"); setTimeout(() => { if (child.exitCode === null) child.kill("SIGTERM"); }, 2000).unref();
  }
}

export class ClaudeCodeAdapter {
  name = "claude-code";
  children = new Map();

  constructor({ found = undefined, spawnImpl = spawn, uuid = randomUUID } = {}) {
    this.found = found === undefined ? findCommand("claude") : found;
    this.spawnImpl = spawnImpl;
    this.uuid = uuid;
  }

  capability() {
    return this.found ? { name: this.name, executable: this.found.executable, version: this.found.version } : null;
  }

  async run(request, emit) {
    if (!this.found) throw new Error("Claude Code CLI is not installed");
    if (this.children.has(request.sessionId)) throw new Error("A Claude Code turn is already running for this session");
    const nativeSessionId = request.nativeSessionId ?? this.uuid();
    const args = buildClaudeArgs(request, nativeSessionId);

    emit({ kind: "status", status: "running", message: "Claude Code turn started", at: now() });
    if (!request.nativeSessionId) emit({ kind: "thread", nativeSessionId, at: now() });
    const child = this.spawnImpl(this.found.executable, args, { cwd: request.cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    this.children.set(request.sessionId, child);
    let resolvedSessionId = nativeSessionId;
    let terminal = false;
    let sawText = false;

    const stdout = readline.createInterface({ input: child.stdout });
    stdout.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const normalized = normalizeClaudeStreamEvent(JSON.parse(line));
        if (normalized.nativeSessionId && normalized.nativeSessionId !== resolvedSessionId) {
          resolvedSessionId = normalized.nativeSessionId;
          emit({ kind: "thread", nativeSessionId: resolvedSessionId, at: now() });
        }
        for (const event of normalized.events) {
          if (event.kind === "text") sawText = true;
          emit({ ...event, at: event.at ?? now() });
        }
        if (!sawText && normalized.resultText) {
          sawText = true;
          emit({ kind: "text", text: normalized.resultText, at: now() });
        }
        if (normalized.terminal) terminal = true;
      } catch {
        emit({ kind: "log", stream: "stdout", text: line, at: now() });
      }
    });
    const stderr = readline.createInterface({ input: child.stderr });
    stderr.on("line", (line) => line.trim() && emit({ kind: "log", stream: "stderr", text: line, at: now() }));
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); })
      .finally(() => { this.children.delete(request.sessionId); stdout.close(); stderr.close(); });
    if (!terminal) {
      if (code !== 0) emit({ kind: "error", message: `Claude Code exited with code ${code ?? "unknown"}`, at: now() });
      emit({ kind: "status", status: code === 0 ? "completed" : "failed", at: now() });
    }
    return { nativeSessionId: resolvedSessionId };
  }

  async interrupt(sessionId) {
    const child = this.children.get(sessionId); if (!child) return;
    child.kill("SIGINT");
    setTimeout(() => { if (child.exitCode === null) child.kill("SIGTERM"); }, 2000).unref();
  }
}

export function buildClaudeArgs(request, nativeSessionId) {
  const model = request.model || process.env.AGENT_WORK_OS_CLAUDE_MODEL;
  const permissionMode = process.env.AGENT_WORK_OS_CLAUDE_PERMISSION_MODE || "acceptEdits";
  const extra = parseJsonArgs(process.env.AGENT_WORK_OS_CLAUDE_ARGS);
  const args = ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", permissionMode];
  if (model) args.push("--model", model);
  args.push(...extra);
  if (request.nativeSessionId) args.push("--resume", request.nativeSessionId);
  else args.push("--session-id", nativeSessionId);
  args.push(request.prompt);
  return args;
}

export function normalizeClaudeStreamEvent(event) {
  const events = [];
  let terminal = false;
  let resultText = null;
  const nativeSessionId = typeof event?.session_id === "string" ? event.session_id
    : typeof event?.sessionId === "string" ? event.sessionId
      : typeof event?.message?.session_id === "string" ? event.message.session_id : null;

  if (!event || typeof event !== "object") return { nativeSessionId, terminal, resultText, events };

  if (event.type === "assistant") {
    for (const block of normalizeContent(event.message?.content ?? event.content)) {
      if (block.type === "text" && typeof block.text === "string" && block.text) {
        events.push({ kind: "text", text: block.text });
      } else if (block.type === "tool_use") {
        events.push({ kind: "tool", name: String(block.name ?? "tool"), phase: "started", payload: block });
      }
    }
  } else if (event.type === "user") {
    for (const block of normalizeContent(event.message?.content ?? event.content)) {
      if (block.type === "tool_result") {
        events.push({
          kind: block.is_error ? "error" : "tool",
          ...(block.is_error
            ? { message: extractClaudeToolResultText(block) || "Claude Code tool failed" }
            : { name: "tool_result", phase: "completed", payload: block })
        });
      }
    }
  } else if (event.type === "result") {
    if (event.usage) events.push({ kind: "usage", usage: normalizeClaudeUsage(event.usage) });
    if (event.is_error || ["error", "failed"].includes(event.subtype)) {
      events.push({ kind: "error", message: String(event.error ?? event.result ?? event.message ?? "Claude Code turn failed") });
      events.push({ kind: "status", status: "failed" });
    } else {
      if (typeof event.result === "string" && event.result) resultText = event.result;
      events.push({ kind: "status", status: "completed" });
    }
    terminal = true;
  } else if (event.type === "error") {
    events.push({ kind: "error", message: String(event.error?.message ?? event.message ?? event.error ?? "Claude Code error") });
  } else if (event.type === "system" && event.subtype === "init") {
    // Session metadata is captured through session_id above. No user-facing event is needed.
  } else {
    events.push({ kind: "log", stream: "stdout", text: JSON.stringify(event) });
  }

  return { nativeSessionId, terminal, resultText, events };
}

function normalizeContent(content) {
  if (Array.isArray(content)) return content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  return [];
}

function extractClaudeToolResultText(block) {
  if (typeof block.content === "string") return block.content;
  if (!Array.isArray(block.content)) return "";
  return block.content.filter((entry) => entry?.type === "text" && typeof entry.text === "string").map((entry) => entry.text).join("\n");
}

function normalizeCodexUsage(usage = {}) {
  return { inputTokens: usage.input_tokens, cachedInputTokens: usage.cached_input_tokens, outputTokens: usage.output_tokens, reasoningOutputTokens: usage.reasoning_output_tokens };
}

function normalizeClaudeUsage(usage = {}) {
  return {
    inputTokens: usage.input_tokens,
    cachedInputTokens: usage.cache_read_input_tokens,
    cacheCreationInputTokens: usage.cache_creation_input_tokens,
    outputTokens: usage.output_tokens
  };
}

function parseJsonArgs(value) { if (!value) return []; try { const parsed = JSON.parse(value); return Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? parsed : []; } catch { return []; } }
