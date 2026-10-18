import assert from "node:assert/strict";
import test from "node:test";
import { planArtifactRecovery, pinJobResource, requirePinnedResource, mergeResearchMemory } from "../src/reliability-invariants.js";

const sha = "a".repeat(64);
const stages = [
  { id: "director", output: "outline", requires: [] },
  { id: "writer", output: "script", requires: ["outline"] },
  { id: "publisher", output: "published", requires: ["script"] }
];
const outline = { sha256: sha, producer: "director", verified: true };
const script = { sha256: sha, producer: "writer", verified: true };
const published = { sha256: sha, producer: "publisher", verified: true };

test("recovery proposes first missing stage; completed run needs all artifacts", () => {
  assert.deepEqual(planArtifactRecovery({ runId: "run-1", stages, artifacts: { outline } }), {
    schemaVersion: "1", runId: "run-1", disposition: "candidate", stageId: "writer",
    output: "script", reason: "verified_artifact_absent", executionAuthorized: false
  });
  assert.equal(planArtifactRecovery({ runId: "run-1", stages, artifacts: { outline, script, published } }).disposition, "complete");
  assert.equal(planArtifactRecovery({ runId: "run-1", stages, artifacts: {} }).stageId, "director");
});

test("recovery refuses malformed/unsupported artifact proof", () => {
  assert.throws(() => planArtifactRecovery({ runId: "x", stages, artifacts: { outline: { ...outline, verified: false } } }), /unverified_or_invalid_artifact/);
  assert.throws(() => planArtifactRecovery({ runId: "x", stages, artifacts: { outline: { ...outline, sha256: "wrong" } } }), /unverified_or_invalid_artifact/);
  assert.throws(() => planArtifactRecovery({ runId: "x", stages, artifacts: { nonsense: outline } }), /unexpected_artifact/);
});

test("stage dependency ordering and orphaned downstream artifacts are checked", () => {
  assert.throws(() => planArtifactRecovery({ runId: "x", stages: [stages[1], stages[0]] }), /missing_or_forward_dependency/);
  assert.throws(() => planArtifactRecovery({ runId: "x", stages, artifacts: { outline: { ...outline, producer: "writer" } } }), /unverified_or_invalid_artifact/);
  assert.equal(planArtifactRecovery({ runId: "x", stages, artifacts: { script } }).disposition, "blocked");
});

test("async job resource is pinned across serialization, retries and polling", () => {
  const pinned = pinJobResource({}, "job42", "resource-a");
  const restored = JSON.parse(JSON.stringify(pinned));
  assert.equal(requirePinnedResource(restored, "job42", "resource-a"), "resource-a");
  assert.throws(() => requirePinnedResource(restored, "job42", "resource-b"), /affinity_mismatch/);
  assert.throws(() => pinJobResource(restored, "job42", "resource-b"), /affinity_conflict/);
  assert.deepEqual(pinJobResource(restored, "job42", "resource-a"), pinned);
  assert.throws(() => pinJobResource(restored, "__proto__", "resource-a"), /job_id_invalid/);
});

test("negative research memory deduplicates while keeping evidence and scopes", () => {
  const base = { scopeId: "research-1", dead_ends: [{ statement: "Try induction", evidenceIds: ["log1"] }] };
  const delta = { scopeId: "research-1", dead_ends: [{ statement: "try   INDUCTION", evidenceIds: ["log2"] }] };
  const merged = mergeResearchMemory(base, delta);
  assert.equal(merged.dead_ends.length, 1);
  assert.deepEqual(merged.dead_ends[0].evidenceIds, ["log1", "log2"]);
  assert.throws(() => mergeResearchMemory(base, { scopeId: "research-1", established: [{ statement: "Riemann proved", evidenceIds: [] }] }), /requires_evidence/);
  assert.throws(() => mergeResearchMemory(base, { scopeId: "other" }), /scope_mismatch/);
});

test("memory cap explicitly reports truncated projection rather than silent loss", () => {
  const delta = { scopeId: "p", dead_ends: [
    { statement: "attempt A", evidenceIds: [] }, { statement: "attempt B", evidenceIds: [] }
  ] };
  const merged = mergeResearchMemory({ scopeId: "p" }, delta, { maxItemsPerBucket: 1 });
  assert.equal(merged.dead_ends.length, 1);
  assert.equal(merged.dead_endsOverflow, 1);
});
