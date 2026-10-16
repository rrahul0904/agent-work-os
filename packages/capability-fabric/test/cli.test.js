import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createCapabilitySpec } from "../src/index.js";

test("CLI compiles a capability and writes a verification receipt", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "awos-capability-"));
  const spec = createCapabilitySpec({
    id: "capability_123e4567-e89b-42d3-a456-426614174010",
    version: "1.0.0",
    kind: "skill",
    metadata: { name: "Review API", description: "Review API contracts" },
    execution: { instructions: "Review the API." },
    provenance: { sourceUrl: "https://example.com/source", sourceCommit: "abcdef1", sourceLicense: "MIT" }
  });
  const specPath = path.join(root, "spec.json");
  const out = path.join(root, "out");
  await writeFile(specPath, JSON.stringify(spec), "utf8");
  const result = spawnSync(process.execPath, [path.resolve("scripts/capability.mjs"), "compile", specPath, "codex", out], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(await readFile(path.join(out, "verification-receipt.json"), "utf8"));
  assert.equal(receipt.harnessId, "codex");
  assert.match(receipt.receiptDigest, /^sha256:/);
  assert.match(await readFile(path.join(out, "skills/review-api/SKILL.md"), "utf8"), /Review API/);
});
