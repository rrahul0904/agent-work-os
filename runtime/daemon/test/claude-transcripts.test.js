import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { ClaudeTranscriptObserver, normalizeClaudeTranscript, parseCompleteJsonLines } from "../src/claude-transcripts.js";

const NOW = Date.parse("2026-10-10T17:30:00.000Z");

function line(value) { return `${JSON.stringify(value)}\n`; }
function assistant(timestamp, content, model = "claude-sonnet") { return { type:"assistant", timestamp, message:{ id:`m-${timestamp}`, model, content } }; }
function user(timestamp, content) { return { type:"user", timestamp, message:{ content } }; }

test("normalizes text, tool calls and results without making model calls", () => {
  const text = [
    line(user("2026-10-10T17:29:50Z", [{ type:"text", text:"Fix the test" }])),
    line(assistant("2026-10-10T17:29:52Z", [{ type:"tool_use", id:"t1", name:"Bash", input:{ command:"npm test" } }])),
    line(user("2026-10-10T17:29:55Z", [{ type:"tool_result", tool_use_id:"t1", content:"24 passed" }])),
    line(assistant("2026-10-10T17:29:56Z", [{ type:"text", text:"All green." }]))
  ].join("");
  const result = normalizeClaudeTranscript(text, { nowMs:NOW, fileMtimeMs:NOW, agentId:"main" });
  assert.equal(result.model, "claude-sonnet");
  assert.equal(result.status, "waiting");
  assert.deepEqual(result.events.map(event => [event.kind, event.phase]), [["tool","started"],["tool","completed"],["text",undefined]]);
  assert.equal(result.messages.at(-1).text, "All green.");
});

test("classifies an aged pending approval-like edit as blocked", () => {
  const text = line(assistant("2026-10-10T17:29:00Z", [{ type:"tool_use", id:"edit1", name:"Edit", input:{ file_path:"a.js", old_string:"a", new_string:"b" } }]));
  const result = normalizeClaudeTranscript(text, { nowMs:NOW, fileMtimeMs:NOW, agentId:"main" });
  assert.equal(result.status, "blocked");
  assert.equal(result.pending[0].name, "Edit");
});

test("sub-agent with a final report and no pending tool is completed", () => {
  const text = line(assistant("2026-10-10T17:29:59Z", [{ type:"text", text:"Done with the delegated work." }]));
  const result = normalizeClaudeTranscript(text, { nowMs:NOW, fileMtimeMs:NOW, agentId:"a1" });
  assert.equal(result.status, "completed");
});

test("ignores malformed and half-written JSONL records", () => {
  const complete = line(user("2026-10-10T17:29:50Z", [{ type:"text", text:"valid" }]));
  const records = parseCompleteJsonLines(`${complete}{"type":"assistant"`);
  assert.equal(records.length, 1);
  assert.equal(records[0].type, "user");
});

test("observer discovers main and explicit sub-agent transcripts while refusing symlink files", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-claude-"));
  t.after(() => rm(root, { recursive:true, force:true }));
  const project = path.join(root, "-Users-demo-repo");
  const session = "session-123";
  const subDir = path.join(project, session, "subagents");
  await mkdir(subDir, { recursive:true });
  await writeFile(path.join(project, `${session}.jsonl`), [
    line(user("2026-10-10T17:29:45Z", [{ type:"text", text:"Build the feature" }])),
    line(assistant("2026-10-10T17:29:50Z", [{ type:"tool_use", id:"delegate", name:"Agent", input:{ prompt:"review it" } }]))
  ].join(""));
  await writeFile(path.join(subDir, "agent-a1.jsonl"), line(assistant("2026-10-10T17:29:59Z", [{ type:"text", text:"Review complete" }])));
  await writeFile(path.join(subDir, "agent-a1.meta.json"), JSON.stringify({ description:"Reviewer", agentType:"review" }));
  const outside = path.join(root, "outside.jsonl");
  await writeFile(outside, line(assistant("2026-10-10T17:29:59Z", [{ type:"text", text:"must not load" }])));
  await symlink(outside, path.join(project, "evil.jsonl"));

  const observer = new ClaudeTranscriptObserver({ root, now:() => NOW, activeWindowMs:365 * 24 * 60 * 60 * 1000 });
  const sessions = await observer.scan("machine-1");
  assert.equal(sessions.length, 2);
  const main = sessions.find(item => item.source.agentId === "main");
  const child = sessions.find(item => item.source.agentId === "a1");
  assert.ok(main);
  assert.ok(child);
  assert.equal(main.status, "waiting");
  assert.equal(child.status, "completed");
  assert.equal(child.observedParentSessionId, main.id);
  assert.equal(child.observedRole, "Reviewer");
  assert.ok(sessions.every(item => !item.id.includes("evil")));
});

test("observer fails closed when the configured transcript root itself is a symlink", async (t) => {
  const base = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-claude-root-"));
  t.after(() => rm(base, { recursive:true, force:true }));
  const actual = path.join(base, "actual");
  const linked = path.join(base, "linked");
  await mkdir(actual);
  await symlink(actual, linked);
  const observer = new ClaudeTranscriptObserver({ root:linked, now:() => NOW });
  assert.equal(await observer.isAvailable(), false);
  assert.deepEqual(await observer.scan("machine-1"), []);
});
