import assert from "node:assert/strict";
import test from "node:test";
import {
  DeterministicDelegationScheduler,
  assertEffectAttenuation,
  compactDelegationResults,
  createAgentDefinition,
  createContextPack,
  createDelegationResult,
  createDelegationRun
} from "../src/delegation.js";
import { DomainValidationError, createCanonicalId } from "../src/index.js";

function ids() {
  return {
    taskId: createCanonicalId("task"),
    agentId: createCanonicalId("agent"),
    grantId: createCanonicalId("grant"),
    contextId: createCanonicalId("context"),
    evidenceId: createCanonicalId("evidence"),
    artifactId: createCanonicalId("artifact")
  };
}

test("agent definitions and context packs are narrow, normalized, and digest-bound", () => {
  const values = ids();
  const agent = createAgentDefinition({
    id: values.agentId,
    provider: "codex",
    role: "repo_explorer",
    capabilities: ["repo.read", "web.docs", "repo.read"],
    effects: [],
    contextPolicy: { maxInputTokens: 12_000, includeParentHistory: false }
  });

  assert.deepEqual(agent.capabilities, ["repo.read", "web.docs"]);
  assert.equal(agent.contextPolicy.includeParentHistory, false);

  const pack = createContextPack({
    id: values.contextId,
    taskId: values.taskId,
    objective: "Map the execution path without editing files.",
    constraints: ["Read-only"],
    evidenceIds: [values.evidenceId],
    allowedCapabilities: ["repo.read"],
    allowedEffects: [],
    exclusions: ["Do not include the full parent transcript"]
  });

  assert.match(pack.digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(pack.taskId, values.taskId);
  assert.deepEqual(pack.allowedEffects, []);
});

test("child effects must be authorized by both parent and task grants", () => {
  assert.deepEqual(
    assertEffectAttenuation({
      parentEffects: ["repo.read", "repo.write"],
      taskEffects: ["repo.read"],
      childEffects: ["repo.read"]
    }),
    ["repo.read"]
  );

  assert.throws(
    () => assertEffectAttenuation({
      parentEffects: ["repo.read", "repo.write"],
      taskEffects: ["repo.read"],
      childEffects: ["repo.write"]
    }),
    (error) => error instanceof DomainValidationError && error.code === "delegation_effect_escalation"
  );
});

test("delegation runs bind agent, context, grant, attempt, and parent relationship", () => {
  const values = ids();
  const pack = createContextPack({
    id: values.contextId,
    taskId: values.taskId,
    objective: "Inspect tests",
    allowedCapabilities: ["tests.read"]
  });

  const parentRunId = createCanonicalId("run");
  const run = createDelegationRun({
    parentRunId,
    taskId: values.taskId,
    agentDefinitionId: values.agentId,
    contextId: values.contextId,
    contextDigest: pack.digest,
    grantId: values.grantId,
    attempt: 2,
    depth: 2
  });

  assert.equal(run.parentRunId, parentRunId);
  assert.equal(run.attempt, 2);
  assert.equal(run.depth, 2);
  assert.equal(run.status, "queued");
});

test("delegation results keep raw logs out of compact supervisor state", () => {
  const values = ids();
  const runId = createCanonicalId("run");
  const result = createDelegationResult({
    runId,
    summary: "The failure is isolated to the retry branch.",
    claims: [{
      text: "Retry state is not persisted before process exit.",
      confidence: 0.9,
      evidenceIds: [values.evidenceId]
    }],
    artifactIds: [values.artifactId],
    usage: { inputTokens: 100, outputTokens: 20, costUsd: 0.01 }
  });

  const [compact] = compactDelegationResults([result]);
  assert.equal(compact.summary, result.summary);
  assert.equal(Object.hasOwn(compact, "usage"), false);
  assert.equal(Object.hasOwn(compact, "rawTranscript"), false);
  assert.match(compact.resultDigest, /^sha256:[0-9a-f]{64}$/);

  assert.throws(
    () => createDelegationResult({ runId, summary: "bad", rawTranscript: "noisy output" }),
    (error) => error instanceof DomainValidationError && error.code === "delegation_result_raw_output_forbidden"
  );
});

test("scheduler enforces concurrency, preserves task order, and records child failures", async () => {
  const scheduler = new DeterministicDelegationScheduler({ maxConcurrency: 2, maxDepth: 3 });
  let active = 0;
  let peak = 0;

  const outcomes = await scheduler.execute({
    tasks: [0, 1, 2, 3, 4],
    depth: 2,
    worker: async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await delay(8 + (4 - value));
      active -= 1;
      if (value === 3) throw new Error("simulated child failure");
      return value * 10;
    }
  });

  assert.equal(peak <= 2, true);
  assert.deepEqual(outcomes.map((entry) => entry.status), [
    "fulfilled", "fulfilled", "fulfilled", "rejected", "fulfilled"
  ]);
  assert.deepEqual(outcomes.filter((entry) => entry.status === "fulfilled").map((entry) => entry.value), [0, 10, 20, 40]);
  assert.equal(outcomes[3].reason.message, "simulated child failure");
});

test("scheduler propagates cancellation instead of treating it as a normal child failure", async () => {
  const scheduler = new DeterministicDelegationScheduler({ maxConcurrency: 2 });
  const controller = new AbortController();
  const execution = scheduler.execute({
    tasks: [1, 2, 3, 4],
    signal: controller.signal,
    worker: async (value, { signal }) => {
      await delay(50, signal);
      return value;
    }
  });

  setTimeout(() => controller.abort(), 5);

  await assert.rejects(
    execution,
    (error) => error instanceof DomainValidationError && error.code === "delegation_cancelled"
  );
});

test("scheduler rejects recursion beyond its configured depth", async () => {
  const scheduler = new DeterministicDelegationScheduler({ maxDepth: 2 });
  await assert.rejects(
    scheduler.execute({ tasks: [1], depth: 3, worker: async () => 1 }),
    (error) => error instanceof DomainValidationError && error.code === "delegation_depth_exceeded"
  );
});

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    if (signal.aborted) {
      clearTimeout(timer);
      reject(new Error("aborted"));
      return;
    }
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    }, { once: true });
  });
}
