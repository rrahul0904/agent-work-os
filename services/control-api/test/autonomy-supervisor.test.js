import test from "node:test";
import assert from "node:assert/strict";
import { createAutonomyRun, nextAutonomyTask, recordAutonomyAttempt, recordShippingReceipt, verifyAutonomyRun } from "../src/autonomy-supervisor.js";
import { createShippingRun, buildReleaseReceipt } from "../src/shipping-receipts.js";

const contract = {
  version: "autonomy-contract/v1",
  project: { id: "agent-work-os", repository: "rrahul0904/agent-work-os", baseBranch: "main" },
  mandate: { goal: "Improve safely", allowedWorkKinds: ["bug", "test", "docs", "feature"] },
  execution: { implementerProviders: ["codex"], isolatedWorktree: true },
  review: { independentFromAuthor: true, lenses: [{ id: "correctness", required: true }] },
  merge: { requiredChecks: ["test"], exactHeadSha: true, latestReviewRecordOnly: true },
  reserved: { paths: ["scripts/**"], actions: ["production-deploy"] },
  budgets: { maxTasksPerRun: 2, maxFixAttempts: 1, maxMergesPerRun: 1, maxCostUsd: 5 },
  learning: { journalRequired: true, promoteFailuresToGuards: true }
};
const base = "1234567890abcdef";
const head = "abcdef1234567890";
const findings = [
  finding("high", "High value", 5, 1),
  finding("low", "Low value", 2, 1),
  { ...finding("reject", "Reject", 5, 1), cleanRoomDecision: "reject" }
];

function finding(id, capability, value, risk) {
  return {
    version: "rea-finding/v1",
    id,
    sourceUrl: "https://example.test/source",
    sourceIdentity: "public-donor",
    capability,
    cleanRoomDecision: "adopt_pattern",
    evidence: [{ url: "https://example.test/evidence", claim: `Observed ${capability}` }],
    value,
    confidence: 5,
    risk,
    effort: 1
  };
}

function greenEvidence(overrides = {}) {
  return {
    headSha: head,
    baseSha: base,
    authorAgentId: "builder",
    sourceTrust: "maintainer",
    changedFiles: ["src/a.js"],
    actions: [],
    ciChecks: [{ name: "test", sha: head, status: "success" }],
    reviews: [{ reviewerId: "reviewer", lens: "correctness", headSha: head, baseSha: base, verdict: "READY", sequence: 1 }],
    humanApprovals: [],
    ...overrides
  };
}

function receiptFor(sha) {
  const at = "2026-10-15T16:00:00.000Z";
  const ship = createShippingRun({
    runId: "ship-1",
    projectId: "agent-work-os",
    releaseVersion: "0.1.0",
    contractDigest: `sha256:${"a".repeat(64)}`,
    at
  });
  ship.state = "SHIPPED";
  ship.testedSha = sha;
  ship.deployedSha = sha;
  ship.updatedAt = at;
  return buildReleaseReceipt(ship, { goldenPath: [{ id: "smoke" }] });
}

test("run compiles and bounds REA-backed work by rank", () => {
  const run = createAutonomyRun({ runId: "auto-1", contract, findings, at: "2026-10-15T15:00:00.000Z" });
  assert.equal(run.state, "READY");
  assert.deepEqual(run.backlog.map((item) => item.id), ["rea-high", "rea-low"]);
  assert.equal(nextAutonomyTask(run).task.id, "rea-high");
  assert.equal(verifyAutonomyRun(run).valid, true);
});

test("blocked evidence retries, then exact-SHA green evidence awaits Shipping OS", () => {
  let run = createAutonomyRun({ runId: "auto-2", contract, findings });
  run = recordAutonomyAttempt(run, {
    workItemId: "rea-high",
    evidence: greenEvidence({ ciChecks: [{ name: "test", sha: head, status: "failure" }] }),
    costUsd: 0.5
  });
  assert.equal(run.backlog[0].status, "RETRYABLE");
  run = recordAutonomyAttempt(run, { workItemId: "rea-high", evidence: greenEvidence(), costUsd: 0.25 });
  assert.equal(run.backlog[0].status, "AWAITING_SHIPPING");
  assert.equal(run.state, "AWAITING_SHIPPING");
  assert.equal(run.spentCostUsd, 0.75);
});

test("reserved path waits for exact-SHA human approval", () => {
  let run = createAutonomyRun({ runId: "auto-3", contract, findings });
  const reserved = greenEvidence({ changedFiles: ["scripts/release.mjs"] });
  run = recordAutonomyAttempt(run, { workItemId: "rea-high", evidence: reserved });
  assert.equal(run.backlog[0].status, "AWAITING_APPROVAL");
  run = recordAutonomyAttempt(run, {
    workItemId: "rea-high",
    evidence: {
      ...reserved,
      humanApprovals: [{ kind: "path", subject: "scripts/**", headSha: head, approvedBy: "operator" }]
    }
  });
  assert.equal(run.backlog[0].status, "AWAITING_SHIPPING");
});

test("only a valid Shipping OS receipt for the exact candidate completes work", () => {
  let run = createAutonomyRun({ runId: "auto-4", contract, findings });
  run = recordAutonomyAttempt(run, { workItemId: "rea-high", evidence: greenEvidence() });
  const receipt = receiptFor(head);
  run = recordShippingReceipt(run, { workItemId: "rea-high", receipt });
  assert.equal(run.backlog[0].status, "SHIPPED");
  assert.equal(run.shippedCount, 1);
  assert.equal(run.state, "MERGE_BUDGET_REACHED");
  assert.equal(verifyAutonomyRun(run).valid, true);

  let other = createAutonomyRun({ runId: "auto-5", contract, findings });
  other = recordAutonomyAttempt(other, { workItemId: "rea-high", evidence: greenEvidence() });
  const tampered = { ...receipt, testedSha: "9999999999999999" };
  assert.throws(() => recordShippingReceipt(other, { workItemId: "rea-high", receipt: tampered }), /autonomy_shipping_receipt_invalid/);
});

test("cost budget fails closed before an over-budget attempt runs", () => {
  let run = createAutonomyRun({ runId: "auto-6", contract, findings });
  run = recordAutonomyAttempt(run, { workItemId: "rea-high", evidence: greenEvidence(), costUsd: 5.01 });
  assert.equal(run.state, "BUDGET_BLOCKED");
  assert.equal(run.spentCostUsd, 0);
  assert.equal(run.backlog[0].attempts, 0);
});

test("approval-waiting work is not automatically selected for another implementer attempt", () => {
  let run = createAutonomyRun({ runId: "auto-7", contract, findings: [findings[0]] });
  run = recordAutonomyAttempt(run, { workItemId: "rea-high", evidence: greenEvidence({ changedFiles: ["scripts/release.mjs"] }) });
  assert.equal(run.backlog[0].status, "AWAITING_APPROVAL");
  assert.equal(nextAutonomyTask(run).task, null);
  assert.equal(nextAutonomyTask(run).reason, "no_runnable_task");
});

test("shipping-waiting work cannot be re-attempted by an implementer", () => {
  let run = createAutonomyRun({ runId: "auto-8", contract, findings });
  run = recordAutonomyAttempt(run, { workItemId: "rea-high", evidence: greenEvidence() });
  assert.throws(() => recordAutonomyAttempt(run, { workItemId: "rea-high", evidence: greenEvidence() }), /autonomy_task_not_attemptable:AWAITING_SHIPPING/);
});
