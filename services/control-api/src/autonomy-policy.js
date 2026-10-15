import crypto from "node:crypto";

export const AUTONOMY_CONTRACT_VERSION = "autonomy-contract/v1";
export const REVIEW_VERDICTS = Object.freeze(["READY", "NEEDS_CHANGES"]);
export const TRUST_TIERS = Object.freeze(["maintainer", "vetted", "unvetted"]);

const VERDICTS = new Set(REVIEW_VERDICTS);
const TIERS = new Set(TRUST_TIERS);

export function validateAutonomyContract(input) {
  const errors = [];
  if (!plain(input)) return { valid: false, errors: ["autonomy_contract_invalid"] };
  const allowed = new Set(["version", "project", "mandate", "execution", "review", "merge", "reserved", "budgets", "learning"]);
  for (const key of Object.keys(input)) if (!allowed.has(key)) errors.push(`autonomy_contract_unknown_field:${key}`);
  if (input.version !== AUTONOMY_CONTRACT_VERSION) errors.push("autonomy_contract_version_invalid");

  requireObject(input.project, "project", errors, (value) => {
    requireString(value.id, "project_id", errors);
    requireString(value.repository, "project_repository", errors);
    requireString(value.baseBranch, "project_base_branch", errors);
  });
  requireObject(input.mandate, "mandate", errors, (value) => {
    requireString(value.goal, "mandate_goal", errors);
    requireStringArray(value.allowedWorkKinds, "mandate_allowed_work_kinds", errors, true);
  });
  requireObject(input.execution, "execution", errors, (value) => {
    requireStringArray(value.implementerProviders, "execution_implementer_providers", errors, true);
    if (value.isolatedWorktree !== true) errors.push("autonomy_contract_isolated_worktree_required");
  });
  requireObject(input.review, "review", errors, (value) => {
    if (value.independentFromAuthor !== true) errors.push("autonomy_contract_independent_review_required");
    if (!Array.isArray(value.lenses) || value.lenses.length === 0) errors.push("autonomy_contract_review_lenses_required");
    else {
      const ids = new Set();
      for (const lens of value.lenses) {
        if (!plain(lens) || !nonEmpty(lens.id)) { errors.push("autonomy_contract_review_lens_invalid"); continue; }
        if (ids.has(lens.id)) errors.push(`autonomy_contract_review_lens_duplicate:${lens.id}`);
        ids.add(lens.id);
        if (lens.required !== true) errors.push(`autonomy_contract_review_lens_must_be_required:${lens.id}`);
      }
    }
  });
  requireObject(input.merge, "merge", errors, (value) => {
    requireStringArray(value.requiredChecks, "merge_required_checks", errors, true);
    if (value.exactHeadSha !== true) errors.push("autonomy_contract_exact_head_sha_required");
    if (value.latestReviewRecordOnly !== true) errors.push("autonomy_contract_latest_review_required");
  });
  requireObject(input.reserved, "reserved", errors, (value) => {
    requireStringArray(value.paths, "reserved_paths", errors, false);
    requireStringArray(value.actions, "reserved_actions", errors, false);
  });
  requireObject(input.budgets, "budgets", errors, (value) => {
    boundedInt(value.maxTasksPerRun, 1, 100, "budget_tasks", errors);
    boundedInt(value.maxFixAttempts, 0, 10, "budget_fix_attempts", errors);
    boundedInt(value.maxMergesPerRun, 0, 20, "budget_merges", errors);
    if (value.maxCostUsd !== undefined && (!Number.isFinite(value.maxCostUsd) || value.maxCostUsd < 0)) errors.push("autonomy_contract_budget_cost_invalid");
  });
  requireObject(input.learning, "learning", errors, (value) => {
    if (value.journalRequired !== true) errors.push("autonomy_contract_journal_required");
    if (value.promoteFailuresToGuards !== true) errors.push("autonomy_contract_failure_learning_required");
  });
  return { valid: errors.length === 0, errors };
}

export function assertAutonomyContract(input) {
  const result = validateAutonomyContract(input);
  if (!result.valid) throw new Error(`autonomy_contract_invalid:${result.errors.join(",")}`);
  return structuredClone(input);
}

export function digestAutonomyContract(input) {
  const contract = assertAutonomyContract(input);
  return digest(contract);
}

