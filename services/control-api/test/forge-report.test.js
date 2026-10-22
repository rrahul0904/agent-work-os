import test from "node:test";
import assert from "node:assert/strict";
import { validateForgePlan, approveForgePlan, claimNextForgeTask, reconcileForgeTask, verifyForgeTask } from "../src/forge-plan.js";
import { buildForgeReport } from "../src/forge-report.js";

test("evidence report never claims shipping or deployment from merely completed agent", () => {
  let plan = approveForgePlan(validateForgePlan({
    title: "Project", cwd: "/tmp/forge", machineId: "mac", tasks: [
      { id: "build", title: "Build", agent: "echo", prompt: "Test", dependsOn: [] }
    ]
  }));
  plan = claimNextForgeTask(plan, { sessionId: "s1", commandId: "c1" }).plan;
  plan = reconcileForgeTask(plan, "build", { id: "s1", status: "completed" });
  const report = buildForgeReport(plan, { s1: {
    id: "s1", status: "completed", events: [{ kind: "status", status: "completed" }]
  } });
  assert.equal(report.proposedTrackerStatus, "IN_PROGRESS_OR_BLOCKED");
  assert.equal(report.tasks[0].evidenceGap, "independent_review_required");
  assert.equal(report.tasks[0].sessionStatus, "completed");
  assert.equal(report.deployed, false);
  assert.equal(report.releaseReceipt, null);
  assert.ok(report.reportDigest.startsWith("sha256:"));
  assert.equal(JSON.stringify(report).includes("Test"), false, "do not expose hidden task prompt");
});

test("even human-attested plan requires separate Shipping OS receipt", () => {
  let plan = approveForgePlan(validateForgePlan({
    title: "Project", cwd: "/tmp/forge", machineId: "mac", tasks: [
      { id: "build", title: "Build", agent: "echo", prompt: "Implementation", dependsOn: [] }
    ]
  }));
  plan = claimNextForgeTask(plan, { sessionId: "s1", commandId: "c1" }).plan;
  plan = reconcileForgeTask(plan, "build", { id: "s1", status: "completed" });
  plan = verifyForgeTask(plan, "build", {
    approved: true, digest: "sha256:" + "1".repeat(64), reviewer: "Reviewer"
  });
  assert.equal(plan.state, "awaiting_release");
  const report = buildForgeReport(plan, {});
  assert.equal(report.proposedTrackerStatus, "RELEASE_REVIEW_REQUIRED");
  assert.equal(report.tasks[0].sessionStatus, "not_observed");
  assert.equal(report.tasks[0].attestation.kind, "human-attestation-not-automated-proof");
  assert.equal(report.releaseReceipt, null);
  assert.equal(report.deployed, false);
});


test("tracker manifest includes only redacted Git worktree SHA evidence, never raw patch content", () => {
  let plan = approveForgePlan(validateForgePlan({
    title: "Review source", cwd: "/tmp/forge", machineId: "mac", tasks: [
      { id: "change", title: "Code task", agent: "codex", prompt: "private draft prompt", dependsOn: [] }
    ]
  }));
  plan = claimNextForgeTask(plan, { sessionId: "session-1", commandId: "command-1" }).plan;
  plan = reconcileForgeTask(plan, "change", { id: "session-1", status: "completed" });
  const receipt = {
    schema: "rea-forge-diff/v1", sessionId: "session-1",
    baseSha: "a".repeat(40), headSha: "a".repeat(40),
    trackedDiffDigest: "sha256:" + "b".repeat(64),
    changed: true, completeSnapshot: false, untrackedPresent: true,
    secret: "should-not-leak", patch: "password=example"
  };
  const report = buildForgeReport(plan, { "session-1": {
    id: "session-1", status: "completed",
    events: [{ kind: "workspace.diff", receipt }]
  } });
  assert.equal(report.tasks[0].worktreeChangeEvidenceStatus, "incomplete_untracked_content");
  assert.equal(report.tasks[0].worktreeChangeEvidence.changed, true);
  assert.equal(report.tasks[0].worktreeChangeEvidence.testsPassed, null);
  assert.equal(report.tasks[0].worktreeChangeEvidence.merged, false);
  assert.equal(JSON.stringify(report).includes("password=example"), false);
  assert.equal(JSON.stringify(report).includes("should-not-leak"), false);
  assert.equal(JSON.stringify(report).includes("private draft"), false);
});
