#!/usr/bin/env node
// A deterministic smoke test of the Research OS evidence/evaluation path.
// Every source here is synthetic; this never contacts a search or model provider.
import { createResearchBrief, planResearch } from "../packages/research-os/src/index.js";
import { createFixtureSearchAdapter, collectResearchEvidence, verifyObservationClaims } from "../packages/research-os/src/collection.js";
import { evaluateResearchEvidenceRun } from "../packages/research-os/src/evaluation.js";

const observationTime = "2026-10-19T12:00:00Z";
const question = "How does Research OS track evidence-backed evaluation receipts?";
const syntheticSources = [
  {
    id: "synthetic-primary",
    sourceUrl: "https://example.org/synthetic-primary",
    sourceTitle: "Synthetic primary reference (not a real source)",
    excerpt: "A synthetic research workflow tracks evidence with digest-bound receipts.",
    classification: "primary",
    support: "supports",
    reaClass: "OBSERVED",
    keywords: "Research OS track evidence backed evaluation receipts"
  },
  {
    id: "synthetic-independent",
    sourceUrl: "https://example.org/synthetic-independent",
    sourceTitle: "Synthetic independent reference (not a real source)",
    excerpt: "A synthetic independent reference checks evidence and receipt lineage.",
    classification: "independent",
    support: "supports",
    reaClass: "OBSERVED",
    keywords: "Research OS evidence evaluation receipts"
  }
];

async function execute() {
  const brief = createResearchBrief({
    question,
    budget: { maxQueries: 1, maxEvidenceItems: 2, maxClaims: 1 },
    successMetrics: { minimumEvidenceItems: 2 }
  });
  const plan = planResearch(brief);
  const searchAdapter = createFixtureSearchAdapter(syntheticSources, { id: "synthetic-research-demo", revision: "fixture-v1" });
  const collect = () => collectResearchEvidence({ brief, plan, searchAdapter, now: () => observationTime });
  const collected = await collect();
  const verification = verifyObservationClaims({
    claims: [{ id: "synthetic-claim-1", text: "Synthetic receipts link to evidence.", evidenceIds: ["synthetic-primary", "synthetic-independent"] }],
    ledger: collected.ledger,
    observations: collected.observations
  });
  const evaluated = evaluateResearchEvidenceRun({ brief, plan, ...collected, verification });
  const replay = await collect();
  if (collected.collection.digest !== replay.collection.digest || evaluated.receipt.status !== "PASSED") {
    throw new Error("fixture_replay_or_evaluation_failed");
  }
  return {
    mode: "SYNTHETIC_FIXTURE_ONLY",
    realProviderConnected: false,
    externalNetworkCalls: 0,
    factualWorldVerification: false,
    question: brief.question,
    evidenceCount: collected.ledger.items.length,
    queryCount: collected.collection.usage.queryCount,
    claimStatus: verification.results[0].status,
    evaluationStatus: evaluated.receipt.status,
    replayStable: true,
    planDigest: plan.digest,
    collectionDigest: collected.collection.digest,
    evaluationReceiptDigest: evaluated.receipt.digest,
    citations: collected.observations.map(({ evidence, sourceSpan }) => ({
      id: evidence.id,
      url: evidence.sourceUrl,
      span: sourceSpan,
      synthetic: true
    }))
  };
}

try {
  process.stdout.write(JSON.stringify(await execute(), null, 2) + "\n");
} catch (error) {
  process.stderr.write(String(error?.stack ?? error) + "\n");
  process.exitCode = 1;
}
