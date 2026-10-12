import test from "node:test";
import assert from "node:assert/strict";
import {
  RE_PROVIDER_VERSION,
  RE_TOOL_VERSION,
  RE_REQUEST_VERSION,
  RE_POLICY_VERSION,
  digestReverseEngineeringProvider,
  digestReverseEngineeringTool,
  digestReverseEngineeringRequest,
  planReverseEngineering,
  createReverseEngineeringGrant,
  validateGrantBinding,
  createReverseEngineeringReceipt
} from "../src/reverse-engineering.js";

const D = (c) => `sha256:${c.repeat(64)}`;

function fixture() {
  const provider = {
    version: RE_PROVIDER_VERSION,
    id: "rea-local",
    kind: "mcp-reverse-engineering",
    transport: "stdio",
    productVersion: "6.4.0",
    revision: "a56f7bb668ab23fec8d33f7af353ac7ed2fe1895",
    locality: "local",
    host: { platform: "darwin", arch: "arm64" },
    catalogDigest: D("a"),
    schemaDigest: D("b"),
    effectsDigest: D("c"),
    capabilities: ["javascript-analysis", "retained-evidence"],
    availability: { state: "ready", observedAt: "2026-10-12T06:00:00Z" },
    configurationRef: "config:rea-local"
  };
  const tool = {
    version: RE_TOOL_VERSION,
    providerId: "rea-local",
    name: "javascript.analyze",
    inputSchemaDigest: D("d"),
    outputSchemaDigest: D("e"),
    effects: {
      mutatesTarget: false,
      mutatesSession: false,
      writesFilesystem: false,
      launchesProcess: true,
      accessesNetwork: false,
      changesUiState: false,
      mayDiscardData: false,
      idempotent: true
    },
    targetClasses: ["javascript-source"],
    requiredCapabilities: ["javascript-analysis", "retained-evidence"],
    evidenceContract: "rea-evidence/v1",
    resourceLimits: { timeoutMs: 30_000, maxOutputBytes: 1_000_000 }
  };
  const request = {
    version: RE_REQUEST_VERSION,
    projectId: "agent-work-os",
    workId: "issue-88",
    taskId: "phase-a-fixture",
    runId: "run-001",
    providerId: "rea-local",
    toolName: "javascript.analyze",
    target: { ref: "/workspace/fixtures/app.js", class: "javascript-source", digest: D("f") },
    args: { mode: "static", selectedView: "summary" },
    outputBudget: { maxReturnedBytes: 64_000, maxRetainedBytes: 2_000_000 },
    purpose: "inspect source-owned fixture",
    policyRef: "policy:read-only-local"
  };
  const policy = {
    version: RE_POLICY_VERSION,
    allowedEffects: ["launchesProcess"],
    maxProviderAgeMs: 3_600_000,
    allowedTargetPrefixes: ["/workspace/fixtures/"]
  };
  return { provider, tool, request, policy };
}

test("contract digests are stable", () => {
  const { provider, tool, request } = fixture();
  assert.equal(digestReverseEngineeringProvider(provider), digestReverseEngineeringProvider(structuredClone(provider)));
  assert.equal(digestReverseEngineeringTool(tool), digestReverseEngineeringTool(structuredClone(tool)));
  assert.equal(digestReverseEngineeringRequest(request), digestReverseEngineeringRequest(structuredClone(request)));
});

test("read-only fixture produces a deterministic ready plan", () => {
  const { provider, tool, request, policy } = fixture();
  const first = planReverseEngineering({ provider, tool, request, policy, asOf: "2026-10-12T06:30:00Z" });
  const second = planReverseEngineering({ provider, tool, request, policy, asOf: "2026-10-12T06:30:00Z" });
  assert.equal(first.status, "ready");
  assert.deepEqual(first.requiredEffects, ["launchesProcess"]);
  assert.equal(first.digest, second.digest);
});

test("plan refuses disallowed mutation and stale provider state", () => {
  const { provider, tool, request, policy } = fixture();
  tool.effects.mutatesTarget = true;
  provider.availability.observedAt = "2026-10-12T04:00:00Z";
  const plan = planReverseEngineering({ provider, tool, request, policy, asOf: "2026-10-12T06:30:00Z" });
  assert.equal(plan.status, "refused");
  assert.ok(plan.reasons.includes("effect_not_allowed:mutatesTarget"));
  assert.ok(plan.reasons.includes("provider_availability_stale"));
});

