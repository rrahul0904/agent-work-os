import test from "node:test";
import assert from "node:assert/strict";
import { WorkMemoryService } from "../src/work-memory-service.js";
import { WorkMemoryProjectionError } from "../src/work-memory-projection.js";

class MemoryStore {
  constructor({ workItems = {}, decisions = [], activity = [] } = {}) {
    this.workItems = workItems;
    this.decisions = decisions;
    this.activity = activity;
  }
  getWorkItem(id) { return this.workItems[id]; }
  listDecisions() { return structuredClone(this.decisions); }
  listActivity() { return structuredClone(this.activity); }
}

const w1 = {
  id: "w1", projectId: "p1", title: "First", description: "First work", lane: "in_progress",
  humanOnly: false, owner: { id: "codex", kind: "agent" }, completionReport: null,
  createdAt: "2026-10-07T17:30:00Z", updatedAt: "2026-10-07T17:31:00Z",
};
const w2 = {
  id: "w2", projectId: "p1", title: "Second", description: "Second work", lane: "ready",
  humanOnly: false, owner: null, completionReport: null,
  createdAt: "2026-10-07T17:32:00Z", updatedAt: "2026-10-07T17:32:00Z",
};

test("service projects only facts belonging to the requested work item", () => {
  const store = new MemoryStore({
    workItems: { w1, w2 },
    decisions: [
      { id: "d1", workItemId: "w1", question: "Approve?", status: "pending", requestedBy: { id: "codex", kind: "agent" }, requestedAt: "2026-10-07T17:33:00Z" },
      { id: "d2", workItemId: "w2", question: "Other?", status: "pending", requestedBy: { id: "codex", kind: "agent" }, requestedAt: "2026-10-07T17:34:00Z" },
    ],
    activity: [
      { id: "a1", workItemId: "w1", type: "work_item.claimed", actor: { id: "codex", kind: "agent" }, details: {}, at: "2026-10-07T17:31:00Z" },
      { id: "a2", workItemId: "w2", type: "work_item.created", actor: { id: "rahul", kind: "human" }, details: {}, at: "2026-10-07T17:32:00Z" },
    ],
  });
  const projection = new WorkMemoryService(store).getProjection("w1");
  assert.equal(projection.workId, "w1");
  assert.deepEqual(projection.pendingDecisionIds, ["d1"]);
  assert.ok(projection.entries.some((entry) => entry.id === "activity:a1"));
  assert.equal(projection.entries.some((entry) => entry.id === "activity:a2"), false);
  assert.equal(projection.entries.some((entry) => entry.id === "decision:d2"), false);
});

test("service refuses unknown work ids without exposing unrelated state", () => {
  const service = new WorkMemoryService(new MemoryStore({ workItems: { w1 } }));
  assert.throws(
    () => service.getProjection("missing"),
    (error) => error instanceof WorkMemoryProjectionError && error.code === "work_item_not_found",
  );
});
