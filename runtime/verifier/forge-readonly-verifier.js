// Independent, read-only REA Forge artifact verifier.
// This runs as a separate process from the Codex worker/daemon and never
// executes code found inside the worker worktree. It is NOT a test/UAT receipt.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function reject(code) { const error = new Error(code); error.code = code; throw error; }
function git(cwd, args, maxBuffer = 9 * 1024 * 1024) {
  const result = spawnSync("git", ["-c", "core.quotePath=false", ...args], {
    cwd, encoding: null, timeout: 15_000, maxBuffer,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1" }
  });
  if (result.error || result.status !== 0) reject("forge_verifier_git_failed");
  return result.stdout;
}
const asString = bytes => bytes.toString("utf8").trim();
const hash = bytes => "sha256:" + createHash("sha256").update(bytes).digest("hex");
const sha = value => typeof value === "string" && /^[a-f0-9]{40,64}$/.test(value);
const digest = value => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);

/**
 * Does NOT rely on the worker event's boolean flags. Recompute facts from the
 * actual detached worktree and compare them with the claimed worktree receipt.
 * Any mismatch fails closed. An additional pinned root blocks arbitrary files.
 */
export function independentlyVerifyForgeDiff(stage, claimed, { root }) {
  if (!stage || stage.schema !== "rea-forge-worktree/v1" ||
      !claimed || claimed.schema !== "rea-forge-diff/v1" ||
      !sha(stage.sourceSha) || !digest(claimed.trackedDiffDigest)) reject("forge_verifier_receipts_invalid");
  if (!stage.sessionId || !stage.planId || !stage.taskId ||
      claimed.sessionId !== stage.sessionId ||
      claimed.planId !== stage.planId || claimed.taskId !== stage.taskId ||
      claimed.baseSha !== stage.sourceSha || !sha(claimed.headSha)) reject("forge_verifier_identity_mismatch");
  if (typeof root !== "string" || !path.isAbsolute(root) ||
      typeof stage.path !== "string" || !path.isAbsolute(stage.path)) reject("forge_verifier_root_invalid");
  const realRoot = fs.realpathSync(root), realPath = fs.realpathSync(stage.path);
  if (realRoot !== path.resolve(root) || realPath !== path.resolve(stage.path) ||
      path.dirname(realPath) !== realRoot) reject("forge_verifier_path_outside_root");
  if (!fs.statSync(realPath).isDirectory()) reject("forge_verifier_not_directory");
  if (asString(git(realPath, ["rev-parse", "--show-toplevel"])) !== realPath) reject("forge_verifier_not_worktree");
  const actualHead = asString(git(realPath, ["rev-parse", "--verify", "HEAD^{commit}"]));
  if (actualHead !== claimed.headSha) reject("forge_verifier_head_changed");
  // A worker may have committed changes: compute from the initial pinned SHA,
  // not merely HEAD or the unstaged index.
  const patch = git(realPath, ["diff", "--binary", "--no-ext-diff", "--no-textconv", stage.sourceSha, "--"]);
  const actualDigest = hash(patch);
  if (claimed.trackedDiffDigest !== actualDigest) reject("forge_verifier_diff_mismatch");
  const entries = git(realPath, ["status", "--porcelain", "-z", "--untracked-files=all"])
    .toString("utf8").split("\0").filter(Boolean);
  const untracked = entries.some(e => e.startsWith("??"));
  const changed = entries.length > 0 || actualHead !== stage.sourceSha;
  if (claimed.untrackedPresent !== untracked ||
      claimed.completeSnapshot !== !untracked ||
      claimed.changed !== changed ||
      claimed.observedStatusEntries !== entries.length) reject("forge_verifier_status_mismatch");
  const whitespaceCheck = spawnSync("git", ["diff", "--check", stage.sourceSha, "--"], {
    cwd: realPath, encoding: "utf8", timeout: 10_000, maxBuffer: 512 * 1024
  });
  const staticCheckPassed = whitespaceCheck.status === 0 && !whitespaceCheck.error;
  const passed = staticCheckPassed && !untracked;
  const report = {
    schema: "rea-forge-independent-diff-review/v1",
    sessionId: stage.sessionId, planId: stage.planId, taskId: stage.taskId,
    baseSha: stage.sourceSha, headSha: actualHead,
    trackedDiffDigest: actualDigest,
    statusEntries: entries.length,
    changed,
    untrackedPresent: untracked,
    staticCheckPassed,
    passed,
    reviewScope: "git-diff-check-and-receipt-reconciliation-only",
    testsExecuted: false, sourceMerged: false, deploymentVerified: false,
    reason: untracked ? "untracked_content_not_in_diff"
      : !staticCheckPassed ? "git_diff_check_failed" : null
  };
  report.reportDigest = hash(Buffer.from(JSON.stringify(report)));
  return report;
}

const direct = process.argv[1] && import.meta.url === new URL("file://" + path.resolve(process.argv[1])).href;
if (direct) {
  let input = "";
  try {
    for await (const bytes of process.stdin) {
      input += String(bytes);
      if (Buffer.byteLength(input) > 32_000) reject("forge_verifier_input_too_large");
    }
    const payload = JSON.parse(input);
    const result = independentlyVerifyForgeDiff(payload.stage, payload.diff, { root: payload.root });
    process.stdout.write(JSON.stringify(result) + "\n");
    if (!result.passed) process.exitCode = 2;
  } catch (error) {
    // Do not print arbitrary paths, prompts, tool outputs or exception stacks.
    process.stderr.write("forge-verifier: " + (String(error.code || "").startsWith("forge_verifier_")
      ? error.code : "verification_unavailable") + "\n");
    process.exitCode = 2;
  }
}
