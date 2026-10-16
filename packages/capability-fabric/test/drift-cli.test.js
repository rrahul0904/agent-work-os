import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createCapabilitySpec } from "../src/index.js";

const root = path.resolve(new URL("../../..", import.meta.url).pathname);

function capability({ version = "1.0.0", instructions = "Return READY.", sourceCommit = "abcdef1234567", sourceLicense = "MIT" } = {}) {
  return createCapabilitySpec({
    id: "capability_00000000-0000-4000-8000-000000000066",
    kind: "skill",
    version,
    metadata: { name: "Drift CLI Probe", slug: "drift-cli-probe" },
    execution: { instructions },
    provenance: { sourceUrl: "https://github.com/example/drift-cli", sourceCommit, sourceLicense },
    evaluation: { testCases: [{ id: "smoke", input: "Probe.", expected: "READY" }], qualityThreshold: 1 }
  });
}

async function writeFixture(previous, current) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "awos-drift-cli-"));
  const previousPath = path.join(dir, "previous.json");
  const currentPath = path.join(dir, "current.json");
  await writeFile(previousPath, JSON.stringify(previous));
  await writeFile(currentPath, JSON.stringify(current));
  return { previousPath, currentPath };
}

test("drift-plan CLI emits re-verification plan for semantic drift", async () => {
  const files = await writeFixture(capability(), capability({ version: "2.0.0", instructions: "Return READY after checking evidence." }));
  const result = spawnSync(process.execPath, ["scripts/capability.mjs", "drift-plan", files.previousPath, files.currentPath, "--harness=codex"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.action, "drift-plan");
  assert.equal(output.assessment.decision, "reverify");
  assert.ok(output.plan.steps.some((step) => step.id === "verify-artifact:codex"));
  assert.equal(output.plan.automaticPromotionAllowed, false);
});

test("drift-plan CLI fails closed for source license drift", async () => {
  const files = await writeFixture(capability(), capability({ version: "2.0.0", sourceCommit: "fedcba7654321", sourceLicense: "Restricted" }));
  const result = spawnSync(process.execPath, ["scripts/capability.mjs", "drift-plan", files.previousPath, files.currentPath, "--harness=codex"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 3, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.equal(output.assessment.decision, "blocked");
  assert.equal(output.assessment.cleanRoomReviewRequired, true);
  assert.ok(output.plan.steps.some((step) => step.id === "review-provenance-license"));
});
