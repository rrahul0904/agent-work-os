import {
  DomainValidationError,
  assertCanonicalId,
  canonicalDigest,
  createCanonicalId
} from "./index.js";

export const DELEGATION_RUN_STATES = Object.freeze([
  "queued", "running", "completed", "failed", "cancelled", "expired"
]);

export function createAgentDefinition(input) {
  assertObject(input, "agent_definition_invalid");
  const id = input.id ?? createCanonicalId("agent");
  assertCanonicalId("agent", id, "id");

  return Object.freeze({
    id,
    provider: requireText(input.provider, "agent_definition_provider_invalid", 100),
    role: requireText(input.role, "agent_definition_role_invalid", 100),
    capabilities: normalizeStringSet(input.capabilities, "agent_definition_capabilities_invalid"),
    effects: normalizeStringSet(input.effects ?? [], "agent_definition_effects_invalid"),
    modelPolicy: normalizeModelPolicy(input.modelPolicy),
    contextPolicy: normalizeContextPolicy(input.contextPolicy),
    resultSchema: requireText(input.resultSchema ?? "delegation-result/v1", "agent_definition_result_schema_invalid", 120)
  });
}

export function createContextPack(input) {
  assertObject(input, "context_pack_invalid");
  const id = input.id ?? createCanonicalId("context");
  assertCanonicalId("context", id, "id");
  assertCanonicalId("task", input.taskId, "taskId");

  const pack = {
    id,
    taskId: input.taskId,
    objective: requireText(input.objective, "context_pack_objective_invalid", 10_000),
    successCriteria: normalizeTextArray(input.successCriteria ?? [], "context_pack_success_criteria_invalid", 2_000),
    constraints: normalizeTextArray(input.constraints ?? [], "context_pack_constraints_invalid", 5_000),
    decisions: normalizeTextArray(input.decisions ?? [], "context_pack_decisions_invalid", 5_000),
    evidenceIds: normalizeCanonicalIds("evidence", input.evidenceIds ?? [], "context_pack_evidence_invalid"),
    allowedCapabilities: normalizeStringSet(input.allowedCapabilities ?? [], "context_pack_capabilities_invalid"),
    allowedEffects: normalizeStringSet(input.allowedEffects ?? [], "context_pack_effects_invalid"),
    exclusions: normalizeTextArray(input.exclusions ?? [], "context_pack_exclusions_invalid", 2_000)
  };

  return Object.freeze({ ...pack, digest: canonicalDigest(pack) });
}

export function assertEffectAttenuation({ parentEffects, taskEffects, childEffects }) {
  const parent = new Set(normalizeStringSet(parentEffects ?? [], "delegation_parent_effects_invalid"));
  const task = new Set(normalizeStringSet(taskEffects ?? [], "delegation_task_effects_invalid"));
  const child = normalizeStringSet(childEffects ?? [], "delegation_child_effects_invalid");

  for (const effect of child) {
    if (!parent.has(effect) || !task.has(effect)) {
      throw new DomainValidationError(
        "delegation_effect_escalation",
        `Child effect ${effect} is not authorized by both parent and task grants`
      );
    }
  }
  return child;
}

