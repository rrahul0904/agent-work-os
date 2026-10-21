import test from "node:test";
import assert from "node:assert/strict";
import { buildForgeGraph, layoutForgeGraph, statusTone } from "../../../apps/web/public/forge-graph.js";

test("empty snapshots never fabricate a supervisor, agents, tasks or dependencies", () => {
  const graph = buildForgeGraph({});
  assert.deepEqual(graph.nodes, []);
  assert.deepEqual(graph.edges, []);
  assert.equal(graph.totalNodes, 0);
  assert.equal(graph.taskDependencyGraphAvailable, false);
});

test("observed machine bindings produce only supported edges", () => {
  const graph = buildForgeGraph({
    machines: [{ id: "m1", name: "Mac Studio", status: "online" }],
    sessions: [
      { id: "s1", machineId: "m1", agent: "codex", status: "running", events: [{ kind: "status" }] },
      { id: "orphan", machineId: "missing", agent: "echo", status: "unknown" }
    ],
    shippingRuns: [
      { runId: "ship1", machineId: "m1", projectId: "p1", state: "SHIPPED", releaseReceipt: { status: "PASS" } }
    ],
    workItems: [{ id: "w1", title: "Review design", state: "queued" }]
  });
  assert.deepEqual(graph.counts, { machine: 1, session: 2, shipping: 1, work: 1 });
  assert.deepEqual(graph.edges.map(edge => [edge.from, edge.to]), [
    ["machine:m1", "session:s1"], ["machine:m1", "shipping:ship1"]
  ]);
  assert.equal(graph.nodes.find(node => node.id === "shipping:ship1").evidence, true);
  assert.equal(graph.nodes.find(node => node.id === "session:s1").eventCount, 1);
  assert.equal(graph.taskDependencyGraphAvailable, false);
});

test("truncated snapshots do not leak dangling edges or invent missing machine nodes", () => {
  const graph = buildForgeGraph({
    machines: [{ id: "m1", name: "m" }],
    sessions: [
      { id: "s1", machineId: "m1", status: "queued" },
      { id: "s2", machineId: "m1", status: "running" }
    ]
  }, { maxNodes: 2 });
  assert.equal(graph.totalNodes, 3);
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.truncated, 1);
  assert.deepEqual(graph.edges.map(e => e.to), ["session:s1"]);
  assert.ok(graph.edges.every(e => graph.nodes.some(n => n.id === e.from) && graph.nodes.some(n => n.id === e.to)));
});

test("duplicate source IDs are deduplicated, unknown records stay unknown", () => {
  const graph = buildForgeGraph({
    machines: [{ id: "m1", name: "first" }, { id: "m1", name: "second" }, { name: "without-id" }],
    sessions: [{ id: "s1", agent: "<script>alert(1)</script>" }]
  });
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.nodes[0].label, "first");
  assert.equal(graph.nodes[1].status, "unknown");
  assert.equal(graph.nodes[1].label, "<script>alert(1)</script>");
  assert.equal(graph.nodes[1].tone, "warning");
});

test("states and layouts are stable and do not treat process interruption as success", () => {
  assert.equal(statusTone("shipped"), "success");
  assert.equal(statusTone("interrupted"), "failure");
  assert.equal(statusTone("lost"), "warning");
  assert.equal(statusTone("running"), "active");
  const graph = buildForgeGraph({ machines: [{ id: "m1" }], sessions: [{ id: "s1", machineId: "m1" }] });
  const once = layoutForgeGraph(graph);
  assert.deepEqual(once, layoutForgeGraph(graph));
  assert.equal(once.edges.length, 1);
  assert.ok(once.edges[0].x2 > once.edges[0].x1);
});

test("invalid graph capacities fail closed", () => {
  for (const cap of [0, -1, 1000, 1.2, NaN]) {
    assert.throws(() => buildForgeGraph({}, { maxNodes: cap }), /invalid_graph_capacity/);
  }
});
