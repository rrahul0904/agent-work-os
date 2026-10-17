import test from "node:test";
import assert from "node:assert/strict";
import {
  EvalValidationError,
  createEvalScenario,
  evaluateDeterministicScenario,
  createEvalBaseline,
  compareEvalBaseline
} from "../src/index.js";

function scenario() {
  return createEvalScenario({
    id: "research-os-fixture",
    target: { kind: "research-os", id: "research-os", revision: "phase-b" },
    rules: [
      { id: "verified", path: ["verification", "passed"], operator: "eq", expected: true },
      { id: "no-unsupported", path: ["metrics", "insufficientClaimCount"], operator: "eq", expected: 0 },
      { id: "query-budget", path: ["usage", "queryCount"], operator: "lte", expected: 4 }
    ]
  });
}

test("same deterministic inputs produce the same receipt digest", () => {
  const s = scenario();
  const input = {
    scenario: s,
    facts: { verification: { passed: true }, metrics: { insufficientClaimCount: 0 }, usage: { queryCount: 3 } },
    config: { provider: "fixture" }
  };
  const a = evaluateDeterministicScenario(input);
  const b = evaluateDeterministicScenario(input);
  assert.equal(a.status, "PASSED");
  assert.equal(a.digest, b.digest);
});

test("failed deterministic rule fails the receipt", () => {
  const receipt = evaluateDeterministicScenario({
    scenario: scenario(),
    facts: { verification: { passed: false }, metrics: { insufficientClaimCount: 2 }, usage: { queryCount: 7 } }
  });
  assert.equal(receipt.status, "FAILED");
  assert.equal(receipt.deterministicOutcomes.filter((item) => !item.passed).length, 3);
});

test("secret values are removed before durable digesting", () => {
  const s = createEvalScenario({
    id: "redaction",
    target: { kind: "fixture", id: "fixture" },
    rules: [{ id: "redacted", path: ["message"], operator: "contains", expected: "[REDACTED]" }]
  });
  const receipt = evaluateDeterministicScenario({
    scenario: s,
    facts: { message: "token=super-secret-value" },
    secrets: ["super-secret-value"]
  });
  assert.equal(receipt.status, "PASSED");
  assert.equal(JSON.stringify(receipt).includes("super-secret-value"), false);
});

test("compatible baseline compares without silently changing identity", () => {
  const s = scenario();
  const receipt = evaluateDeterministicScenario({
    scenario: s,
    facts: { verification: { passed: true }, metrics: { insufficientClaimCount: 0 }, usage: { queryCount: 2 } },
    config: { provider: "fixture" }
  });
  const baseline = createEvalBaseline(receipt);
  const comparison = compareEvalBaseline({ baseline, receipt });
  assert.equal(comparison.compatible, true);
  assert.equal(comparison.status, "UNCHANGED");
});

test("scenario or config drift is baseline-incompatible", () => {
  const s = scenario();
  const oldReceipt = evaluateDeterministicScenario({
    scenario: s,
    facts: { verification: { passed: true }, metrics: { insufficientClaimCount: 0 }, usage: { queryCount: 2 } },
    config: { provider: "fixture", revision: "1" }
  });
  const baseline = createEvalBaseline(oldReceipt);
  const newReceipt = evaluateDeterministicScenario({
    scenario: s,
    facts: { verification: { passed: true }, metrics: { insufficientClaimCount: 0 }, usage: { queryCount: 2 } },
    config: { provider: "fixture", revision: "2" }
  });
  const comparison = compareEvalBaseline({ baseline, receipt: newReceipt });
  assert.equal(comparison.compatible, false);
  assert.equal(comparison.status, "INCOMPATIBLE");
});

test("unknown or malformed rule operators fail closed", () => {
  assert.throws(() => createEvalScenario({
    id: "bad",
    target: { kind: "fixture", id: "fixture" },
    rules: [{ path: ["value"], operator: "approximately", expected: 1 }]
  }), (error) => error instanceof EvalValidationError && error.code === "eval_rule_operator_invalid");
});
