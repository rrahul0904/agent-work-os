// REA Forge cross-worktree handoff preflight. Read only: never applies,
// cherry-picks, commits, merges, removes or pushes worker changes.
// A successful result allows an operator to REVIEW the patch; it is not a
// release receipt or permission to mutate the destination.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { independentlyVerifyForgeDiff } from "./forge-readonly-verifier.js";

const hash = bytes => "sha256:" + createHash("sha256").update(bytes).digest("hex");
function refuse(code) { let e = new Error(code); e.code = code; throw e; }
function command(cwd, args, input = undefined, maxBuffer = 9 * 1024 * 1024) {
  const result = spawnSync("git", args, {
    cwd, input, timeout: 15_000, encoding: null, maxBuffer,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1" }
  });
  return result;
}
function git(cwd, args, input) {
  const result = command(cwd, args, input);
  if (result.error || result.status !== 0) refuse("forge_handoff_git_unavailable");
  return result.stdout;
}
function str(b) { return b.toString("utf8").trim(); }

/**
 * Does not transfer any files. The baseline must be the exact current
 * destination HEAD, and the destination must be clean and independent.
 * Source data must already have passed the standalone Git verifier.
 */
export function checkForgeHandoff({ stage, diff, sourceRoot, destination }) {
  if (!stage || !diff || typeof destination !== "string" || !path.isAbsolute(destination)) {
    refuse("forge_handoff_input_invalid");
  }
  const verification = independentlyVerifyForgeDiff(stage, diff, { root: sourceRoot });
  if (!verification.passed) refuse("forge_handoff_source_unverified");
  if (!verification.changed) refuse("forge_handoff_no_changes");
  const realDestination = fs.realpathSync(destination);
  if (realDestination !== path.resolve(destination) ||
      !fs.statSync(realDestination).isDirectory()) refuse("forge_handoff_destination_symlink");
  const actualRoot = str(git(realDestination, ["rev-parse", "--show-toplevel"]));
  if (actualRoot !== realDestination) refuse("forge_handoff_destination_not_repository_root");
  if (realDestination === stage.path) refuse("forge_handoff_same_checkout");
  if (str(git(realDestination, ["rev-parse", "HEAD"])) !== stage.sourceSha) {
    refuse("forge_handoff_base_sha_conflict");
  }
  const destinationStatus = git(realDestination, ["status", "--porcelain", "--untracked-files=all"]);
  if (destinationStatus.length > 0) refuse("forge_handoff_destination_dirty");
  const patch = git(stage.path, ["diff", "--binary", "--no-ext-diff", "--no-textconv",
    stage.sourceSha, "--"]);
  if (hash(patch) !== diff.trackedDiffDigest) refuse("forge_handoff_patch_digest_changed");
  const check = command(realDestination, ["apply", "--check", "--binary", "-"], patch);
  if (check.error || check.status !== 0) refuse("forge_handoff_git_apply_check_failed");
  // This is a preflight only. The receiving task needs a separately reviewed,
  // authorized artifact handoff and exact-SHA verification after promotion.
  return {
    schema: "rea-forge-handoff-preflight/v1",
    sessionId: stage.sessionId, planId: stage.planId, taskId: stage.taskId,
    destinationHeadSha: stage.sourceSha,
    sourceHeadSha: diff.headSha,
    patchDigest: hash(patch),
    staticReviewDigest: verification.reportDigest,
    checked: true,
    destinationClean: true,
    applyPreflightPassed: true,
    promotionPerformed: false,
    testsExecuted: false,
    authorizedToMerge: false,
    status: "READY_FOR_HUMAN_PATCH_REVIEW"
  };
}
