import { createHash } from "node:crypto";

export const PROMPT_REVISION_VERSION = "prompt-revision/v1";
export const PROMPT_EVAL_VERSION = "prompt-eval-receipt/v1";
export const PROMPT_APPROVAL_VERSION = "prompt-approval/v1";

function nonempty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}

export function createPromptRevision({ promptId, revision, template, variables = [], authoredBy }) {
  if (![promptId, revision, template, authoredBy].every(nonempty)) throw new Error("prompt_revision_fields_required");
  if (!Array.isArray(variables) || !variables.every(nonempty) || new Set(variables).size !== variables.length) {
    throw new Error("prompt_revision_variables_invalid");
  }
  const body = { version: PROMPT_REVISION_VERSION, promptId, revision, template, variables: [...variables].sort(), authoredBy };
  return Object.freeze({ ...body, digest: digest(body) });
}

export function validatePromptRevision(candidate) {
  if (!candidate || candidate.version !== PROMPT_REVISION_VERSION) return false;
  try {
    const expected = createPromptRevision(candidate);
    return expected.digest === candidate.digest && Object.keys(candidate).sort().join(",") === Object.keys(expected).sort().join(",");
  } catch {
    return false;
  }
}

// Side-effect-free authorization gate: it makes no database/provider/deployment changes.
export function assessPromptPromotion({ candidate, currentDigest = null, evalReceipt, approval }) {
  const failures = [];
  if (!validatePromptRevision(candidate)) failures.push("candidate_invalid");
  if (currentDigest !== null && !/^sha256:[0-9a-f]{64}$/.test(currentDigest)) failures.push("current_digest_invalid");
  if (currentDigest === candidate?.digest) failures.push("already_active");
  if (!evalReceipt || evalReceipt.version !== PROMPT_EVAL_VERSION || evalReceipt.promptDigest !== candidate?.digest ||
      !nonempty(evalReceipt.suiteDigest) || !/^sha256:[0-9a-f]{64}$/.test(evalReceipt.suiteDigest ?? "") ||
      !nonempty(evalReceipt.runId) || !nonempty(evalReceipt.testedCommit) ||
      evalReceipt.status !== "PASS" || evalReceipt.regressions !== 0 ||
      evalReceipt.deterministic !== true || evalReceipt.independent !== true) {
    failures.push("independent_regression_evidence_required");
  }
  if (!approval || approval.version !== PROMPT_APPROVAL_VERSION ||
      approval.promptDigest !== candidate?.digest || approval.suiteDigest !== evalReceipt?.suiteDigest ||
      approval.expectedCurrentDigest !== currentDigest || approval.decision !== "APPROVED" ||
      !nonempty(approval.approvedBy) || approval.approvedBy === candidate?.authoredBy ||
      !nonempty(approval.approvalId)) failures.push("independent_exact_revision_approval_required");
  return Object.freeze({
    status: failures.length === 0 ? "ELIGIBLE_FOR_STAGED_ACTIVATION" : "BLOCKED",
    failures,
    promptDigest: candidate?.digest ?? null,
    // Eligibility deliberately is not evidence of activation or production readiness.
    activationPerformed: false
  });
}
