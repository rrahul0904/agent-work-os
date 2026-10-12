import assert from "node:assert/strict";
import test from "node:test";
import { analyzeUnifiedDiff, parseUnifiedDiff } from "../src/index.js";

test("passes a small diff that preserves assertions", () => {
  const diff = [
    "diff --git a/src/math.js b/src/math.js",
    "--- a/src/math.js",
    "+++ b/src/math.js",
    "@@ -1 +1,2 @@",
    " export const add = (a, b) => a + b;",
    "+export const sub = (a, b) => a - b;",
    "diff --git a/test/math.test.js b/test/math.test.js",
    "--- a/test/math.test.js",
    "+++ b/test/math.test.js",
    "@@ -1 +1,2 @@",
    " assert.equal(add(1, 2), 3);",
    "+assert.equal(sub(3, 2), 1);"
  ].join("\n");

  const report = analyzeUnifiedDiff(diff, { baseSha: "a".repeat(40), headSha: "b".repeat(40) });
  assert.equal(report.decision, "PASS");
  assert.equal(report.metrics.assertionDelta, 1);
  assert.equal(report.metrics.changedFiles, 2);
  assert.match(report.receiptDigest, /^[a-f0-9]{64}$/);
});

test("blocks a negative assertion delta", () => {
  const diff = [
    "diff --git a/test/math.test.js b/test/math.test.js",
    "--- a/test/math.test.js",
    "+++ b/test/math.test.js",
    "@@ -1 +0,0 @@",
    "-assert.equal(add(1, 2), 3);"
  ].join("\n");

  const report = analyzeUnifiedDiff(diff);
  assert.equal(report.decision, "BLOCK");
  assert.ok(report.findings.some((item) => item.ruleId === "AIRLOCK_ASSERTION_DELTA"));
});

test("does not count the word assertion as a replacement assertion", () => {
  const diff = [
    "diff --git a/test/math.test.js b/test/math.test.js",
    "--- a/test/math.test.js",
    "+++ b/test/math.test.js",
    "@@ -1 +1 @@",
    "-assert.equal(add(1, 2), 3);",
    "+// assertion removed"
  ].join("\n");

  const report = analyzeUnifiedDiff(diff);
  assert.equal(report.metrics.addedAssertions, 0);
  assert.equal(report.metrics.deletedAssertions, 1);
  assert.equal(report.metrics.assertionDelta, -1);
  assert.equal(report.decision, "BLOCK");
});

test("blocks deleted test files", () => {
  const diff = [
    "diff --git a/tests/unit.test.js b/tests/unit.test.js",
    "deleted file mode 100644",
    "--- a/tests/unit.test.js",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-console.log('fixture');"
  ].join("\n");

  const report = analyzeUnifiedDiff(diff);
  assert.equal(report.decision, "BLOCK");
  assert.ok(report.findings.some((item) => item.ruleId === "AIRLOCK_TEST_FILE_DELETED"));
});

test("blocks newly added bidi control characters", () => {
  const diff = [
    "diff --git a/src/auth.js b/src/auth.js",
    "--- a/src/auth.js",
    "+++ b/src/auth.js",
    "@@ -0,0 +1 @@",
    "+const user = 'admin\u202e';"
  ].join("\n");

  const report = analyzeUnifiedDiff(diff);
  assert.equal(report.decision, "BLOCK");
  assert.ok(report.findings.some((item) => item.ruleId === "AIRLOCK_BIDI_CONTROL_ADDED"));
});

test("enforces changed-file and line budgets", () => {
  const diff = [
    "diff --git a/src/a.js b/src/a.js",
    "--- a/src/a.js",
    "+++ b/src/a.js",
    "@@ -0,0 +1 @@",
    "+a();",
    "diff --git a/src/b.js b/src/b.js",
    "--- a/src/b.js",
    "+++ b/src/b.js",
    "@@ -0,0 +1 @@",
    "+b();"
  ].join("\n");

  const report = analyzeUnifiedDiff(diff, { policy: { maxChangedFiles: 1, maxAddedLines: 1 } });
  assert.equal(report.decision, "BLOCK");
  assert.ok(report.findings.some((item) => item.ruleId === "AIRLOCK_CHANGED_FILE_BUDGET"));
  assert.ok(report.findings.some((item) => item.ruleId === "AIRLOCK_ADDED_LINE_BUDGET"));
});

test("parser produces deterministic sorted changed files", () => {
  const diff = [
    "diff --git a/z.js b/z.js",
    "+one",
    "diff --git a/a.js b/a.js",
    "+two"
  ].join("\n");

  assert.deepEqual(parseUnifiedDiff(diff).changedFiles, ["a.js", "z.js"]);
});
