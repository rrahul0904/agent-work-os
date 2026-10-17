import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanRepository } from "../src/index.js";
import { analyzeRepositoryImports } from "../src/import-analysis.js";
import { analyzeModuleResolution } from "../src/module-resolution.js";
import { analyzeRepositoryTopology } from "../src/topology.js";
import { analyzeStructuralRisk } from "../src/risk.js";
import { diffRepositoryMaps } from "../src/diff.js";
import { analyzeSemanticRepositoryImpact } from "../src/impact-v2.js";
import { createRepositoryEvidenceBundleV2, RepoEvidenceV2Error } from "../src/evidence-v2.js";

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-evidence-v2-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

async function put(root, relative, content) {
  const destination = path.join(root, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content);
}

test("semantic evidence bundle v2 contains resolution and alias-aware impact without source bodies", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "semantic-evidence", private: true }));
    await put(root, "tsconfig.json", JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@core": ["src/core"] } } }));
    await put(root, "src/core.ts", "export const SOURCE_SECRET_MUST_NOT_LEAK = 1;\n");
    await put(root, "src/service.ts", "import { SOURCE_SECRET_MUST_NOT_LEAK } from '@core';\nexport const service = SOURCE_SECRET_MUST_NOT_LEAK;\n");
    await put(root, "src/index.ts", "import { service } from './service';\nexport { service };\n");

    const previous = await scanRepository(root);
    await put(root, "src/core.ts", "export const SOURCE_SECRET_MUST_NOT_LEAK = 2;\nexport const changed = true;\n");
    const current = await scanRepository(root);
    const topology = await analyzeRepositoryTopology(root, current);
    const risk = analyzeStructuralRisk(current, topology);
    const diff = diffRepositoryMaps(previous, current);
    const imports = await analyzeRepositoryImports(root, current);
    const resolution = await analyzeModuleResolution(root, current, imports);
    const semanticImpact = analyzeSemanticRepositoryImpact({ repoMap: current, importAnalysis: imports, moduleResolution: resolution, diff, topology });

    const first = createRepositoryEvidenceBundleV2({
      repoMap: current,
      topology,
      risk,
      diff,
      importAnalysis: imports,
      moduleResolution: resolution,
      semanticImpact,
      provenance: { repository: "example/semantic-evidence", ref: "main", commit: "abc123", source: "test" }
    });
    const second = createRepositoryEvidenceBundleV2({
      repoMap: current,
      topology,
      risk,
      diff,
      importAnalysis: imports,
      moduleResolution: resolution,
      semanticImpact,
      provenance: { repository: "example/semantic-evidence", ref: "main", commit: "abc123", source: "test" }
    });

    assert.equal(first.schemaVersion, "repo-evidence-bundle/v2");
    assert.equal(first.producer.contractVersion, 2);
    assert.equal(first.digest, second.digest);
    for (const kind of ["repo-map", "repo-topology", "repo-risk", "repo-diff", "repo-imports", "repo-resolution", "repo-semantic-impact"]) {
      assert.ok(first.artifacts.some((artifact) => artifact.kind === kind));
    }
    assert.ok(first.claims.some((claim) => claim.type === "repository-module-resolution"));
    assert.ok(first.claims.some((claim) => claim.type === "repository-semantic-change-impact"));
    assert.equal(first.summary.aliasResolvedEdges, 1);
    assert.equal(first.summary.impactedFiles, 2);
    assert.equal(JSON.stringify(first).includes("SOURCE_SECRET_MUST_NOT_LEAK"), false);
  });
});

test("semantic evidence bundle v2 fails closed when resolution or impact bindings cannot be reproduced", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "binding-fixture", private: true }));
    await put(root, "tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "@x": ["./src/x"] } } }));
    await put(root, "src/x.ts", "export const x = 1;\n");
    await put(root, "src/y.ts", "import { x } from '@x';\nexport const y = x;\n");

    const previous = await scanRepository(root);
    await put(root, "src/x.ts", "export const x = 2;\n");
    const current = await scanRepository(root);
    const diff = diffRepositoryMaps(previous, current);
    const imports = await analyzeRepositoryImports(root, current);
    const resolution = await analyzeModuleResolution(root, current, imports);
    const topology = await analyzeRepositoryTopology(root, current);
    const semanticImpact = analyzeSemanticRepositoryImpact({ repoMap: current, importAnalysis: imports, moduleResolution: resolution, diff, topology });

    const wrongResolution = { ...resolution, importAnalysisDigest: `sha256:${"0".repeat(64)}` };
    assert.throws(
      () => createRepositoryEvidenceBundleV2({ repoMap: current, importAnalysis: imports, moduleResolution: wrongResolution }),
      (error) => error instanceof RepoEvidenceV2Error && error.code === "repo_module_resolution_import_mismatch"
    );

    assert.throws(
      () => createRepositoryEvidenceBundleV2({ repoMap: current, diff, importAnalysis: imports, moduleResolution: resolution, semanticImpact }),
      (error) => error instanceof RepoEvidenceV2Error && error.code === "repo_semantic_impact_topology_mismatch"
    );

    const wrongImpact = { ...semanticImpact, moduleResolutionDigest: `sha256:${"f".repeat(64)}` };
    assert.throws(
      () => createRepositoryEvidenceBundleV2({ repoMap: current, topology, diff, importAnalysis: imports, moduleResolution: resolution, semanticImpact: wrongImpact }),
      (error) => error instanceof RepoEvidenceV2Error && error.code === "repo_semantic_impact_resolution_mismatch"
    );
  });
});
