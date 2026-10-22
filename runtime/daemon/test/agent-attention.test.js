import test from "node:test";
import assert from "node:assert/strict";
import { createResumeIntents, projectAgentAttention } from "../src/agent-attention.js";

const NOW = "2026-10-22T20:00:00.000Z";
const base = {
  id: "s1", machineId: "mac-1", workItemId: "work-1",
  provider: "codex", state: "running",
  machineHeartbeatAt: NOW, lastEventAt: "2026-10-22T19:59:30.000Z",
};
const recoverable = {
  ...base, state: "lost", nativeSessionId: "abcdef0123456789", cwd: "/repo/worktree",
};
const machine = { id: "mac-1", lastHeartbeatAt: NOW, providers: ["codex", "claude-code"] };

test("explicit user question is prioritized, preserves provenance, and never leaks text", () => {
  const s = {
    ...base, pendingQuestion: { eventId: "evt-7", text: "private password" },
    machineHeartbeatAt: "2026-10-22T19:00:00.000Z",
  };
  const p = projectAgentAttention([base, s && { ...s, id: "s2" }], { now: NOW });
  assert.equal(p.sessions[0].attention, "needs_input");
  assert.equal(p.sessions[0].evidenceEventId, "evt-7");
  assert.ok(!JSON.stringify(p).includes("private password"));
  assert.equal(p.counts.needs_input, 1);
});

test("quiet is verified inactivity, not a guess from missing activity", () => {
  const p = projectAgentAttention([
    { ...base, id: "quiet", lastEventAt: "2026-10-22T19:50:00.000Z" },
    { ...base, id: "unknown", lastEventAt: undefined },
    { ...base, id: "working" },
  ], { now: NOW });
  assert.equal(p.sessions.find((s) => s.id === "quiet").attention, "quiet");
  assert.equal(p.sessions.find((s) => s.id === "unknown").attention, "unknown");
  assert.equal(p.sessions.find((s) => s.id === "working").attention, "working");
});

test("stale heartbeat is disconnected, not working or completed", () => {
  const p = projectAgentAttention([
    { ...base, machineHeartbeatAt: "2026-10-22T19:00:00.000Z" },
    { ...base, id: "failed", state: "failed" },
    { ...base, id: "done", state: "completed" },
  ], { now: NOW });
  assert.equal(p.sessions.find((s) => s.id === "s1").attention, "disconnected");
  assert.equal(p.sessions.find((s) => s.id === "failed").attention, "failed");
  assert.equal(p.sessions.find((s) => s.id === "done").attention, "done");
});

test("duplicate sessions, malformed time and invalid threshold fail closed", () => {
  assert.throws(() => projectAgentAttention([base, base], { now: NOW }), /unique/);
  assert.throws(() => projectAgentAttention([base], { now: "tomorrow" }), /ISO/);
  assert.throws(() => projectAgentAttention([base], { now: NOW, staleAfterMs: -1 }), /thresholds/);
});

test("resumption intent is structured, approval-only and deterministic", () => {
  const options = { now: NOW, sessionIds: ["s2", "s1"] };
  const sessions = [{ ...recoverable, id: "s2" }, recoverable];
  const result = createResumeIntents(sessions, [machine], options);
  assert.deepEqual(result.intents.map((s) => s.sessionId), ["s1", "s2"]);
  assert.equal(result.refused.length, 0);
  assert.equal(result.intents[0].requiresHumanApproval, true);
  assert.equal(result.intents[0].executable, false);
  assert.ok(!("command" in result.intents[0]));
  assert.deepEqual(result, createResumeIntents([...sessions].reverse(), [machine], options));
});

test("recovery denies running sessions, missing thread, unsafe cwd and stale daemon", () => {
  const options = { now: NOW, sessionIds: ["s1"] };
  const decide = (s, m = machine) =>
    createResumeIntents([s], [m], options).refused[0].reason;
  assert.equal(decide({ ...recoverable, state: "running" }), "not_confirmed_recoverable");
  assert.equal(decide({ ...recoverable, nativeSessionId: "" }), "native_session_unverified");
  assert.equal(decide({ ...recoverable, cwd: "../repo" }), "cwd_unverified");
  assert.equal(decide({ ...recoverable, cwd: "/repo/../private" }), "cwd_unverified");
  assert.equal(decide({ ...recoverable, provider: "shell" }), "unsupported_provider");
  assert.equal(decide(recoverable, { ...machine, providers: [] }), "adapter_unavailable");
  assert.equal(decide(recoverable, { ...machine, lastHeartbeatAt: "2026-10-22T19:00:00.000Z" }), "machine_not_fresh");
});

test("absent session cannot be invented and duplicate user requests are refused", () => {
  const r = createResumeIntents([], [machine], { now: NOW, sessionIds: ["missing"] });
  assert.deepEqual(r.refused, [{ sessionId: "missing", reason: "session_not_found" }]);
  assert.throws(() => createResumeIntents([recoverable], [machine],
    { now: NOW, sessionIds: ["s1", "s1"] }), /unique/);
});
