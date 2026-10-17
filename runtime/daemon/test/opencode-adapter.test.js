import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { OpenCodeAdapter, buildOpenCodeArgs, normalizeOpenCodeEvent } from "../src/opencode-adapter.js";

test("buildOpenCodeArgs uses non-interactive JSON run mode and resumes sessions", () => {
  const previousModel = process.env.AGENT_WORK_OS_OPENCODE_MODEL;
  const previousAgent = process.env.AGENT_WORK_OS_OPENCODE_AGENT;
  process.env.AGENT_WORK_OS_OPENCODE_MODEL = "openai/gpt-5";
  process.env.AGENT_WORK_OS_OPENCODE_AGENT = "build";
  try {
    assert.deepEqual(buildOpenCodeArgs({ cwd: "/tmp/work", prompt: "hello", nativeSessionId: "ses_123" }), [
      "run", "--format", "json", "--dir", "/tmp/work",
      "--model", "openai/gpt-5", "--agent", "build", "--session", "ses_123", "hello"
    ]);
  } finally {
    if (previousModel === undefined) delete process.env.AGENT_WORK_OS_OPENCODE_MODEL;
    else process.env.AGENT_WORK_OS_OPENCODE_MODEL = previousModel;
    if (previousAgent === undefined) delete process.env.AGENT_WORK_OS_OPENCODE_AGENT;
    else process.env.AGENT_WORK_OS_OPENCODE_AGENT = previousAgent;
  }
});

test("normalizeOpenCodeEvent maps text, tools, usage and errors", () => {
  assert.deepEqual(normalizeOpenCodeEvent({ type: "text", sessionID: "ses_1", part: { text: "done" } }), {
    nativeSessionId: "ses_1",
    events: [{ kind: "text", text: "done" }]
  });
  assert.equal(normalizeOpenCodeEvent({ type: "tool_use", sessionID: "ses_1", part: { tool: "bash", state: { status: "completed" } } }).events[0].kind, "tool");
  const usage = normalizeOpenCodeEvent({
    type: "step_finish", sessionID: "ses_1",
    part: { tokens: { input: 10, output: 4, reasoning: 2, cache: { read: 3, write: 1 } }, cost: 0.01 }
  }).events[0];
  assert.deepEqual(usage, {
    kind: "usage",
    usage: { inputTokens: 10, outputTokens: 4, reasoningOutputTokens: 2, cachedInputTokens: 3, cacheCreationInputTokens: 1, cost: 0.01 }
  });
  assert.equal(normalizeOpenCodeEvent({ type: "error", sessionID: "ses_1", error: { data: { message: "boom" } } }).events[0].message, "boom");
});

test("adapter emits normalized events and treats clean process exit as completion without step_finish", async () => {
  const spawned = [];
  const spawnImpl = (executable, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.kill = () => {};
    spawned.push({ executable, args, options, child });
    queueMicrotask(() => {
      child.stdout.write(`${JSON.stringify({ type: "text", sessionID: "ses_live", part: { text: "hello from OpenCode" } })}\n`);
      child.stdout.end();
      child.stderr.end();
      child.exitCode = 0;
      child.emit("exit", 0);
    });
    return child;
  };
  const adapter = new OpenCodeAdapter({ found: { executable: "/usr/local/bin/opencode", version: "1.18.30" }, spawnImpl });
  const events = [];
  const result = await adapter.run({ sessionId: "awos-1", cwd: "/tmp/work", prompt: "hello" }, (event) => events.push(event));
  assert.equal(result.nativeSessionId, "ses_live");
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].executable, "/usr/local/bin/opencode");
  assert.ok(events.some((event) => event.kind === "thread" && event.nativeSessionId === "ses_live"));
  assert.ok(events.some((event) => event.kind === "text" && event.text === "hello from OpenCode"));
  assert.equal(events.at(-1).status, "completed");
});

test("adapter converts non-zero exit into failed status", async () => {
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.kill = () => {};
    queueMicrotask(() => {
      child.stdout.end();
      child.stderr.end();
      child.exitCode = 2;
      child.emit("exit", 2);
    });
    return child;
  };
  const adapter = new OpenCodeAdapter({ found: { executable: "opencode", version: "1" }, spawnImpl });
  const events = [];
  await adapter.run({ sessionId: "awos-2", cwd: "/tmp/work", prompt: "hello" }, (event) => events.push(event));
  assert.ok(events.some((event) => event.kind === "error" && /code 2/.test(event.message)));
  assert.equal(events.at(-1).status, "failed");
});
