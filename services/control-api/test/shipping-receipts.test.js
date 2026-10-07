import test from "node:test";
import assert from "node:assert/strict";
import { appendShippingEvent, buildReleaseReceipt, createShippingRun, reconcileShippingRunOnStartup, verifyReleaseReceipt, verifyShippingRun } from "../src/shipping-receipts.js";

const DIGEST = `sha256:${"a".repeat(64)}`;

test("receipt chain detects tampering", () => {
  let run = createShippingRun({ runId: "r1", projectId: "p1", releaseVersion: "0.1", contractDigest: DIGEST });
  run = appendShippingEvent(run, { type: "a", state: "WORKTREE_READY" });
  run = appendShippingEvent(run, { type: "b", state: "VERIFIED" });
  assert.equal(verifyShippingRun(run).valid, true);
  run.events[0].state = "SHIPPED";
  assert.equal(verifyShippingRun(run).valid, false);
});

test("startup reconciliation never fabricates success", () => {
  let run = createShippingRun({ runId: "r2", projectId: "p1", releaseVersion: "0.1", contractDigest: DIGEST });
  run = appendShippingEvent(run, { type: "build", state: "BUILDING" });
  run = reconcileShippingRunOnStartup(run, { at: "2026-10-07T17:00:00.000Z" });
  assert.equal(run.state, "INTERRUPTED");
  assert.equal(run.events.at(-1).message, "restart_from:BUILDING");
});

test("release receipt only builds from evidence-complete SHIPPED run", () => {
  let run = createShippingRun({ runId: "r3", projectId: "p1", releaseVersion: "0.1", contractDigest: DIGEST });
  run.testedSha = "abc1234";
  run.deployedSha = "abc1234";
  run = appendShippingEvent(run, { type: "release.shipped", state: "SHIPPED" });
  const receipt = buildReleaseReceipt(run, { goldenPath: [{ id: "G1" }] });
  assert.equal(verifyReleaseReceipt(receipt).valid, true);
  receipt.projectId = "tampered";
  assert.equal(verifyReleaseReceipt(receipt).valid, false);
});
