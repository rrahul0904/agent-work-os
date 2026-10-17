import { canonicalDigest, assertCanonicalId } from "../../domain/src/index.js";

export const COMPANY_OS_SCHEMA_VERSION = "company-os-state/v1";
export const COMPANY_WORKSTREAMS = Object.freeze([
  "product", "engineering", "design", "shipping", "growth", "sales", "partnerships",
  "fundraising", "support", "finance", "operations", "legal"
]);
export const COMPANY_OBJECTIVE_STATES = Object.freeze(["planned", "active", "blocked", "achieved", "failed", "cancelled"]);
export const COMPANY_BLOCKER_CATEGORIES = Object.freeze([
  "provider_approval_pending", "credential_required", "human_decision_required", "legal_review_required",
  "payment_authority_required", "quota_or_rate_limit", "external_dependency", "verification_failed",
  "deployment_failed", "policy_denied", "insufficient_evidence", "reconciliation_required"
]);
export const PHASE_A_ALLOWED_EFFECTS = Object.freeze(new Set([
  "read_public_evidence", "read_owned_fixture", "write_owned_fixture", "run_deterministic_test",
  "plan_preview", "observe_preview", "create_draft_artifact"
]));
export const PHASE_A_FORBIDDEN_EFFECTS = Object.freeze(new Set([
  "send_email", "publish_social", "file_legal_document", "charge_payment", "purchase", "production_deploy",
  "mutate_production", "use_real_customer_data", "use_real_prospect_data"
]));
export const LAUNCH_CERTIFICATE_REQUIREMENTS = Object.freeze([
  "research_dossier", "prd", "build", "tests", "preview", "browser_uat", "replay"
]);

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SECRET_KEY_PATTERN = /(password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|credit[_-]?card|card[_-]?number)/i;
const SECRET_VALUE_PATTERNS = [/(?:^|\s)sk-[A-Za-z0-9_-]{16,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /xox[baprs]-[A-Za-z0-9-]{16,}/];

export class CompanyValidationError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "CompanyValidationError";
    this.code = code;
  }
}

export function createCompanySpec(input) {
  const value = assertObject(input, "company_spec_invalid");
  const spec = {
    schemaVersion: "company-spec/v1",
    companyId: requireId(value.companyId, "companyId"),
    projectId: assertCanonicalId("project", value.projectId, "projectId"),
    revision: requirePositiveInt(value.revision ?? 1, "revision"),
    founderIntent: requireText(value.founderIntent, "founderIntent", 10_000),
    problemStatement: requireText(value.problemStatement, "problemStatement", 10_000),
    targetCustomer: requireText(value.targetCustomer, "targetCustomer", 5_000),
    valueProposition: requireText(value.valueProposition, "valueProposition", 5_000),
    businessModelHypothesis: requireText(value.businessModelHypothesis, "businessModelHypothesis", 5_000),
    productForm: requireText(value.productForm, "productForm", 2_000),
    launchConstraints: textArray(value.launchConstraints ?? [], "launchConstraints", 100),
    geographyAssumptions: textArray(value.geographyAssumptions ?? [], "geographyAssumptions", 50),
    budgetPolicyRef: value.budgetPolicyRef ?? null,
    successMetricIds: idArray(value.successMetricIds, "successMetricIds", 50, true),
    allowedCapabilityIds: idArray(value.allowedCapabilityIds ?? [], "allowedCapabilityIds", 200),
    provenance: requireReferences(value.provenance),
    createdBy: assertActorId(value.createdBy, "createdBy"),
    createdAt: requireTimestamp(value.createdAt, "createdAt")
  };
  assertNoSecrets(spec);
  return { ...spec, specDigest: canonicalDigest(spec) };
}

