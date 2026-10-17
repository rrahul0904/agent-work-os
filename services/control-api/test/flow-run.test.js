import assert from "node:assert/strict";
import test from "node:test";
import {
  createFlowRun,
  reconcileFlowRunOnStartup,
  transitionFlowNode,
  transitionFlowRun,
  verifyFlowRunSnapshot
} from "../src/flow-run.js";

const DIGEST = `sha256:${"a".repeat(64)}`;
const T0 = "2026-10-05T20:00:00.000Z";
const T1 = "2026-10-05T20:00:01.000Z";
const T2 = "2026-10-05T20:00:02.000Z";
const T3 = "2026-10-05T20:00:03.000Z";
const T4 = "2026-10-05T20:00:04.000Z";
const T5 = "2026-10-05T20:00:05.000Z";
const T6 = "2026-10-05T20:00:06.000Z";

function fresh(id = "run-1", nodeIds = ["a", "b"]) {
  return createFlowRun({ id, flowDigest: DIGEST, nodeIds, trigger: { type: "manual" }, at: T0 });
}

function running(run = fresh()) {
  run = transitionFlowRun(run, { to: "admitted", at: T1, reason: "policy_ok" });
  return transitionFlowRun(run, { to: "running", at: T2, reason: "executor_ready" });
}

test("creates a verified queued run bound to an exact flow digest", () => {
  const run = fresh();
  assert.equal(run.status, "queued");
  assert.deepEqual(run.activeNodeIds, []);
  assert.equal(run.nodes.a.status, "pending");
  assert.equal(run.nodes.a.attempts, 0);
  assert.deepEqual(verifyFlowRunSnapshot(run), { valid: true, errors: [] });
});

test("records hash-chained run and node transition receipts", () => {
  let run = running(fresh("receipt-run", ["a"]));
  run = transitionFlowNode(run, "a", { to: "running", at: T3 });
  run = transitionFlowNode(run, "a", { to: "completed", at: T4, evidenceRefs: ["test:green", "sha:abc"] });
  run = transitionFlowRun(run, { to: "completed", at: T5, evidenceRefs: ["verifier:receipt-1"] });

  assert.equal(run.status, "completed");
  assert.equal(run.nodes.a.status, "completed");
  assert.equal(run.nodes.a.attempts, 1);
  assert.equal(run.receipts.length, 5);
  assert.equal(run.receipts[0].previousReceiptDigest, null);
  assert.equal(run.receipts[1].previousReceiptDigest, run.receipts[0].receiptDigest);
  assert.equal(run.receipts.at(-1).previousReceiptDigest, run.receipts.at(-2).receiptDigest);
  assert.deepEqual(verifyFlowRunSnapshot(run), { valid: true, errors: [] });
});

test("refuses node execution until the run is running", () => {
  assert.throws(
    () => transitionFlowNode(fresh(), "a", { to: "running", at: T1 }),
    /flow_node_run_not_running/
  );
});

test("parks for approval and resumes the same attempt", () => {
  let run = running(fresh("approval-run", ["approval"]));
  run = transitionFlowNode(run, "approval", { to: "running", at: T3 });
  run = transitionFlowNode(run, "approval", { to: "waiting_for_approval", at: T4, reason: "protected_transition" });
  run = transitionFlowRun(run, { to: "waiting_for_approval", at: T4 });

  assert.equal(run.status, "waiting_for_approval");
  assert.equal(run.nodes.approval.status, "waiting_for_approval");
  assert.equal(run.nodes.approval.attempts, 1);
  assert.deepEqual(run.activeNodeIds, []);

  run = transitionFlowRun(run, { to: "running", at: T5, reason: "approval_granted", evidenceRefs: ["approval:exact-digest"] });
  run = transitionFlowNode(run, "approval", { to: "running", at: T5, reason: "resume" });
  assert.equal(run.nodes.approval.attempts, 1);
  run = transitionFlowNode(run, "approval", { to: "completed", at: T6 });
  assert.deepEqual(verifyFlowRunSnapshot(run), { valid: true, errors: [] });
});

test("increments attempts only for a real retry", () => {
  let run = running(fresh("retry-run", ["agent"]));
  run = transitionFlowNode(run, "agent", { to: "running", at: T3 });
  run = transitionFlowNode(run, "agent", { to: "failed", at: T4, reason: "test_failed" });
  assert.equal(run.nodes.agent.attempts, 1);

  run = transitionFlowNode(run, "agent", { to: "running", at: T5, reason: "explicit_retry" });
  assert.equal(run.nodes.agent.attempts, 2);
});

