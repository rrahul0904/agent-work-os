import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../src/core.js", import.meta.url), "utf8");
const sandbox = { globalThis: {} };
vm.runInNewContext(source, sandbox, { filename: "core.js" });
const core = sandbox.globalThis.StreamSignalCore;

test("normalizes punctuation, accents and ampersands", () => {
  assert.equal(core.normalizeTitle("Léon: The Professional & Co."), "leon the professional and co");
});

test("exact title/year/kind resolves with high confidence", () => {
  const observation = core.createTitleObservation({ platform: "fixture", rawTitle: "Arrival", year: 2016, kind: "movie" });
  const result = core.resolveTitle(observation, [
    { id: "a", title: "Arrival", year: 2016, kind: "movie" },
    { id: "b", title: "Arrival", year: 1996, kind: "movie" },
  ]);
  assert.equal(result.state, "matched");
  assert.equal(result.canonicalId, "a");
  assert.ok(result.confidence >= 0.99);
});

test("same title without year can remain ambiguous", () => {
  const observation = core.createTitleObservation({ platform: "fixture", rawTitle: "Heat", kind: "movie" });
  const result = core.resolveTitle(observation, [
    { id: "1995", title: "Heat", year: 1995, kind: "movie" },
    { id: "1972", title: "Heat", year: 1972, kind: "movie" },
  ]);
  assert.equal(result.state, "ambiguous");
});

test("low-confidence partial title does not become a certain match", () => {
  const observation = core.createTitleObservation({ platform: "fixture", rawTitle: "Dune", year: 2021, kind: "movie" });
  const result = core.resolveTitle(observation, [{ id: "x", title: "Dune Messiah", year: 2026, kind: "movie" }]);
  assert.equal(result.state, "unknown");
});

test("missing title fails closed", () => {
  const observation = core.createTitleObservation({ platform: "fixture", rawTitle: "" });
  assert.equal(observation.state, "unknown");
  assert.equal(observation.reason, "missing-title");
});

test("matched title with no ratings renders nothing", () => {
  const decision = core.decideOverlay({
    resolution: { state: "matched", canonicalId: "a", confidence: 1 },
    ratings: [],
    settings: {},
  });
  assert.equal(decision.state, "no-overlay");
  assert.equal(decision.reason, "no-ratings");
});

test("threshold fade is deterministic", () => {
  const decision = core.decideOverlay({
    resolution: { state: "matched", canonicalId: "a", confidence: 1 },
    ratings: [{ provider: "fixture", label: "Demo", value: 42 }],
    settings: { minimumScore: 70, fadeBelowThreshold: true, showConfidence: true },
  });
  assert.equal(decision.state, "overlay");
  assert.equal(decision.faded, true);
});

test("settings are clamped and defaults are preserved", () => {
  assert.equal(
    JSON.stringify(core.sanitizeSettings({ minimumScore: 999, fadeBelowThreshold: "yes" })),
    JSON.stringify({ minimumScore: 100, fadeBelowThreshold: true, showConfidence: true }),
  );
});
