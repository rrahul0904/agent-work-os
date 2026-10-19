import { spawn, spawnSync } from "node:child_process";
import readline from "node:readline";

const now = () => new Date().toISOString();

export class OpenCodeAdapter {
  name = "opencode";
  children = new Map();

  constructor({ found = undefined, spawnImpl = spawn } = {}) {
    this.found = found === undefined ? findCommand("opencode") : found;
    this.spawnImpl = spawnImpl;
  }

  capability() {
    return this.found ? { name: this.name, executable: this.found.executable, version: this.found.version } : null;
  }

  async run(request, emit) {
    if (!this.found) throw new Error("OpenCode CLI is not installed");
    if (this.children.has(request.sessionId)) throw new Error("An OpenCode turn is already running for this session");

    const args = buildOpenCodeArgs(request);
    emit({ kind: "status", status: "running", message: "OpenCode turn started", at: now() });

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
        const normalized = normalizeOpenCodeEvent(JSON.parse(line));
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

    // OpenCode has had versions where the final step_finish event can be omitted
    // even though the process completed normally. Treat process exit as terminal truth.
    if (!terminal) {
      if (code !== 0) {
        sawError = true;
        emit({ kind: "error", message: `OpenCode exited with code ${code ?? "unknown"}`, at: now() });
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

export function buildOpenCodeArgs(request) {
  const model = request.model || process.env.AGENT_WORK_OS_OPENCODE_MODEL;
  const agent = process.env.AGENT_WORK_OS_OPENCODE_AGENT;
  const extra = parseJsonArgs(process.env.AGENT_WORK_OS_OPENCODE_ARGS);
  const args = ["run", "--format", "json", "--dir", request.cwd];
  if (model) args.push("--model", model);
  if (agent) args.push("--agent", agent);
  if (request.nativeSessionId) args.push("--session", request.nativeSessionId);
  args.push(...extra, request.prompt);
  return args;
}

export function normalizeOpenCodeEvent(event) {
  const events = [];
  const nativeSessionId = typeof event?.sessionID === "string" ? event.sessionID : null;
  if (!event || typeof event !== "object") return { nativeSessionId, events };

  if (event.type === "text") {
    const text = event.part?.text;
    if (typeof text === "string" && text) events.push({ kind: "text", text });
  } else if (event.type === "tool_use") {
    const part = event.part ?? {};
    const failed = part.state?.status === "error";
    if (failed) {
      events.push({ kind: "error", message: String(part.state?.error ?? `${part.tool ?? "tool"} failed`) });
    } else {
      events.push({ kind: "tool", name: String(part.tool ?? "tool"), phase: "completed", payload: part });
    }
  } else if (event.type === "step_start") {
    events.push({ kind: "tool", name: "step", phase: "started", payload: event.part ?? {} });
  } else if (event.type === "step_finish") {
    const tokens = event.part?.tokens ?? {};
    events.push({
      kind: "usage",
      usage: {
        inputTokens: tokens.input,
        outputTokens: tokens.output,
        reasoningOutputTokens: tokens.reasoning,
        cachedInputTokens: tokens.cache?.read,
        cacheCreationInputTokens: tokens.cache?.write,
        cost: event.part?.cost
      }
    });
  } else if (event.type === "error") {
    events.push({ kind: "error", message: String(event.error?.data?.message ?? event.error?.message ?? event.error ?? "OpenCode turn failed") });
  } else if (event.type === "session.complete") {
    events.push({ kind: "status", status: "completed" });
  } else {
    events.push({ kind: "log", stream: "stdout", text: JSON.stringify(event) });
  }

  return { nativeSessionId, events };
}

function findCommand(command) {
  const finder = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(finder, [command], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const executable = result.stdout.trim().split(/\r?\n/)[0] || command;
  const version = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 3000 });
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
