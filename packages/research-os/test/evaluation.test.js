import test from "node:test";
import assert from "node:assert/strict";
import { createResearchBrief, planResearch } from "../src/index.js";
import {
  createFixtureSearchAdapter,
  collectResearchEvidence,
  verifyObservationClaims
} from "../src/collection.js";
import {
  createResearchEvalBaseline,
  evaluateResearchEvidenceRun
} from "../src/evaluation.js";

function fixtures({ reaClass = "OBSERVED" } = {}) {
  return [
    {
      id: "primary-1",
      sourceUrl: "https://primary.example/research",
      sourceTitle: "Primary research evidence",
      excerpt: "The system produces evidence-bound research receipts.",
      classification: "primary",
      support: "supports",
      reaClass,
      keywords: "agent evaluation evidence research receipts",
      sourceRevision: "primary-r1",
      provenance: { sourceRevision: "primary-r1" }
    },
    {
      id: "independent-1",
      sourceUrl: "https://independent.example/research",
      sourceTitle: "Independent research evaluation",
      excerpt: "Independent testing confirms evidence-bound research receipts.",
      classification: "independent",
      support: "supports",
      reaClass,
      keywords: "agent evaluation evidence research receipts",
      sourceRevision: "independent-r1",
      provenance: { sourceRevision: "independent-r1" }
    }
  ];
}

async function buildRun({ reaClass = "OBSERVED" } = {}) {
  const brief = createResearchBrief({
    question: "How does agent evaluation preserve research evidence?",
    budget: { maxQueries: 3, maxEvidenceItems: 5, maxClaims: 5 },
    successMetrics: { minimumEvidenceItems: 2 }
  });
  const plan = planResearch(brief);
  const adapter = createFixtureSearchAdapter(fixtures({ reaClass }), { id: "fixture-eval", revision: "r1" });
  const collected = await collectResearchEvidence({ brief, plan, searchAdapter: adapter, now: () => "2026-10-17T00:00:00Z" });
  const verification = verifyObservationClaims({
    claims: [{ text: "Research receipts remain evidence-bound.", evidenceIds: ["primary-1", "independent-1"] }],
    ledger: collected.ledger,
    observations: collected.observations
  });
  return { brief, plan, ...collected, verification };
}

test("verified fixture research run produces PASSED agent-eval receipt", async () => {
  const run = await buildRun();
  const evaluated = evaluateResearchEvidenceRun(run);
  assert.equal(evaluated.receipt.status, "PASSED");
  assert.equal(evaluated.facts.verification.insufficientClaimCount, 0);
  assert.equal(evaluated.facts.provenance.missingProviderCount, 0);
  assert.equal(evaluated.facts.citations.missingSpanCount, 0);
});

test("speculative-only evidence fails the research evaluation gate", async () => {
  const run = await buildRun({ reaClass: "HYPOTHESIS" });
  assert.equal(run.verification.passed, false);
  const evaluated = evaluateResearchEvidenceRun(run);
  assert.equal(evaluated.receipt.status, "FAILED");
  assert.equal(evaluated.facts.verification.speculativeOnlyCount, 1);
});

test("research evaluation baseline is replay-compatible for identical run", async () => {
  const run = await buildRun();
  const first = evaluateResearchEvidenceRun(run);
  const baseline = createResearchEvalBaseline(first.receipt);
  const second = evaluateResearchEvidenceRun({ ...run, baseline });
  assert.equal(second.comparison.compatible, true);
  assert.equal(second.comparison.status, "UNCHANGED");
  assert.equal(first.receipt.digest, second.receipt.digest);
});
