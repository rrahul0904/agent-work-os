import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { scanRepository } from "../src/index.js";
import { analyzeRepositoryImports } from "../src/import-analysis.js";
import { analyzeRepositoryTopology } from "../src/topology.js";
import { diffRepositoryMaps } from "../src/diff.js";
import { analyzeRepositoryImpact } from "../src/impact.js";
import { createRepositoryEvidenceBundle, RepoEvidenceError } from "../src/evidence.js";

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL("../../../scripts/repo-atlas.mjs", import.meta.url));

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-m8-"));
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
  return execFileAsync(process.execPath, [CLI, ...args], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}

test("M8 artifacts bind into the evidence bundle and reject cross-snapshot imports", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "m8-evidence", private: true }));
    await put(root, "src/core.ts", "export const core = 1;\n");
    await put(root, "src/api.ts", "import { core } from './core';\nexport const api = core;\n");

    const previous = await scanRepository(root);
    const previousImports = await analyzeRepositoryImports(root, previous);
    await put(root, "src/core.ts", "export const core = 2;\nexport const changed = true;\n");
    const current = await scanRepository(root);
    const imports = await analyzeRepositoryImports(root, current);
    const topology = await analyzeRepositoryTopology(root, current);
    const diff = diffRepositoryMaps(previous, current);
    const impact = analyzeRepositoryImpact({ repoMap: current, importAnalysis: imports, diff, topology });

    const bundle = createRepositoryEvidenceBundle({ repoMap: current, topology, diff, importAnalysis: imports, impact });
    assert.ok(bundle.artifacts.some((artifact) => artifact.kind === "repo-imports"));
    assert.ok(bundle.artifacts.some((artifact) => artifact.kind === "repo-impact"));
    assert.ok(bundle.claims.some((claim) => claim.type === "repository-import-analysis"));
    assert.ok(bundle.claims.some((claim) => claim.type === "repository-change-impact"));
    assert.equal(bundle.summary.parsedSourceFiles, 2);
    assert.equal(bundle.summary.impactedFiles, 1);

    assert.throws(
      () => createRepositoryEvidenceBundle({ repoMap: current, importAnalysis: previousImports }),
      (error) => error instanceof RepoEvidenceError && error.code === "repo_import_analysis_invalid_digest_mismatch"
    );
  });
});

test("CLI emits imports, impact, and M8 evidence without source bodies", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "m8-cli", private: true }));
    await put(root, "src/core.ts", "export const SECRET_SOURCE_VALUE = 1;\n");
    await put(root, "src/service.ts", "import { SECRET_SOURCE_VALUE } from './core';\nexport const service = SECRET_SOURCE_VALUE;\n");
    const previous = await scanRepository(root);
    const previousPath = path.join(root, "previous-map.json");
    await writeFile(previousPath, JSON.stringify(previous), "utf8");
    await put(root, "src/core.ts", "export const SECRET_SOURCE_VALUE = 2;\nexport const changed = true;\n");

    const imports = JSON.parse((await invoke(["imports", root])).stdout);
    assert.equal(imports.schemaVersion, "repo-import-analysis/v1");
    assert.equal(JSON.stringify(imports).includes("SECRET_SOURCE_VALUE"), false);

    const impact = JSON.parse((await invoke(["impact", root, `--previous-map=${previousPath}`, "--max-depth=3"])).stdout);
    assert.equal(impact.schemaVersion, "repo-impact/v1");
    assert.ok(impact.impactedFiles.includes("src/service.ts"));

    const bundle = JSON.parse((await invoke([
      "bundle", root,
      `--previous-map=${previousPath}`,
      "--include-imports",
      "--include-impact",
      "--max-depth=3"
    ])).stdout);
    assert.equal(bundle.schemaVersion, "repo-evidence-bundle/v1");
    assert.ok(bundle.artifacts.some((artifact) => artifact.kind === "repo-imports"));
    assert.ok(bundle.artifacts.some((artifact) => artifact.kind === "repo-impact"));
    assert.equal(JSON.stringify(bundle).includes("SECRET_SOURCE_VALUE"), false);
  });
});
