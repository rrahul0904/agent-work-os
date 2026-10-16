import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  addCapabilityToFileRegistry,
  applyInstallPlan,
  CapabilityRuntimeError,
  createInstallPlan,
  listCapabilitiesFromFileRegistry,
  resolveCapabilityFromFileRegistry,
  rollbackInstall
} from "../src/runtime.js";
import { compileCapability, createCapabilitySpec } from "../src/index.js";

function spec(version = "1.0.0") {
  return createCapabilitySpec({
    id: "capability_123e4567-e89b-42d3-a456-426614174020",
    version,
    kind: "skill",
    metadata: { name: "Safe Review", tags: ["review"] },
    execution: { instructions: `Review safely for ${version}.` },
    provenance: { sourceUrl: "https://example.com/source", sourceCommit: "abcdef1", sourceLicense: "MIT" }
  });
}

test("file registry persists and resolves the latest capability version", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "awos-registry-"));
  const file = path.join(root, "registry.json");
  await addCapabilityToFileRegistry(file, spec("1.0.0"));
  await addCapabilityToFileRegistry(file, spec("1.2.0"));
  assert.equal((await listCapabilitiesFromFileRegistry(file, { tag: "review" })).length, 2);
  assert.equal((await resolveCapabilityFromFileRegistry(file, "safe-review")).version, "1.2.0");
});

test("install requires explicit write approval and rollback removes newly created files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "awos-install-"));
  const compiled = compileCapability(spec(), "codex");
  const plan = createInstallPlan(compiled, root, { installId: "install_test_new" });
  await assert.rejects(() => applyInstallPlan(plan), (error) => error.code === "capability_install_write_not_approved");
  const installed = await applyInstallPlan(plan, { approveWrite: true });
  const target = path.join(root, "skills/safe-review/SKILL.md");
  assert.match(await readFile(target, "utf8"), /Review safely/);
  const rollback = await rollbackInstall(installed.receipt);
  assert.equal(rollback.results[0].action, "removed");
  await assert.rejects(() => readFile(target), (error) => error.code === "ENOENT");
});

test("rollback restores pre-existing files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "awos-restore-"));
  const target = path.join(root, "skills/safe-review/SKILL.md");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, "original\n", "utf8");
  const plan = createInstallPlan(compileCapability(spec(), "codex"), root, { installId: "install_test_restore" });
  const installed = await applyInstallPlan(plan, { approveWrite: true });
  assert.notEqual(await readFile(target, "utf8"), "original\n");
  await rollbackInstall(installed.receipt);
  assert.equal(await readFile(target, "utf8"), "original\n");
});

test("rollback refuses to overwrite a file changed after installation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "awos-drift-"));
  const plan = createInstallPlan(compileCapability(spec(), "codex"), root, { installId: "install_test_drift" });
  const installed = await applyInstallPlan(plan, { approveWrite: true });
  const target = path.join(root, "skills/safe-review/SKILL.md");
  await writeFile(target, "user changed this\n", "utf8");
  await assert.rejects(() => rollbackInstall(installed.receipt), (error) => error.code === "capability_rollback_target_drifted");
});

test("installer refuses symlink traversal", async (t) => {
  if (process.platform === "win32") t.skip("symlink privileges vary on Windows");
  const root = await mkdtemp(path.join(tmpdir(), "awos-symlink-"));
  const outside = await mkdtemp(path.join(tmpdir(), "awos-outside-"));
  await symlink(outside, path.join(root, "skills"));
  const plan = createInstallPlan(compileCapability(spec(), "codex"), root, { installId: "install_test_symlink" });
  await assert.rejects(() => applyInstallPlan(plan, { approveWrite: true }), (error) => {
    assert.ok(error instanceof CapabilityRuntimeError);
    return error.code === "capability_symlink_refused";
  });
});
