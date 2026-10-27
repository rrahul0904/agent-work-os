import test from "node:test";
import assert from "node:assert/strict";
import { planInference, createLocalRequestGate } from "../src/index.js";

const now = 1_920_000_000_000;
const lane = (options = {}) => ({
  id: "local-qwen", type: "local_machine", model: "qwen-local", protocol: "chat_completions",
  health: "ready", verifiedAtMs: now - 1000, maxContextTokens: 8192, tools: false,
  permitsPrivate: true, region: "local", runtimeRevision: "vllm-example-test", priority: 0, ...options
});
const request = (options = {}) => ({ protocol: "chat_completions", privacy: "private", tools: false, contextTokens: 400, ...options });
const policy = (options = {}) => ({
  allowedLaneTypes: ["local_machine", "approved_remote"],
  allowedModels: ["qwen-local"], allowedRegions: ["local"], maxHealthAgeMs: 60_000,
  ...options
});
const plan = (lanes = [lane()], req = request(), rules = policy()) => planInference({ lanes, request: req, policy: rules, nowMs: now });

test("returns stable hash with matching canonical route, no execution grant", () => {
  const first = plan();
  assert.equal(first.status, "eligible");
  assert.equal(first.selected.laneId, "local-qwen");
  assert.equal(first.executionAuthorized, false);
  assert.match(first.digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(plan(), first);
  assert.notEqual(plan([lane({ runtimeRevision: "changed" })]).digest, first.digest);
  assert.notEqual(plan([lane({ health: "unavailable" })]).digest, first.digest);
});

test("blocks all unapproved remote fallbacks for private-code content", () => {
  const result = plan([
    lane({ id: "local", health: "down" }),
    lane({ id: "hosted", type: "approved_remote", region: "remote", permitsPrivate: false })
  ]);
  assert.equal(result.status, "refused");
  assert.equal(result.selected, null);
  assert.ok(result.rejected.find((item) => item.laneId === "hosted").reasons.includes("PRIVATE_DATA_NOT_APPROVED"));
});

test("private approval never defeats restricted local-only residency", () => {
  const result = plan([lane({ id: "hosted", type: "approved_remote", permitsPrivate: true })], request({ privacy: "restricted" }));
  assert.equal(result.status, "refused");
  assert.ok(result.rejected[0].reasons.includes("RESTRICTED_LOCAL_ONLY"));
});

test("rejects stale or unknown readiness, protocol mismatch, missing tools, inadequate context", () => {
  const options = { id: "insufficient", verifiedAtMs: now - 120_000, protocol: "messages", maxContextTokens: 128, tools: false };
  const result = plan([lane(options)], request({ tools: true }));
  assert.equal(result.status, "refused");
  assert.deepEqual(result.rejected[0].reasons.sort(), [
    "CONTEXT_LIMIT_UNVERIFIED", "HEALTH_STALE_OR_UNKNOWN", "PROTOCOL_INCOMPATIBLE", "TOOLS_UNSUPPORTED"
  ].sort());
});

test("requires measured cost when policy imposes hard budget", () => {
  const unknown = plan([lane()], request(), policy({ maxCostUsd: 0.1 }));
  assert.ok(unknown.rejected[0].reasons.includes("COST_UNKNOWN_OR_OVER_BUDGET"));
  const tooExpensive = plan([lane({ estimatedCostUsd: 0.2 })], request(), policy({ maxCostUsd: 0.1 }));
  assert.equal(tooExpensive.status, "refused");
  const affordable = plan([lane({ estimatedCostUsd: 0.05 })], request(), policy({ maxCostUsd: 0.1 }));
  assert.equal(affordable.status, "eligible");
});

test("deterministic priority ordering across swapped lane order", () => {
  const a = lane({ id: "a", priority: 10 });
  const b = lane({ id: "b", priority: 5 });
  const first = plan([a, b]);
  const second = plan([b, a]);
  assert.equal(first.selected.laneId, "b");
  assert.equal(first.digest, second.digest);
});

test("never admits unknown privacy/protocol/context and duplicate lane IDs", () => {
  assert.throws(() => plan([lane()], request({ privacy: undefined })), /INFERENCE_PRIVACY_REQUIRED/);
  assert.throws(() => plan([lane()], request({ protocol: "responses" })), /INFERENCE_PROTOCOL_UNSUPPORTED/);
  assert.throws(() => plan([lane()], request({ contextTokens: NaN })), /INFERENCE_CONTEXT_ESTIMATE_REQUIRED/);
  assert.throws(() => plan([lane(), lane()]), /INFERENCE_LANE_ID_INVALID/);
});

test("local per-minute quota rejects overflow and expires by sliding window", () => {
  let t = now;
  const gate = createLocalRequestGate({ requestsPerMinute: 2, maxConcurrent: 2, clock: () => t });
  const releaseA = gate.admit();
  const releaseB = gate.admit();
  assert.throws(() => gate.admit(), /MODEL_CHAT_RATE_QUOTA_EXCEEDED/);
  releaseA(); releaseA(); releaseB();
  assert.equal(gate.snapshot().active, 0);
  t += 60_001;
  assert.equal(typeof gate.admit(), "function");
});

test("separate concurrent limit; release exactly once, reject impossible limits", () => {
  const gate = createLocalRequestGate({ requestsPerMinute: 9, maxConcurrent: 1 });
  const release = gate.admit();
  assert.throws(() => gate.admit(), /MODEL_CHAT_CONCURRENCY_QUOTA_EXCEEDED/);
  release();release();
  assert.equal(gate.snapshot().active, 0);
  assert.equal(typeof gate.admit(), "function");
  assert.throws(() => createLocalRequestGate({ requestsPerMinute: 0 }), /INFERENCE_QUOTA_CONFIG_INVALID/);
  assert.throws(() => createLocalRequestGate({ maxConcurrent: 900 }), /INFERENCE_QUOTA_CONFIG_INVALID/);
});
