import assert from "node:assert/strict";
import test from "node:test";
import { DomainValidationError, canonicalDigest } from "../src/index.js";
import {
  DecisionLedger,
  createAgentDecision,
  createCorrectionReceipt,
  createModelGeneration,
  createProviderBudgetReceipt
} from "../src/decision-ledger.js";

const D = (char) => `sha256:${char.repeat(64)}`;
const NOW = "2026-10-16T21:30:00-04:00";

function noActionDecision(overrides = {}) {
  return createAgentDecision({
    decisionId: "decision:fixture-001",
    createdAt: NOW,
    decision: "NO_ACTION",
    inputDigest: D("1"),
    evidenceDigest: D("2"),
    modelGenerationId: "model-gen:fixture-a",
    modelRuntimeDigest: D("3"),
    policyDigest: D("4"),
    confidence: 0.41,
    rationaleSummary: "Evidence is insufficient to propose an action.",
    evidenceRefs: [
      { evidenceId: "evidence:fixture-001", digest: D("5"), epistemicState: "observed" }
    ],
    memoryPolicy: {
      retrospectiveMode: "write_only",
      allowUnverifiedRetrospectiveInFutureContext: false
    },
    requestedEffectClass: null,
    ...overrides
  });
}

test("NO_ACTION is a valid immutable first-class decision", () => {
  const decision = noActionDecision();
  assert.equal(decision.decision, "NO_ACTION");
  assert.equal(decision.memoryPolicy.retrospectiveMode, "write_only");
  assert.equal(Object.isFrozen(decision), true);
  assert.equal(Object.isFrozen(decision.memoryPolicy), true);
  assert.throws(() => {
    decision.decision = "ACTION";
  }, TypeError);
});

test("unverified retrospective memory cannot be enabled", () => {
  assert.throws(() => noActionDecision({
    memoryPolicy: {
      retrospectiveMode: "validated_only",
      allowUnverifiedRetrospectiveInFutureContext: true
    }
  }), (error) => error instanceof DomainValidationError && error.code === "memory_unverified_retrospective_must_be_denied");
});

test("decision ledger is append-only and rejects duplicate external identity", () => {
  const ledger = new DecisionLedger();
  const first = noActionDecision();
  const entry = ledger.appendDecision(first, {
    ledgerEntryId: "ledger:fixture-001",
    externalIdentityKey: "fixture:case-001",
    at: NOW
  });
  assert.equal(entry.sequence, 1);
  assert.equal(entry.appendOnly, true);
  assert.equal(entry.decisionDigest, canonicalDigest(first));

  const second = noActionDecision({ decisionId: "decision:fixture-002" });
  assert.throws(() => ledger.appendDecision(second, {
    ledgerEntryId: "ledger:fixture-002",
    externalIdentityKey: "fixture:case-001",
    at: NOW
  }), (error) => error instanceof DomainValidationError && error.code === "decision_external_identity_duplicate");
});

test("outcome attaches to accepted digest without mutating decision", () => {
  const ledger = new DecisionLedger();
  const decision = noActionDecision();
  const entry = ledger.appendDecision(decision, {
    ledgerEntryId: "ledger:fixture-001",
    externalIdentityKey: "fixture:case-001",
    at: NOW
  });
  const outcome = ledger.appendOutcome(entry.ledgerEntryId, {
    outcomeId: "outcome:fixture-001",
    observedAt: "2026-10-17T09:00:00-04:00",
    sourceDigest: D("6"),
    status: "SUCCEEDED",
    metrics: { effectsExecuted: 0, policyThresholdRespected: true },
    notes: "Abstention remained policy-correct."
  });
  assert.equal(outcome.decisionDigest, entry.decisionDigest);
  assert.equal(ledger.getDecision(decision.decisionId), decision);
  assert.equal(decision.decision, "NO_ACTION");
});

test("corrections append lineage rather than overwrite original artifacts", () => {
  const target = Object.freeze({ schema: "outcome-observation/v1", outcomeId: "outcome:fixture-001", value: "old" });
  const replacement = Object.freeze({ schema: "outcome-observation/v1", outcomeId: "outcome:fixture-001-r2", value: "new" });
  const receipt = createCorrectionReceipt(target, replacement, {
    correctionId: "correction:fixture-001",
    reasonCode: "TIME_CORRECTION",
    reasonSummary: "Timestamp normalized.",
    at: NOW
  });
  assert.equal(receipt.targetArtifactDigest, canonicalDigest(target));
  assert.equal(receipt.replacementDigest, canonicalDigest(replacement));
  assert.equal(receipt.doesNotOverwriteOriginal, true);
  assert.equal(target.value, "old");
});

test("model generations never inherit an earlier scorecard implicitly", () => {
  const generation = createModelGeneration({
    modelGenerationId: "model-gen:fixture-b",
    createdAt: NOW,
    modelProvider: "fixture-provider",
    modelName: "fixture-model-b",
    runtimeDigest: D("7"),
    promptPolicyDigest: D("8"),
    toolsetDigest: D("9"),
    baselineGenerationId: "model-gen:fixture-a",
    baselineCompatibilityDigest: D("a")
  });
  assert.equal(generation.inheritsScorecard, false);
  assert.equal(generation.baselineGenerationId, "model-gen:fixture-a");
});

test("provider budgets fail closed when call or cost limits are exceeded", () => {
  const within = createProviderBudgetReceipt({
    receiptId: "budget:within",
    runId: "run:fixture-001",
    createdAt: NOW,
    provider: "fixture-provider",
    callCount: 3,
    callLimit: 10,
    costObserved: 0.03,
    costLimit: 0.25
  });
  assert.equal(within.budgetStatus, "WITHIN_BUDGET");

  const callsExceeded = createProviderBudgetReceipt({
    receiptId: "budget:calls-exceeded",
    runId: "run:fixture-002",
    createdAt: NOW,
    provider: "fixture-provider",
    callCount: 11,
    callLimit: 10,
    costObserved: 0.03,
    costLimit: 0.25
  });
  assert.equal(callsExceeded.budgetStatus, "BUDGET_EXCEEDED");

  const costExceeded = createProviderBudgetReceipt({
    receiptId: "budget:cost-exceeded",
    runId: "run:fixture-003",
    createdAt: NOW,
    provider: "fixture-provider",
    callCount: 3,
    callLimit: 10,
    costObserved: 0.30,
    costLimit: 0.25
  });
  assert.equal(costExceeded.budgetStatus, "BUDGET_EXCEEDED");
});
