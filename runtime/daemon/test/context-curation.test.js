import assert from "node:assert/strict";
import test from "node:test";
import { curateProjectContext } from "../src/context-curation.js";

function snapshot(overrides = {}) {
  return {
    schemaVersion: "project-context/v1",
    projectId: "alpha",
    revision: "r1",
    updatedAt: "2026-10-01T00:00:00.000Z",
    summary: "Current bounded truth.",
    decisions: [{ id: "D001", topic: "storage", status: "active", statement: "Keep private context outside the source repository." }],
    activeDesign: { id: "context-spine", title: "Context spine", successCriteria: ["Receipts bind every dispatch."], unknowns: [] },
    evidenceRefs: ["github:issue-79"],
    ...overrides,
  };
}

test("fresh bounded context passes curation deterministically", () => {
  const options = { now: "2026-10-08T00:00:00.000Z", staleAfterDays: 45, maxCanonicalChars: 24000 };
  const one = curateProjectContext(snapshot(), options);
  const two = curateProjectContext(snapshot(), options);
  assert.equal(one.status, "PASS");
  assert.equal(one.counts.errors, 0);
  assert.equal(one.counts.warnings, 0);
  assert.equal(one.reportDigest, two.reportDigest);
});

test("stale and oversized context requires review", () => {
  const report = curateProjectContext(snapshot({ updatedAt: "2026-01-01T00:00:00.000Z", summary: "x".repeat(4000) }), {
    now: "2026-10-08T00:00:00.000Z",
    staleAfterDays: 30,
    maxCanonicalChars: 1024,
  });
  assert.equal(report.status, "REVIEW");
  assert.ok(report.findings.some((item) => item.code === "STALE_CONTEXT"));
  assert.ok(report.findings.some((item) => item.code === "OVERSIZED_CONTEXT"));
});

test("conflicting active decisions block dispatch review", () => {
  const report = curateProjectContext(snapshot({
    decisions: [
      { id: "D001", topic: "storage", status: "active", statement: "Keep context local." },
      { id: "D002", topic: "storage", status: "active", statement: "Store context in the hosted control plane." },
    ],
  }), { now: "2026-10-08T00:00:00.000Z" });
  assert.equal(report.status, "BLOCK");
  const conflict = report.findings.find((item) => item.code === "CONFLICTING_ACTIVE_DECISIONS");
  assert.deepEqual(conflict.refs, ["D001", "D002"]);
});

test("missing evidence and design are explicit findings", () => {
  const report = curateProjectContext(snapshot({ activeDesign: null, evidenceRefs: [] }), { now: "2026-10-08T00:00:00.000Z" });
  assert.equal(report.status, "REVIEW");
  assert.ok(report.findings.some((item) => item.code === "NO_ACTIVE_DESIGN"));
  assert.ok(report.findings.some((item) => item.code === "NO_EVIDENCE_REFS"));
});
