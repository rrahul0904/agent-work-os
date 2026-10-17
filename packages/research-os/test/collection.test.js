import test from "node:test";
import assert from "node:assert/strict";
import { ResearchValidationError, createResearchBrief, planResearch } from "../src/index.js";
import { createFixtureSearchAdapter, collectResearchEvidence, verifyObservationClaims } from "../src/collection.js";

test("fixture adapter is deterministic, provider-free, and binds provenance", async () => {
  const adapter = createFixtureSearchAdapter([
    { id: "e1", sourceUrl: "https://first.example", sourceTitle: "First party release", excerpt: "The product added grounded research citations", classification: "primary", keywords: "research citations" },
    { id: "e2", sourceUrl: "https://second.example", sourceTitle: "Independent review", excerpt: "The release added citation verification", classification: "independent", keywords: "research citations" }
  ], { id: "fixture-rea", revision: "2026-10-17" });
  assert.equal(adapter.metadata.networkAccess, false);
  const a = await adapter.search("research citations", { queryId: "q1", retrievedAt: "2026-10-17T00:00:00Z" });
  const b = await adapter.search("research citations", { queryId: "q1", retrievedAt: "2026-10-17T00:00:00Z" });
  assert.deepEqual(a, b);
  assert.equal(a[0].provenance.provider, "fixture-rea");
  assert.equal(a[0].evidence.queryId, "q1");
});

test("collection enforces evidence budget and emits a stable receipt", async () => {
  const brief = createResearchBrief({ question: "research citations", budget: { maxQueries: 2, maxEvidenceItems: 1 } });
  const plan = planResearch(brief);
  const adapter = createFixtureSearchAdapter([
    { id: "e1", sourceUrl: "https://first.example", sourceTitle: "First", excerpt: "research citations are grounded", classification: "primary" },
    { id: "e2", sourceUrl: "https://second.example", sourceTitle: "Second", excerpt: "research citations are checked", classification: "independent" }
  ]);
  const run = await collectResearchEvidence({ brief, plan, searchAdapter: adapter, now: () => "2026-10-17T00:00:00Z" });
  assert.equal(run.ledger.items.length, 1);
  assert.equal(run.collection.usage.evidenceCount, 1);
  assert.equal(run.collection.usage.truncated, true);
  const replay = await collectResearchEvidence({ brief, plan, searchAdapter: adapter, now: () => "2026-10-17T00:00:00Z" });
  assert.equal(run.collection.digest, replay.collection.digest);
});

test("Phase A refuses adapters with changed network authority metadata", async () => {
  const brief = createResearchBrief({ question: "safe research" });
  const plan = planResearch(brief);
  const adapter = createFixtureSearchAdapter([{ id: "e1", sourceUrl: "https://x.example", sourceTitle: "X", excerpt: "safe research evidence", classification: "primary" }]);
  const unsafe = { ...adapter, metadata: { ...adapter.metadata, networkAccess: true } };
  await assert.rejects(() => collectResearchEvidence({ brief, plan, searchAdapter: unsafe }), (error) => error instanceof ResearchValidationError && error.code === "search_adapter_metadata_invalid");
});

test("HYPOTHESIS-only REA evidence cannot verify a factual claim", async () => {
  const brief = createResearchBrief({ question: "possible evidence", budget: { maxQueries: 1, maxEvidenceItems: 2 } });
  const plan = planResearch(brief);
  const adapter = createFixtureSearchAdapter([
    { id: "h1", sourceUrl: "https://example.com", sourceTitle: "Hypothesis", excerpt: "possible evidence", classification: "derived", support: "supports", reaClass: "HYPOTHESIS" }
  ]);
  const run = await collectResearchEvidence({ brief, plan, searchAdapter: adapter, now: () => "2026-10-17T00:00:00Z" });
  const verification = verifyObservationClaims({ claims: [{ text: "This is true", evidenceIds: ["h1"] }], ledger: run.ledger, observations: run.observations, requireIndependent: false });
  assert.equal(verification.results[0].speculativeOnly, true);
  assert.equal(verification.results[0].status, "insufficient_evidence");
});

test("REA verification preserves exact source spans for citation checking", async () => {
  const brief = createResearchBrief({ question: "0123456789", budget: { maxQueries: 1, maxEvidenceItems: 2 } });
  const plan = planResearch(brief);
  const adapter = createFixtureSearchAdapter([
    { id: "e1", sourceUrl: "https://example.com", sourceTitle: "Example", excerpt: "0123456789", sourceSpan: { start: 2, end: 7 }, classification: "primary", support: "supports" }
  ]);
  const run = await collectResearchEvidence({ brief, plan, searchAdapter: adapter, now: () => "2026-10-17T00:00:00Z" });
  const verification = verifyObservationClaims({ claims: [{ text: "Claim", evidenceIds: ["e1"] }], ledger: run.ledger, observations: run.observations });
  assert.deepEqual(verification.results[0].citationSpans[0].sourceSpan, { start: 2, end: 7 });
});
