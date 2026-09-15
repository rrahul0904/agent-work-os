import { spawn, spawnSync } from "node:child_process";
import readline from "node:readline";

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
    const model = request.model || process.env.AGENT_WORK_OS_CODEX_MODEL;
    const extra = parseJsonArgs(process.env.AGENT_WORK_OS_CODEX_ARGS);
    const args = ["exec", "--json", "--full-auto", "--cd", request.cwd];
    if (model) args.push("--model", model);
    args.push(...extra);
    if (request.nativeSessionId) args.push("resume", request.nativeSessionId, request.prompt);
    else args.push(request.prompt);

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
        if (event.type === "item.started" || event.type === "item.completed") {
          const item = event.item ?? {}; const itemType = item.type ?? "item";
          if (itemType === "agent_message" && typeof item.text === "string" && event.type === "item.completed") emit({ kind: "text", text: item.text, at: now() });
          else if (itemType === "error") emit({ kind: "error", message: String(item.message ?? "Codex item error"), at: now() });
          else emit({ kind: "tool", name: String(itemType), phase: event.type === "item.started" ? "started" : "completed", payload: item, at: now() });
          return;
        }
        if (event.type === "turn.completed") {
          emit({ kind: "usage", usage: normalizeUsage(event.usage), at: now() }); emit({ kind: "status", status: "completed", at: now() }); terminal = true; return;
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
    if (!terminal) {
      if (code !== 0) emit({ kind: "error", message: `Codex exited with code ${code ?? "unknown"}`, at: now() });
      emit({ kind: "status", status: code === 0 ? "completed" : "failed", at: now() });
    }
    return { nativeSessionId };
  }

  async interrupt(sessionId) {
    const child = this.children.get(sessionId); if (!child) return;
    child.kill("SIGINT"); setTimeout(() => { if (child.exitCode === null) child.kill("SIGTERM"); }, 2000).unref();
  }
}

function normalizeUsage(usage = {}) {
  return { inputTokens: usage.input_tokens, cachedInputTokens: usage.cached_input_tokens, outputTokens: usage.output_tokens, reasoningOutputTokens: usage.reasoning_output_tokens };
}
function parseJsonArgs(value) { if (!value) return []; try { const parsed = JSON.parse(value); return Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? parsed : []; } catch { return []; } }
