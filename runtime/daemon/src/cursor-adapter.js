import { spawn, spawnSync } from "node:child_process";
import readline from "node:readline";

const now = () => new Date().toISOString();

export class CursorAdapter {
  name = "cursor";
  children = new Map();

  constructor({ found = undefined, spawnImpl = spawn } = {}) {
    this.found = found === undefined ? findCursorCommand() : found;
    this.spawnImpl = spawnImpl;
  }

  capability() {
    return this.found ? { name: this.name, executable: this.found.executable, version: this.found.version } : null;
  }

  async run(request, emit) {
    if (!this.found) throw new Error("Cursor Agent CLI is not installed");
    if (this.children.has(request.sessionId)) throw new Error("A Cursor turn is already running for this session");

    const args = buildCursorArgs(request);
    emit({ kind: "status", status: "running", message: "Cursor turn started", at: now() });
    const child = this.spawnImpl(this.found.executable, args, {
      cwd: request.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.children.set(request.sessionId, child);

    let nativeSessionId = request.nativeSessionId ?? null;
    let terminal = false;
    let sawError = false;
    const stdout = readline.createInterface({ input: child.stdout });
    stdout.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const normalized = normalizeCursorEvent(JSON.parse(line));
        if (normalized.nativeSessionId && normalized.nativeSessionId !== nativeSessionId) {
          nativeSessionId = normalized.nativeSessionId;
          emit({ kind: "thread", nativeSessionId, at: now() });
        }
        for (const event of normalized.events) {
          if (event.kind === "error") sawError = true;
          if (event.kind === "status") terminal = true;
          emit({ ...event, at: event.at ?? now() });
        }
      } catch {
        emit({ kind: "log", stream: "stdout", text: line, at: now() });
      }
    });
    const stderr = readline.createInterface({ input: child.stderr });
    stderr.on("line", (line) => line.trim() && emit({ kind: "log", stream: "stderr", text: line, at: now() }));

    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    }).finally(() => {
      this.children.delete(request.sessionId);
      stdout.close();
      stderr.close();
    });

    if (!terminal) {
      if (code !== 0) {
        sawError = true;
        emit({ kind: "error", message: `Cursor Agent exited with code ${code ?? "unknown"}`, at: now() });
      }
      emit({ kind: "status", status: code === 0 && !sawError ? "completed" : "failed", at: now() });
    }
    return { nativeSessionId };
  }

  async interrupt(sessionId) {
    const child = this.children.get(sessionId);
    if (!child) return;
    child.kill("SIGINT");
    setTimeout(() => { if (child.exitCode === null) child.kill("SIGTERM"); }, 2000).unref();
  }
}

export function buildCursorArgs(request) {
  const model = request.model || process.env.AGENT_WORK_OS_CURSOR_MODEL;
  const mode = process.env.AGENT_WORK_OS_CURSOR_MODE;
  const extra = parseJsonArgs(process.env.AGENT_WORK_OS_CURSOR_ARGS);
  const args = ["--print", "--output-format", "stream-json"];
  if (model) args.push("--model", model);
  if (mode) args.push("--mode", mode);
  if (request.nativeSessionId) args.push("--resume", request.nativeSessionId);
  args.push(...extra, request.prompt);
  return args;
}

export function normalizeCursorEvent(event) {
  const nativeSessionId = typeof event?.session_id === "string" ? event.session_id : null;
  const events = [];
  if (!event || typeof event !== "object") return { nativeSessionId, events };

  if (event.type === "assistant") {
    for (const part of event.message?.content ?? []) {
      if (part?.type === "text" && typeof part.text === "string" && part.text) {
        events.push({ kind: "text", text: part.text });
      }
    }
  } else if (event.type === "tool_call") {
    const phase = event.subtype === "started" ? "started" : "completed";
    const tool = event.tool_call && typeof event.tool_call === "object" ? Object.keys(event.tool_call)[0] : null;
    events.push({ kind: "tool", name: tool ?? "tool", phase, payload: event.tool_call ?? {} });
  } else if (event.type === "result") {
    if (event.usage && typeof event.usage === "object") {
      events.push({
        kind: "usage",
        usage: {
          inputTokens: event.usage.inputTokens ?? event.usage.input_tokens,
          outputTokens: event.usage.outputTokens ?? event.usage.output_tokens,
          cachedInputTokens: event.usage.cacheReadTokens ?? event.usage.cachedInputTokens ?? event.usage.cached_input_tokens,
          cacheCreationInputTokens: event.usage.cacheWriteTokens ?? event.usage.cacheCreationInputTokens,
          cost: event.usage.cost
        }
      });
    }
    if (event.is_error === true || event.subtype === "error") {
      events.push({ kind: "error", message: String(event.result ?? event.error?.message ?? "Cursor turn failed") });
      events.push({ kind: "status", status: "failed" });
    } else {
      events.push({ kind: "status", status: "completed" });
    }
  } else if (event.type === "system" || event.type === "user") {
    // Session identity is consumed above. User/system echo events do not need canonical emission.
  } else if (event.type === "error") {
    events.push({ kind: "error", message: String(event.message ?? event.error?.message ?? "Cursor turn failed") });
  } else {
    events.push({ kind: "log", stream: "stdout", text: JSON.stringify(event) });
  }

  return { nativeSessionId, events };
}

function findCursorCommand() {
  for (const command of ["agent", "cursor-agent"]) {
    const found = findCommand(command);
    if (found) return found;
  }
  return null;
}

function findCommand(command) {
  const finder = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(finder, [command], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const executable = result.stdout.trim().split(/\r?\n/)[0] || command;
  const version = spawnSync(executable, ["--version"], { encoding: "utf8", timeout: 3000 });
  return { executable, version: version.status === 0 ? version.stdout.trim().split(/\r?\n/)[0] : undefined };
}

function parseJsonArgs(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch {
    return [];
  }
}
