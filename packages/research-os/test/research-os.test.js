import test from "node:test";
import assert from "node:assert/strict";
import {
  ResearchValidationError,
  createResearchBrief,
  planResearch,
  createEvidenceItem,
  buildEvidenceLedger,
  verifyClaims,
  createResearchReceipt
} from "../src/index.js";

test("research brief and plan are deterministic", () => {
  const input = { question: "What changed in the target product?", requiredSources: ["first-party"], budget: { maxQueries: 4 } };
  const a = createResearchBrief(input);
  const b = createResearchBrief(input);
  assert.equal(a.digest, b.digest);
  assert.equal(planResearch(a).digest, planResearch(b).digest);
});

test("evidence ledger sorts items and produces stable digest", () => {
  const a = createEvidenceItem({ id: "b", sourceUrl: "https://b.example", sourceTitle: "B", excerpt: "Independent evidence", classification: "independent" });
  const b = createEvidenceItem({ id: "a", sourceUrl: "https://a.example", sourceTitle: "A", excerpt: "Primary evidence", classification: "primary" });
  const one = buildEvidenceLedger([a, b]);
  const two = buildEvidenceLedger([b, a]);
  assert.equal(one.digest, two.digest);
  assert.deepEqual(one.items.map((item) => item.id), ["a", "b"]);
});

test("unsupported claim blocks the research receipt", () => {
  const brief = createResearchBrief({ question: "Is claim X true?" });
  const plan = planResearch(brief);
  const ledger = buildEvidenceLedger([
    { id: "e1", sourceUrl: "https://example.com", sourceTitle: "Example", excerpt: "Context only", classification: "independent", support: "context" }
  ]);
  const verification = verifyClaims({ claims: [{ text: "Claim X is true", evidenceIds: ["e1"] }], ledger });
  assert.equal(verification.passed, false);
  const receipt = createResearchReceipt({ brief, plan, ledger, verification });
  assert.equal(receipt.outcome, "blocked");
  assert.equal(receipt.metrics.insufficientClaimCount, 1);
});

test("supported claim with contradiction remains visible and verified", () => {
  const brief = createResearchBrief({ question: "What is the evidence?" });
  const plan = planResearch(brief);
  const ledger = buildEvidenceLedger([
    { id: "p1", sourceUrl: "https://primary.example", sourceTitle: "Primary", excerpt: "Supports claim", classification: "primary", support: "supports" },
    { id: "i1", sourceUrl: "https://independent.example", sourceTitle: "Independent", excerpt: "Disputes claim", classification: "independent", support: "contradicts" }
  ]);
  const verification = verifyClaims({ claims: [{ text: "Claim", evidenceIds: ["p1", "i1"] }], ledger });
  assert.equal(verification.results[0].status, "supported_with_contradiction");
  assert.equal(verification.results[0].contradicted, true);
  const receipt = createResearchReceipt({ brief, plan, ledger, verification });
  assert.equal(receipt.outcome, "verified");
  assert.equal(receipt.metrics.contradictionCount, 1);
});

test("missing evidence ID fails closed", () => {
  const ledger = buildEvidenceLedger([
    { id: "e1", sourceUrl: "https://example.com", sourceTitle: "Example", excerpt: "Supports claim", classification: "independent", support: "supports" }
  ]);
  const verification = verifyClaims({ claims: [{ text: "Claim", evidenceIds: ["missing"] }], ledger });
  assert.equal(verification.results[0].status, "insufficient_evidence");
  assert.deepEqual(verification.results[0].missingEvidenceIds, ["missing"]);
});

test("tampered brief digest is rejected", () => {
  const brief = createResearchBrief({ question: "Original question" });
  const tampered = { ...brief, question: "Changed question" };
  assert.throws(() => planResearch(tampered), (error) => error instanceof ResearchValidationError && error.code === "research_brief_digest_invalid");
});
