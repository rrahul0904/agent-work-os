import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConsultationPlan,
  createConsultationReceipt,
  createVerificationReceipt,
  normalizeBinding,
  normalizeCouncil,
  normalizeObservation,
  normalizePersona,
  normalizeSessionLineage,
  projectAlerts,
  reconcileConsultationsAfterRestart
} from "../src/review-council.js";

const PERSONA = {
  id: "persona-security",
  name: "Security reviewer",
  focus: "Authentication, authorization and secret handling",
  instructions: "Review the transcript for concrete security risks. Cite the message ids that support every claim.",
  capabilities: ["transcript:read", "repository:read"]
};

const BINDING = {
  id: "binding-security-codex",
  personaId: PERSONA.id,
  provider: "codex",
  model: "gpt-5.6-sol"
};

const COUNCIL = {
  id: "council-1",
  name: "Release review",
  bindingIds: [BINDING.id],
  perObserverTokenBudget: 4_000,
  consultationTokenBudget: 8_000
};

const TRANSCRIPT = [
  { id: "m1", role: "human", text: "Please add the protected write endpoint." },
  { id: "m2", role: "assistant", text: "I added an authorization check before the mutation." }
];

const LINEAGE = [
  { sessionId: "root", parentSessionId: null, provider: "codex", agent: "builder" },
  { sessionId: "child", parentSessionId: "root", provider: "claude", agent: "test-reviewer" }
];

test("persona capabilities are strictly read-only and auto review requires explicit opt-in", () => {
  assert.deepEqual(normalizePersona(PERSONA).capabilities, ["transcript:read", "repository:read"]);
  assert.equal(normalizeBinding(BINDING).provider, "codex");
  assert.equal(normalizeCouncil(COUNCIL).mode, "manual");

  assert.throws(
    () => normalizePersona({ ...PERSONA, capabilities: ["repository:write"] }),
    /persona_capability_not_read_only/
  );
  assert.throws(
    () => normalizeCouncil({ ...COUNCIL, mode: "auto" }),
    /council_auto_requires_opt_in/
  );
  assert.equal(normalizeCouncil({ ...COUNCIL, mode: "auto", autoReviewOptIn: true }).mode, "auto");
});

test("session lineage exposes parent/subagent depth and rejects missing parents or cycles", () => {
  const lineage = normalizeSessionLineage(LINEAGE);
  assert.deepEqual(lineage.map(({ sessionId, rootSessionId, depth }) => ({ sessionId, rootSessionId, depth })), [
    { sessionId: "root", rootSessionId: "root", depth: 0 },
    { sessionId: "child", rootSessionId: "root", depth: 1 }
  ]);

  assert.throws(
    () => normalizeSessionLineage([{ sessionId: "child", parentSessionId: "missing", provider: "claude", agent: "reviewer" }]),
    /lineage_parent_missing/
  );
  assert.throws(
    () => normalizeSessionLineage([
      { sessionId: "a", parentSessionId: "b", provider: "claude", agent: "a" },
      { sessionId: "b", parentSessionId: "a", provider: "codex", agent: "b" }
    ]),
    /lineage_cycle_detected/
  );
});

test("consultation planning is deterministic, transcript-scoped and budget gated", () => {
  const input = {
    council: COUNCIL,
    bindings: [BINDING],
    personas: [PERSONA],
    transcript: TRANSCRIPT,
    lineage: LINEAGE
  };
  const first = buildConsultationPlan(input);
  const second = buildConsultationPlan(input);
  assert.equal(first.planDigest, second.planDigest);
  assert.equal(first.observers.length, 1);
  assert.equal(first.lineage.find((item) => item.sessionId === "child").depth, 1);
  assert.ok(first.estimatedTotalInputTokens > 0);

  assert.throws(
    () => buildConsultationPlan({
      ...input,
      council: { ...COUNCIL, perObserverTokenBudget: 128, consultationTokenBudget: 128 }
    }),
    /consultation_observer_budget_exceeded/
  );
});

test("agreement raises an alert but never becomes verification", () => {
  const shared = {
    consultationId: "consult-1",
    sessionId: "root",
    title: "Authorization gap",
    claim: "The write endpoint lacks an authorization check.",
    severity: 4,
    confidence: 0.9,
    sourceAnchors: ["m2"]
  };
  const one = normalizeObservation({ ...shared, observerId: "observer-1" });
  const two = normalizeObservation({ ...shared, observerId: "observer-2", confidence: 0.7 });
  const [cluster] = projectAlerts([one, two], { alertThreshold: 3 });

  assert.equal(cluster.observerCount, 2);
  assert.equal(cluster.alert, true);
  assert.equal(cluster.requiresIndependentVerification, true);
  assert.equal(cluster.verified, false);
});

test("an observer cannot certify its own claim and evidence is required for decisive verification", () => {
  const observation = normalizeObservation({
    consultationId: "consult-2",
    observerId: "observer-security",
    sessionId: "root",
    title: "Replay risk",
    claim: "The approval token can be replayed.",
    severity: 5,
    confidence: 0.95,
    sourceAnchors: ["m2"]
  });

  assert.throws(
    () => createVerificationReceipt(observation, { verifierId: "observer-security", status: "verified", evidenceRefs: ["test:replay"] }),
    /verification_self_certification_forbidden/
  );
  assert.throws(
    () => createVerificationReceipt(observation, { verifierId: "independent-verifier", status: "rejected" }),
    /verification_evidence_required/
  );

  const receipt = createVerificationReceipt(observation, {
    verifierId: "independent-verifier",
    status: "verified",
    evidenceRefs: ["test:replay-rejected"],
    verifiedAt: "2026-10-05T20:00:00.000Z"
  });
  assert.equal(receipt.status, "verified");
  assert.equal(receipt.observationDigest, observation.observationDigest);
});

test("restart reconciliation never promotes queued or running consultation work to success", () => {
  const planDigest = "a".repeat(64);
  const queued = createConsultationReceipt({
    id: "consult-queued",
    planDigest,
    status: "queued",
    createdAt: "2026-10-05T20:00:00.000Z"
  });
  const running = createConsultationReceipt({
    id: "consult-running",
    planDigest,
    status: "running",
    createdAt: "2026-10-05T20:00:00.000Z"
  });
  const completed = createConsultationReceipt({
    id: "consult-completed",
    planDigest,
    status: "completed",
    createdAt: "2026-10-05T20:00:00.000Z"
  });

  const reconciled = reconcileConsultationsAfterRestart(
    [queued, running, completed],
    "2026-10-05T21:00:00.000Z"
  );
  assert.deepEqual(reconciled.map((item) => item.status), ["interrupted", "interrupted", "completed"]);
});
