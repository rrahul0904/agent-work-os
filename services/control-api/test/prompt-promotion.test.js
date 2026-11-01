import test from "node:test";
import assert from "node:assert/strict";
import { createPromptRevision, validatePromptRevision, assessPromptPromotion } from "../../../packages/domain/src/prompt-promotion.js";

const OLD = `sha256:${"a".repeat(64)}`;
const SUITE = `sha256:${"b".repeat(64)}`;
const candidate = createPromptRevision({ promptId: "assistant-routing", revision: "r2", template: "Route {{task}} safely", variables: ["task"], authoredBy: "builder-1" });
const evalReceipt = { version: "prompt-eval-receipt/v1", promptDigest: candidate.digest, suiteDigest: SUITE, runId: "run-123", testedCommit: "f".repeat(40), status: "PASS", regressions: 0, deterministic: true, independent: true };
const approval = { version: "prompt-approval/v1", promptDigest: candidate.digest, suiteDigest: SUITE, expectedCurrentDigest: OLD, approvalId: "approval-42", approvedBy: "inspector-2", decision: "APPROVED" };
const assess = (overrides = {}) => assessPromptPromotion({ candidate, currentDigest: OLD, evalReceipt, approval, ...overrides });

test("immutable version has repeatable digest and rejects mutation", () => {
  assert.equal(candidate.digest, createPromptRevision({ promptId: candidate.promptId, revision: candidate.revision, template: candidate.template, variables: ["task"], authoredBy: candidate.authoredBy }).digest);
  assert.equal(validatePromptRevision(candidate), true);
  assert.equal(validatePromptRevision({ ...candidate, template: "Tampered" }), false);
});

test("valid independent proof permits staging eligibility, but never activates", () => {
  assert.deepEqual(assess().failures, []);
  assert.equal(assess().status, "ELIGIBLE_FOR_STAGED_ACTIVATION");
  assert.equal(assess().activationPerformed, false);
});

test("missing and failed tests fail closed", () => {
  assert.equal(assess({ evalReceipt: null }).status, "BLOCKED");
  assert.equal(assess({ evalReceipt: { ...evalReceipt, status: "FAIL" } }).status, "BLOCKED");
  assert.equal(assess({ evalReceipt: { ...evalReceipt, regressions: 1 } }).status, "BLOCKED");
  assert.equal(assess({ evalReceipt: { ...evalReceipt, independent: false } }).status, "BLOCKED");
});

test("revision changes cannot reuse stale receipts", () => {
  const newer = createPromptRevision({ promptId: "assistant-routing", revision: "r3", template: "Changed", authoredBy: "builder-1" });
  assert.equal(assess({ candidate: newer }).status, "BLOCKED");
});

test("builder cannot approve own changes", () => {
  assert.equal(assess({ approval: { ...approval, approvedBy: "builder-1" } }).status, "BLOCKED");
});

test("stale current revision and mismatched suite fail closed", () => {
  assert.equal(assess({ currentDigest: `sha256:${"c".repeat(64)}` }).status, "BLOCKED");
  assert.equal(assess({ approval: { ...approval, suiteDigest: `sha256:${"c".repeat(64)}` } }).status, "BLOCKED");
});

test("unknown contract versions fail closed", () => {
  assert.equal(assess({ candidate: { ...candidate, version: "prompt-revision/v2" } }).status, "BLOCKED");
  assert.equal(assess({ approval: { ...approval, version: "prompt-approval/v2" } }).status, "BLOCKED");
});

test("duplicate variables and extra candidate fields are invalid", () => {
  assert.throws(() => createPromptRevision({ promptId: "p", revision: "r", template: "t", variables: ["x", "x"], authoredBy: "a" }), /variables_invalid/);
  assert.equal(validatePromptRevision({ ...candidate, sourceCredential: "secret" }), false);
});
