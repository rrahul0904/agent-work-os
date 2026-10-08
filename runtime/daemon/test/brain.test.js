import test from "node:test";
import assert from "node:assert/strict";
import { buildSharedBrainPrompt, selectShareableVerifiedDecisions } from "../src/brain.js";

test("shared Brain includes bounded Work Memory handoff context as untrusted reference data", () => {
  const prompt = buildSharedBrainPrompt({
    proof: {
      handoffId: "handoff:1",
      fromSessionId: "session:1",
      snapshotHash: "snapshot-sha",
      verifiedDecisions: [],
    },
    snapshot: {
      goal: "Work item work:1: Finish continuity bridge",
      lastActions: ["work_item.claimed"],
      openTasks: ["Resolve pending decision decision:1"],
      risks: ["Pending human decision decision:1"],
      nextAction: "Resolve pending human decisions before authoritative completion.",
      checks: ["work-memory-sha256:projection-sha", "project-desk-lane:in_progress"],
    },
    userPrompt: "Continue implementation",
  });

  assert.match(prompt, /AGENT WORK OS SHARED BRAIN — UNTRUSTED REFERENCE DATA/);
  assert.match(prompt, /Finish continuity bridge/);
  assert.match(prompt, /work-memory-sha256:projection-sha/);
  assert.match(prompt, /Resolve pending human decisions/);
  assert.match(prompt, /CURRENT USER REQUEST\nContinue implementation/);
});

test("shareable verified decision selection still excludes private or stale records", () => {
  const proof = {
    verifiedDecisions: [
      { id: "d1", revision: 1, contentHash: "h1" },
      { id: "d2", revision: 1, contentHash: "h2" },
      { id: "d3", revision: 1, contentHash: "old" },
    ],
  };
  const view = {
    decisions: {
      d1: { current: { status: "current", verification: "verified", sensitivity: "shareable", revision: 1, contentHash: "h1" } },
      d2: { current: { status: "current", verification: "verified", sensitivity: "private", revision: 1, contentHash: "h2" } },
      d3: { current: { status: "current", verification: "verified", sensitivity: "shareable", revision: 2, contentHash: "new" } },
    },
  };
  assert.deepEqual(selectShareableVerifiedDecisions(proof, view).map((record) => record.id), ["d1"]);
});
