import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { approveForgePlan, claimNextForgeTask, reconcileForgeTask, retryForgeTask, terminateForgePlan, validateForgePlan, verifyForgeTask } from "./forge-plan.js";

function conflict(code) { const e = new Error(code); e.code = code; e.statusCode = 409; throw e; }
export function redactForgePlan(plan) {
  if (!plan) return null;
  return { ...plan, tasks: plan.tasks.map(({ prompt, ...task }) => task) };
}
export async function validateForgeWorkspace(cwd, allowedRoot) {
  if (typeof cwd !== "string" || !path.isAbsolute(cwd)) conflict("forge_workspace_must_be_absolute");
  if (!allowedRoot || !path.isAbsolute(allowedRoot)) conflict("forge_workspace_root_not_configured");
  const root = await fs.realpath(allowedRoot);
  const dir = await fs.realpath(cwd);
  const relative = path.relative(root, dir);
  if (relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) conflict("forge_workspace_outside_approved_root");
  if (!(await fs.stat(dir)).isDirectory()) conflict("forge_workspace_not_directory");
  // Reject even inward-pointing symlinks, since our worktree policy depends
  // on canonical source boundaries and non-symlink workspace ancestry.
  let cursor = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if ((await fs.lstat(cursor)).isSymbolicLink()) conflict("forge_workspace_symlink_refused");
  }
  if (dir !== path.resolve(cwd)) conflict("forge_workspace_symlink_refused");
  return dir;
}
export function createForgeSupervisor({ store, dispatch, broadcast, allowedRoot }) {
  let ticking = false;
  const emitted = plan => broadcast({ type: "forge.plan.updated", plan: redactForgePlan(plan) });
  const create = async spec => {
    await validateForgeWorkspace(spec?.cwd, allowedRoot);
    const plan = validateForgePlan(spec);
    const saved = await store.createForgePlan(plan);
    emitted(saved);
    return redactForgePlan(saved);
  };
  const approve = async id => {
    const current = store.getForgePlan(id);
    if (!current) conflict("forge_plan_not_found");
    const machine = await store.getMachine(current.machineId);
    if (!machine || machine.status !== "online" ||
      !current.tasks.every(t => machine.capabilities?.some(c => c.name === t.agent))) {
      conflict("forge_machine_or_agent_not_available");
    }
    const saved = await store.mutateForgePlan(id, prior => approveForgePlan(prior));
    emitted(saved);
    return redactForgePlan(saved);
  };
  const verify = async (id, taskId, evidence) => {
    const prior = store.getForgePlan(id);
    if (!prior) conflict("forge_plan_not_found");
    const task = prior.tasks.find(t => t.id === taskId);
    if (!task?.sessionId) conflict("forge_task_session_missing");
    const session = await store.getSession(task.sessionId);
    if (!session || session.status !== "completed") conflict("forge_completed_session_required");
    if (session.forgePlanId && (session.forgePlanId !== id || session.forgeTaskId !== taskId)) {
      conflict("forge_session_task_binding_mismatch");
    }
    if (task.agent === "codex") {
      const events = Array.isArray(session.events) ? session.events : [];
      const stage = events.findLast(e => e?.kind === "workspace")?.receipt;
      const diff = events.findLast(e => e?.kind === "workspace.diff")?.receipt;
      const review = events.findLast(e => e?.kind === "workspace.review")?.receipt;
      if (!stage || !diff || stage.schema !== "rea-forge-worktree/v1" ||
          diff.schema !== "rea-forge-diff/v1" ||
          stage.sessionId !== session.id || diff.sessionId !== session.id ||
          stage.planId !== id || stage.taskId !== taskId ||
          diff.planId !== id || diff.taskId !== taskId ||
          stage.sourceSha !== diff.baseSha) conflict("forge_verified_worktree_receipts_required");
      if (diff.untrackedPresent || !diff.completeSnapshot) conflict("forge_untracked_content_requires_review");
      if (diff.trackedDiffDigest !== evidence?.digest) conflict("forge_diff_digest_mismatch");
      if (task.expectChanges && !diff.changed) conflict("forge_expected_change_not_observed");
      // A separate local verifier process independently reconstructs the
      // exact Git diff. It does NOT certify tests, security or shipment.
      if (!review || review.schema !== "rea-forge-independent-diff-review/v1" ||
          review.sessionId !== session.id || review.planId !== id || review.taskId !== taskId ||
          review.baseSha !== stage.sourceSha || review.headSha !== diff.headSha ||
          review.trackedDiffDigest !== diff.trackedDiffDigest ||
          review.passed !== true || review.staticCheckPassed !== true ||
          review.testsExecuted !== false || review.sourceMerged !== false ||
          review.deploymentVerified !== false ||
          !/^sha256:[a-f0-9]{64}$/.test(review.reportDigest ?? "")) {
        conflict("forge_independent_static_review_required");
      }
      const { reportDigest, ...reportBody } = review;
      const reconstructed = "sha256:" + createHash("sha256")
        .update(JSON.stringify(reportBody)).digest("hex");
      if (reconstructed !== reportDigest) conflict("forge_review_receipt_digest_invalid");
    }
    const saved = await store.mutateForgePlan(id, current => {
      if (!current) conflict("forge_plan_not_found");
      const currentTask = current.tasks.find(t => t.id === taskId);
      if (currentTask?.sessionId !== task.sessionId) conflict("forge_session_changed_during_attestation");
      return verifyForgeTask(current, taskId, evidence);
    });
    emitted(saved);
    return redactForgePlan(saved);
  };
  const retry = async (id, taskId) => {
    const saved = await store.mutateForgePlan(id, prior => {
      if (!prior) conflict("forge_plan_not_found");
      return retryForgeTask(prior, taskId);
    });
    emitted(saved);
    return redactForgePlan(saved);
  };
  const stop = async id => {
    const saved = await store.mutateForgePlan(id, prior => {
      if (!prior) conflict("forge_plan_not_found");
      return terminateForgePlan(prior);
    });
    emitted(saved);
    return redactForgePlan(saved);
  };
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      for (const entry of store.listForgePlans().filter(p => p.state === "running")) {
        for (const task of entry.tasks.filter(t => t.state === "dispatching" || t.state === "running")) {
          const session = task.sessionId ? await store.getSession(task.sessionId) : null;
          const machine = await store.getMachine(entry.machineId);
          const observed = machine?.status === "online" ? session : null;
          const updated = await store.mutateForgePlan(entry.id, current =>
            reconcileForgeTask(current, task.id, observed));
          if (updated?.updatedAt !== entry.updatedAt) emitted(updated);
        }
        while (true) {
          const plan = store.getForgePlan(entry.id);
          if (!plan || plan.state !== "running") break;
          const machine = await store.getMachine(plan.machineId);
          if (!machine || machine.status !== "online") break;
          let claimedTask;
          const claimed = await store.mutateForgePlan(plan.id, current => {
            const claimed = claimNextForgeTask(current);
            claimedTask = claimed.task;
            return claimedTask ? claimed.plan : null;
          });
          if (!claimedTask) break;
          emitted(claimed);
          try {
            await dispatch(claimed, claimedTask);
            const updated = await store.mutateForgePlan(plan.id, current =>
              reconcileForgeTask(current, claimedTask.id, { id: claimedTask.sessionId, status: "queued" }));
            emitted(updated);
          } catch {
            // No auto-retry: command may have partially executed. Operator
            // must inspect the recorded session and explicitly authorize retry.
            const updated = await store.mutateForgePlan(plan.id, current =>
              reconcileForgeTask(current, claimedTask.id, null));
            emitted(updated);
          }
        }
      }
    } finally { ticking = false; }
  };
  const list = () => store.listForgePlans().map(redactForgePlan);
  const get = id => redactForgePlan(store.getForgePlan(id));
  return { create, approve, verify, retry, stop, tick, list, get };
}
