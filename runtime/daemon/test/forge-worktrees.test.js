import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stageForgeWorktree, resumeForgeWorktree, inspectForgeWorktree } from "../src/forge-worktrees.js";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}
async function fixture() {
  const home = await mkdtemp(path.join(os.tmpdir(), "forge-worktree-test-"));
  const source = path.join(home, "source");
  const root = path.join(home, "isolated");
  await mkdir(source); await mkdir(root);
  git(source, "init", "-q");
  git(source, "config", "user.name", "Test");
  git(source, "config", "user.email", "test@example.test");
  await writeFile(path.join(source, "README.md"), "original\n", "utf8");
  git(source, "add", "README.md");
  git(source, "commit", "-qm", "initial");
  return { home, source, root, sha: git(source, "rev-parse", "HEAD") };
}
function request(f) {
  return { cwd: f.source, root: f.root, planId: "forge-plan", taskId: "code", sessionId: "session-1" };
}

test("isolated Forge Codex workers are detached at exact SHA and cannot mutate operator checkout", async () => {
  const f = await fixture();
  const receipt = await stageForgeWorktree(request(f));
  assert.equal(receipt.schema, "rea-forge-worktree/v1");
  assert.equal(receipt.sourceSha, f.sha);
  assert.equal(git(receipt.path, "rev-parse", "HEAD"), f.sha);
  assert.equal(receipt.cleanup, "operator-only");
  assert.equal(git(receipt.path, "branch", "--show-current"), "");
  await writeFile(path.join(receipt.path, "README.md"), "changed by worker\n", "utf8");
  assert.equal(await readFile(path.join(f.source, "README.md"), "utf8"), "original\n");
  assert.equal(git(f.source, "status", "--porcelain"), "");
  const session = { id: "session-1", forgePlanId: "forge-plan", forgeTaskId: "code",
    events: [{ kind: "workspace", receipt }] };
  assert.equal(await resumeForgeWorktree(session, f.root), receipt.path);
  await assert.rejects(stageForgeWorktree(request(f)), /forge_worktree_target_exists/);
});

test("worktree staging refuses dirty checkout, in-checkout target root and symlinked checkout", async () => {
  const f = await fixture();
  await writeFile(path.join(f.source, "extra.txt"), "untracked", "utf8");
  await assert.rejects(stageForgeWorktree(request(f)), /forge_worktree_source_not_clean/);
  await mkdir(path.join(f.source, "nested"));
  await assert.rejects(stageForgeWorktree({ ...request(f), root: path.join(f.source, "nested") }),
    /forge_worktree_root_inside_checkout/);
  const link = path.join(f.home, "source-link");
  await symlink(f.source, link);
  await assert.rejects(stageForgeWorktree({ ...request(f), cwd: link }),
    /forge_worktree_source_symlink_refused/);
});

test("resuming Forge Codex sessions requires real provenance from matching session/plan/task", async () => {
  const f = await fixture();
  const receipt = await stageForgeWorktree(request(f));
  const session = { id: "session-1", forgePlanId: "forge-plan", forgeTaskId: "code",
    events: [{ kind: "workspace", receipt }] };
  await assert.rejects(resumeForgeWorktree({ ...session, events: [] }, f.root),
    /forge_resume_workspace_receipt_missing/);
  await assert.rejects(resumeForgeWorktree({ ...session, id: "other-session" }, f.root),
    /forge_resume_workspace_receipt_missing/);
  await assert.rejects(resumeForgeWorktree({ ...session, forgeTaskId: "other-task" }, f.root),
    /forge_resume_workspace_receipt_missing/);
  const forged = { ...receipt, path: f.source };
  await assert.rejects(resumeForgeWorktree({ ...session, events: [{ kind: "workspace", receipt: forged }] }, f.root),
    /forge_resume_workspace_outside_root/);
});


test("diff metadata proves changed checkout without storing patch or source filenames", async () => {
  const f = await fixture();
  const stage = await stageForgeWorktree(request(f));
  const before = await inspectForgeWorktree(stage);
  assert.equal(before.changed, false);
  assert.equal(before.completeSnapshot, true);
  assert.equal(before.headSha, f.sha);
  await writeFile(path.join(stage.path, "README.md"), "SECRET=should-not-appear\n", "utf8");
  const after = await inspectForgeWorktree(stage);
  assert.equal(after.changed, true);
  assert.equal(after.untrackedPresent, false);
  assert.notEqual(after.trackedDiffDigest, before.trackedDiffDigest);
  assert.equal(after.reviewed, false);
  assert.equal(after.testsPassed, null);
  assert.equal(after.merged, false);
  assert.equal(JSON.stringify(after).includes("SECRET"), false);
  assert.equal(JSON.stringify(after).includes("README.md"), false);
  await writeFile(path.join(stage.path, "untracked.private"), "private", "utf8");
  const incomplete = await inspectForgeWorktree(stage);
  assert.equal(incomplete.untrackedPresent, true);
  assert.equal(incomplete.completeSnapshot, false);
  assert.equal(git(f.source, "status", "--porcelain"), "");
});
