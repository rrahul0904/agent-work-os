import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalizeSession,
  handoffSession,
  detectRateLimit,
  exportSessionBundle,
  importSessionBundle
} from "../lib/session-fabric.js";

const claude = [
  JSON.stringify({ type: "user", uuid: "u1", message: { role: "user", content: "Fix the failing test" } }),
  JSON.stringify({
    type: "assistant",
    uuid: "a1",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Inspect the suite first." },
        { type: "tool_use", id: "t1", name: "Agent", input: { prompt: "inspect" } },
        { type: "tool_result", tool_use_id: "t1", content: "Found timeout bug" },
        { type: "text", text: "The timeout is too low." }
      ]
    }
  })
].join("\n");

test("Claude session converts to canonical and preserves unknown tool history", () => {
  const session = canonicalizeSession(claude, "claude");
  assert.equal(session.messages.length, 2);
  assert.equal(session.messages[1].toolCalls[0].name, "Agent");
  assert.equal(session.messages[1].toolCalls[0].result, "Found timeout bug");
});

test("handoff serializes Claude history into Codex-readable tool calls", () => {
  const result = handoffSession(claude, { sourceAgent: "claude", targetAgent: "codex" });
  assert.match(result.serialized, /"type":"function_call"/);
  assert.match(result.serialized, /"name":"Agent"/);
  assert.match(result.serialized, /Found timeout bug/);
});

test("handoff blocks a mid-turn session", () => {
  const session = canonicalizeSession(claude, "claude");
  session.status = "running";
  assert.throws(() => handoffSession(session, { sourceAgent: "claude", targetAgent: "codex" }), /HANDOFF_BLOCKED_MID_TURN/);
});

test("rate-limit detector catches reset messages", () => {
  const result = detectRateLimit("Limit reached. Resets in 4h 52m.");
  assert.equal(result.limited, true);
  assert.equal(result.resetHint, "4h 52m");
});

test("session bundle round-trips", () => {
  const session = canonicalizeSession(claude, "claude");
  const restored = importSessionBundle(exportSessionBundle(session));
  assert.equal(restored.messages[0].content, "Fix the failing test");
});
