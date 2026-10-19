import { canonicalDigest, DomainValidationError } from "./index.js";

export const AGENT_DECISIONS = Object.freeze(["ACTION", "NO_ACTION", "NEEDS_HUMAN", "BLOCKED"]);
export const OUTCOME_STATUSES = Object.freeze(["SUCCEEDED", "FAILED", "PARTIAL", "VOID", "UNKNOWN"]);
export const RETROSPECTIVE_MODES = Object.freeze(["disabled", "write_only", "validated_only"]);

const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function createModelGeneration(input, { now = () => new Date().toISOString() } = {}) {
  assertObject(input, "model_generation_invalid");
  const createdAt = input.createdAt ?? now();
  assertTimestamp(createdAt, "model_generation_timestamp_invalid");
  const generation = {
    schema: "model-generation/v1",
    modelGenerationId: requireText(input.modelGenerationId, "model_generation_id_invalid", 200),
    createdAt,
    modelProvider: requireText(input.modelProvider, "model_provider_invalid", 200),
    modelName: requireText(input.modelName, "model_name_invalid", 200),
    runtimeDigest: assertDigest(input.runtimeDigest, "runtime_digest_invalid"),
    promptPolicyDigest: assertDigest(input.promptPolicyDigest, "prompt_policy_digest_invalid"),
    toolsetDigest: assertDigest(input.toolsetDigest, "toolset_digest_invalid"),
    baselineGenerationId: input.baselineGenerationId ?? null,
    baselineCompatibilityDigest: input.baselineCompatibilityDigest ?? null,
    inheritsScorecard: false
  };
  if (generation.baselineGenerationId !== null) {
    requireText(generation.baselineGenerationId, "baseline_generation_id_invalid", 200);
    assertDigest(generation.baselineCompatibilityDigest, "baseline_compatibility_digest_invalid");
  } else if (generation.baselineCompatibilityDigest !== null) {
    throw new DomainValidationError("baseline_compatibility_without_generation");
  }
  return deepFreeze(generation);
}

