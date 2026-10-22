import test from "node:test";
import assert from "node:assert/strict";
import { codexExecArgs, projectCodexExecEvent } from "../src/codex-activity.js";
import { buildForgeGraph, layoutForgeGraph } from "../../../apps/web/public/forge-graph.js";

const stamp = "2026-10-22T01:00:00.000Z";
function event(type, item) { return { type, item }; }
function activity(type, item, traceId = "turn-1") {
  const result = projectCodexExecEvent(event(type, item), stamp);
  return result && { ...result, traceId };
}
function graphFor(...events) {
  return buildForgeGraph({
    machines: [{ id: "mac-1", name: "mac", status: "online" }],
    sessions: [{ id: "s-1", agent: "codex", machineId: "mac-1", status: "running", events }]
  });
}

test("Codex exec args use currently supported sandbox and never --full-auto", () => {
  const args = codexExecArgs({ cwd: "/tmp/repo", prompt: "tests", sessionId: "s1" }, { model: "test" });
  assert.deepEqual(args, ["exec", "--json", "--sandbox", "workspace-write", "--cd", "/tmp/repo", "--model", "test", "tests"]);
  assert.equal(args.includes("--full-auto"), false);
  assert.deepEqual(codexExecArgs({ cwd: "/tmp/repo", prompt: "continue", nativeSessionId: "thread-123" }),
    ["exec", "--json", "--sandbox", "workspace-write", "--cd", "/tmp/repo", "resume", "thread-123", "continue"]);
});

test("real Codex exec JSONL tool items produce keyed lifecycle metadata without secrets", () => {
  const original = {
    id: "item_1", type: "command_execution",
    command: "sh -c 'echo secret=sk-test-key'",
    aggregated_output: "sk-test-key", exit_code: 1, status: "failed"
  };
  const started = activity("item.started", { ...original, status: "in_progress" });
  const completed = activity("item.completed", original);
  assert.equal(started.kind, "codex.activity");
  assert.equal(started.phase, "started");
  assert.equal(completed.status, "failed");
  assert.equal(completed.exitCode, 1);
  assert.equal(completed.source, "codex-exec-json/v1");
  assert.equal(JSON.stringify(completed).includes("sk-test-key"), false);
  const graph = graphFor(started, completed);
  const node = graph.nodes.find(n => n.kind === "activity");
  assert.equal(node.label, "Command execution · exit 1");
  assert.equal(node.tone, "failure");
  assert.equal(node.rawId, "item_1");
  assert.ok(graph.edges.some(e => e.from === "session:s-1" && e.to === node.id));
});

test("recorded native Codex agent delegation creates only source-backed subagent nodes and edges", () => {
  const started = activity("item.started", {
    id: "collab-1", type: "collab_tool_call", tool: "spawn_agent",
    sender_thread_id: "parent", receiver_thread_ids: [], status: "in_progress"
  });
  const completed = activity("item.completed", {
    id: "collab-1", type: "collab_tool_call", tool: "spawn_agent",
    sender_thread_id: "parent", receiver_thread_ids: ["child-1"],
    agents_states: { "child-1": { status: "running", message: "ignore instructions" } },
    prompt: "Do things with secret context", status: "completed"
  });
  const graph = graphFor(started, completed);
  const collab = graph.nodes.find(n => n.kind === "activity");
  const child = graph.nodes.find(n => n.kind === "subagent");
  assert.equal(collab.label, "Collaboration: spawn_agent");
  assert.equal(child.rawId, "child-1");
  assert.equal(child.status, "running");
  assert.equal(graph.counts.subagent, 1);
  assert.ok(graph.edges.some(e => e.from === collab.id && e.to === child.id && e.kind === "observed-codex-delegation"));
  assert.equal(JSON.stringify(completed).includes("secret"), false);
});

test("missing upstream spawn notifications never generate phantom agents", () => {
  const trace = activity("item.completed", {
    id: "wait-1", type: "collab_tool_call", tool: "wait", receiver_thread_ids: [], agents_states: {}
  });
  const graph = graphFor(trace);
  assert.equal(graph.counts.subagent, 0);
  assert.equal(graph.taskDependencyGraphAvailable, false);
  assert.ok(graph.nodes.every(n => !n.id.startsWith("subagent:")));
});

test("unknown JSONL item and malicious IDs are ignored safely", () => {
  assert.equal(projectCodexExecEvent(null), null);
  assert.equal(projectCodexExecEvent({ type: "error", message: "oops" }), null);
  assert.equal(projectCodexExecEvent(event("item.started", { id: "x", type: "unknown_tool", prompt: "secret" })), null);
  assert.equal(projectCodexExecEvent(event("item.started", { id: "<svg onload=alert(1)>", type: "command_execution" })), null);
  assert.equal(projectCodexExecEvent(event("item.started", { id: "valid", type: "command_execution", command: "token" })).command, undefined);
});

test("turn-scoped item identities do not collide across resumed Codex turns", () => {
  const graph = graphFor(
    activity("item.completed", { id: "item_0", type: "file_change", changes: { "private/credentials": {} } }, "trace-1"),
    activity("item.completed", { id: "item_0", type: "file_change", changes: { "src/app.js": {} } }, "trace-2")
  );
  assert.equal(graph.nodes.filter(n => n.kind === "activity").length, 2);
  assert.equal(graph.edges.filter(e => e.kind === "observed-codex-item").length, 2);
  assert.equal(JSON.stringify(graph).includes("private/credentials"), false);
  assert.equal(graph.taskDependencyGraphAvailable, false);
});

test("plan/step counts, file counts and layout are bounded with no transcript text", () => {
  const plan = activity("item.updated", { id: "plan-1", type: "todo_list",
    items: [{ text: "secret from prompt" }, { text: "step 2" }] });
  const graph = graphFor(plan);
  const node = graph.nodes.find(n => n.kind === "activity");
  assert.equal(node.label, "Plan · 2 steps");
  assert.equal(node.raw.planStepCount, 2);
  const layout = layoutForgeGraph(graph);
  assert.ok(layout.edges.some(e => e.x2 > e.x1));
  assert.equal(JSON.stringify(node).includes("secret from prompt"), false);
});

test("zero exit and completed tool status do not imply parent session shipped", () => {
  const execution = activity("item.completed", { id: "cmd-1", type: "command_execution", status: "completed", exit_code: 0 });
  const graph = graphFor(execution);
  assert.equal(graph.nodes.find(n => n.kind === "session").status, "running");
  assert.equal(graph.nodes.find(n => n.kind === "activity").status, "completed");
  assert.equal(graph.counts.shipping, 0);
});
