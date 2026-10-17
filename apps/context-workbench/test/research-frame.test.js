import test from "node:test";
import assert from "node:assert/strict";
import { answerFromBrief, buildBrief, briefToMarkdown, draftFromBrief } from "../lib/research-frame.js";

const sources = [
  {
    title: "Project note A",
    text: "The team plans to launch on October 20, 2026. The release requires a final QA pass before launch."
  },
  {
    title: "Project note B",
    text: "The team plans to launch on October 27, 2026, pending approval. The release requires a final QA pass before launch."
  }
];

test("source comparison preserves a date disagreement", () => {
  const brief = buildBrief({ query: "When is launch?", briefType: "source-comparison", sources });
  assert.ok(brief.conflicts.length >= 1);
  assert.ok(brief.disagreements.length >= 1);
});

test("research brief keeps uncertainty and a next move", () => {
  const brief = buildBrief({ query: "When is launch?", briefType: "research", sources });
  assert.equal(brief.confidence, "guarded");
  assert.match(brief.nextResearchMove, /Resolve|source/i);
});

test("recommendation refuses to overclaim thin evidence", () => {
  const brief = buildBrief({
    query: "Linear vs Jira?",
    briefType: "recommendation",
    sources: [{ title: "One note", text: "Linear is fast for small teams but this note provides no comparative Jira evidence." }]
  });
  assert.equal(brief.recommendation, null);
  assert.equal(brief.firmness, "insufficient");
});

test("markdown includes source labels", () => {
  const brief = buildBrief({ query: "When is launch?", briefType: "source", sources });
  const md = briefToMarkdown(brief);
  assert.match(md, /\[S1\]/);
  assert.match(md, /Sources/);
});

test("follow-up answers stay evidence-grounded", () => {
  const brief = buildBrief({
    query: "When is launch?",
    briefType: "research",
    sources: [
      { title: "Plan", text: "The launch is scheduled for October 20, 2026 after the final QA pass." },
      { title: "Update", text: "The launch is scheduled for October 20, 2026 after the final QA pass and approval." }
    ]
  });
  const result = answerFromBrief({ brief, question: "When is launch scheduled?" });
  assert.match(result.answer, /October 20, 2026/);
  assert.ok(result.evidence.some((x) => /\[S1\]|\[S2\]/.test(x)));
});

test("draft from brief retains citations and sources", () => {
  const brief = buildBrief({
    query: "Should we proceed?",
    briefType: "source",
    sources: [{ title: "Primary", url: "https://example.com", text: "The pilot passed 98 percent of acceptance checks and no critical defects remain." }]
  });
  const result = draftFromBrief({ brief, format: "memo", audience: "leadership" });
  assert.match(result.draft, /\[S1\]/);
  assert.match(result.draft, /Primary/);
});
