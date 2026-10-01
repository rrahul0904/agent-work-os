import { spawn } from "node:child_process";
import readline from "node:readline";
import { findCommand } from "./adapters.js";

const now = () => new Date().toISOString();
const jsonArgs = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((x) => typeof x === "string") ? parsed : [];
  } catch { return []; }
};

export function buildClaudeArgs(request, model, extra = []) {
  const args = ["-p", "--output-format", "stream-json", "--verbose"];
  if (model) args.push("--model", model);
  if (request.nativeSessionId) args.push("--resume", request.nativeSessionId);
  args.push(...extra, request.prompt);
  return args;
}

export function buildGeminiArgs(request, model, extra = []) {
  const args = ["--output-format", "stream-json"];
  if (model) args.push("--model", model);
  if (request.nativeSessionId) args.push("--resume", request.nativeSessionId);
  args.push(...extra, "-p", request.prompt);
  return args;
}

export function buildGrokArgs(request, model, extra = []) {
  const args = ["--no-auto-update", "--output-format", "streaming-json", "--cwd", request.cwd];
  if (model) args.push("--model", model);
  if (request.nativeSessionId) args.push("--resume", request.nativeSessionId);
  args.push(...extra, "-p", request.prompt);
  return args;
}

class StructuredCliAdapter {
  constructor({ name, command, envPrefix, buildArgs, normalize }) {
    this.name = name;
    this.command = command;
    this.envPrefix = envPrefix;
    this.buildArgs = buildArgs;
    this.normalize = normalize;
    this.children = new Map();
    this.found = findCommand(command);
  }
  capability() {
    return this.found ? {
      name: this.name,
      executable: this.found.executable,
      version: this.found.version,
      transport: "structured-cli"
    } : null;
  }
  async run(request, emit) {
    if (!this.found) throw new Error(this.command + " CLI is not installed");
    if (this.children.has(request.sessionId)) throw new Error("A " + this.name + " turn is already running for this session");
    const model = request.model || process.env["AGENT_WORK_OS_" + this.envPrefix + "_MODEL"];
    const extra = jsonArgs(process.env["AGENT_WORK_OS_" + this.envPrefix + "_ARGS"]);
    const args = this.buildArgs(request, model, extra);
    emit({ kind: "status", status: "running", message: this.name + " turn started", at: now() });
    const child = spawn(this.found.executable, args, { cwd: request.cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    this.children.set(request.sessionId, child);
    let nativeSessionId = request.nativeSessionId;
    let terminalStatus = null;
    const stdout = readline.createInterface({ input: child.stdout });
    stdout.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        const actions = this.normalize(event);
        if (!actions.length) emit({ kind: "log", stream: "stdout", text: line, at: now() });
        for (const action of actions) {
          if (action.kind === "thread") {
            if (action.nativeSessionId && action.nativeSessionId !== nativeSessionId) {
              nativeSessionId = action.nativeSessionId;
              emit({ kind: "thread", nativeSessionId, at: now() });
            }
          } else if (action.kind === "status") {
            terminalStatus = action.status;
            emit({ ...action, at: now() });
          } else emit({ ...action, at: now() });
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
    if (code !== 0) {
      emit({ kind: "error", message: this.name + " exited with code " + (code ?? "unknown"), at: now() });
      if (terminalStatus !== "failed") emit({ kind: "status", status: "failed", at: now() });
    } else if (!terminalStatus) emit({ kind: "status", status: "completed", at: now() });
    return { nativeSessionId };
  }
  async interrupt(sessionId) {
    const child = this.children.get(sessionId);
    if (!child) return;
    child.kill("SIGINT");
    setTimeout(() => { if (child.exitCode === null) child.kill("SIGTERM"); }, 2000).unref();
  }
}

const textBlocks = (content) => Array.isArray(content)
  ? content.filter((x) => x?.type === "text" && typeof x.text === "string").map((x) => x.text)
  : [];

function claudeEvents(event) {
  const out = [];
  if (typeof event.session_id === "string") out.push({ kind: "thread", nativeSessionId: event.session_id });
  if (event.type === "assistant") {
    for (const textValue of textBlocks(event.message?.content)) out.push({ kind: "text", text: textValue });
    for (const block of event.message?.content ?? []) {
      if (block?.type === "tool_use") out.push({ kind: "tool", name: String(block.name ?? "tool"), phase: "started", payload: block });
    }
  }
  if (event.type === "result") {
    if (event.usage) out.push({ kind: "usage", usage: event.usage });
    if (event.is_error) {
      out.push({ kind: "error", message: String(event.result ?? "Claude turn failed") });
      out.push({ kind: "status", status: "failed" });
    } else out.push({ kind: "status", status: "completed" });
  }
  if (event.type === "error") out.push({ kind: "error", message: String(event.error?.message ?? event.message ?? "Claude error") });
  return out;
}

function geminiEvents(event) {
  const out = [];
  const sid = event.session_id ?? event.sessionId;
  if (typeof sid === "string") out.push({ kind: "thread", nativeSessionId: sid });
  if (event.type === "message" && (event.role === "assistant" || event.role === "model")) {
    const textValue = typeof event.content === "string" ? event.content : event.content?.text;
    if (typeof textValue === "string" && textValue) out.push({ kind: "text", text: textValue });
  }
  if (event.type === "tool_use") out.push({ kind: "tool", name: String(event.tool_name ?? event.name ?? "tool"), phase: "started", payload: event });
  if (event.type === "tool_result") out.push({ kind: "tool", name: String(event.tool_name ?? event.name ?? "tool"), phase: "completed", payload: event });
  if (event.type === "result") {
    if (event.stats || event.usage) out.push({ kind: "usage", usage: event.stats ?? event.usage });
    out.push({ kind: "status", status: event.status === "error" ? "failed" : "completed" });
  }
  if (event.type === "error") out.push({ kind: "error", message: String(event.message ?? event.error?.message ?? "Gemini error") });
  return out;
}

function grokEvents(event) {
  const out = [];
  const sid = event.session_id ?? event.sessionId ?? event.session?.id;
  if (typeof sid === "string") out.push({ kind: "thread", nativeSessionId: sid });
  const role = event.role ?? event.message?.role;
  const textValue = typeof event.text === "string" ? event.text
    : typeof event.content === "string" ? event.content
    : typeof event.message?.content === "string" ? event.message.content
    : undefined;
  if ((role === "assistant" || event.type === "assistant" || event.type === "message") && textValue) out.push({ kind: "text", text: textValue });
  if (event.type === "tool_use" || event.type === "tool_call") out.push({ kind: "tool", name: String(event.name ?? event.tool_name ?? "tool"), phase: "started", payload: event });
  if (event.type === "tool_result") out.push({ kind: "tool", name: String(event.name ?? event.tool_name ?? "tool"), phase: "completed", payload: event });
  if (event.type === "result" || event.type === "completed") {
    if (event.usage || event.stats) out.push({ kind: "usage", usage: event.usage ?? event.stats });
    out.push({ kind: "status", status: "completed" });
  }
  if (event.type === "error") {
    out.push({ kind: "error", message: String(event.message ?? event.error?.message ?? "Grok error") });
    out.push({ kind: "status", status: "failed" });
  }
  return out;
}

export class ClaudeAdapter extends StructuredCliAdapter {
  constructor() { super({ name: "claude", command: "claude", envPrefix: "CLAUDE", buildArgs: buildClaudeArgs, normalize: claudeEvents }); }
}
export class GeminiAdapter extends StructuredCliAdapter {
  constructor() { super({ name: "gemini", command: "gemini", envPrefix: "GEMINI", buildArgs: buildGeminiArgs, normalize: geminiEvents }); }
}
export class GrokAdapter extends StructuredCliAdapter {
  constructor() { super({ name: "grok", command: "grok", envPrefix: "GROK", buildArgs: buildGrokArgs, normalize: grokEvents }); }
}