test("grant binds exact provider tool request target and effects", () => {
  const { provider, tool, request, policy } = fixture();
  const plan = planReverseEngineering({ provider, tool, request, policy, asOf: "2026-10-12T06:30:00Z" });
  const grant = createReverseEngineeringGrant({ plan, provider, tool, request, policy, approvedEffects: ["launchesProcess"], executionId: "exec-001", expiresAt: "2026-10-12T07:00:00Z" });
  assert.equal(validateGrantBinding({ grant, provider, tool, request, asOf: "2026-10-12T06:45:00Z" }).valid, true);
  const driftedTool = structuredClone(tool);
  driftedTool.outputSchemaDigest = D("9");
  const drift = validateGrantBinding({ grant, provider, tool: driftedTool, request, asOf: "2026-10-12T06:45:00Z" });
  assert.equal(drift.valid, false);
  assert.ok(drift.errors.includes("tool_drift"));
});

test("grant cannot widen approved effects", () => {
  const { provider, tool, request, policy } = fixture();
  const plan = planReverseEngineering({ provider, tool, request, policy, asOf: "2026-10-12T06:30:00Z" });
  assert.throws(() => createReverseEngineeringGrant({ plan, provider, tool, request, policy, approvedEffects: ["launchesProcess", "accessesNetwork"], executionId: "exec-002", expiresAt: "2026-10-12T07:00:00Z" }), /effects_widened_or_missing/);
});

test("request rejects raw secret-shaped arguments", () => {
  const { request } = fixture();
  request.args = { apiKey: "sk-test-do-not-store" };
  assert.throws(() => digestReverseEngineeringRequest(request), /secret_literal_forbidden/);
});

test("receipt preserves partial coverage and cleanup truth", () => {
  const { provider, tool, request, policy } = fixture();
  const plan = planReverseEngineering({ provider, tool, request, policy, asOf: "2026-10-12T06:30:00Z" });
  const grant = createReverseEngineeringGrant({ plan, provider, tool, request, policy, approvedEffects: ["launchesProcess"], executionId: "exec-003", expiresAt: "2026-10-12T07:00:00Z" });
  const receipt = createReverseEngineeringReceipt({
    grant, provider, tool, request,
    startedAt: "2026-10-12T06:40:00Z",
    endedAt: "2026-10-12T06:41:00Z",
    outcome: "interrupted",
    cancellation: "unconfirmed",
    cleanup: "incomplete",
    evidence: [{ id: "ev-1", digest: D("8"), ref: "evidence://ev-1" }],
    coverage: { state: "partial", limitations: ["analysis stopped before completion"], unknowns: ["remaining call graph"] },
    result: { returnedBytes: 1024, retainedBytes: 4096, truncated: true }
  });
  assert.equal(receipt.outcome, "interrupted");
  assert.equal(receipt.cancellation, "unconfirmed");
  assert.equal(receipt.cleanup, "incomplete");
});

test("truncated result cannot claim complete coverage", () => {
  const { provider, tool, request, policy } = fixture();
  const plan = planReverseEngineering({ provider, tool, request, policy, asOf: "2026-10-12T06:30:00Z" });
  const grant = createReverseEngineeringGrant({ plan, provider, tool, request, policy, approvedEffects: ["launchesProcess"], executionId: "exec-004", expiresAt: "2026-10-12T07:00:00Z" });
  assert.throws(() => createReverseEngineeringReceipt({
    grant, provider, tool, request,
    startedAt: "2026-10-12T06:40:00Z",
    endedAt: "2026-10-12T06:41:00Z",
    outcome: "succeeded",
    cancellation: "not_requested",
    cleanup: "complete",
    evidence: [{ id: "ev-2", digest: D("7") }],
    coverage: { state: "complete", limitations: [], unknowns: [] },
    result: { returnedBytes: 1000, retainedBytes: 2000, truncated: true }
  }), /truncated_complete_forbidden/);
});
