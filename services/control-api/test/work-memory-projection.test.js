import test from "node:test";
import assert from "node:assert/strict";
import { projectWorkMemory, WorkMemoryProjectionError } from "../src/work-memory-projection.js";

const workItem = {
  id: "w1",
  projectId: "p1",
  title: "Ship bounded integration",
  description: "Converge authoritative work truth with Work Memory",
  lane: "review",
  humanOnly: false,
  owner: { id: "codex", kind: "agent", provider: "openai" },
  completionReport: {
    summary: "Implemented projection",
    commitSha: "abc1234",
    ciStatus: "passed",
    testInstructions: "npm test",
    prUrl: "https://github.com/acme/repo/pull/1",
    submittedBy: { id: "codex", kind: "agent", provider: "openai" },
    submittedAt: "2026-10-07T17:20:00Z",
  },
  createdAt: "2026-10-07T17:00:00Z",
  updatedAt: "2026-10-07T17:20:00Z",
};

const pending = {
  id: "d1", workItemId: "w1", kind: "merge", question: "Approve merge?", status: "pending",
  requestedBy: { id: "codex", kind: "agent", provider: "openai" }, requestedAt: "2026-10-07T17:21:00Z",
  resolvedBy: null, resolvedAt: null, comment: null,
};

const approved = {
  id: "d2", workItemId: "w1", kind: "release", question: "Approve release?", status: "approved",
  requestedBy: { id: "codex", kind: "agent", provider: "openai" }, requestedAt: "2026-10-07T17:22:00Z",
  resolvedBy: { id: "rahul", kind: "human" }, resolvedAt: "2026-10-07T17:23:00Z", comment: "Reviewed evidence",
};

const activity = [
  { id: "a2", workItemId: "w1", type: "decision.requested", actor: { id: "codex", kind: "agent" }, details: { decisionId: "d1" }, at: "2026-10-07T17:21:00Z" },
  { id: "a1", workItemId: "w1", type: "work_item.completion_reported", actor: { id: "codex", kind: "agent" }, details: { commitSha: "abc1234" }, at: "2026-10-07T17:20:00Z" },
];

test("projection is deterministic regardless of source collection ordering", () => {
  const first = projectWorkMemory({ workItem, decisions: [approved, pending], activity });
  const second = projectWorkMemory({ workItem, decisions: [pending, approved], activity: [...activity].reverse() });
  assert.equal(first.digest, second.digest);
  assert.deepEqual(first, second);
});

test("pending approvals stay unresolved questions and approved decisions retain human authority", () => {
  const projected = projectWorkMemory({ workItem, decisions: [pending, approved], activity: [] });
  const pendingEntry = projected.entries.find((entry) => entry.id === "decision:d1");
  const approvedEntry = projected.entries.find((entry) => entry.id === "decision:d2");
  assert.equal(pendingEntry.kind, "question");
  assert.equal(pendingEntry.resolved, false);
  assert.equal(approvedEntry.kind, "approval");
  assert.equal(approvedEntry.actor.type, "human");
  assert.equal(approvedEntry.resolution, "approved");
  assert.deepEqual(projected.pendingDecisionIds, ["d1"]);
});

test("completion report is projected as an unverified attempt, not completion proof", () => {
  const projected = projectWorkMemory({ workItem, decisions: [], activity: [] });
  const attempt = projected.entries.find((entry) => entry.id === "completion-report");
  assert.equal(attempt.kind, "attempt");
  assert.equal(attempt.verified, false);
  assert.ok(attempt.evidenceRefs.includes("claim:commit:abc1234"));
  assert.ok(attempt.evidenceRefs.includes("claim:ci:passed"));
  assert.equal(projected.workState.done, false);
});

test("done state is reflected only from the authoritative work item", () => {
  const done = { ...workItem, lane: "done" };
  const projected = projectWorkMemory({ workItem: done, decisions: [approved], activity: [] });
  assert.equal(projected.workState.done, true);
  assert.equal(projected.authority.mutableThroughProjection, false);
  assert.equal(projected.authority.statusAuthority, "project-desk");
  assert.equal(projected.authority.approvalAuthority, "project-desk");
  assert.equal(done.lane, "done");
});

test("cross-work facts fail closed instead of leaking into another work memory", () => {
  assert.throws(
    () => projectWorkMemory({ workItem, decisions: [{ ...pending, workItemId: "other" }], activity: [] }),
    (error) => error instanceof WorkMemoryProjectionError && error.code === "cross_work_decision",
  );
  assert.throws(
    () => projectWorkMemory({ workItem, decisions: [], activity: [{ ...activity[0], workItemId: "other" }] }),
    (error) => error instanceof WorkMemoryProjectionError && error.code === "cross_work_activity",
  );
});
