import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { CursorAdapter, buildCursorArgs, normalizeCursorEvent } from "../src/cursor-adapter.js";

test("buildCursorArgs uses headless stream-json and resumes native sessions", () => {
  const previousModel = process.env.AGENT_WORK_OS_CURSOR_MODEL;
  const previousMode = process.env.AGENT_WORK_OS_CURSOR_MODE;
  process.env.AGENT_WORK_OS_CURSOR_MODEL = "gpt-5";
  process.env.AGENT_WORK_OS_CURSOR_MODE = "ask";
  try {
    assert.deepEqual(buildCursorArgs({ prompt: "hello", nativeSessionId: "chat-123" }), [
      "--print", "--output-format", "stream-json", "--model", "gpt-5", "--mode", "ask", "--resume", "chat-123", "hello"
    ]);
  } finally {
    if (previousModel === undefined) delete process.env.AGENT_WORK_OS_CURSOR_MODEL;
    else process.env.AGENT_WORK_OS_CURSOR_MODEL = previousModel;
    if (previousMode === undefined) delete process.env.AGENT_WORK_OS_CURSOR_MODE;
    else process.env.AGENT_WORK_OS_CURSOR_MODE = previousMode;
  }
});

test("normalizeCursorEvent maps session, assistant deltas, tools, usage and result", () => {
  assert.deepEqual(normalizeCursorEvent({ type: "system", subtype: "init", session_id: "chat-1" }), {
    nativeSessionId: "chat-1",
    events: []
  });
  assert.deepEqual(normalizeCursorEvent({ type: "assistant", session_id: "chat-1", message: { content: [{ type: "text", text: "hello" }] } }), {
    nativeSessionId: "chat-1",
    events: [{ kind: "text", text: "hello" }]
  });
  const tool = normalizeCursorEvent({ type: "tool_call", subtype: "started", session_id: "chat-1", tool_call: { readToolCall: { args: { path: "README.md" } } } }).events[0];
  assert.equal(tool.kind, "tool");
  assert.equal(tool.name, "readToolCall");
  assert.equal(tool.phase, "started");
  const result = normalizeCursorEvent({
    type: "result", subtype: "success", is_error: false, session_id: "chat-1",
    usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 3, cacheWriteTokens: 1 }
  });
  assert.equal(result.events[0].kind, "usage");
  assert.equal(result.events.at(-1).status, "completed");
});

test("adapter consumes stream-json and returns Cursor session id", async () => {
  const spawnImpl = (executable, args, options) => {
    assert.equal(executable, "/fake/agent");
    assert.ok(args.includes("stream-json"));
    assert.equal(options.cwd, "/tmp/work");
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.kill = () => {};
    queueMicrotask(() => {
      child.stdout.write(`${JSON.stringify({ type: "system", subtype: "init", session_id: "cursor-live" })}\n`);
      child.stdout.write(`${JSON.stringify({ type: "assistant", session_id: "cursor-live", message: { content: [{ type: "text", text: "READY" }] } })}\n`);
      child.stdout.write(`${JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: "cursor-live" })}\n`);
      child.stdout.end();
      child.stderr.end();
      child.exitCode = 0;
      child.emit("exit", 0);
    });
    return child;
  };
  const adapter = new CursorAdapter({ found: { executable: "/fake/agent", version: "2026.10" }, spawnImpl });
  const events = [];
  const result = await adapter.run({ sessionId: "outer", cwd: "/tmp/work", prompt: "verify" }, (event) => events.push(event));
  assert.equal(result.nativeSessionId, "cursor-live");
  assert.ok(events.some((event) => event.kind === "thread" && event.nativeSessionId === "cursor-live"));
  assert.ok(events.some((event) => event.kind === "text" && event.text === "READY"));
  assert.equal(events.at(-1).status, "completed");
});

test("adapter fails closed on non-zero process exit without result", async () => {
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.kill = () => {};
    queueMicrotask(() => {
      child.stdout.end();
      child.stderr.end();
      child.exitCode = 7;
      child.emit("exit", 7);
    });
    return child;
  };
  const adapter = new CursorAdapter({ found: { executable: "agent", version: "1" }, spawnImpl });
  const events = [];
  await adapter.run({ sessionId: "outer-fail", cwd: "/tmp/work", prompt: "verify" }, (event) => events.push(event));
  assert.ok(events.some((event) => event.kind === "error" && /code 7/.test(event.message)));
  assert.equal(events.at(-1).status, "failed");
});
