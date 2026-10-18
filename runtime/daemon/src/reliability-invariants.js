/**
 * Provider-neutral reliability invariants. Pure planning only: no network, side
 * effects, execution authority, durable locks or persistence.
 * Independently implemented after read-only SandBox source analysis.
 */
const SHA256 = /^[a-f0-9]{64}$/i;
const BUCKETS = ["dead_ends", "established", "experiments", "open_leads"];

function nonempty(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 256) {
    throw new TypeError(label + "_invalid");
  }
  return value;
}

/** A verified flag is a caller assertion, NOT cryptographic attestation. */
export function planArtifactRecovery({ runId, stages, artifacts = {} }) {
  nonempty(runId, "run_id");
  if (!Array.isArray(stages) || stages.length === 0 || stages.length > 128) throw new TypeError("stages_invalid");
  if (!artifacts || typeof artifacts !== "object" || Array.isArray(artifacts)) throw new TypeError("artifacts_invalid");
  const produced = new Map();
  const ids = new Set();
  for (const [index, stage] of stages.entries()) {
    if (!stage || typeof stage !== "object") throw new TypeError("stage_invalid");
    const id = nonempty(stage.id, "stage_id");
    const output = nonempty(stage.output, "output");
    if (ids.has(id) || produced.has(output)) throw new TypeError("duplicate_stage_or_output");
    if (!Array.isArray(stage.requires)) throw new TypeError("requirements_invalid");
    if (stage.requires.includes(output)) throw new TypeError("stage_cyclic_dependency");
    for (const key of stage.requires) {
      nonempty(key, "required_output");
      if (!produced.has(key)) throw new TypeError("missing_or_forward_dependency");
    }
    ids.add(id);
    produced.set(output, { stage, index });
  }
  for (const key of Object.keys(artifacts)) {
    if (!produced.has(key)) throw new TypeError("unexpected_artifact");
    const proof = artifacts[key];
    if (!proof || typeof proof !== "object" || proof.verified !== true ||
        !SHA256.test(proof.sha256 ?? "") || proof.producer !== produced.get(key).stage.id) {
      throw new TypeError("unverified_or_invalid_artifact");
    }
  }
  // Do not regenerate ancestors of downstream artifacts whose prerequisites disappeared.
  for (const stage of stages) {
    if (Object.hasOwn(artifacts, stage.output)) {
      const missing = stage.requires.filter(key => !Object.hasOwn(artifacts, key));
      if (missing.length) return Object.freeze({
        schemaVersion: "1", runId, disposition: "blocked", stageId: stage.id,
        missingDependencies: missing, reason: "orphaned_downstream_artifact"
      });
    }
  }
  for (const stage of stages) {
    if (Object.hasOwn(artifacts, stage.output)) continue;
    const missing = stage.requires.filter(key => !Object.hasOwn(artifacts, key));
    if (missing.length) return Object.freeze({
      schemaVersion: "1", runId, disposition: "blocked", stageId: stage.id,
      missingDependencies: missing, reason: "required_artifact_absent"
    });
    return Object.freeze({
      schemaVersion: "1", runId, disposition: "candidate", stageId: stage.id,
      output: stage.output, reason: "verified_artifact_absent", executionAuthorized: false
    });
  }
  return Object.freeze({ schemaVersion: "1", runId, disposition: "complete", executionAuthorized: false });
}

/** Caller must persist this versioned state with compare-and-swap before external polling. */
export function pinJobResource(state, jobId, resourceId) {
  nonempty(jobId, "job_id");
  if (["__proto__", "constructor", "prototype"].includes(jobId)) throw new TypeError("job_id_invalid");
  nonempty(resourceId, "resource_id");
  if (!state || typeof state !== "object" || Array.isArray(state)) throw new TypeError("affinity_state_invalid");
  const current = Object.hasOwn(state, jobId) ? state[jobId] : undefined;
  if (current !== undefined && current !== resourceId) throw new Error("job_resource_affinity_conflict");
  return Object.freeze({ ...state, [jobId]: resourceId });
}

export function requirePinnedResource(state, jobId, resourceId) {
  nonempty(jobId, "job_id");
  if (["__proto__", "constructor", "prototype"].includes(jobId)) throw new TypeError("job_id_invalid");
  nonempty(resourceId, "resource_id");
  if (!state || typeof state !== "object" || !Object.hasOwn(state, jobId) || state[jobId] !== resourceId) {
    throw new Error("job_resource_affinity_mismatch");
  }
  return resourceId;
}

/**
 * Per-scope, evidence-labelled memory projection.
 * External evidence verification and an append-only event store remain mandatory.
 */
export function mergeResearchMemory(snapshot, delta, { maxItemsPerBucket = 32 } = {}) {
  if (!Number.isInteger(maxItemsPerBucket) || maxItemsPerBucket < 1 || maxItemsPerBucket > 1000) {
    throw new TypeError("memory_limit_invalid");
  }
  if (!snapshot || !delta || typeof snapshot !== "object" || typeof delta !== "object") throw new TypeError("memory_invalid");
  nonempty(snapshot.scopeId, "memory_scope");
  if (snapshot.scopeId !== delta.scopeId) throw new Error("memory_scope_mismatch");
  const result = { schemaVersion: "1", scopeId: snapshot.scopeId };
  for (const bucket of BUCKETS) {
    const existing = snapshot[bucket] ?? [];
    const incoming = delta[bucket] ?? [];
    if (!Array.isArray(existing) || !Array.isArray(incoming)) throw new TypeError("memory_bucket_invalid");
    const merged = new Map();
    for (const item of [...existing, ...incoming]) {
      if (!item || typeof item !== "object") throw new TypeError("memory_item_invalid");
      const statement = nonempty(item.statement, "memory_statement");
      if (!Array.isArray(item.evidenceIds) || item.evidenceIds.some(id => typeof id !== "string" || !id.trim())) {
        throw new TypeError("memory_evidence_ids_invalid");
      }
      if (bucket === "established" && item.evidenceIds.length === 0) throw new TypeError("established_claim_requires_evidence");
      const key = statement.trim().replace(/\s+/g, " ").toLowerCase();
      const earlier = merged.get(key);
      const evidenceIds = [...new Set([...(earlier?.evidenceIds ?? []), ...item.evidenceIds])];
      merged.set(key, { statement, evidenceIds });
    }
    result[bucket] = [...merged.values()].slice(0, maxItemsPerBucket);
    result[bucket + "Overflow"] = Math.max(0, merged.size - maxItemsPerBucket);
  }
  return Object.freeze(result);
}
