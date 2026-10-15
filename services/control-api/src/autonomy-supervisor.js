import crypto from "node:crypto";
import { assertAutonomyContract, digestAutonomyContract, evaluateAutonomyGate } from "./autonomy-policy.js";
import { compileReaBacklog } from "./rea-intake.js";
import { verifyReleaseReceipt } from "./shipping-receipts.js";

export const AUTONOMY_RUN_VERSION = "autonomy-run/v1";

export function createAutonomyRun({ runId = `auto-${crypto.randomUUID()}`, contract: contractInput, findings, at = new Date().toISOString() }) {
  const contract = assertAutonomyContract(contractInput);
  const backlog = compileReaBacklog(findings, { projectId: contract.project.id })
    .slice(0, contract.budgets.maxTasksPerRun)
    .map((item) => ({ ...item, status: "PENDING", attempts: 0, candidateSha: null, gate: null, shippingReceipt: null }));
  const run = {
    version: AUTONOMY_RUN_VERSION,
    runId,
    projectId: contract.project.id,
    contract,
    contractDigest: digestAutonomyContract(contract),
    state: backlog.length ? "READY" : "IDLE",
    createdAt: at,
    updatedAt: at,
    spentCostUsd: 0,
    shippedCount: 0,
    backlog,
    events: []
  };
  return appendEvent(run, { type: "run.created", state: run.state, at, evidence: { backlog: backlog.map((item) => item.id) } });
}

export function nextAutonomyTask(runInput) {
  const run = assertRun(runInput);
  if (run.shippedCount >= run.contract.budgets.maxMergesPerRun) return { run, task: null, reason: "merge_budget_reached" };
  const task = run.backlog.find((item) => item.status === "PENDING" || item.status === "RETRYABLE" || item.status === "AWAITING_APPROVAL");
  return { run, task: task ? structuredClone(task) : null, reason: task ? null : "no_runnable_task" };
}

export function recordAutonomyAttempt(runInput, { workItemId, evidence, costUsd = 0, at = new Date().toISOString() }) {
  let run = assertRun(runInput);
  if (!Number.isFinite(costUsd) || costUsd < 0) throw new Error("autonomy_attempt_cost_invalid");
  const maxCost = run.contract.budgets.maxCostUsd;
  if (maxCost !== undefined && run.spentCostUsd + costUsd > maxCost) {
    return appendEvent(run, { type: "budget.blocked", state: "BUDGET_BLOCKED", at, evidence: { attemptedCostUsd: costUsd, spentCostUsd: run.spentCostUsd, maxCostUsd: maxCost } });
  }
  const index = findTask(run, workItemId);
  const task = run.backlog[index];
  if (["SHIPPED", "FAILED"].includes(task.status)) throw new Error(`autonomy_task_terminal:${task.status}`);
  const maxAttempts = run.contract.budgets.maxFixAttempts + 1;
  if (task.attempts >= maxAttempts) throw new Error("autonomy_task_attempt_budget_exhausted");

  const gate = evaluateAutonomyGate(run.contract, evidence);
  const next = structuredClone(run);
  const updated = next.backlog[index];
  updated.attempts += 1;
  updated.candidateSha = normalizeSha(evidence?.headSha);
  updated.gate = gate;
  next.spentCostUsd = money(next.spentCostUsd + costUsd);

  if (gate.state === "READY_TO_SHIP") updated.status = "AWAITING_SHIPPING";
  else if (gate.state === "HUMAN_APPROVAL_REQUIRED") updated.status = "AWAITING_APPROVAL";
  else updated.status = updated.attempts < maxAttempts ? "RETRYABLE" : "FAILED";

  const state = gate.state === "READY_TO_SHIP" ? "AWAITING_SHIPPING"
    : gate.state === "HUMAN_APPROVAL_REQUIRED" ? "AWAITING_APPROVAL"
      : updated.status === "FAILED" ? "TASK_FAILED" : "READY";
  run = appendEvent(next, {
    type: "task.attempt.recorded",
    state,
    at,
    evidence: { workItemId, attempt: updated.attempts, gateState: gate.state, gateDigest: gate.evidenceDigest, candidateSha: updated.candidateSha, costUsd }
  });
  return run;
}

