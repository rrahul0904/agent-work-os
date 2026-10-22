// REA Forge worker isolation. All Git effects are local to an explicitly
// configured daemon workspace root; never clone, fetch, push, merge or remove
// a worktree automatically.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
const exec = promisify(execFile);
const ID = /^[a-zA-Z0-9_.-]{1,160}$/;
function fail(code) { const e = new Error(code); e.code = code; throw e; }
async function git(args, cwd) {
  const { stdout } = await exec("git", args, {
    cwd, timeout: 15_000, maxBuffer: 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
  });
  return stdout.trim();
}
function checkId(value, label) {
  if (typeof value !== "string" || !ID.test(value) || value === "." || value === "..") {
    fail("forge_worktree_" + label + "_invalid");
  }
}
/**
 * Create an isolated detached worktree at the *exact locally checked-out SHA*.
 * Caller must persist the returned sourceSha/path receipt BEFORE launching a
 * worker. If creation is interrupted, the directory remains for investigation;
 * we do not silently delete, reuse or overwrite it.
 */
export async function resumeForgeWorktree(session, root) {
  if (!session?.forgePlanId || !session?.forgeTaskId) fail("forge_resume_not_a_forge_session");
  if (typeof root !== "string" || !path.isAbsolute(root)) fail("forge_worktree_root_invalid");
  const rootReal = await fs.realpath(root);
  if (rootReal !== path.resolve(root)) fail("forge_worktree_root_symlink_refused");
  const record = Array.isArray(session.events)
    ? session.events.findLast(event => event?.kind === "workspace" &&
      event.receipt?.schema === "rea-forge-worktree/v1" &&
      event.receipt?.sessionId === session.id &&
      event.receipt?.planId === session.forgePlanId &&
      event.receipt?.taskId === session.forgeTaskId)
    : null;
  if (!record) fail("forge_resume_workspace_receipt_missing");
  const candidate = record.receipt.path;
  if (typeof candidate !== "string" || path.dirname(candidate) !== rootReal) fail("forge_resume_workspace_outside_root");
  const real = await fs.realpath(candidate);
  if (real !== candidate) fail("forge_resume_workspace_symlink_refused");
  if ((await git(["rev-parse", "--show-toplevel"], real)) !== real) fail("forge_resume_not_worktree_root");
  return real;
}

export async function stageForgeWorktree({ cwd, root, planId, taskId, sessionId }) {
  for (const [label, id] of [["plan", planId], ["task", taskId], ["session", sessionId]]) checkId(id, label);
  if (typeof root !== "string" || !path.isAbsolute(root) ||
      typeof cwd !== "string" || !path.isAbsolute(cwd)) fail("forge_worktree_root_invalid");
  // Require a PREEXISTING root owned by the operator, not an arbitrary path
  // passed in an agent prompt. This also rejects symlinks in root ancestry.
  const absRoot = path.resolve(root), absCwd = path.resolve(cwd);
  const rootReal = await fs.realpath(absRoot);
  if (rootReal !== absRoot) fail("forge_worktree_root_symlink_refused");
  const cwdReal = await fs.realpath(absCwd);
  if (cwdReal !== absCwd) fail("forge_worktree_source_symlink_refused");
  const info = await fs.stat(rootReal);
  if (!info.isDirectory()) fail("forge_worktree_root_not_directory");
  // Worktree storage must be outside the input checkout to keep the source
  // clean and avoid recursive Git discovery.
  if (rootReal === cwdReal || rootReal.startsWith(cwdReal + path.sep)) {
    fail("forge_worktree_root_inside_checkout");
  }
  const gitRoot = await git(["rev-parse", "--show-toplevel"], cwdReal);
  if (gitRoot !== cwdReal) fail("forge_worktree_source_must_be_repo_root");
  // Non-clean HEAD makes source assumptions unrepeatable, including staged
  // files. Untracked files are omitted from the clone but must be disclosed.
  const dirty = await git(["status", "--porcelain", "--untracked-files=all"], cwdReal);
  if (dirty) fail("forge_worktree_source_not_clean");
  const sourceSha = await git(["rev-parse", "--verify", "HEAD^{commit}"], cwdReal);
  if (!/^[a-f0-9]{40,64}$/.test(sourceSha)) fail("forge_worktree_sha_invalid");
  const digest = createHash("sha256").update([planId, taskId, sessionId].join("\0")).digest("hex").slice(0, 24);
  const target = path.join(rootReal, "forge-" + digest);
  try {
    await fs.lstat(target);
    fail("forge_worktree_target_exists");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  // No branch creation, no network access. Using a fixed commit rather than
  // HEAD avoids a concurrent checkout moving between validation and creation.
  await git(["worktree", "add", "--detach", target, sourceSha], cwdReal);
  const observed = await git(["rev-parse", "--verify", "HEAD"], target);
  if (observed !== sourceSha) fail("forge_worktree_sha_mismatch");
  return {
    schema: "rea-forge-worktree/v1", sourceSha,
    path: target, sessionId, planId, taskId,
    createdAt: new Date().toISOString(), isolation: "git-detached-worktree",
    approval: "already-approved-forge-task", cleanup: "operator-only"
  };
}
