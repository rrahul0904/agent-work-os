import assert from "node:assert/strict";
import test from "node:test";
import {
  FLOW_GRAPH_VERSION,
  MAX_FLOW_NODES,
  validateFlowGraph
} from "../src/flow-graph.js";

function validFlow() {
  return {
    version: FLOW_GRAPH_VERSION,
    id: "build-and-review",
    name: "Build and review",
    nodes: [
      { id: "start", type: "trigger.manual", config: { source: "operator" } },
      { id: "task", type: "start-task", config: { isolation: "worktree" } },
      { id: "builder", type: "agent", config: { role: "builder" } },
      { id: "tests", type: "command", config: { commandRef: "test" } },
      { id: "passed", type: "condition", config: { expressionRef: "tests.ok" } },
      { id: "review", type: "approval", config: { kind: "human-review" } },
      { id: "done", type: "end" },
      { id: "failed", type: "end" }
    ],
    edges: [
      { id: "e1", source: "start", target: "task" },
      { id: "e2", source: "task", target: "builder" },
      { id: "e3", source: "builder", target: "tests" },
      { id: "e4", source: "tests", target: "passed" },
      { id: "e5", source: "passed", sourceHandle: "true", target: "review" },
      { id: "e6", source: "passed", sourceHandle: "false", target: "failed" },
      { id: "e7", source: "review", target: "done" }
    ]
  };
}

function codes(result) {
  return result.errors.map((error) => error.code);
}

test("accepts a bounded acyclic flow and returns a stable digest", () => {
  const first = validateFlowGraph(validFlow());
  assert.equal(first.valid, true);
  assert.match(first.digest, /^sha256:[a-f0-9]{64}$/);

  const reordered = validFlow();
  reordered.nodes.reverse();
  reordered.edges.reverse();
  reordered.nodes[0] = { type: reordered.nodes[0].type, id: reordered.nodes[0].id };
  const second = validateFlowGraph(reordered);

  assert.equal(second.valid, true);
  assert.equal(second.digest, first.digest);
});

test("rejects a graph with zero or multiple triggers", () => {
  const zero = validFlow();
  zero.nodes[0] = { id: "not-trigger", type: "agent" };
  assert.ok(codes(validateFlowGraph(zero)).includes("trigger.count"));

  const two = validFlow();
  two.nodes.push({ id: "other-trigger", type: "trigger.webhook" });
  two.edges.push({ id: "e8", source: "other-trigger", target: "done" });
  assert.ok(codes(validateFlowGraph(two)).includes("trigger.count"));
});

test("rejects duplicate node and edge identifiers", () => {
  const flow = validFlow();
  flow.nodes.push({ id: "builder", type: "agent" });
  flow.edges.push({ id: "e1", source: "start", target: "done" });
  const result = validateFlowGraph(flow);
  assert.ok(codes(result).includes("node.duplicate"));
  assert.ok(codes(result).includes("edge.duplicate"));
});

test("rejects unknown edge endpoints and self edges", () => {
  const missing = validFlow();
  missing.edges.push({ id: "missing-edge", source: "builder", target: "ghost" });
  assert.ok(codes(validateFlowGraph(missing)).includes("edge.endpoint"));

  const self = validFlow();
  self.edges.push({ id: "self-edge", source: "builder", target: "builder" });
  assert.ok(codes(validateFlowGraph(self)).includes("edge.self"));
});

test("rejects incoming trigger edges and outgoing end edges", () => {
  const triggerIncoming = validFlow();
  triggerIncoming.edges.push({ id: "bad-trigger", source: "review", target: "start" });
  const triggerResult = validateFlowGraph(triggerIncoming);
  assert.ok(codes(triggerResult).includes("trigger.incoming"));
  assert.ok(codes(triggerResult).includes("graph.cycle"));

  const endOutgoing = validFlow();
  endOutgoing.edges.push({ id: "bad-end", source: "done", target: "failed" });
  assert.ok(codes(validateFlowGraph(endOutgoing)).includes("end.outgoing"));
});

test("requires exact true and false condition branches", () => {
  const flow = validFlow();
  flow.edges.find((edge) => edge.id === "e6").sourceHandle = "else";
  assert.ok(codes(validateFlowGraph(flow)).includes("condition.branches"));
});

test("rejects unreachable nodes", () => {
  const flow = validFlow();
  flow.nodes.push({ id: "orphan", type: "agent" });
  const result = validateFlowGraph(flow);
  assert.ok(result.errors.some((error) => error.code === "node.unreachable" && error.subject === "orphan"));
});

test("rejects cycles", () => {
  const flow = validFlow();
  flow.nodes.push({ id: "loop-a", type: "agent" }, { id: "loop-b", type: "agent" });
  flow.edges.push(
    { id: "e8", source: "task", target: "loop-a" },
    { id: "e9", source: "loop-a", target: "loop-b" },
    { id: "e10", source: "loop-b", target: "loop-a" }
  );
  assert.ok(codes(validateFlowGraph(flow)).includes("graph.cycle"));
});

test("rejects unsupported node types", () => {
  const flow = validFlow();
  flow.nodes.find((node) => node.id === "builder").type = "shell-anything";
  assert.ok(codes(validateFlowGraph(flow)).includes("node.type"));
});

test("rejects flows above the node budget", () => {
  const flow = validFlow();
  for (let i = flow.nodes.length; i <= MAX_FLOW_NODES; i += 1) {
    flow.nodes.push({ id: `extra-${i}`, type: "agent" });
  }
  assert.ok(codes(validateFlowGraph(flow)).includes("nodes.limit"));
});

test("rejects malformed version and container shapes", () => {
  const badVersion = validFlow();
  badVersion.version = "flow-graph/v999";
  assert.ok(codes(validateFlowGraph(badVersion)).includes("graph.version"));

  const malformed = validateFlowGraph({ version: FLOW_GRAPH_VERSION, nodes: {}, edges: null });
  assert.equal(malformed.valid, false);
  assert.ok(codes(malformed).includes("nodes.invalid"));
  assert.ok(codes(malformed).includes("edges.invalid"));
});
