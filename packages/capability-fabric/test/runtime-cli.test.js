import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createCapabilitySpec } from "../src/index.js";

test("runtime CLI installs, persists receipt, and rolls back", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "awos-runtime-cli-"));
  const spec = createCapabilitySpec({
    id: "capability_123e4567-e89b-42d3-a456-426614174030",
    version: "1.0.0",
    kind: "skill",
    metadata: { name: "Runtime Check" },
    execution: { instructions: "Perform runtime check." },
    provenance: { sourceUrl: "https://example.com/source", sourceCommit: "abcdef1", sourceLicense: "MIT" }
  });
  const specPath = path.join(root, "spec.json");
  const target = path.join(root, "target");
  await writeFile(specPath, JSON.stringify(spec), "utf8");
  const install = spawnSync(process.execPath, [path.resolve("scripts/capability.mjs"), "install", specPath, "codex", target, "--approve-write"], { encoding: "utf8" });
  assert.equal(install.status, 0, install.stderr);
  const out = JSON.parse(install.stdout);
  assert.match(await readFile(path.join(target, "skills/runtime-check/SKILL.md"), "utf8"), /runtime check/i);
  const rollback = spawnSync(process.execPath, [path.resolve("scripts/capability.mjs"), "rollback", out.receiptPath], { encoding: "utf8" });
  assert.equal(rollback.status, 0, rollback.stderr);
  await assert.rejects(() => readFile(path.join(target, "skills/runtime-check/SKILL.md")), (error) => error.code === "ENOENT");
});
