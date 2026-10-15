import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAutonomyGate, validateAutonomyContract } from "../src/autonomy-policy.js";

const contract = {
  version: "autonomy-contract/v1",
  project: { id: "agent-work-os", repository: "rrahul0904/agent-work-os", baseBranch: "main" },
  mandate: { goal: "Continuously improve low-risk product quality", allowedWorkKinds: ["bug", "test", "docs", "feature"] },
  execution: { implementerProviders: ["codex"], isolatedWorktree: true },
  review: { independentFromAuthor: true, lenses: [{ id: "correctness", required: true }, { id: "security", required: true }] },
  merge: { requiredChecks: ["test", "acceptance"], exactHeadSha: true, latestReviewRecordOnly: true },
  reserved: { paths: [".github/**", "scripts/**"], actions: ["production-deploy", "destructive-migration"] },
  budgets: { maxTasksPerRun: 3, maxFixAttempts: 3, maxMergesPerRun: 2, maxCostUsd: 25 },
  learning: { journalRequired: true, promoteFailuresToGuards: true }
};
const head = "abcdef1234567890";
const base = "1234567890abcdef";
const evidence = {
  headSha: head,
  baseSha: base,
  authorAgentId: "builder-1",
  sourceTrust: "maintainer",
  changedFiles: ["src/a.js"],
  actions: [],
  ciChecks: [
    { name: "test", sha: head, status: "success" },
    { name: "acceptance", sha: head, status: "success" }
  ],
  reviews: [
    { reviewerId: "r1", lens: "correctness", headSha: head, baseSha: base, verdict: "READY", sequence: 1 },
    { reviewerId: "r2", lens: "security", headSha: head, baseSha: base, verdict: "READY", sequence: 1 }
  ],
  humanApprovals: []
};

test("valid autonomy contract passes", () => assert.equal(validateAutonomyContract(contract).valid, true));

test("green exact-SHA independent reviews are ready to ship", () => {
  assert.equal(evaluateAutonomyGate(contract, evidence).state, "READY_TO_SHIP");
});

test("reserved paths require head-bound human approval", () => {
  const blocked = evaluateAutonomyGate(contract, { ...evidence, changedFiles: ["scripts/release.mjs"] });
  assert.equal(blocked.state, "HUMAN_APPROVAL_REQUIRED");
  const approved = evaluateAutonomyGate(contract, {
    ...evidence,
    changedFiles: ["scripts/release.mjs"],
    humanApprovals: [{ kind: "path", subject: "scripts/**", headSha: head, approvedBy: "operator" }]
  });
  assert.equal(approved.state, "READY_TO_SHIP");
});

test("fixup invalidates old reviews because head changed", () => {
  const nextHead = "fedcba0987654321";
  const result = evaluateAutonomyGate(contract, {
    ...evidence,
    headSha: nextHead,
    ciChecks: [
      { name: "test", sha: nextHead, status: "success" },
      { name: "acceptance", sha: nextHead, status: "success" }
    ]
  });
  assert.equal(result.state, "BLOCKED");
  assert.ok(result.reasons.includes("review_not_bound_to_head:correctness"));
});

test("author cannot satisfy independent review", () => {
  const reviews = evidence.reviews.map((review) => ({ ...review, reviewerId: "builder-1" }));
  const result = evaluateAutonomyGate(contract, { ...evidence, reviews });
  assert.ok(result.reasons.includes("review_independent_ready_missing:correctness"));
});

test("latest blocking reviewer record prevents merge", () => {
  const reviews = [
    ...evidence.reviews,
    { reviewerId: "r1", lens: "correctness", headSha: head, baseSha: base, verdict: "NEEDS_CHANGES", sequence: 2 }
  ];
  const result = evaluateAutonomyGate(contract, { ...evidence, reviews });
  assert.ok(result.reasons.includes("review_needs_changes:correctness"));
});
