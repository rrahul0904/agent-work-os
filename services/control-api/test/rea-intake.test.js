import test from "node:test";
import assert from "node:assert/strict";
import { compileReaBacklog, rankReaFindings, validateReaFinding } from "../src/rea-intake.js";

const base = {
  version: "rea-finding/v1",
  sourceUrl: "https://github.com/gymcoach-app/gymcoach",
  sourceIdentity: "gymcoach-app/gymcoach",
  evidence: [{ url: "https://github.com/gymcoach-app/gymcoach/blob/main/docs/loops/evidence.md", claim: "Observed exact-SHA merge gating" }],
  confidence: 5
};
const findings = [
  { ...base, id: "exact-sha", capability: "Exact-SHA merge gate", cleanRoomDecision: "adopt_pattern", value: 5, risk: 1, effort: 2, constraints: ["Do not copy source"] },
  { ...base, id: "branding", capability: "Copy donor branding", cleanRoomDecision: "reject", value: 1, risk: 5, effort: 1 },
  { ...base, id: "journal", capability: "Failure journal", cleanRoomDecision: "adopt_pattern", value: 4, risk: 1, effort: 1 }
];

test("finding requires evidence", () => {
  const bad = { ...findings[0], evidence: [] };
  assert.equal(validateReaFinding(bad).valid, false);
});

test("REA findings rank by value, confidence, risk and effort", () => {
  const ranked = rankReaFindings(findings);
  assert.equal(ranked[0].id, "exact-sha");
  assert.match(ranked[0].evidenceDigest, /^sha256:/);
});

test("backlog only emits clean-room adopt patterns", () => {
  const backlog = compileReaBacklog(findings, { projectId: "agent-work-os" });
  assert.deepEqual(backlog.map((item) => item.id), ["rea-exact-sha", "rea-journal"]);
  assert.ok(backlog.every((item) => item.status === "PROPOSED"));
});
