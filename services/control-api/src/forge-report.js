import { createHash } from "node:crypto";
import { redactForgePlan } from "./forge-supervisor.js";

const hash = value => "sha256:" + createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Read-only evidence manifest for the canonical tracker review queue.
 * No WorkItem, tracker row or shipping status is mutated by this function.
 */
export function buildForgeReport(plan, sessionSummaries = {}) {
  if (!plan || plan.schema !== "rea-forge-plan/v1") throw new Error("forge_report_plan_invalid");
  const tasks = plan.tasks.map(task => {
    const session = task.sessionId ? sessionSummaries[task.sessionId] ?? null : null;
    const rawDiff = Array.isArray(session?.events)
      ? session.events.findLast(event => event?.kind === "workspace.diff")?.receipt : null;
    const rawReview = Array.isArray(session?.events)
      ? session.events.findLast(event => event?.kind === "workspace.review")?.receipt : null;
    const independentReview = rawReview?.schema === "rea-forge-independent-diff-review/v1"
      && rawReview.sessionId === session?.id && rawReview.taskId === task.id
      && rawReview.planId === plan.id
      ? { passed: rawReview.passed, staticCheckPassed: rawReview.staticCheckPassed,
          reportDigest: rawReview.reportDigest, testsExecuted: false,
          scope: "git-diff-check-and-receipt-reconciliation-only" } : null;
    const diff = rawDiff?.schema === "rea-forge-diff/v1" && rawDiff.sessionId === session?.id
      ? {
          baseSha: rawDiff.baseSha, headSha: rawDiff.headSha,
          trackedDiffDigest: rawDiff.trackedDiffDigest,
          changed: rawDiff.changed,
          completeSnapshot: rawDiff.completeSnapshot,
          untrackedPresent: rawDiff.untrackedPresent,
          reviewed: false, merged: false, testsPassed: null
        }
      : null;
    return {
      taskId: task.id,
      title: task.title, dependsOn: [...task.dependsOn],
      status: task.state, attempt: task.attempt,
      sessionId: task.sessionId,
      sessionStatus: session?.status ?? "not_observed",
      nativeSessionId: session?.nativeSessionId ?? null,
      eventCount: Array.isArray(session?.events) ? session.events.length : 0,
      worktreeChangeEvidence: diff,
      independentStaticReview: independentReview,
      worktreeChangeEvidenceStatus: diff ? (diff.completeSnapshot ? "unreviewed_diff" : "incomplete_untracked_content") : "not_observed",
      attestation: task.verification
        ? { ...task.verification, kind: "human-attestation-not-automated-proof" } : null,
      evidenceGap: task.state === "verified" ? null
        : task.state === "awaiting_verification" ? "independent_review_required"
          : task.state === "failed" || task.state === "blocked" ? "operator_attention_required"
            : "execution_or_dependency_incomplete"
    };
  });
  const verifiedCount = tasks.filter(t => t.status === "verified").length;
  const ready = plan.state === "awaiting_release" && verifiedCount === tasks.length;
  const report = {
    schema: "rea-forge-report/v1",
    plan: { id: plan.id, title: plan.title, sourceUrl: plan.sourceUrl,
      state: plan.state, updatedAt: plan.updatedAt },
    taskSummary: { total: tasks.length, verified: verifiedCount,
      blocked: tasks.filter(t => t.status === "blocked" || t.status === "failed").length },
    tasks,
    proposedTrackerStatus: ready ? "RELEASE_REVIEW_REQUIRED" : "IN_PROGRESS_OR_BLOCKED",
    releaseReceipt: null,
    deployed: false,
    limitations: [
      "No independent test results are verified solely by human attestation.",
      "No automatic WorkItem state transition, master tracker write or deployment is performed.",
      "Shipping requires separate exact-SHA, UAT and Shipping OS release receipts."
    ]
  };
  return { ...report, reportDigest: hash(report) };
}