export function recordShippingReceipt(runInput, { workItemId, receipt, at = new Date().toISOString() }) {
  let run = assertRun(runInput);
  const index = findTask(run, workItemId);
  const task = run.backlog[index];
  if (task.status !== "AWAITING_SHIPPING" || task.gate?.state !== "READY_TO_SHIP") throw new Error("autonomy_task_not_ready_for_shipping");
  const receiptVerification = verifyReleaseReceipt(receipt);
  if (!receiptVerification.valid) throw new Error(`autonomy_shipping_receipt_invalid:${receiptVerification.errors.join(",")}`);
  if (receipt.projectId !== run.projectId) throw new Error("autonomy_shipping_project_mismatch");
  if (normalizeSha(receipt.testedSha) !== task.candidateSha) throw new Error("autonomy_shipping_tested_sha_mismatch");
  if (normalizeSha(receipt.deployedSha) !== task.candidateSha) throw new Error("autonomy_shipping_deployed_sha_mismatch");

  const next = structuredClone(run);
  next.backlog[index].status = "SHIPPED";
  next.backlog[index].shippingReceipt = structuredClone(receipt);
  next.shippedCount += 1;
  const runnableLeft = next.backlog.some((item) => ["PENDING", "RETRYABLE", "AWAITING_APPROVAL"].includes(item.status));
  const mergeBudgetReached = next.shippedCount >= next.contract.budgets.maxMergesPerRun;
  const state = mergeBudgetReached ? "MERGE_BUDGET_REACHED" : runnableLeft ? "READY" : "COMPLETE";
  run = appendEvent(next, { type: "task.shipped", state, at, evidence: { workItemId, candidateSha: task.candidateSha, receiptDigest: receipt.receiptDigest } });
  return run;
}

export function verifyAutonomyRun(run) {
  const errors = [];
  if (!run || run.version !== AUTONOMY_RUN_VERSION) return { valid: false, errors: ["autonomy_run_invalid"] };
  try { if (digestAutonomyContract(run.contract) !== run.contractDigest) errors.push("autonomy_run_contract_digest_invalid"); } catch { errors.push("autonomy_run_contract_invalid"); }
  if (!Array.isArray(run.events)) errors.push("autonomy_run_events_invalid");
  if (Array.isArray(run.events)) {
    let previousDigest = null;
    run.events.forEach((event, index) => {
      if (event.sequence !== index + 1) errors.push(`autonomy_event_sequence_invalid:${index + 1}`);
      if (event.previousDigest !== previousDigest) errors.push(`autonomy_event_chain_invalid:${index + 1}`);
      if (digestEvent(event) !== event.digest) errors.push(`autonomy_event_digest_invalid:${index + 1}`);
      previousDigest = event.digest ?? null;
    });
  }
  return { valid: errors.length === 0, errors };
}

function appendEvent(run, { type, state = run.state, at, evidence }) {
  const next = structuredClone(run);
  next.state = state;
  next.updatedAt = at;
  const event = {
    version: "autonomy-event/v1",
    sequence: next.events.length + 1,
    runId: next.runId,
    type,
    state,
    at,
    evidence: sortObject(evidence ?? {}),
    previousDigest: next.events.at(-1)?.digest ?? null
  };
  event.digest = digestEvent(event);
  next.events.push(event);
  return next;
}
function digestEvent(event) {
  const clone = structuredClone(event);
  delete clone.digest;
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(sortObject(clone))).digest("hex")}`;
}
function assertRun(run) {
  const verification = verifyAutonomyRun(run);
  if (!verification.valid) throw new Error(`autonomy_run_invalid:${verification.errors.join(",")}`);
  return structuredClone(run);
}
function findTask(run, id) {
  const index = run.backlog.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("autonomy_task_not_found");
  return index;
}
function normalizeSha(value) { return typeof value === "string" && /^[a-f0-9]{7,64}$/i.test(value.trim()) ? value.trim().toLowerCase() : null; }
function money(value) { return Number(value.toFixed(6)); }
function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}
