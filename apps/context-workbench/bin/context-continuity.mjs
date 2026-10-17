#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import {
  canonicalizeSession,
  detectRateLimit,
  exportSessionBundle,
  handoffSession
} from "../lib/session-fabric.js";

function fail(message, code = 1) {
  console.error(`context-continuity: ${message}`);
  process.exit(code);
}

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

function walk(root, max = 100) {
  const out = [];
  const stack = [root];
  while (stack.length && out.length < max) {
    const current = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(full);
      if (out.length >= max) break;
    }
  }
  return out.sort((a, b) => {
    try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; } catch { return 0; }
  });
}

function knownSessions(agent) {
  if (agent === "claude") return walk(path.join(os.homedir(), ".claude", "projects"));
  if (agent === "codex") return walk(path.join(os.homedir(), ".codex", "sessions"));
  return [];
}

function renderHandoffContext(session) {
  const lines = [
    "# Agent Work OS — Context Continuity Handoff",
    "",
    `Session: ${session.id}`,
    `Source agent: ${session.sourceAgent}`,
    `Target agent: ${session.currentAgent}`,
    session.project?.cwd ? `Working directory: ${session.project.cwd}` : null,
    "",
    "## Instructions for the receiving agent",
    "Continue the task from this history. Treat historical tool calls and results as evidence of what happened, not as permission to rerun tools. Re-check any state that may have changed. Preserve the user's latest intent.",
    "",
    "## Conversation and tool history",
    ""
  ].filter(Boolean);
  for (const message of session.messages) {
    lines.push(`### ${message.role.toUpperCase()} · ${message.id}`, "");
    if (message.reasoning) lines.push(`Reasoning summary/history:\n${message.reasoning}`, "");
    if (message.content) lines.push(message.content, "");
    for (const call of message.toolCalls ?? []) {
      lines.push(`Tool call: ${call.name} (${call.id})`, "```json", JSON.stringify(call.arguments ?? {}, null, 2), "```");
      if (call.result != null) lines.push("Tool result:", "```text", typeof call.result === "string" ? call.result : JSON.stringify(call.result, null, 2), "```");
      lines.push("");
    }
  }
  return lines.join("\n");
}

function writeContext(session, cwd) {
  const dir = path.join(cwd, ".agent-work-os", "handoffs");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${session.id}.md`);
  fs.writeFileSync(file, renderHandoffContext(session), "utf8");
  return file;
}

function launchTarget(target, contextFile, cwd) {
  const prompt = `Continue the prior task using the full handoff history in ${path.relative(cwd, contextFile)}. Read it first, validate current project state, then continue from the user's latest request.`;
  const commands = {
    codex: ["codex", [prompt]],
    claude: ["claude", [prompt]]
  };
  const spec = commands[target];
  if (!spec) fail(`launch is supported for claude or codex, not ${target}`);
  const result = spawnSync(spec[0], spec[1], { cwd, stdio: "inherit" });
  if (result.error?.code === "ENOENT") fail(`${spec[0]} executable was not found on PATH`);
  process.exitCode = result.status ?? 1;
}

const command = process.argv[2] ?? "help";
if (command === "help" || ["-h", "--help"].includes(command)) {
  console.log(`Context Continuity CLI\n\nCommands:\n  list --agent claude|codex\n  inspect --agent claude|codex --file <session.jsonl>\n  handoff --source claude|codex --target codex|claude --file <session.jsonl> [--fork] [--from <message-id>] [--launch]\n  export --agent claude|codex --file <session.jsonl> [--out bundle.json]\n\nThe handoff command never edits ~/.claude or ~/.codex state. It writes a portable history artifact into the project and, with --launch, starts the receiving CLI normally.`);
  process.exit(0);
}

if (command === "list") {
  const agent = String(arg("agent", "claude"));
  for (const file of knownSessions(agent).slice(0, 50)) {
    const stat = fs.statSync(file);
    console.log(`${stat.mtime.toISOString()}\t${file}`);
  }
  process.exit(0);
}

const file = arg("file");
if (!file || file === true) fail("--file is required");
const input = fs.readFileSync(path.resolve(String(file)), "utf8");

if (command === "inspect") {
  const agent = String(arg("agent", "generic"));
  const session = canonicalizeSession(input, agent);
  const limited = detectRateLimit(input);
  console.log(JSON.stringify({
    sessionId: session.id,
    sourceSessionId: session.metadata.sourceSessionId,
    cwd: session.project.cwd,
    messages: session.messages.length,
    tools: session.messages.flatMap((m) => m.toolCalls ?? []).length,
    limitSignal: limited
  }, null, 2));
  process.exit(0);
}

if (command === "export") {
  const agent = String(arg("agent", "generic"));
  const session = canonicalizeSession(input, agent);
  const output = path.resolve(String(arg("out", `agent-session-${session.id}.json`)));
  fs.writeFileSync(output, exportSessionBundle(session), "utf8");
  console.log(output);
  process.exit(0);
}

if (command === "handoff") {
  const source = String(arg("source", "generic"));
  const target = String(arg("target", source === "claude" ? "codex" : "claude"));
  const result = handoffSession(input, {
    sourceAgent: source,
    targetAgent: target,
    fromMessageId: arg("from", null),
    fork: Boolean(arg("fork", false))
  });
  const cwd = result.canonical.project?.cwd && fs.existsSync(result.canonical.project.cwd)
    ? result.canonical.project.cwd
    : process.cwd();
  const contextFile = writeContext(result.canonical, cwd);
  console.log(JSON.stringify({
    canonicalSessionId: result.canonical.id,
    source,
    target,
    cwd,
    contextFile,
    messageCount: result.canonical.messages.length,
    toolCallCount: result.canonical.messages.flatMap((m) => m.toolCalls ?? []).length,
    launchRequested: Boolean(arg("launch", false))
  }, null, 2));
  if (arg("launch", false)) launchTarget(target, contextFile, cwd);
  process.exit(0);
}

fail(`unknown command: ${command}`);