test("supports concurrent active nodes for fan-out", () => {
  let run = running(fresh("fanout-run", ["left", "right"]));
  run = transitionFlowNode(run, "right", { to: "running", at: T3 });
  run = transitionFlowNode(run, "left", { to: "running", at: T3 });
  assert.deepEqual(run.activeNodeIds, ["left", "right"]);

  run = transitionFlowNode(run, "left", { to: "completed", at: T4 });
  assert.deepEqual(run.activeNodeIds, ["right"]);
  assert.deepEqual(verifyFlowRunSnapshot(run), { valid: true, errors: [] });
});

test("refuses any non-running run state while live nodes remain", () => {
  let run = running(fresh("live-run", ["agent"]));
  run = transitionFlowNode(run, "agent", { to: "running", at: T3 });
  assert.throws(
    () => transitionFlowRun(run, { to: "completed", at: T4 }),
    /flow_run_nonrunning_with_active_nodes/
  );
  assert.throws(
    () => transitionFlowRun(run, { to: "cancelled", at: T4 }),
    /flow_run_nonrunning_with_active_nodes/
  );
  assert.throws(
    () => transitionFlowRun(run, { to: "interrupted", at: T4 }),
    /flow_run_nonrunning_with_active_nodes/
  );
});

test("reconciles every live node to interrupted after restart without assuming failure", () => {
  let run = running(fresh("restart-run", ["left", "right"]));
  run = transitionFlowNode(run, "left", { to: "running", at: T3 });
  run = transitionFlowNode(run, "right", { to: "running", at: T3 });

  const reconciled = reconcileFlowRunOnStartup(run, { at: T4 });
  assert.equal(reconciled.status, "interrupted");
  assert.equal(reconciled.nodes.left.status, "interrupted");
  assert.equal(reconciled.nodes.right.status, "interrupted");
  assert.deepEqual(reconciled.activeNodeIds, []);
  assert.equal(reconciled.completedAt, null);
  assert.deepEqual(verifyFlowRunSnapshot(reconciled), { valid: true, errors: [] });
});

test("preserves a parked approval across restart when no executor is live", () => {
  let run = running(fresh("parked-run", ["approval"]));
  run = transitionFlowNode(run, "approval", { to: "running", at: T3 });
  run = transitionFlowNode(run, "approval", { to: "waiting_for_approval", at: T4 });
  run = transitionFlowRun(run, { to: "waiting_for_approval", at: T4 });
  const receiptCount = run.receipts.length;

  const reconciled = reconcileFlowRunOnStartup(run, { at: T5 });
  assert.equal(reconciled.status, "waiting_for_approval");
  assert.equal(reconciled.nodes.approval.status, "waiting_for_approval");
  assert.equal(reconciled.receipts.length, receiptCount);
});

test("detects receipt tampering", () => {
  let run = running(fresh("tamper-run", ["a"]));
  run = transitionFlowNode(run, "a", { to: "running", at: T3, reason: "original" });
  const tampered = structuredClone(run);
  tampered.receipts[0].reason = "rewritten";

  const result = verifyFlowRunSnapshot(tampered);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.startsWith("flow_receipt_digest_invalid:")));
});

test("canonicalizes evidence reference order in receipts", () => {
  let first = fresh("deterministic-run", ["a"]);
  let second = fresh("deterministic-run", ["a"]);
  first = transitionFlowRun(first, { to: "admitted", at: T1, evidenceRefs: ["b", "a"] });
  second = transitionFlowRun(second, { to: "admitted", at: T1, evidenceRefs: ["a", "b"] });
  assert.equal(first.receipts[0].receiptDigest, second.receipts[0].receiptDigest);
});

test("refuses mutation from a snapshot whose active-node projection was tampered", () => {
  let run = running(fresh("projection-run", ["a"]));
  run = transitionFlowNode(run, "a", { to: "running", at: T3 });
  run.activeNodeIds = [];
  const result = verifyFlowRunSnapshot(run);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("flow_run_active_nodes_mismatch"));
  assert.throws(() => transitionFlowNode(run, "a", { to: "completed", at: T4 }), /flow_run_snapshot_invalid/);
});
