import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stageForgeWorktree, inspectForgeWorktree } from "../src/forge-worktrees.js";
import { checkForgeHandoff } from "../../verifier/forge-handoff-check.js";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
async function fixture() {
  const home = await mkdtemp(path.join(os.tmpdir(), "rea-forge-handoff-"));
  const source = path.join(home, "source");
  const root = path.join(home, "workers");
  await mkdir(source); await mkdir(root);
  git(source, "init", "-q");
  git(source, "config", "user.name", "Handoff");
  git(source, "config", "user.email", "handoff@example.test");
  await writeFile(path.join(source, "README.md"), "baseline\n");
  git(source, "add", "README.md"); git(source, "commit", "-qm", "baseline");
  const stage = await stageForgeWorktree({
    cwd: source, root, planId: "forge-review", taskId: "code", sessionId: "session-1"
  });
  await writeFile(path.join(stage.path, "README.md"), "changed\n");
  const diff = await inspectForgeWorktree(stage);
  return { source, root, stage, diff, home };
}

test("handoff checks patch against exact clean base but NEVER mutates main checkout", async () => {
  const f = await fixture();
  const report = checkForgeHandoff({
    stage:f.stage, diff:f.diff, sourceRoot:f.root, destination:f.source
  });
  assert.equal(report.checked, true);
  assert.equal(report.applyPreflightPassed, true);
  assert.equal(report.promotionPerformed, false);
  assert.equal(report.authorizedToMerge, false);
  assert.equal(report.testsExecuted, false);
  assert.equal(report.patchDigest, f.diff.trackedDiffDigest);
  assert.equal(await readFile(path.join(f.source, "README.md"), "utf8"), "baseline\n");
  assert.equal(git(f.source, "status", "--porcelain"), "");
  assert.equal(JSON.stringify(report).includes("README.md"), false);
});

test("handoff refuses dirty target, diverged target HEAD, and untracked worker edits", async () => {
  const f = await fixture();
  await writeFile(path.join(f.source, "README.md"), "stale work\n");
  assert.throws(() => checkForgeHandoff({
    stage:f.stage, diff:f.diff, sourceRoot:f.root, destination:f.source
  }), /forge_handoff_destination_dirty/);
  await writeFile(path.join(f.source, "README.md"), "baseline\n");
  await writeFile(path.join(f.source, "README.md"), "committed-new-head\n");
  git(f.source, "add", "README.md"); git(f.source, "commit", "-qm", "new");
  assert.throws(() => checkForgeHandoff({
    stage:f.stage, diff:f.diff, sourceRoot:f.root, destination:f.source
  }), /forge_handoff_base_sha_conflict/);
  await writeFile(path.join(f.stage.path, "untracked-secret.txt"), "incomplete\n");
  const diff = await inspectForgeWorktree(f.stage);
  assert.throws(() => checkForgeHandoff({
    stage:f.stage, diff, sourceRoot:f.root, destination:f.source
  }), /forge_handoff_source_unverified/);
});

test("handoff refuses symlinks and worker-supplied forged patch digests", async () => {
  const f = await fixture();
  const link = path.join(f.home, "source-link");
  await symlink(f.source, link);
  assert.throws(() => checkForgeHandoff({
    stage:f.stage, diff:f.diff, sourceRoot:f.root, destination:link
  }), /forge_handoff_destination_symlink/);
  assert.throws(() => checkForgeHandoff({
    stage:f.stage, diff:{ ...f.diff, trackedDiffDigest: "sha256:" + "0".repeat(64) },
    sourceRoot:f.root, destination:f.source
  }), /forge_verifier_diff_mismatch/);
});
