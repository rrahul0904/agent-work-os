import assert from "node:assert/strict";
import test from "node:test";
import {
  COORDINATION_SCHEMA_VERSION,
  FairTurnScheduler,
  projectAttention,
  reparentAgent,
  validateOrganization
} from "../src/coordination.js";

function organization() {
  return {
    id: "org-a",
    name: "Alpha",
    agents: [
      { id: "lead", parentId: null },
      { id: "builder", parentId: "lead" },
      { id: "reviewer", parentId: "lead" }
    ]
  };
}

test("organization validation is deterministic and rejects missing parents and cycles", () => {
  const normalized = validateOrganization(organization());
  assert.equal(normalized.schemaVersion, COORDINATION_SCHEMA_VERSION);
  assert.deepEqual(normalized.agents.map((agent) => agent.id), ["builder", "lead", "reviewer"]);

  assert.throws(
    () => validateOrganization({ id: "bad", agents: [{ id: "child", parentId: "missing" }] }),
    /missing parent/
  );
  assert.throws(
    () => validateOrganization({
      id: "cycle",
      agents: [
        { id: "a", parentId: "b" },
        { id: "b", parentId: "a" }
      ]
    }),
    /cycle detected/
  );
});

test("reparenting preserves a valid tree and refuses a descendant cycle", () => {
  const moved = reparentAgent(organization(), "reviewer", "builder");
  assert.equal(moved.agents.find((agent) => agent.id === "reviewer").parentId, "builder");

  assert.throws(
    () => reparentAgent(moved, "lead", "reviewer"),
    /cycle detected/
  );
});

test("fair scheduler enforces global concurrency, preserves org FIFO and rotates organizations", () => {
  const scheduler = new FairTurnScheduler({ maxConcurrent: 2 });
  scheduler.enqueue({ id: "a1", organizationId: "a", agentId: "a-lead" });
  scheduler.enqueue({ id: "a2", organizationId: "a", agentId: "a-worker" });
  scheduler.enqueue({ id: "b1", organizationId: "b", agentId: "b-lead" });
  scheduler.enqueue({ id: "b2", organizationId: "b", agentId: "b-worker" });

  assert.deepEqual(scheduler.dispatch().map((turn) => turn.id), ["a1", "b1"]);
  assert.equal(scheduler.snapshot().running.length, 2);
  assert.equal(scheduler.dispatch().length, 0);
  assert.equal(scheduler.receipt("a2").queuePosition, 1);
  assert.equal(scheduler.receipt("a2").reason, "global_concurrency_limit");

  scheduler.complete("a1");
  scheduler.complete("b1");
  assert.deepEqual(scheduler.dispatch().map((turn) => turn.id), ["a2", "b2"]);
});

test("fair scheduler does not starve a later organization behind a deep queue", () => {
  const scheduler = new FairTurnScheduler({ maxConcurrent: 1 });
  scheduler.enqueue({ id: "a1", organizationId: "a", agentId: "a1" });
  scheduler.enqueue({ id: "a2", organizationId: "a", agentId: "a2" });
  scheduler.enqueue({ id: "a3", organizationId: "a", agentId: "a3" });
  scheduler.enqueue({ id: "b1", organizationId: "b", agentId: "b1" });

  assert.equal(scheduler.dispatch()[0].id, "a1");
  scheduler.complete("a1");
  assert.equal(scheduler.dispatch()[0].id, "b1");
  scheduler.complete("b1");
  assert.equal(scheduler.dispatch()[0].id, "a2");
});

test("attention projection is stable, deduplicated and excludes resolved work", () => {
  const input = {
    approvals: [
      { id: "p1", state: "pending", priority: "critical", createdAt: "2026-10-01T10:00:00Z", title: "Approve deploy" },
      { id: "p1", state: "pending", priority: "critical", createdAt: "2026-10-01T10:00:00Z", title: "Approve deploy" }
    ],
    messages: [
      { id: "m1", urgent: true, createdAt: "2026-10-01T09:00:00Z", text: "Need a decision" },
      { id: "m2", urgent: false, createdAt: "2026-10-01T08:00:00Z", text: "FYI" }
    ],
    workItems: [
      { id: "w1", blockedByHuman: true, createdAt: "2026-10-01T07:00:00Z", title: "Choose API" },
      { id: "w2", status: "needs_human", priority: "high", createdAt: "2026-10-01T06:00:00Z", title: "Review scope" }
    ]
  };

  assert.deepEqual(
    projectAttention(input).map((item) => item.id),
    ["approval:p1", "work:w2", "message:m1", "work:w1"]
  );
  assert.deepEqual(
    projectAttention(input, { resolvedIds: ["p1", "work:w2"] }).map((item) => item.id),
    ["message:m1", "work:w1"]
  );
});
