import test from "node:test";
import assert from "node:assert/strict";
import { createCapabilitySpec, compileCapability, HARNESS_PROFILES } from "../src/index.js";
import { assessCapabilityDrift, createReverificationPlan } from "../src/drift.js";

function capability(overrides = {}) {
  const base = {
    id: "capability_00000000-0000-4000-8000-000000000055",
    kind: "skill",
    version: "1.0.0",
    metadata: {
      name: "Drift Probe",
      slug: "drift-probe",
      description: "Detect governed drift.",
      triggers: ["review drift"],
      tags: ["drift"]
    },
    contract: { inputs: [{ name: "input" }], outputs: [{ name: "result" }] },
    execution: { instructions: "Return DRIFT_OK." },
    requirements: { tools: ["Read"], permissions: ["read"], networkPolicy: "deny-by-default" },
    provenance: {
      sourceUrl: "https://github.com/example/drift-source",
      sourceCommit: "abcdef1234567",
      sourceLicense: "MIT",
      sourcePath: "skills/drift/SKILL.md"
    },
    evaluation: { testCases: [{ id: "smoke", input: "Check drift.", expected: "DRIFT_OK" }], qualityThreshold: 1 }
  };
  return createCapabilitySpec({
    ...base,
    ...overrides,
    metadata: { ...base.metadata, ...overrides.metadata },
    contract: { ...base.contract, ...overrides.contract },
    execution: { ...base.execution, ...overrides.execution },
    requirements: { ...base.requirements, ...overrides.requirements },
    provenance: { ...base.provenance, ...overrides.provenance },
    evaluation: { ...base.evaluation, ...overrides.evaluation }
  });
}

test("identical capability and harness state produces no-op drift assessment", () => {
  const previous = capability();
  const current = capability();
  const receipt = compileCapability(previous, "codex").receipt;
  const assessment = assessCapabilityDrift({ previous, current, harnessIds: ["codex"], previousCompilationReceipts: [receipt] });
  assert.equal(assessment.changed, false);
  assert.equal(assessment.decision, "no-op");
  assert.equal(assessment.risk, "none");
  assert.equal(assessment.safeToAutoPromote, false);
  assert.equal(createReverificationPlan(assessment).steps.length, 0);
});

test("upstream commit-only drift requires review without claiming semantic drift", () => {
  const previous = capability();
  const current = capability({ version: "1.0.1", provenance: { sourceCommit: "fedcba7654321" } });
  const assessment = assessCapabilityDrift({ previous, current, harnessIds: ["codex"] });
  assert.equal(assessment.decision, "review");
  assert.equal(assessment.risk, "low");
  assert.deepEqual(assessment.changes.map((change) => change.kind).sort(), ["source_commit", "version"]);
  const plan = createReverificationPlan(assessment);
  assert.deepEqual(plan.steps.map((entry) => entry.id), ["refresh-evidence", "review-nonsemantic-drift", "promote"]);
});

test("instruction drift requires harness re-verification and explicit promotion", () => {
  const previous = capability();
  const current = capability({ version: "2.0.0", execution: { instructions: "Return DRIFT_OK only after validating evidence." } });
  const receipt = compileCapability(previous, "codex").receipt;
  const assessment = assessCapabilityDrift({ previous, current, harnessIds: ["codex"], previousCompilationReceipts: [receipt] });
  assert.equal(assessment.decision, "reverify");
  assert.equal(assessment.risk, "medium");
  assert.ok(assessment.changes.some((change) => change.kind === "instructions"));
  const plan = createReverificationPlan(assessment);
  assert.equal(plan.automaticMutationAllowed, false);
  assert.equal(plan.automaticPromotionAllowed, false);
  assert.ok(plan.steps.some((entry) => entry.id === "compile:codex"));
  assert.ok(plan.steps.some((entry) => entry.id === "verify-artifact:codex"));
  assert.ok(plan.steps.some((entry) => entry.id === "verify-native:codex"));
  assert.equal(plan.steps.at(-1).id, "promote");
});

test("requirements drift is high risk and harness profile drift also forces re-verification", () => {
  const previous = capability();
  const current = capability({ version: "1.1.0", requirements: { permissions: ["read", "write"], networkPolicy: "allow-listed" } });
  const receipt = compileCapability(previous, "codex").receipt;
  const changedProfiles = {
    ...HARNESS_PROFILES,
    codex: Object.freeze({ ...HARNESS_PROFILES.codex, skillBodyMaxBytes: HARNESS_PROFILES.codex.skillBodyMaxBytes + 1 })
  };
  const assessment = assessCapabilityDrift({
    previous,
    current,
    harnessIds: ["codex"],
    previousCompilationReceipts: [receipt],
    currentProfiles: changedProfiles
  });
  assert.equal(assessment.decision, "reverify");
  assert.equal(assessment.risk, "high");
  assert.equal(assessment.harnesses[0].profileChanged, true);
  assert.ok(assessment.changes.some((change) => change.kind === "requirements"));
});

test("source identity or license drift blocks promotion pending clean-room review", () => {
  const previous = capability();
  const current = capability({
    version: "2.0.0",
    provenance: { sourceUrl: "https://github.com/other/source", sourceLicense: "Custom-Restricted", sourceCommit: "fedcba7654321" }
  });
  const assessment = assessCapabilityDrift({ previous, current, harnessIds: ["codex"] });
  assert.equal(assessment.decision, "blocked");
  assert.equal(assessment.risk, "critical");
  assert.equal(assessment.cleanRoomReviewRequired, true);
  assert.equal(assessment.safeToAutoPromote, false);
  const plan = createReverificationPlan(assessment);
  assert.equal(plan.blocked, true);
  assert.ok(plan.steps.some((entry) => entry.id === "review-provenance-license"));
  assert.equal(plan.steps.at(-1).id, "promote");
});

test("unknown harness fails closed", () => {
  assert.throws(
    () => assessCapabilityDrift({ previous: capability(), current: capability(), harnessIds: ["unknown-harness"] }),
    { code: "capability_drift_harness_unknown" }
  );
});