export function createDelegationRun(input, { now = () => new Date().toISOString() } = {}) {
  assertObject(input, "delegation_run_invalid");
  const id = input.id ?? createCanonicalId("run");
  assertCanonicalId("run", id, "id");
  if (input.parentRunId !== undefined && input.parentRunId !== null) {
    assertCanonicalId("run", input.parentRunId, "parentRunId");
    if (input.parentRunId === id) throw new DomainValidationError("delegation_parent_cycle");
  }
  assertCanonicalId("task", input.taskId, "taskId");
  assertCanonicalId("agent", input.agentDefinitionId, "agentDefinitionId");
  assertCanonicalId("context", input.contextId, "contextId");
  assertCanonicalId("grant", input.grantId, "grantId");
  if (input.workspaceId !== undefined && input.workspaceId !== null) {
    assertCanonicalId("worktree", input.workspaceId, "workspaceId");
  }
  assertDigest(input.contextDigest, "delegation_context_digest_invalid");

  const status = input.status ?? "queued";
  if (!DELEGATION_RUN_STATES.includes(status)) throw new DomainValidationError("delegation_run_state_invalid");
  const attempt = input.attempt ?? 1;
  const depth = input.depth ?? 1;
  if (!Number.isSafeInteger(attempt) || attempt < 1) throw new DomainValidationError("delegation_attempt_invalid");
  if (!Number.isSafeInteger(depth) || depth < 1) throw new DomainValidationError("delegation_depth_invalid");

  const createdAt = input.createdAt ?? now();
  if (!Number.isFinite(Date.parse(createdAt))) throw new DomainValidationError("delegation_timestamp_invalid");

  return Object.freeze({
    id,
    parentRunId: input.parentRunId ?? null,
    taskId: input.taskId,
    agentDefinitionId: input.agentDefinitionId,
    contextId: input.contextId,
    contextDigest: input.contextDigest,
    grantId: input.grantId,
    workspaceId: input.workspaceId ?? null,
    status,
    attempt,
    depth,
    createdAt
  });
}

export function createDelegationResult(input) {
  assertObject(input, "delegation_result_invalid");
  assertCanonicalId("run", input.runId, "runId");
  if (Object.hasOwn(input, "rawTranscript") || Object.hasOwn(input, "toolLogs")) {
    throw new DomainValidationError(
      "delegation_result_raw_output_forbidden",
      "Raw transcripts and tool logs must be retained as evidence, not embedded in the parent result"
    );
  }

  const result = {
    runId: input.runId,
    summary: requireText(input.summary, "delegation_result_summary_invalid", 20_000),
    claims: normalizeClaims(input.claims ?? []),
    artifactIds: normalizeCanonicalIds("artifact", input.artifactIds ?? [], "delegation_result_artifacts_invalid"),
    unresolved: normalizeTextArray(input.unresolved ?? [], "delegation_result_unresolved_invalid", 4_000),
    recommendedNextActions: normalizeTextArray(
      input.recommendedNextActions ?? [],
      "delegation_result_next_actions_invalid",
      4_000
    ),
    usage: normalizeUsage(input.usage)
  };

  return Object.freeze({ ...result, resultDigest: canonicalDigest(result) });
}

export function compactDelegationResults(results) {
  if (!Array.isArray(results)) throw new DomainValidationError("delegation_results_invalid");
  return results.map((input) => {
    const result = createDelegationResult(input);
    return Object.freeze({
      runId: result.runId,
      summary: result.summary,
      claims: result.claims,
      artifactIds: result.artifactIds,
      unresolved: result.unresolved,
      recommendedNextActions: result.recommendedNextActions,
      resultDigest: result.resultDigest
    });
  });
}

export class DeterministicDelegationScheduler {
  constructor({ maxConcurrency = 3, maxDepth = 2 } = {}) {
    if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 64) {
      throw new DomainValidationError("delegation_concurrency_invalid");
    }
    if (!Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 16) {
      throw new DomainValidationError("delegation_max_depth_invalid");
    }
    this.maxConcurrency = maxConcurrency;
    this.maxDepth = maxDepth;
  }

  async execute({ tasks, worker, depth = 1, signal } = {}) {
    if (!Array.isArray(tasks)) throw new DomainValidationError("delegation_tasks_invalid");
    if (typeof worker !== "function") throw new DomainValidationError("delegation_worker_invalid");
    if (!Number.isSafeInteger(depth) || depth < 1 || depth > this.maxDepth) {
      throw new DomainValidationError("delegation_depth_exceeded");
    }
    throwIfCancelled(signal);
    if (tasks.length === 0) return [];

    const outcomes = new Array(tasks.length);
    let nextIndex = 0;
    const laneCount = Math.min(this.maxConcurrency, tasks.length);

    const runLane = async () => {
      while (true) {
        throwIfCancelled(signal);
        const index = nextIndex++;
        if (index >= tasks.length) return;
        try {
          const value = await worker(tasks[index], { index, depth, signal });
          throwIfCancelled(signal);
          outcomes[index] = Object.freeze({ status: "fulfilled", value });
        } catch (error) {
          if (signal?.aborted) throw cancelledError();
          outcomes[index] = Object.freeze({
            status: "rejected",
            reason: Object.freeze(normalizeError(error))
          });
        }
      }
    };

    await Promise.all(Array.from({ length: laneCount }, () => runLane()));
    throwIfCancelled(signal);
    return outcomes;
  }
}

