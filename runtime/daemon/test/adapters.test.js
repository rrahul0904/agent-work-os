import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { ClaudeCodeAdapter, EchoAdapter, buildClaudeArgs, normalizeClaudeStreamEvent } from "../src/adapters.js";

test("EchoAdapter completes a turn", async () => {
  const adapter = new EchoAdapter(); const events = [];
  const result = await adapter.run({ sessionId: "s1", cwd: process.cwd(), prompt: "hello" }, (event) => events.push(event));
  assert.equal(result.nativeSessionId, "echo-s1");
  assert.ok(events.some((event) => event.kind === "text" && event.text === "Echo: hello"));
  assert.equal(events.at(-1).status, "completed");
});

test("buildClaudeArgs uses structured print mode and deterministic session controls", () => {
  const priorMode = process.env.AGENT_WORK_OS_CLAUDE_PERMISSION_MODE;
  const priorModel = process.env.AGENT_WORK_OS_CLAUDE_MODEL;
  const priorArgs = process.env.AGENT_WORK_OS_CLAUDE_ARGS;
  process.env.AGENT_WORK_OS_CLAUDE_PERMISSION_MODE = "acceptEdits";
  process.env.AGENT_WORK_OS_CLAUDE_MODEL = "sonnet";
  process.env.AGENT_WORK_OS_CLAUDE_ARGS = JSON.stringify(["--max-turns", "4"]);
  try {
    const fresh = buildClaudeArgs({ prompt: "fix it" }, "550e8400-e29b-41d4-a716-446655440000");
    assert.deepEqual(fresh, [
      "-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits",
      "--model", "sonnet", "--max-turns", "4",
      "--session-id", "550e8400-e29b-41d4-a716-446655440000", "fix it"
    ]);

    const resumed = buildClaudeArgs({ prompt: "continue", nativeSessionId: "550e8400-e29b-41d4-a716-446655440001" }, "ignored");
    assert.ok(resumed.includes("--resume"));
    assert.ok(resumed.includes("550e8400-e29b-41d4-a716-446655440001"));
    assert.equal(resumed.at(-1), "continue");
    assert.equal(resumed.includes("--session-id"), false);
  } finally {
    restoreEnv("AGENT_WORK_OS_CLAUDE_PERMISSION_MODE", priorMode);
    restoreEnv("AGENT_WORK_OS_CLAUDE_MODEL", priorModel);
    restoreEnv("AGENT_WORK_OS_CLAUDE_ARGS", priorArgs);
  }
});

test("normalizeClaudeStreamEvent maps session, text, tools, usage and terminal status", () => {
  const sessionId = "550e8400-e29b-41d4-a716-446655440002";
  const init = normalizeClaudeStreamEvent({ type: "system", subtype: "init", session_id: sessionId });
  assert.equal(init.nativeSessionId, sessionId);
  assert.deepEqual(init.events, []);

  const assistant = normalizeClaudeStreamEvent({
    type: "assistant",
    session_id: sessionId,
    message: { content: [{ type: "text", text: "Done" }, { type: "tool_use", id: "tool-1", name: "Read", input: { file_path: "README.md" } }] }
  });
  assert.deepEqual(assistant.events.map((event) => event.kind), ["text", "tool"]);
  assert.equal(assistant.events[0].text, "Done");
  assert.equal(assistant.events[1].name, "Read");
  assert.equal(assistant.events[1].phase, "started");

  const toolResult = normalizeClaudeStreamEvent({
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: "tool-1", content: "README contents" }] }
  });
  assert.equal(toolResult.events[0].kind, "tool");
  assert.equal(toolResult.events[0].phase, "completed");

  const result = normalizeClaudeStreamEvent({
    type: "result",
    subtype: "success",
    session_id: sessionId,
    result: "Done",
    usage: { input_tokens: 10, cache_read_input_tokens: 3, cache_creation_input_tokens: 2, output_tokens: 5 }
  });
  assert.equal(result.terminal, true);
  assert.equal(result.resultText, "Done");
  assert.deepEqual(result.events.at(-1), { kind: "status", status: "completed" });
  assert.deepEqual(result.events[0].usage, { inputTokens: 10, cachedInputTokens: 3, cacheCreationInputTokens: 2, outputTokens: 5 });
});

test("normalizeClaudeStreamEvent fails terminal result closed", () => {
  const result = normalizeClaudeStreamEvent({ type: "result", subtype: "error_max_turns", is_error: true, result: "Maximum turns reached" });
  assert.equal(result.terminal, true);
  assert.equal(result.events[0].kind, "error");
  assert.equal(result.events[1].status, "failed");
});

test("ClaudeCodeAdapter executes stream-json turn and returns native session id", async () => {
  const sessionId = "550e8400-e29b-41d4-a716-446655440003";
  let observedExecutable;
  let observedArgs;
  const spawnImpl = (executable, args) => {
    observedExecutable = executable;
    observedArgs = args;
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.kill = () => { child.exitCode = 130; child.emit("exit", 130); };
    queueMicrotask(() => {
      child.stdout.write(`${JSON.stringify({ type: "system", subtype: "init", session_id: sessionId })}\n`);
      child.stdout.write(`${JSON.stringify({ type: "assistant", session_id: sessionId, message: { content: [{ type: "text", text: "Adapter ready" }] } })}\n`);
      child.stdout.write(`${JSON.stringify({ type: "result", subtype: "success", session_id: sessionId, result: "Adapter ready", usage: { input_tokens: 2, output_tokens: 3 } })}\n`);
      child.stdout.end();
      child.stderr.end();
      child.exitCode = 0;
      child.emit("exit", 0);
    });
    return child;
  };
  const adapter = new ClaudeCodeAdapter({
    found: { executable: "/fake/claude", version: "2.1-test" },
    spawnImpl,
    uuid: () => sessionId
  });
  const events = [];
  const response = await adapter.run({ sessionId: "awos-session", cwd: process.cwd(), prompt: "hello" }, (event) => events.push(event));

  assert.equal(observedExecutable, "/fake/claude");
  assert.ok(observedArgs.includes("stream-json"));
  assert.ok(observedArgs.includes("--session-id"));
  assert.equal(response.nativeSessionId, sessionId);
  assert.equal(events.filter((event) => event.kind === "text").length, 1, "result text must not duplicate assistant text");
  assert.ok(events.some((event) => event.kind === "usage" && event.usage.outputTokens === 3));
  assert.equal(events.at(-1).status, "completed");
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