export function createCompanyObjective(input, spec) {
  const value = assertObject(input, "company_objective_invalid");
  assertCompanySpec(spec);
  if (value.companyId !== spec.companyId) throw new CompanyValidationError("company_mismatch");
  if (value.companySpecDigest !== spec.specDigest) throw new CompanyValidationError("company_spec_stale");
  const createdAt = requireTimestamp(value.createdAt, "createdAt");
  const objective = {
    schemaVersion: "company-objective/v1",
    objectiveId: requireId(value.objectiveId, "objectiveId"),
    companyId: spec.companyId,
    companySpecDigest: spec.specDigest,
    name: requireText(value.name, "name", 500),
    metricIds: idArray(value.metricIds, "metricIds", 50, true),
    baselineObservationRefs: refArray(value.baselineObservationRefs ?? [], "baselineObservationRefs", 100),
    target: value.target ?? null,
    horizon: requireText(value.horizon, "horizon", 256),
    constraints: textArray(value.constraints ?? [], "constraints", 100),
    budgetPolicyRef: value.budgetPolicyRef ?? null,
    state: requireEnum(value.state ?? "planned", COMPANY_OBJECTIVE_STATES, "state"),
    evidenceRequirements: textArray(value.evidenceRequirements ?? [], "evidenceRequirements", 100),
    createdAt,
    updatedAt: requireTimestamp(value.updatedAt ?? createdAt, "updatedAt")
  };
  assertNoSecrets(objective);
  return { ...objective, objectiveDigest: canonicalDigest(objective) };
}

export function createCompanyActionPlan(input, { spec, stateSnapshotDigest, phase = "A" }) {
  const value = assertObject(input, "company_action_plan_invalid");
  assertCompanySpec(spec);
  requireDigest(stateSnapshotDigest, "stateSnapshotDigest");
  if (value.companyId !== spec.companyId) throw new CompanyValidationError("company_mismatch");
  if (value.companySpecDigest !== spec.specDigest) throw new CompanyValidationError("company_spec_stale");
  if (value.baseStateSnapshotDigest !== stateSnapshotDigest) throw new CompanyValidationError("company_state_stale");
  const effects = idArray(value.expectedEffects ?? [], "expectedEffects", 100);
  if (phase === "A") assertPhaseAEffects(effects);
  const plan = {
    schemaVersion: "company-action-plan/v1",
    planId: requireId(value.planId, "planId"),
    companyId: spec.companyId,
    companySpecDigest: spec.specDigest,
    objectiveId: requireId(value.objectiveId, "objectiveId"),
    workstream: requireEnum(value.workstream, COMPANY_WORKSTREAMS, "workstream"),
    workItemId: assertCanonicalId("work", value.workItemId, "workItemId"),
    baseStateSnapshotDigest: stateSnapshotDigest,
    intent: requireText(value.intent, "intent", 10_000),
    expectedOutputs: textArray(value.expectedOutputs ?? [], "expectedOutputs", 100),
    expectedEffects: effects,
    requestedCapabilityIds: idArray(value.requestedCapabilityIds ?? [], "requestedCapabilityIds", 100),
    externalDependencies: textArray(value.externalDependencies ?? [], "externalDependencies", 100),
    riskClass: requireEnum(value.riskClass ?? "unknown", ["low", "moderate", "high", "unknown"], "riskClass"),
    reversibility: requireEnum(value.reversibility ?? "unknown", ["reversible", "partially_reversible", "irreversible", "unknown"], "reversibility"),
    budgetEstimate: value.budgetEstimate ?? null,
    approvalRequirement: requireEnum(value.approvalRequirement ?? "unknown", ["none", "policy", "human", "legal_or_regulated", "unknown"], "approvalRequirement"),
    postconditionChecks: textArray(value.postconditionChecks ?? [], "postconditionChecks", 100),
    createdBy: assertActorId(value.createdBy, "createdBy"),
    createdAt: requireTimestamp(value.createdAt, "createdAt")
  };
  assertNoSecrets(plan);
  return { ...plan, planDigest: canonicalDigest(plan) };
}

export function createCompanyBlocker(input) {
  const value = assertObject(input, "company_blocker_invalid");
  const blocker = {
    schemaVersion: "company-blocker/v1",
    blockerId: requireId(value.blockerId, "blockerId"),
    companyId: requireId(value.companyId, "companyId"),
    objectiveId: value.objectiveId ?? null,
    workItemId: value.workItemId ?? null,
    category: requireEnum(value.category, COMPANY_BLOCKER_CATEGORIES, "category"),
    status: requireEnum(value.status ?? "open", ["open", "resolved", "superseded"], "status"),
    reason: requireText(value.reason, "reason", 5_000),
    externalProvider: value.externalProvider ?? null,
    evidenceRefs: refArray(value.evidenceRefs ?? [], "evidenceRefs", 100),
    requiresHuman: Boolean(value.requiresHuman),
    firstObservedAt: requireTimestamp(value.firstObservedAt, "firstObservedAt"),
    lastObservedAt: requireTimestamp(value.lastObservedAt ?? value.firstObservedAt, "lastObservedAt"),
    resolvedAt: value.resolvedAt ? requireTimestamp(value.resolvedAt, "resolvedAt") : null
  };
  if (blocker.workItemId !== null) assertCanonicalId("work", blocker.workItemId, "workItemId");
  if (blocker.status === "resolved" && !blocker.resolvedAt) throw new CompanyValidationError("blocker_resolution_timestamp_required");
  assertNoSecrets(blocker);
  return { ...blocker, blockerDigest: canonicalDigest(blocker) };
}

