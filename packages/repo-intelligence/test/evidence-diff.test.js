import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanRepository } from "../src/index.js";
import { analyzeRepositoryTopology } from "../src/topology.js";
import { analyzeStructuralRisk } from "../src/risk.js";
import { diffRepositoryMaps } from "../src/diff.js";
import { createRepositoryEvidenceBundle, RepoEvidenceError } from "../src/evidence.js";

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-evidence-diff-"));
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

test("evidence bundle includes drift artifact and claim when diff is supplied", async () => {
  await withFixture(async (root) => {
    const previousRoot = path.join(root, "previous");
    const currentRoot = path.join(root, "current");
    await put(previousRoot, "package.json", JSON.stringify({ name: "fixture" }));
    await put(previousRoot, "src/index.ts", "export const value = 1;\n");
    await put(currentRoot, "package.json", JSON.stringify({ name: "fixture" }));
    await put(currentRoot, "src/index.ts", "export const value = 1;\nexport const extra = 2;\n");
    await put(currentRoot, "src/new.ts", "export const created = true;\n");

    const previousMap = await scanRepository(previousRoot);
    const currentMap = await scanRepository(currentRoot);
    const topology = await analyzeRepositoryTopology(currentRoot, currentMap);
    const risk = analyzeStructuralRisk(currentMap, topology);
    const diff = diffRepositoryMaps(previousMap, currentMap);
    const bundle = createRepositoryEvidenceBundle({ repoMap: currentMap, topology, risk, diff });

    assert.ok(bundle.artifacts.some((artifact) => artifact.kind === "repo-diff" && artifact.digest === diff.digest));
    assert.ok(bundle.claims.some((claim) => claim.type === "repository-drift"));
    assert.equal(bundle.summary.affectedFiles, diff.summary.affectedFiles);
  });
});

test("evidence bundle rejects drift whose current snapshot does not match current map", async () => {
  await withFixture(async (root) => {
    const one = path.join(root, "one");
    const two = path.join(root, "two");
    const three = path.join(root, "three");
    await put(one, "src/index.js", "export const one = 1;\n");
    await put(two, "src/index.js", "export const two = 2;\n");
    await put(three, "src/index.js", "export const three = 3;\n");

    const mapOne = await scanRepository(one);
    const mapTwo = await scanRepository(two);
    const mapThree = await scanRepository(three);
    const wrongDiff = diffRepositoryMaps(mapOne, mapTwo);

    assert.throws(
      () => createRepositoryEvidenceBundle({ repoMap: mapThree, diff: wrongDiff }),
      (error) => error instanceof RepoEvidenceError && error.code === "repo_diff_current_mismatch"
    );
  });
});
