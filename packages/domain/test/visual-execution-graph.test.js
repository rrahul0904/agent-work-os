import assert from "node:assert/strict";
import test from "node:test";
import { createCanonicalId } from "../src/index.js";
import {
  compileVisualExecutionReadModel,
  VisualGraphValidationError
} from "../src/visual-execution-graph.js";

const org = createCanonicalId("org");
const run = createCanonicalId("run");
const work = createCanonicalId("work");
const receipt = createCanonicalId("receipt");

function valid() {
  return {
    scope: { organizationId: org, runId: run },
    nodes: [
      { id: "task-b", type: "verification", status: "complete",
        organizationId: org, runId: run, receiptId: receipt },
      { id: "task-a", type: "task", status: "running",
        organizationId: org, runId: run, workItemId: work }
    ],
    edges: [{ id: "edge-1", from: "task-a", to: "task-b", type: "verifies" }]
  };
}

function failure(graph, code) {
  assert.throws(() => compileVisualExecutionReadModel(graph),
    (error) => error instanceof VisualGraphValidationError && error.code === code);
}

test("canonical serialization is stable and input ordering cannot change digest", () => {
  const a = compileVisualExecutionReadModel(valid());
  const shuffled = valid();
  shuffled.nodes.reverse();
  assert.deepEqual(compileVisualExecutionReadModel(shuffled), a);
  assert.match(a.digest, /^[a-f0-9]{64}$/);
  assert.equal(a.schema, "awos.visual-execution-read-model/v1");
  assert.equal(Object.isFrozen(a.nodes), true);
  assert.equal(Object.isFrozen(a.nodes[0]), true);
  assert.throws(() => { a.nodes.push({}); }, TypeError);
});

test("rejects duplicate nodes and relations", () => {
  const g = valid();
  g.nodes.push({ ...g.nodes[0] });
  failure(g, "node_id_duplicate");
  const h = valid();
  h.edges.push({ ...h.edges[0], id: "edge-2" });
  failure(h, "edge_relation_duplicate");
  const i = valid();
  i.edges.push({ ...i.edges[0] });
  failure(i, "edge_id_duplicate");
});

test("rejects mixed tenant or run scope", () => {
  const g = valid();
  g.nodes[0].organizationId = createCanonicalId("org");
  failure(g, "node_scope_mismatch");
  const h = valid();
  h.nodes[0].runId = createCanonicalId("run");
  failure(h, "node_scope_mismatch");
});

test("terminal states need a canonical receipt reference, not a fabricated success", () => {
  const g = valid();
  delete g.nodes[0].receiptId;
  failure(g, "terminal_state_requires_receipt_reference");
  const h = valid();
  h.nodes[0].receiptId = "receipt_fake";
  failure(h, "node_receipt_invalid");
  const i = valid();
  i.nodes[0].status = "verified";
  failure(i, "node_status_invalid");
});

test("rejects unsafe script fields and prototype-bearing objects", () => {
  const g = valid();
  g.nodes[0].script = "eval('malicious')";
  failure(g, "node_field_unknown");
  const h = valid();
  h.nodes[0] = new Date();
  failure(h, "node_invalid");
  const i = valid();
  i.scope.extra = "unknown";
  failure(i, "scope_field_unknown");
});

test("rejects missing endpoints, cycles, disconnected nodes and self loops", () => {
  const dangling = valid();
  dangling.edges[0].to = "missing";
  failure(dangling, "edge_dangling");

  const cycle = valid();
  cycle.edges.push({ id: "edge-2", from: "task-b", to: "task-a", type: "depends_on" });
  failure(cycle, "graph_cycle");

  const orphan = valid();
  orphan.nodes.push({ id: "task-c", type: "agent", status: "pending",
    organizationId: org, runId: run });
  failure(orphan, "graph_disconnected");

  const selfLoop = valid();
  selfLoop.edges[0].to = "task-a";
  failure(selfLoop, "edge_self_loop");
});

test("bounds graph sizes and preserves a one-node DAG", () => {
  const one = valid();
  one.nodes = [one.nodes[0]];
  one.edges = [];
  assert.equal(compileVisualExecutionReadModel(one).nodes.length, 1);

  const large = valid();
  large.nodes = Array.from({ length: 501 }, (_, i) => ({
    id: "n-" + i, type: "task", status: "pending", organizationId: org, runId: run
  }));
  large.edges = [];
  failure(large, "nodes_limit_invalid");
});

test("does not mutate input and does not import an execution engine", () => {
  const input = valid();
  const before = JSON.stringify(input);
  const output = compileVisualExecutionReadModel(input);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(Object.keys(output).sort(), ["digest", "edges", "nodes", "schema", "scope"]);
});