export function createMetricObservation(input) {
  const value = assertObject(input, "company_metric_observation_invalid");
  const unknown = Boolean(value.unknown);
  if (!unknown && value.value === undefined) throw new CompanyValidationError("metric_value_required");
  if (!value.sourceRef) throw new CompanyValidationError("metric_source_required");
  const provenance = requireReferences(value.provenance);
  if (provenance.length === 0) throw new CompanyValidationError("metric_provenance_required");
  const observation = {
    schemaVersion: "company-metric-observation/v1",
    observationId: requireId(value.observationId, "observationId"),
    companyId: requireId(value.companyId, "companyId"),
    metricId: requireId(value.metricId, "metricId"),
    value: unknown ? null : value.value,
    unknown,
    unit: requireText(value.unit, "unit", 128),
    sourceType: requireEnum(value.sourceType, ["analytics", "billing", "crm", "deployment", "support", "research", "manual", "synthetic", "estimate"], "sourceType"),
    sourceRef: requireText(value.sourceRef, "sourceRef", 2_048),
    observedAt: requireTimestamp(value.observedAt, "observedAt"),
    windowStart: value.windowStart ? requireTimestamp(value.windowStart, "windowStart") : null,
    windowEnd: value.windowEnd ? requireTimestamp(value.windowEnd, "windowEnd") : null,
    quality: requireEnum(value.quality ?? "unknown", ["verified", "observed", "derived", "estimate", "unknown"], "quality"),
    provenance,
    evidenceRefs: refArray(value.evidenceRefs ?? [], "evidenceRefs", 100)
  };
  assertNoSecrets(observation);
  return { ...observation, observationDigest: canonicalDigest(observation) };
}

export function createInitialCompanyState(spec) {
  assertCompanySpec(spec);
  const state = {
    schemaVersion: COMPANY_OS_SCHEMA_VERSION,
    companyId: spec.companyId,
    companySpec: spec,
    objectives: {},
    actionPlans: {},
    blockers: {},
    metrics: {},
    evidence: {},
    eventCount: 0
  };
  return withSnapshotDigest(state);
}

export function reduceCompanyEvent(stateInput, eventInput) {
  const state = assertState(stateInput);
  const event = assertObject(eventInput, "company_event_invalid");
  if (event.companyId !== state.companyId) throw new CompanyValidationError("company_event_cross_company");
  let next = cloneWithoutSnapshot(state);
  switch (event.type) {
    case "objective.upsert": {
      const objective = createCompanyObjective(event.objective, state.companySpec);
      next.objectives[objective.objectiveId] = objective;
      break;
    }
    case "action.planned": {
      const plan = createCompanyActionPlan(event.plan, { spec: state.companySpec, stateSnapshotDigest: state.snapshotDigest, phase: event.phase ?? "A" });
      next.actionPlans[plan.planId] = plan;
      break;
    }
    case "blocker.observed": {
      const blocker = createCompanyBlocker(event.blocker);
      if (blocker.companyId !== state.companyId) throw new CompanyValidationError("company_event_cross_company");
      next.blockers[blocker.blockerId] = blocker;
      break;
    }
    case "blocker.resolved": {
      const current = next.blockers[event.blockerId];
      if (!current) throw new CompanyValidationError("blocker_not_found");
      const resolved = createCompanyBlocker({ ...current, status: "resolved", lastObservedAt: event.resolvedAt, resolvedAt: event.resolvedAt });
      next.blockers[event.blockerId] = resolved;
      break;
    }
    case "metric.observed": {
      const observation = createMetricObservation(event.observation);
      if (observation.companyId !== state.companyId) throw new CompanyValidationError("company_event_cross_company");
      next.metrics[observation.observationId] = observation;
      break;
    }
    case "evidence.recorded": {
      const evidence = assertEvidence(event.evidence, state.companyId);
      next.evidence[evidence.kind] = evidence;
      break;
    }
    case "work.completed":
      // Work completion is intentionally not a business metric or verification event.
      break;
    default:
      throw new CompanyValidationError("company_event_type_unknown");
  }
  next.eventCount += 1;
  return withSnapshotDigest(next);
}