function normalizeClaims(value) {
  if (!Array.isArray(value)) throw new DomainValidationError("delegation_result_claims_invalid");
  return Object.freeze(value.map((claim) => {
    assertObject(claim, "delegation_result_claim_invalid");
    const confidence = claim.confidence ?? 0.5;
    if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new DomainValidationError("delegation_result_confidence_invalid");
    }
    return Object.freeze({
      text: requireText(claim.text, "delegation_result_claim_text_invalid", 8_000),
      confidence,
      evidenceIds: normalizeCanonicalIds("evidence", claim.evidenceIds ?? [], "delegation_result_claim_evidence_invalid")
    });
  }));
}

function normalizeModelPolicy(value = {}) {
  assertObject(value, "agent_definition_model_policy_invalid");
  const maxCostUsd = value.maxCostUsd ?? null;
  if (maxCostUsd !== null && (typeof maxCostUsd !== "number" || !Number.isFinite(maxCostUsd) || maxCostUsd < 0)) {
    throw new DomainValidationError("agent_definition_max_cost_invalid");
  }
  return Object.freeze({
    class: requireText(value.class ?? "default", "agent_definition_model_class_invalid", 100),
    maxCostUsd
  });
}

function normalizeContextPolicy(value = {}) {
  assertObject(value, "agent_definition_context_policy_invalid");
  const maxInputTokens = value.maxInputTokens ?? 60_000;
  if (!Number.isSafeInteger(maxInputTokens) || maxInputTokens < 1) {
    throw new DomainValidationError("agent_definition_context_tokens_invalid");
  }
  return Object.freeze({
    maxInputTokens,
    includeParentHistory: value.includeParentHistory === true
  });
}

function normalizeUsage(value = {}) {
  assertObject(value, "delegation_result_usage_invalid");
  const normalized = {
    inputTokens: value.inputTokens ?? 0,
    outputTokens: value.outputTokens ?? 0,
    costUsd: value.costUsd ?? 0
  };
  if (!Number.isSafeInteger(normalized.inputTokens) || normalized.inputTokens < 0) {
    throw new DomainValidationError("delegation_result_input_tokens_invalid");
  }
  if (!Number.isSafeInteger(normalized.outputTokens) || normalized.outputTokens < 0) {
    throw new DomainValidationError("delegation_result_output_tokens_invalid");
  }
  if (typeof normalized.costUsd !== "number" || !Number.isFinite(normalized.costUsd) || normalized.costUsd < 0) {
    throw new DomainValidationError("delegation_result_cost_invalid");
  }
  return Object.freeze(normalized);
}

function normalizeCanonicalIds(kind, value, code) {
  if (!Array.isArray(value)) throw new DomainValidationError(code);
  return Object.freeze(value.map((id) => assertCanonicalId(kind, id, `${kind}Id`)));
}

function normalizeStringSet(value, code) {
  if (!Array.isArray(value)) throw new DomainValidationError(code);
  const normalized = value.map((entry) => requireText(entry, code, 200));
  return Object.freeze([...new Set(normalized)].sort());
}

function normalizeTextArray(value, code, maxLength) {
  if (!Array.isArray(value)) throw new DomainValidationError(code);
  return Object.freeze(value.map((entry) => requireText(entry, code, maxLength)));
}

function assertDigest(value, code) {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new DomainValidationError(code);
  }
  return value;
}

function assertObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DomainValidationError(code);
  return value;
}

function requireText(value, code, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new DomainValidationError(code);
  }
  return value.trim();
}

function throwIfCancelled(signal) {
  if (signal?.aborted) throw cancelledError();
}

function cancelledError() {
  return new DomainValidationError("delegation_cancelled", "Delegation was cancelled");
}

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      code: typeof error.code === "string" ? error.code : null,
      message: error.message
    };
  }
  return { name: "Error", code: null, message: String(error) };
}
