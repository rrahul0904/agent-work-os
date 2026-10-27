import { createHash } from "node:crypto";

/**
 * Deterministic, side-effect-free inference route planner.
 * An eligible plan is a proposal, never authorization to execute.
 */
export function planInference({ request, lanes, policy, nowMs = Date.now() }) {
  if (!request || !Array.isArray(lanes) || !policy || !Array.isArray(policy.allowedLaneTypes)) {
    throw new Error("INFERENCE_POLICY_INVALID");
  }
  if (!["public", "private", "restricted"].includes(request.privacy)) throw new Error("INFERENCE_PRIVACY_REQUIRED");
  if (request.protocol !== "chat_completions") throw new Error("INFERENCE_PROTOCOL_UNSUPPORTED");
  if (!Number.isSafeInteger(request.contextTokens) || request.contextTokens < 0) throw new Error("INFERENCE_CONTEXT_ESTIMATE_REQUIRED");
  const rejected = [];
  const eligible = [];
  const seen = new Set();
  for (const lane of lanes) {
    if (!lane || typeof lane.id !== "string" || !lane.id || seen.has(lane.id)) {
      throw new Error("INFERENCE_LANE_ID_INVALID");
    }
    seen.add(lane.id);
    const reasons = [];
    if (!policy.allowedLaneTypes.includes(lane.type)) reasons.push("LANE_TYPE_DENIED");
    if (policy.allowedModels && !policy.allowedModels.includes(lane.model)) reasons.push("MODEL_DENIED");
    if (lane.protocol !== request.protocol) reasons.push("PROTOCOL_INCOMPATIBLE");
    if (lane.health !== "ready" || !Number.isFinite(lane.verifiedAtMs) ||
        lane.verifiedAtMs > nowMs || nowMs - lane.verifiedAtMs > policy.maxHealthAgeMs) {
      reasons.push("HEALTH_STALE_OR_UNKNOWN");
    }
    if (request.contextTokens > lane.maxContextTokens || !Number.isSafeInteger(lane.maxContextTokens)) {
      reasons.push("CONTEXT_LIMIT_UNVERIFIED");
    }
    if (request.tools === true && lane.tools !== true) reasons.push("TOOLS_UNSUPPORTED");
    if (request.privacy !== "public" && lane.permitsPrivate !== true) reasons.push("PRIVATE_DATA_NOT_APPROVED");
    if (request.privacy === "restricted" && lane.type !== "local_machine") reasons.push("RESTRICTED_LOCAL_ONLY");
    if (policy.allowedRegions && !policy.allowedRegions.includes(lane.region)) reasons.push("RESIDENCY_DENIED");
    if (Number.isFinite(policy.maxCostUsd) &&
        (!Number.isFinite(lane.estimatedCostUsd) || lane.estimatedCostUsd > policy.maxCostUsd)) {
      reasons.push("COST_UNKNOWN_OR_OVER_BUDGET");
    }
    if (reasons.length > 0) rejected.push({ laneId: lane.id, reasons });
    else eligible.push({ laneId: lane.id, model: lane.model, type: lane.type, region: lane.region });
  }
  // Caller order is not an authority input: policy priority, then stable lane ID.
  eligible.sort((a, b) => {
    const first = lanes.find((l) => l.id === a.laneId);
    const second = lanes.find((l) => l.id === b.laneId);
    return (first.priority ?? 100) - (second.priority ?? 100) || a.laneId.localeCompare(b.laneId);
  });
  rejected.sort((a, b) => a.laneId.localeCompare(b.laneId));
  const selected = eligible[0] ?? null;
  const canonical = {
    version: "inference-plan/v1",
    request: { protocol: request.protocol, privacy: request.privacy, tools: request.tools === true, contextTokens: request.contextTokens },
    selected, eligible, rejected,
    policy: { allowedLaneTypes: [...policy.allowedLaneTypes].sort(), allowedModels: policy.allowedModels ? [...policy.allowedModels].sort() : null,
      allowedRegions: policy.allowedRegions ? [...policy.allowedRegions].sort() : null,
      maxHealthAgeMs: policy.maxHealthAgeMs, maxCostUsd: policy.maxCostUsd ?? null },
    laneEvidence: lanes.map((l) => ({
      id: l.id, type: l.type, model: l.model, runtimeRevision: l.runtimeRevision ?? null,
      protocol: l.protocol, health: l.health, verifiedAtMs: l.verifiedAtMs,
      maxContextTokens: l.maxContextTokens, tools: l.tools === true, permitsPrivate: l.permitsPrivate === true,
      region: l.region, priority: l.priority ?? 100, estimatedCostUsd: l.estimatedCostUsd ?? null
    })).sort((a, b) => a.id.localeCompare(b.id))
  };
  const digest = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  return { ...canonical, digest, status: selected ? "eligible" : "refused", executionAuthorized: false };
}

/**
 * Process-local admission safety valve. This is explicitly NOT global or durable
 * quota/billing; production needs atomic PostgreSQL/Redis admission in Token Intelligence.
 */
export function createLocalRequestGate({ requestsPerMinute = 30, maxConcurrent = 1, clock = () => Date.now() } = {}) {
  if (!Number.isInteger(requestsPerMinute) || requestsPerMinute < 1 || requestsPerMinute > 600 ||
      !Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 10) {
    throw new Error("INFERENCE_QUOTA_CONFIG_INVALID");
  }
  const times = [];
  let active = 0;
  return {
    admit() {
      const now = clock();
      while (times.length && times[0] <= now - 60_000) times.shift();
      if (times.length >= requestsPerMinute) throw new Error("MODEL_CHAT_RATE_QUOTA_EXCEEDED");
      if (active >= maxConcurrent) throw new Error("MODEL_CHAT_CONCURRENCY_QUOTA_EXCEEDED");
      times.push(now);
      active += 1;
      let released = false;
      return () => { if (!released) { active -= 1; released = true; } };
    },
    snapshot() { return { active, requestCountInWindow: times.length }; }
  };
}