export function replayCompanyEvents(spec, events) {
  if (!Array.isArray(events)) throw new CompanyValidationError("company_events_invalid");
  return events.reduce((state, event) => reduceCompanyEvent(state, event), createInitialCompanyState(spec));
}

export function evaluateLaunchReadiness(stateInput) {
  const state = assertState(stateInput);
  const missingEvidence = LAUNCH_CERTIFICATE_REQUIREMENTS.filter((kind) => !state.evidence[kind]);
  const blocking = Object.values(state.blockers).filter((blocker) => blocker.status === "open");
  const failedEvidence = Object.values(state.evidence).filter((evidence) => evidence.status !== "passed");
  return {
    ready: missingEvidence.length === 0 && blocking.length === 0 && failedEvidence.length === 0,
    missingEvidence,
    openBlockerIds: blocking.map((item) => item.blockerId).sort(),
    failedEvidenceKinds: failedEvidence.map((item) => item.kind).sort(),
    snapshotDigest: state.snapshotDigest
  };
}

export function issueLaunchCertificate(stateInput, { certificateId, issuedAt, issuedBy }) {
  const state = assertState(stateInput);
  const readiness = evaluateLaunchReadiness(state);
  if (!readiness.ready) {
    const error = new CompanyValidationError("company_launch_not_ready");
    error.readiness = readiness;
    throw error;
  }
  const certificate = {
    schemaVersion: "company-launch-certificate/v1",
    certificateId: requireId(certificateId, "certificateId"),
    companyId: state.companyId,
    companySpecDigest: state.companySpec.specDigest,
    stateSnapshotDigest: state.snapshotDigest,
    evidenceRefs: LAUNCH_CERTIFICATE_REQUIREMENTS.map((kind) => state.evidence[kind].evidenceRef),
    issuedAt: requireTimestamp(issuedAt, "issuedAt"),
    issuedBy: assertActorId(issuedBy, "issuedBy"),
    declaration: "verified_phase_a_preview_ready_not_business_success"
  };
  return { ...certificate, certificateDigest: canonicalDigest(certificate) };
}

export function assertPhaseAEffects(effects) {
  for (const effect of effects) {
    if (PHASE_A_FORBIDDEN_EFFECTS.has(effect) || !PHASE_A_ALLOWED_EFFECTS.has(effect)) {
      throw new CompanyValidationError("phase_a_effect_forbidden", `Phase A forbids effect: ${effect}`);
    }
  }
  return effects;
}

