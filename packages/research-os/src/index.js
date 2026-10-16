import { createHash } from "node:crypto";

export const RESEARCH_RUN_STATES = Object.freeze([
  "planned", "collecting", "synthesizing", "verifying", "complete", "blocked", "failed", "interrupted"
]);

export class ResearchValidationError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "ResearchValidationError";
    this.code = code;
  }
}

export function canonicalDigest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(sortValue(value))).digest("hex")}`;
}

export function createResearchBrief(input) {
  assertObject(input, "research_brief_invalid");
  const question = text(input.question, "research_question_invalid", 4000);
  const objective = text(input.objective ?? question, "research_objective_invalid", 4000);
  const constraints = normalizeStringArray(input.constraints ?? [], "research_constraints_invalid", 50, 1000);
  const requiredSources = normalizeStringArray(input.requiredSources ?? [], "research_required_sources_invalid", 50, 1000);
  const successMetrics = normalizeMetrics(input.successMetrics ?? DEFAULT_SUCCESS_METRICS);
  const brief = {
    schema: "research-brief/v1",
    question,
    objective,
    constraints,
    requiredSources,
    successMetrics,
    budget: normalizeBudget(input.budget ?? {})
  };
  return Object.freeze({ ...brief, digest: canonicalDigest(brief) });
}

export function planResearch(briefInput) {
  const brief = assertResearchBrief(briefInput);
  const seeds = unique([
    brief.question,
    ...brief.requiredSources.map((source) => `${brief.question} source:${source}`),
    `${brief.question} primary sources`,
    `${brief.question} contradictory evidence`
  ]).slice(0, brief.budget.maxQueries);

  const plan = {
    schema: "research-plan/v1",
    briefDigest: brief.digest,
    queries: seeds.map((query, index) => ({ id: `q${index + 1}`, query })),
    requiredEvidenceClasses: ["primary", "independent"],
    contradictionCheckRequired: true,
    citationVerificationRequired: true
  };
  return Object.freeze({ ...plan, digest: canonicalDigest(plan) });
}

export function createEvidenceItem(input) {
  assertObject(input, "evidence_item_invalid");
  const classification = oneOf(input.classification, ["primary", "independent", "community", "derived"], "evidence_classification_invalid");
  const support = oneOf(input.support ?? "supports", ["supports", "contradicts", "context"], "evidence_support_invalid");
  const observedAt = input.observedAt ?? null;
  if (observedAt !== null && !Number.isFinite(Date.parse(observedAt))) throw new ResearchValidationError("evidence_observed_at_invalid");
  const item = {
    schema: "evidence-item/v1",
    id: text(input.id, "evidence_id_invalid", 200),
    queryId: input.queryId === null || input.queryId === undefined ? null : text(input.queryId, "evidence_query_id_invalid", 100),
    sourceUrl: text(input.sourceUrl, "evidence_source_url_invalid", 4000),
    sourceTitle: text(input.sourceTitle, "evidence_source_title_invalid", 1000),
    excerpt: text(input.excerpt, "evidence_excerpt_invalid", 12000),
    classification,
    support,
    observedAt,
    contentDigest: canonicalDigest({ sourceUrl: input.sourceUrl, excerpt: input.excerpt })
  };
  return Object.freeze({ ...item, digest: canonicalDigest(item) });
}

export function buildEvidenceLedger(items) {
  if (!Array.isArray(items)) throw new ResearchValidationError("evidence_ledger_invalid");
  const normalized = items.map(createEvidenceItem);
  const ids = new Set();
  for (const item of normalized) {
    if (ids.has(item.id)) throw new ResearchValidationError("evidence_id_duplicate");
    ids.add(item.id);
  }
  const sorted = [...normalized].sort((a, b) => a.id.localeCompare(b.id));
  const ledger = {
    schema: "evidence-ledger/v1",
    items: sorted,
    counts: sorted.reduce((acc, item) => {
      acc[item.classification] = (acc[item.classification] ?? 0) + 1;
      acc[item.support] = (acc[item.support] ?? 0) + 1;
      return acc;
    }, {})
  };
  return Object.freeze({ ...ledger, digest: canonicalDigest(ledger) });
}

export function verifyClaims({ claims, ledger, requireIndependent = true }) {
  if (!Array.isArray(claims)) throw new ResearchValidationError("claims_invalid");
  assertEvidenceLedger(ledger);
  const byId = new Map(ledger.items.map((item) => [item.id, item]));
  const results = claims.map((claim, index) => {
    assertObject(claim, "claim_invalid");
    const textValue = text(claim.text, "claim_text_invalid", 8000);
    const evidenceIds = normalizeStringArray(claim.evidenceIds ?? [], "claim_evidence_ids_invalid", 100, 200);
    const evidence = evidenceIds.map((id) => byId.get(id)).filter(Boolean);
    const missingEvidenceIds = evidenceIds.filter((id) => !byId.has(id));
    const hasPrimary = evidence.some((item) => item.classification === "primary");
    const hasIndependent = evidence.some((item) => item.classification === "independent");
    const contradicted = evidence.some((item) => item.support === "contradicts");
    const supported = evidence.some((item) => item.support === "supports");
    const pass = missingEvidenceIds.length === 0 && supported && (!requireIndependent || hasIndependent || hasPrimary);
    return {
      id: claim.id ?? `claim-${index + 1}`,
      text: textValue,
      evidenceIds,
      missingEvidenceIds,
      hasPrimary,
      hasIndependent,
      contradicted,
      status: pass ? (contradicted ? "supported_with_contradiction" : "supported") : "insufficient_evidence"
    };
  });
  const verification = {
    schema: "claim-verification/v1",
    ledgerDigest: ledger.digest,
    requireIndependent,
    results,
    passed: results.every((result) => result.status === "supported" || result.status === "supported_with_contradiction")
  };
  return Object.freeze({ ...verification, digest: canonicalDigest(verification) });
}

export function createResearchReceipt({ brief, plan, ledger, verification }) {
  assertResearchBrief(brief);
  assertResearchPlan(plan, brief.digest);
  assertEvidenceLedger(ledger);
  if (!verification || verification.schema !== "claim-verification/v1" || verification.ledgerDigest !== ledger.digest) {
    throw new ResearchValidationError("verification_invalid");
  }
  const receipt = {
    schema: "research-receipt/v1",
    briefDigest: brief.digest,
    planDigest: plan.digest,
    evidenceLedgerDigest: ledger.digest,
    verificationDigest: verification.digest,
    outcome: verification.passed ? "verified" : "blocked",
    metrics: {
      evidenceCount: ledger.items.length,
      verifiedClaimCount: verification.results.filter((r) => r.status !== "insufficient_evidence").length,
      insufficientClaimCount: verification.results.filter((r) => r.status === "insufficient_evidence").length,
      contradictionCount: verification.results.filter((r) => r.contradicted).length
    }
  };
  return Object.freeze({ ...receipt, digest: canonicalDigest(receipt) });
}

export function assertResearchBrief(value) {
  if (!value || value.schema !== "research-brief/v1" || value.digest !== canonicalDigest(stripDigest(value))) {
    throw new ResearchValidationError("research_brief_digest_invalid");
  }
  return value;
}

export function assertResearchPlan(value, briefDigest) {
  if (!value || value.schema !== "research-plan/v1" || value.briefDigest !== briefDigest || value.digest !== canonicalDigest(stripDigest(value))) {
    throw new ResearchValidationError("research_plan_invalid");
  }
  return value;
}

export function assertEvidenceLedger(value) {
  if (!value || value.schema !== "evidence-ledger/v1" || value.digest !== canonicalDigest(stripDigest(value))) {
    throw new ResearchValidationError("evidence_ledger_digest_invalid");
  }
  return value;
}

const DEFAULT_SUCCESS_METRICS = Object.freeze({
  minimumEvidenceItems: 2,
  requireCitationVerification: true,
  allowUnsupportedClaims: false
});

function normalizeBudget(input) {
  assertObject(input, "research_budget_invalid");
  return {
    maxQueries: integer(input.maxQueries ?? 6, "research_budget_queries_invalid", 1, 50),
    maxEvidenceItems: integer(input.maxEvidenceItems ?? 50, "research_budget_evidence_invalid", 1, 500),
    maxClaims: integer(input.maxClaims ?? 30, "research_budget_claims_invalid", 1, 200)
  };
}

function normalizeMetrics(input) {
  assertObject(input, "success_metrics_invalid");
  return {
    minimumEvidenceItems: integer(input.minimumEvidenceItems ?? 2, "success_metrics_evidence_invalid", 1, 500),
    requireCitationVerification: input.requireCitationVerification !== false,
    allowUnsupportedClaims: input.allowUnsupportedClaims === true
  };
}

function normalizeStringArray(value, code, maxItems, maxLength) {
  if (!Array.isArray(value) || value.length > maxItems) throw new ResearchValidationError(code);
  return unique(value.map((item) => text(item, code, maxLength)));
}

function text(value, code, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new ResearchValidationError(code);
  return value.trim();
}

function integer(value, code, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ResearchValidationError(code);
  return value;
}

function oneOf(value, allowed, code) {
  if (!allowed.includes(value)) throw new ResearchValidationError(code);
  return value;
}

function assertObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ResearchValidationError(code);
}

function unique(values) {
  return [...new Set(values)];
}

function stripDigest(value) {
  const { digest: _digest, ...rest } = value;
  return rest;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
