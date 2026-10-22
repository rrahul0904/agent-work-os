import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stageForgeWorktree, inspectForgeWorktree } from "../src/forge-worktrees.js";
import { independentlyVerifyForgeDiff } from "../../verifier/forge-readonly-verifier.js";
import { runForgeIndependentReview } from "../src/forge-independent-review.js";

function git(cwd, ...args) { return execFileSync("git", args, { cwd, encoding: "utf8" }).trim(); }
async function createGitFixture() {
  const home = await mkdtemp(path.join(os.tmpdir(), "forge-independent-review-"));
  const source = path.join(home, "source");
  const root = path.join(home, "isolated");
  await mkdir(source); await mkdir(root);
  git(source, "init", "-q");
  git(source, "config", "user.name", "Forge Test");
  git(source, "config", "user.email", "forge@example.test");
  await writeFile(path.join(source, "README.md"), "one\n");
  git(source, "add", "README.md"); git(source, "commit", "-qm", "initial");
  const stage = await stageForgeWorktree({
    cwd: source, root, planId: "forge-test", taskId: "research", sessionId: "session-1"
  });
  return { home, source, root, stage };
}

test("independent verifier reopens actual isolated Git tree and recomputes exact diff in separate process", async () => {
  const f = await createGitFixture();
  await writeFile(path.join(f.stage.path, "README.md"), "two\n");
  const claimed = await inspectForgeWorktree(f.stage);
  const report = await runForgeIndependentReview(f.stage, claimed, f.root);
  assert.equal(report.passed, true);
  assert.equal(report.reviewScope, "git-diff-check-and-receipt-reconciliation-only");
  assert.equal(report.testsExecuted, false);
  assert.equal(report.sourceMerged, false);
  assert.equal(report.deploymentVerified, false);
  assert.equal(report.trackedDiffDigest, claimed.trackedDiffDigest);
  assert.ok(/^sha256:[a-f0-9]{64}$/.test(report.reportDigest));
  const local = independentlyVerifyForgeDiff(f.stage, claimed, {root:f.root});
  assert.equal(local.reportDigest, report.reportDigest);
});

test("different worker-reported hash and unobserved worker modification are rejected", async () => {
  const f = await createGitFixture();
  await writeFile(path.join(f.stage.path, "README.md"), "two\n");
  const claimed = await inspectForgeWorktree(f.stage);
  assert.throws(() => independentlyVerifyForgeDiff(f.stage, {
    ...claimed, trackedDiffDigest: "sha256:" + "0".repeat(64)
  }, { root: f.root }), /forge_verifier_diff_mismatch/);
  await writeFile(path.join(f.stage.path, "README.md"), "three\n");
  assert.throws(() => independentlyVerifyForgeDiff(f.stage, claimed, {root:f.root}),
    /forge_verifier_diff_mismatch/);
  await assert.rejects(runForgeIndependentReview(f.stage, claimed, f.root),
    /forge_review_malformed_result/);
});

test("independent verifier checks untracked gaps, whitespace and rejects forged directory", async () => {
  const f = await createGitFixture();
  await writeFile(path.join(f.stage.path, "README.md"), "two\n");
  await writeFile(path.join(f.stage.path, "new-secret.txt"), "secret\n");
  const untracked = await inspectForgeWorktree(f.stage);
  const incomplete = independentlyVerifyForgeDiff(f.stage, untracked, {root:f.root});
  assert.equal(incomplete.passed, false);
  assert.equal(incomplete.untrackedPresent, true);
  assert.equal(incomplete.testsExecuted, false);
  const forged = { ...f.stage, path: f.source };
  assert.throws(() => independentlyVerifyForgeDiff(forged, untracked, {root:f.root}),
    /forge_verifier_path_outside_root/);
  const other = await mkdtemp(path.join(os.tmpdir(), "forge-other-root-"));
  assert.throws(() => independentlyVerifyForgeDiff(f.stage, untracked, {root:other}),
    /forge_verifier_path_outside_root/);
});

test("worker-reported receipt flags and IDs cannot override independently recomputed facts", async () => {
  const f = await createGitFixture();
  const clean = await inspectForgeWorktree(f.stage);
  assert.throws(() => independentlyVerifyForgeDiff(f.stage, {
    ...clean, changed: true
  }, {root:f.root}), /forge_verifier_status_mismatch/);
  assert.throws(() => independentlyVerifyForgeDiff(f.stage, {
    ...clean, sessionId: "wrong"
  }, {root:f.root}), /forge_verifier_identity_mismatch/);
});