export function assertNoSecrets(value, path = "root") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`));
    return value;
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      throw new CompanyValidationError("secret_material_forbidden", `Secret-shaped value at ${path}`);
    }
    return value;
  }
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) throw new CompanyValidationError("secret_material_forbidden", `Secret-shaped field at ${path}.${key}`);
    assertNoSecrets(child, `${path}.${key}`);
  }
  return value;
}

function assertCompanySpec(spec) {
  const value = assertObject(spec, "company_spec_invalid");
  if (value.schemaVersion !== "company-spec/v1") throw new CompanyValidationError("company_spec_version_invalid");
  requireId(value.companyId, "companyId");
  assertCanonicalId("project", value.projectId, "projectId");
  requirePositiveInt(value.revision, "revision");
  requireDigest(value.specDigest, "specDigest");
  const { specDigest, ...unsigned } = value;
  if (canonicalDigest(unsigned) !== specDigest) throw new CompanyValidationError("company_spec_digest_invalid");
  return value;
}

function assertState(state) {
  const value = assertObject(state, "company_state_invalid");
  if (value.schemaVersion !== COMPANY_OS_SCHEMA_VERSION) throw new CompanyValidationError("company_state_version_invalid");
  assertCompanySpec(value.companySpec);
  if (value.companyId !== value.companySpec.companyId) throw new CompanyValidationError("company_mismatch");
  requireDigest(value.snapshotDigest, "snapshotDigest");
  const expected = canonicalDigest(cloneWithoutSnapshot(value));
  if (expected !== value.snapshotDigest) throw new CompanyValidationError("company_state_digest_invalid");
  return value;
}

function assertEvidence(input, companyId) {
  const value = assertObject(input, "company_evidence_invalid");
  if (value.companyId !== companyId) throw new CompanyValidationError("company_event_cross_company");
  const evidence = {
    companyId,
    kind: requireEnum(value.kind, LAUNCH_CERTIFICATE_REQUIREMENTS, "kind"),
    status: requireEnum(value.status, ["passed", "failed", "blocked", "unknown"], "status"),
    evidenceRef: requireText(value.evidenceRef, "evidenceRef", 512),
    evidenceDigest: requireDigest(value.evidenceDigest, "evidenceDigest"),
    observedAt: requireTimestamp(value.observedAt, "observedAt")
  };
  assertNoSecrets(evidence);
  return { ...evidence, recordDigest: canonicalDigest(evidence) };
}

function withSnapshotDigest(state) {
  const clean = cloneWithoutSnapshot(state);
  assertNoSecrets(clean);
  return { ...clean, snapshotDigest: canonicalDigest(clean) };
}

function cloneWithoutSnapshot(state) {
  const { snapshotDigest: _ignored, ...rest } = state;
  return structuredClone(rest);
}

function assertObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CompanyValidationError(code);
  return value;
}

function requireText(value, field, max) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new CompanyValidationError(`company_${field}_invalid`);
  return value.trim();
}

function requireId(value, field) {
  const text = requireText(value, field, 128);
  if (!ID_PATTERN.test(text)) throw new CompanyValidationError(`company_${field}_invalid`);
  return text;
}

function requirePositiveInt(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) throw new CompanyValidationError(`company_${field}_invalid`);
  return value;
}

function requireTimestamp(value, field) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new CompanyValidationError(`company_${field}_invalid`);
  return value;
}

function requireDigest(value, field) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) throw new CompanyValidationError(`company_${field}_invalid`);
  return value;
}

function requireEnum(value, allowed, field) {
  if (!allowed.includes(value)) throw new CompanyValidationError(`company_${field}_invalid`);
  return value;
}

function textArray(value, field, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems) throw new CompanyValidationError(`company_${field}_invalid`);
  return value.map((item) => requireText(item, field, 1_000));
}

function idArray(value, field, maxItems, requireOne = false) {
  if (!Array.isArray(value) || value.length > maxItems || (requireOne && value.length === 0)) throw new CompanyValidationError(`company_${field}_invalid`);
  const normalized = value.map((item) => requireId(item, field));
  if (new Set(normalized).size !== normalized.length) throw new CompanyValidationError(`company_${field}_duplicate`);
  return normalized;
}

function refArray(value, field, maxItems, requireOne = false) {
  if (!Array.isArray(value) || value.length > maxItems || (requireOne && value.length === 0)) throw new CompanyValidationError(`company_${field}_invalid`);
  const normalized = value.map((item) => requireText(item, field, 2_048));
  if (new Set(normalized).size !== normalized.length) throw new CompanyValidationError(`company_${field}_duplicate`);
  return normalized;
}

function requireReferences(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) throw new CompanyValidationError("company_provenance_invalid");
  return value.map((item) => {
    const ref = assertObject(item, "company_reference_invalid");
    const normalized = {
      type: requireEnum(ref.type, ["source", "artifact", "evidence", "receipt", "deployment", "memory", "external"], "reference_type"),
      ref: requireText(ref.ref, "reference_ref", 2_048)
    };
    if (ref.digest !== undefined) normalized.digest = requireDigest(ref.digest, "reference_digest");
    if (ref.observedAt !== undefined) normalized.observedAt = requireTimestamp(ref.observedAt, "reference_observedAt");
    return normalized;
  });
}

function assertActorId(value, field) {
  const kind = ["user", "agent", "service"].find((candidate) => typeof value === "string" && value.startsWith(`${candidate}_`));
  if (!kind) throw new CompanyValidationError("actor_id_invalid");
  return assertCanonicalId(kind, value, field);
}