export function evaluateAutonomyGate(contractInput, evidenceInput) {
  const contract = assertAutonomyContract(contractInput);
  if (!plain(evidenceInput)) return blocked(["evidence_invalid"], contract, evidenceInput);

  const headSha = normalizeSha(evidenceInput.headSha);
  const baseSha = normalizeSha(evidenceInput.baseSha);
  const reasons = [];
  const approvalsNeeded = [];

  if (!headSha) reasons.push("head_sha_invalid");
  if (!baseSha) reasons.push("base_sha_invalid");
  if (!nonEmpty(evidenceInput.authorAgentId)) reasons.push("author_agent_required");
  if (!TIERS.has(evidenceInput.sourceTrust)) reasons.push("source_trust_invalid");

  const changedFiles = stringList(evidenceInput.changedFiles);
  const actions = stringList(evidenceInput.actions);
  const approvals = Array.isArray(evidenceInput.humanApprovals) ? evidenceInput.humanApprovals : [];

  for (const file of changedFiles) {
    const pattern = contract.reserved.paths.find((candidate) => pathMatches(candidate, file));
    if (pattern && !hasApproval(approvals, { kind: "path", subject: pattern, headSha })) approvalsNeeded.push(`path:${pattern}`);
  }
  for (const action of actions) {
    if (contract.reserved.actions.includes(action) && !hasApproval(approvals, { kind: "action", subject: action, headSha })) approvalsNeeded.push(`action:${action}`);
  }

  const checks = Array.isArray(evidenceInput.ciChecks) ? evidenceInput.ciChecks : [];
  for (const required of contract.merge.requiredChecks) {
    const matching = checks.filter((item) => plain(item) && item.name === required && normalizeSha(item.sha) === headSha);
    if (matching.length === 0) reasons.push(`ci_missing:${required}`);
    else if (matching.some((item) => item.status !== "success")) reasons.push(`ci_not_green:${required}`);
  }

  const reviewResult = evaluateReviews(contract, evidenceInput.reviews, { headSha, baseSha, authorAgentId: evidenceInput.authorAgentId });
  reasons.push(...reviewResult.reasons);

  const uniqueReasons = [...new Set(reasons)];
  const uniqueApprovals = [...new Set(approvalsNeeded)];
  const snapshot = {
    headSha,
    baseSha,
    sourceTrust: evidenceInput.sourceTrust ?? null,
    changedFiles,
    actions,
    checks: contract.merge.requiredChecks,
    requiredLenses: contract.review.lenses.map((lens) => lens.id),
    reasons: uniqueReasons,
    approvalsNeeded: uniqueApprovals
  };
  const evidenceDigest = digest(snapshot);

  if (uniqueReasons.length > 0) return { eligible: false, state: "BLOCKED", reasons: uniqueReasons, approvalsNeeded: uniqueApprovals, evidenceDigest };
  if (uniqueApprovals.length > 0) return { eligible: false, state: "HUMAN_APPROVAL_REQUIRED", reasons: [], approvalsNeeded: uniqueApprovals, evidenceDigest };
  return { eligible: true, state: "READY_TO_SHIP", reasons: [], approvalsNeeded: [], evidenceDigest };
}

function evaluateReviews(contract, reviewsInput, { headSha, baseSha, authorAgentId }) {
  const reviews = Array.isArray(reviewsInput) ? reviewsInput.filter(plain) : [];
  const reasons = [];
  for (const lens of contract.review.lenses) {
    const candidates = reviews.filter((review) => review.lens === lens.id);
    if (candidates.length === 0) { reasons.push(`review_missing:${lens.id}`); continue; }
    const latestByReviewer = new Map();
    for (const review of candidates) {
      const sequence = Number.isInteger(review.sequence) ? review.sequence : -1;
      const previous = latestByReviewer.get(review.reviewerId);
      if (!previous || sequence > previous.sequence) latestByReviewer.set(review.reviewerId, { ...review, sequence });
    }
    const latest = [...latestByReviewer.values()];
    const exact = latest.filter((review) => normalizeSha(review.headSha) === headSha && normalizeSha(review.baseSha) === baseSha);
    if (exact.length !== latest.length) reasons.push(`review_not_bound_to_head:${lens.id}`);
    if (exact.length === 0) continue;
    if (exact.some((review) => review.edited === true)) reasons.push(`review_edited:${lens.id}`);
    if (exact.some((review) => !VERDICTS.has(review.verdict))) reasons.push(`review_verdict_invalid:${lens.id}`);
    if (exact.some((review) => review.verdict === "NEEDS_CHANGES")) reasons.push(`review_needs_changes:${lens.id}`);
    const independentReady = exact.some((review) => review.verdict === "READY" && nonEmpty(review.reviewerId) && review.reviewerId !== authorAgentId);
    if (!independentReady) reasons.push(`review_independent_ready_missing:${lens.id}`);
  }
  return { reasons: [...new Set(reasons)] };
}

function hasApproval(approvals, { kind, subject, headSha }) {
  return approvals.some((approval) => plain(approval)
    && approval.kind === kind
    && approval.subject === subject
    && normalizeSha(approval.headSha) === headSha
    && nonEmpty(approval.approvedBy));
}

function pathMatches(pattern, file) {
  if (!nonEmpty(pattern) || !nonEmpty(file)) return false;
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return file === prefix || file.startsWith(`${prefix}/`);
  }
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    const rest = file.startsWith(`${prefix}/`) ? file.slice(prefix.length + 1) : null;
    return rest !== null && !rest.includes("/");
  }
  return pattern === file;
}

function blocked(reasons, contract, evidence) {
  return { eligible: false, state: "BLOCKED", reasons, approvalsNeeded: [], evidenceDigest: digest({ contract: digestAutonomyContract(contract), evidence: evidence ?? null }) };
}
function normalizeSha(value) { return typeof value === "string" && /^[a-f0-9]{7,64}$/i.test(value.trim()) ? value.trim().toLowerCase() : null; }
function digest(value) { return `sha256:${crypto.createHash("sha256").update(JSON.stringify(sortObject(value))).digest("hex")}`; }
function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!plain(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}
function requireObject(value, label, errors, fn) { if (!plain(value)) errors.push(`autonomy_contract_${label}_invalid`); else fn(value); }
function requireString(value, label, errors) { if (!nonEmpty(value)) errors.push(`autonomy_contract_${label}_required`); }
function requireStringArray(value, label, errors, nonEmptyRequired) {
  if (!Array.isArray(value) || (nonEmptyRequired && value.length === 0) || value.some((item) => !nonEmpty(item))) errors.push(`autonomy_contract_${label}_invalid`);
}
function boundedInt(value, min, max, label, errors) { if (!Number.isInteger(value) || value < min || value > max) errors.push(`autonomy_contract_${label}_invalid`); }
function stringList(value) { return Array.isArray(value) ? value.filter(nonEmpty) : []; }
function nonEmpty(value) { return typeof value === "string" && value.trim().length > 0; }
function plain(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
