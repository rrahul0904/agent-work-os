import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL("../../../scripts/repo-atlas.mjs", import.meta.url));

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-bundle-diff-cli-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function put(root, relative, content) {
  const destination = path.join(root, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content);
}

async function invoke(args) {
  return execFileAsync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

test("bundle CLI can include drift from a prior RepoMap", async () => {
  await withFixture(async (root) => {
    const previousRepo = path.join(root, "previous");
    const currentRepo = path.join(root, "current");
    const previousMap = path.join(root, "previous-map.json");

    await put(previousRepo, "package.json", JSON.stringify({ name: "fixture" }));
    await put(previousRepo, "src/index.ts", "export const value = 1;\n");
    await put(currentRepo, "package.json", JSON.stringify({ name: "fixture" }));
    await put(currentRepo, "src/index.ts", "export const value = 1;\nexport const extra = 2;\n");
    await put(currentRepo, "src/new.ts", "export const created = true;\n");

    await invoke(["map", previousRepo, `--output=${previousMap}`]);
    const result = await invoke([
      "bundle", currentRepo,
      `--previous-map=${previousMap}`,
      "--repository=example/fixture",
      "--ref=feature/drift"
    ]);
    const bundle = JSON.parse(result.stdout);

    assert.equal(bundle.schemaVersion, "repo-evidence-bundle/v1");
    assert.ok(bundle.artifacts.some((artifact) => artifact.kind === "repo-diff"));
    assert.ok(bundle.claims.some((claim) => claim.type === "repository-drift"));
    assert.equal(bundle.summary.affectedFiles, 2);
    assert.equal(bundle.provenance.ref, "feature/drift");
  });
});
