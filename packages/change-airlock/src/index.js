import crypto from "node:crypto";

export const CHANGE_AIRLOCK_SCHEMA = "agent-work-os/change-airlock/v1";

export const DEFAULT_CHANGE_AIRLOCK_POLICY = Object.freeze({
  maxChangedFiles: 50,
  maxAddedLines: 1500,
  maxDeletedLines: 1500,
  maxTotalChangedLines: 2500,
  minAssertionDelta: 0,
  blockOnDeletedTestFile: true,
  blockOnBidiControl: true
});

const BIDI_CONTROL = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const TEST_PATH = /(^|\/)(test|tests|__tests__|spec|specs)(\/|$)|(?:^|\/)[^/]+\.(?:test|spec)\.[^/]+$/i;
const ASSERTION = /\b(?:assert(?:\.[A-Za-z_$][\w$]*)?\s*\(|assert\s+(?![=])|assert!\s*\(|assert_(?:eq|ne)!\s*\(|debug_assert(?:_(?:eq|ne))?!\s*\(|expect\s*\(|pytest\.raises\s*\(|REQUIRE\s*\(|CHECK\s*\(|ASSERT_[A-Z0-9_]+\s*\(|EXPECT_[A-Z0-9_]+\s*\(|t\.(?:fatal|fatalf|error|errorf)\s*\()/;

export function analyzeUnifiedDiff(diffText, { policy: policyInput = {}, baseSha = null, headSha = null } = {}) {
  const policy = normalizePolicy(policyInput);
  const parsed = parseUnifiedDiff(String(diffText ?? ""));
  const findings = [];

  if (parsed.deletedTestFiles.length > 0 && policy.blockOnDeletedTestFile) {
    findings.push(finding(
      "AIRLOCK_TEST_FILE_DELETED",
      "blocker",
      `Deleted test files: ${parsed.deletedTestFiles.join(", ")}`,
      { files: parsed.deletedTestFiles }
    ));
  }

  if (parsed.assertionDelta < policy.minAssertionDelta) {
    findings.push(finding(
      "AIRLOCK_ASSERTION_DELTA",
      "blocker",
      `Assertion delta ${parsed.assertionDelta} is below required minimum ${policy.minAssertionDelta}`,
      {
        addedAssertions: parsed.addedAssertions,
        deletedAssertions: parsed.deletedAssertions,
        assertionDelta: parsed.assertionDelta,
        minimum: policy.minAssertionDelta
      }
    ));
  }

  if (parsed.bidiAdditions.length > 0 && policy.blockOnBidiControl) {
    findings.push(finding(
      "AIRLOCK_BIDI_CONTROL_ADDED",
      "blocker",
      "Bidirectional or invisible direction-control Unicode was added to changed source text",
      { locations: parsed.bidiAdditions }
    ));
  }

  if (parsed.changedFiles.length > policy.maxChangedFiles) {
    findings.push(finding(
      "AIRLOCK_CHANGED_FILE_BUDGET",
      "blocker",
      `Changed file count ${parsed.changedFiles.length} exceeds budget ${policy.maxChangedFiles}`,
      { actual: parsed.changedFiles.length, maximum: policy.maxChangedFiles }
    ));
  }

  if (parsed.addedLines > policy.maxAddedLines) {
    findings.push(finding(
      "AIRLOCK_ADDED_LINE_BUDGET",
      "blocker",
      `Added line count ${parsed.addedLines} exceeds budget ${policy.maxAddedLines}`,
      { actual: parsed.addedLines, maximum: policy.maxAddedLines }
    ));
  }

  if (parsed.deletedLines > policy.maxDeletedLines) {
    findings.push(finding(
      "AIRLOCK_DELETED_LINE_BUDGET",
      "blocker",
      `Deleted line count ${parsed.deletedLines} exceeds budget ${policy.maxDeletedLines}`,
      { actual: parsed.deletedLines, maximum: policy.maxDeletedLines }
    ));
  }

  if (parsed.totalChangedLines > policy.maxTotalChangedLines) {
    findings.push(finding(
      "AIRLOCK_TOTAL_LINE_BUDGET",
      "blocker",
      `Total changed line count ${parsed.totalChangedLines} exceeds budget ${policy.maxTotalChangedLines}`,
      { actual: parsed.totalChangedLines, maximum: policy.maxTotalChangedLines }
    ));
  }

  const decision = findings.some((item) => item.severity === "blocker") ? "BLOCK" : "PASS";
  const evidence = {
    schema: CHANGE_AIRLOCK_SCHEMA,
    baseSha,
    headSha,
    diffDigest: sha256(String(diffText ?? "")),
    policy,
    metrics: {
      changedFiles: parsed.changedFiles.length,
      addedLines: parsed.addedLines,
      deletedLines: parsed.deletedLines,
      totalChangedLines: parsed.totalChangedLines,
      addedAssertions: parsed.addedAssertions,
      deletedAssertions: parsed.deletedAssertions,
      assertionDelta: parsed.assertionDelta,
      deletedTestFiles: parsed.deletedTestFiles.length,
      bidiControlAdditions: parsed.bidiAdditions.length
    },
    findings,
    decision
  };

  return {
    ...evidence,
    changedFiles: parsed.changedFiles,
    receiptDigest: sha256(JSON.stringify(evidence))
  };
}

export function parseUnifiedDiff(diffText) {
  const changedFiles = new Set();
  const deletedTestFiles = new Set();
  const bidiAdditions = [];
  let currentFile = null;
  let currentFileDeleted = false;
  let addedLines = 0;
  let deletedLines = 0;
  let addedAssertions = 0;
  let deletedAssertions = 0;

  for (const rawLine of String(diffText ?? "").split(/\r?\n/)) {
    if (rawLine.startsWith("diff --git ")) {
      currentFile = parseDiffPath(rawLine);
      currentFileDeleted = false;
      if (currentFile) changedFiles.add(currentFile);
      continue;
    }
    if (rawLine.startsWith("deleted file mode ")) {
      currentFileDeleted = true;
      if (currentFile && TEST_PATH.test(currentFile)) deletedTestFiles.add(currentFile);
      continue;
    }
    if (rawLine.startsWith("+++ ") || rawLine.startsWith("--- ") || rawLine.startsWith("@@")) continue;

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      const content = rawLine.slice(1);
      addedLines += 1;
      if (isAssertion(content)) addedAssertions += 1;
      if (BIDI_CONTROL.test(content)) {
        bidiAdditions.push({ file: currentFile, line: content });
      }
      continue;
    }

    if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      const content = rawLine.slice(1);
      deletedLines += 1;
      if (isAssertion(content)) deletedAssertions += 1;
    }
  }

  if (currentFileDeleted && currentFile && TEST_PATH.test(currentFile)) deletedTestFiles.add(currentFile);

  return {
    changedFiles: [...changedFiles].sort(),
    deletedTestFiles: [...deletedTestFiles].sort(),
    bidiAdditions,
    addedLines,
    deletedLines,
    totalChangedLines: addedLines + deletedLines,
    addedAssertions,
    deletedAssertions,
    assertionDelta: addedAssertions - deletedAssertions
  };
}

export function normalizePolicy(input = {}) {
  const merged = { ...DEFAULT_CHANGE_AIRLOCK_POLICY, ...input };
  for (const key of ["maxChangedFiles", "maxAddedLines", "maxDeletedLines", "maxTotalChangedLines"]) {
    if (!Number.isInteger(merged[key]) || merged[key] < 0) throw new Error(`invalid_change_airlock_policy:${key}`);
  }
  if (!Number.isInteger(merged.minAssertionDelta)) throw new Error("invalid_change_airlock_policy:minAssertionDelta");
  for (const key of ["blockOnDeletedTestFile", "blockOnBidiControl"]) {
    if (typeof merged[key] !== "boolean") throw new Error(`invalid_change_airlock_policy:${key}`);
  }
  return merged;
}

function parseDiffPath(line) {
  const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
  if (!match) return null;
  return match[2];
}

function isAssertion(line) {
  return ASSERTION.test(line);
}

function finding(ruleId, severity, message, evidence) {
  return { ruleId, severity, message, evidence };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
