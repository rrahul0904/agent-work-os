import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ProjectContextStore } from "../src/project-context-store.js";

function snapshot(revision, summary) {
  return {
    schemaVersion: "project-context/v1",
    projectId: "alpha",
    revision,
    updatedAt: revision === "r1" ? "2026-10-08T18:00:00.000Z" : "2026-10-08T19:00:00.000Z",
    summary,
    constraints: ["Worktrees share durable project truth but receive distinct handoff bindings."],
    decisions: [{ id: "D001", status: "active", statement: "Replay uses the exact historical context digest, not whatever is current later." }],
    evidenceRefs: ["test:context-recovery"],
  };
}

test("restart preserves exact historical handoffs across independent worktrees", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-work-os-context-recovery-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const firstProcess = new ProjectContextStore(root);
  const r1 = await firstProcess.writeSnapshot(snapshot("r1", "Initial shared project truth."));
  const worktreeA = await firstProcess.createHandoff({
    projectId: "alpha",
    worktreeId: "wt-a",
    taskId: "task-a",
    runId: "run-a",
    createdAt: "2026-10-08T18:10:00.000Z",
  });
  const worktreeB = await firstProcess.createHandoff({
    projectId: "alpha",
    worktreeId: "wt-b",
    taskId: "task-b",
    runId: "run-b",
    createdAt: "2026-10-08T18:11:00.000Z",
  });

  assert.equal(worktreeA.context.digest, r1.digest);
  assert.equal(worktreeB.context.digest, r1.digest);
  assert.equal(worktreeA.promptDigest, worktreeB.promptDigest);
  assert.notEqual(worktreeA.handoffId, worktreeB.handoffId);
  assert.equal(worktreeA.binding.worktreeId, "wt-a");
  assert.equal(worktreeB.binding.worktreeId, "wt-b");

  // Simulate a daemon/process restart and a later project-context update.
  const restarted = new ProjectContextStore(root);
  const replayA = await restarted.readHandoff("alpha", worktreeA.handoffId);
  const replayB = await restarted.readHandoff("alpha", worktreeB.handoffId);
  assert.deepEqual(replayA, worktreeA);
  assert.deepEqual(replayB, worktreeB);

  const r2 = await restarted.writeSnapshot(snapshot("r2", "New current truth after the original runs completed."));
  assert.notEqual(r2.digest, r1.digest);
  assert.equal((await restarted.readCurrent("alpha")).digest, r2.digest);

  // Historical handoffs remain pinned to r1 after current context moves to r2.
  assert.equal((await restarted.readHandoff("alpha", worktreeA.handoffId)).context.digest, r1.digest);
  assert.equal((await restarted.readHandoff("alpha", worktreeB.handoffId)).context.digest, r1.digest);
});