export function createAgentDecision(input, { now = () => new Date().toISOString() } = {}) {
  assertObject(input, "agent_decision_invalid");
  if (!AGENT_DECISIONS.includes(input.decision)) throw new DomainValidationError("agent_decision_state_invalid");
  const createdAt = input.createdAt ?? now();
  assertTimestamp(createdAt, "agent_decision_timestamp_invalid");
  const memoryPolicy = normalizeMemoryPolicy(input.memoryPolicy);
  const confidence = input.confidence ?? null;
  if (confidence !== null && (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
    throw new DomainValidationError("agent_decision_confidence_invalid");
  }
  const evidenceRefs = Array.isArray(input.evidenceRefs) ? input.evidenceRefs.map(normalizeEvidenceRef) : [];
  const decision = {
    schema: "agent-decision/v1",
    decisionId: requireText(input.decisionId, "agent_decision_id_invalid", 200),
    createdAt,
    decision: input.decision,
    inputDigest: assertDigest(input.inputDigest, "input_digest_invalid"),
    evidenceDigest: assertDigest(input.evidenceDigest, "evidence_digest_invalid"),
    modelGenerationId: requireText(input.modelGenerationId, "model_generation_id_invalid", 200),
    modelRuntimeDigest: assertDigest(input.modelRuntimeDigest, "model_runtime_digest_invalid"),
    policyDigest: assertDigest(input.policyDigest, "policy_digest_invalid"),
    confidence,
    rationaleSummary: requireText(input.rationaleSummary, "rationale_summary_invalid", 4_000),
    evidenceRefs,
    memoryPolicy,
    requestedEffectClass: input.requestedEffectClass ?? null
  };
  if (decision.requestedEffectClass !== null) {
    requireText(decision.requestedEffectClass, "requested_effect_class_invalid", 200);
  }
  return deepFreeze(decision);
}

export function acceptDecision(decisionInput, {
  ledgerEntryId,
  sequence,
  externalIdentityKey = null,
  at = new Date().toISOString()
} = {}) {
  const decision = assertAgentDecision(decisionInput);
  assertTimestamp(at, "decision_ledger_timestamp_invalid");
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new DomainValidationError("decision_ledger_sequence_invalid");
  if (externalIdentityKey !== null) requireText(externalIdentityKey, "external_identity_key_invalid", 500);
  return deepFreeze({
    schema: "decision-ledger-entry/v1",
    ledgerEntryId: requireText(ledgerEntryId, "ledger_entry_id_invalid", 200),
    acceptedAt: at,
    decisionId: decision.decisionId,
    decisionDigest: canonicalDigest(decision),
    sequence,
    externalIdentityKey,
    appendOnly: true
  });
}

export function observeOutcome(entryInput, outcomeInput, { now = () => new Date().toISOString() } = {}) {
  const entry = assertLedgerEntry(entryInput);
  assertObject(outcomeInput, "outcome_observation_invalid");
  const observedAt = outcomeInput.observedAt ?? now();
  assertTimestamp(observedAt, "outcome_observation_timestamp_invalid");
  if (!OUTCOME_STATUSES.includes(outcomeInput.status)) throw new DomainValidationError("outcome_status_invalid");
  return deepFreeze({
    schema: "outcome-observation/v1",
    outcomeId: requireText(outcomeInput.outcomeId, "outcome_id_invalid", 200),
    observedAt,
    ledgerEntryId: entry.ledgerEntryId,
    decisionDigest: entry.decisionDigest,
    sourceDigest: assertDigest(outcomeInput.sourceDigest, "outcome_source_digest_invalid"),
    status: outcomeInput.status,
    metrics: normalizeMetrics(outcomeInput.metrics ?? {}),
    notes: outcomeInput.notes ?? null
  });
}

export function createCorrectionReceipt(targetArtifact, replacementArtifact, {
  correctionId,
  reasonCode,
  reasonSummary = null,
  at = new Date().toISOString()
} = {}) {
  assertObject(targetArtifact, "correction_target_invalid");
  assertObject(replacementArtifact, "correction_replacement_invalid");
  assertTimestamp(at, "correction_timestamp_invalid");
  const allowedReasons = new Set(["SOURCE_CORRECTION", "IDENTITY_CORRECTION", "TIME_CORRECTION", "OUTCOME_CORRECTION", "OTHER"]);
  if (!allowedReasons.has(reasonCode)) throw new DomainValidationError("correction_reason_invalid");
  if (reasonSummary !== null) requireText(reasonSummary, "correction_reason_summary_invalid", 2_000);
  const targetArtifactId = artifactId(targetArtifact);
  return deepFreeze({
    schema: "correction-receipt/v1",
    correctionId: requireText(correctionId, "correction_id_invalid", 200),
    createdAt: at,
    targetArtifactId,
    targetArtifactDigest: canonicalDigest(targetArtifact),
    reasonCode,
    reasonSummary,
    replacementDigest: canonicalDigest(replacementArtifact),
    doesNotOverwriteOriginal: true
  });
}

export function createProviderBudgetReceipt(input, { now = () => new Date().toISOString() } = {}) {
  assertObject(input, "provider_budget_invalid");
  const createdAt = input.createdAt ?? now();
  assertTimestamp(createdAt, "provider_budget_timestamp_invalid");
  if (!Number.isSafeInteger(input.callCount) || input.callCount < 0) throw new DomainValidationError("provider_call_count_invalid");
  if (!Number.isSafeInteger(input.callLimit) || input.callLimit < 0) throw new DomainValidationError("provider_call_limit_invalid");
  const costObserved = input.costObserved ?? null;
  const costLimit = input.costLimit ?? null;
  if (costObserved !== null && (!Number.isFinite(costObserved) || costObserved < 0)) throw new DomainValidationError("provider_cost_observed_invalid");
  if (costLimit !== null && (!Number.isFinite(costLimit) || costLimit < 0)) throw new DomainValidationError("provider_cost_limit_invalid");
  const exceeded = input.callCount > input.callLimit || (costObserved !== null && costLimit !== null && costObserved > costLimit);
  return deepFreeze({
    schema: "provider-budget-receipt/v1",
    receiptId: requireText(input.receiptId, "provider_budget_receipt_id_invalid", 200),
    runId: requireText(input.runId, "provider_budget_run_id_invalid", 200),
    createdAt,
    provider: requireText(input.provider, "provider_budget_provider_invalid", 200),
    callCount: input.callCount,
    callLimit: input.callLimit,
    costObserved,
    costLimit,
    budgetStatus: exceeded ? "BUDGET_EXCEEDED" : "WITHIN_BUDGET"
  });
}

export class DecisionLedger {
  #entries = [];
  #decisions = new Map();
  #externalIdentity = new Map();
  #outcomes = [];
  #corrections = [];

  appendDecision(decisionInput, options) {
    const decision = assertAgentDecision(decisionInput);
    if (this.#decisions.has(decision.decisionId)) throw new DomainValidationError("decision_duplicate_id");
    const identity = options?.externalIdentityKey ?? null;
    if (identity !== null && this.#externalIdentity.has(identity)) {
      throw new DomainValidationError("decision_external_identity_duplicate");
    }
    const entry = acceptDecision(decision, { ...options, sequence: this.#entries.length + 1 });
    this.#entries.push(entry);
    this.#decisions.set(decision.decisionId, decision);
    if (identity !== null) this.#externalIdentity.set(identity, entry.ledgerEntryId);
    return entry;
  }

  appendOutcome(ledgerEntryId, outcomeInput, options) {
    const entry = this.#entries.find((candidate) => candidate.ledgerEntryId === ledgerEntryId);
    if (!entry) throw new DomainValidationError("decision_ledger_entry_not_found");
    const outcome = observeOutcome(entry, outcomeInput, options);
    this.#outcomes.push(outcome);
    return outcome;
  }

  appendCorrection(targetArtifact, replacementArtifact, options) {
    const receipt = createCorrectionReceipt(targetArtifact, replacementArtifact, options);
    this.#corrections.push(receipt);
    return receipt;
  }

  getDecision(decisionId) {
    return this.#decisions.get(decisionId) ?? null;
  }

  snapshot() {
    return deepFreeze({
      entries: [...this.#entries],
      outcomes: [...this.#outcomes],
      corrections: [...this.#corrections]
    });
  }
}

export function assertAgentDecision(input) {
  assertObject(input, "agent_decision_invalid");
  if (input.schema !== "agent-decision/v1") throw new DomainValidationError("agent_decision_schema_invalid");
  if (!AGENT_DECISIONS.includes(input.decision)) throw new DomainValidationError("agent_decision_state_invalid");
  requireText(input.decisionId, "agent_decision_id_invalid", 200);
  assertTimestamp(input.createdAt, "agent_decision_timestamp_invalid");
  assertDigest(input.inputDigest, "input_digest_invalid");
  assertDigest(input.evidenceDigest, "evidence_digest_invalid");
  assertDigest(input.modelRuntimeDigest, "model_runtime_digest_invalid");
  assertDigest(input.policyDigest, "policy_digest_invalid");
  normalizeMemoryPolicy(input.memoryPolicy);
  return input;
}

export function assertLedgerEntry(input) {
  assertObject(input, "decision_ledger_entry_invalid");
  if (input.schema !== "decision-ledger-entry/v1" || input.appendOnly !== true) {
    throw new DomainValidationError("decision_ledger_entry_schema_invalid");
  }
  requireText(input.ledgerEntryId, "ledger_entry_id_invalid", 200);
  assertDigest(input.decisionDigest, "decision_digest_invalid");
  return input;
}

function normalizeMemoryPolicy(input) {
  assertObject(input, "memory_policy_invalid");
  if (!RETROSPECTIVE_MODES.includes(input.retrospectiveMode)) throw new DomainValidationError("memory_retrospective_mode_invalid");
  if (input.allowUnverifiedRetrospectiveInFutureContext !== false) {
    throw new DomainValidationError("memory_unverified_retrospective_must_be_denied");
  }
  return deepFreeze({
    retrospectiveMode: input.retrospectiveMode,
    allowUnverifiedRetrospectiveInFutureContext: false
  });
}

function normalizeEvidenceRef(input) {
  assertObject(input, "evidence_ref_invalid");
  const allowedStates = new Set(["observed", "derived", "inferred", "unknown", "verified"]);
  if (!allowedStates.has(input.epistemicState)) throw new DomainValidationError("evidence_epistemic_state_invalid");
  return deepFreeze({
    evidenceId: requireText(input.evidenceId, "evidence_id_invalid", 200),
    digest: assertDigest(input.digest, "evidence_digest_invalid"),
    epistemicState: input.epistemicState
  });
}

function normalizeMetrics(input) {
  assertObject(input, "outcome_metrics_invalid");
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    requireText(key, "outcome_metric_key_invalid", 200);
    if (!["string", "number", "boolean"].includes(typeof value) && value !== null) {
      throw new DomainValidationError("outcome_metric_value_invalid");
    }
    result[key] = value;
  }
  return deepFreeze(result);
}

function artifactId(artifact) {
  const candidate = artifact.outcomeId ?? artifact.ledgerEntryId ?? artifact.decisionId ?? artifact.modelGenerationId ?? artifact.receiptId ?? artifact.correctionId;
  return requireText(candidate, "correction_target_id_invalid", 200);
}

function assertDigest(value, code) {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) throw new DomainValidationError(code);
  return value;
}

function assertTimestamp(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new DomainValidationError(code);
  return value;
}

function requireText(value, code, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new DomainValidationError(code);
  return value;
}

function assertObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DomainValidationError(code);
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
