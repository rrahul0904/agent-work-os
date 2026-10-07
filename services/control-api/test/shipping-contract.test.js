import test from "node:test";
import assert from "node:assert/strict";
import { digestShippingContract, validateShippingContract } from "../src/shipping-contract.js";

function contract() {
  return {
    version: "shipping-contract/v1",
    project: { id: "demo", repoPath: "/tmp/demo" },
    release: { version: "0.1.0" },
    worktree: { baseRef: "HEAD", cleanupOnSuccess: false },
    builder: { command: { name: "build", command: "true" }, repairCommand: { name: "repair", command: "true" }, maxRepairAttempts: 2 },
    verification: [{ name: "test", command: "true" }],
    preview: { required: true, deployCommand: { command: "true" }, uat: [{ command: "true" }] },
    production: { required: true, deployCommand: { command: "true" }, uat: [{ command: "true" }] },
    exactSha: { required: true, testedShaCommand: { command: "git rev-parse HEAD" }, deployedShaCommand: { command: "git rev-parse HEAD" } },
    goldenPath: [{ id: "FLOW-1", description: "primary flow works" }],
    excludedFromRelease: ["billing"]
  };
}

test("valid shipping contract has stable digest", () => {
  const input = contract();
  assert.deepEqual(validateShippingContract(input), { valid: true, errors: [] });
  assert.equal(digestShippingContract(input), digestShippingContract(structuredClone(input)));
});

test("unknown fields and weak release definitions fail closed", () => {
  const input = contract();
  input.percentageComplete = 99;
  input.builder.maxRepairAttempts = 99;
  const result = validateShippingContract(input);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("shipping_contract_unknown_field:percentageComplete"));
  assert.ok(result.errors.includes("shipping_contract_repair_attempts_invalid"));
});
