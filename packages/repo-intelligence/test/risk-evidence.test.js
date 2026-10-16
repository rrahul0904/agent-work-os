import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanRepository, selectRepositoryContext } from "../src/index.js";
import { analyzeRepositoryTopology } from "../src/topology.js";
import { analyzeStructuralRisk, REPO_RISK_SCHEMA, RepoRiskError } from "../src/risk.js";
import { createRepositoryEvidenceBundle, REPO_EVIDENCE_BUNDLE_SCHEMA, RepoEvidenceError } from "../src/evidence.js";

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-risk-"));
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

test("structural risk ranks shared large files ahead of simple leaves", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "risk-fixture", private: true }));
    const sharedBody = ["export const shared = 1;", ...Array.from({ length: 260 }, (_, i) => `export const v${i} = ${i};`)].join("\n");
    await put(root, "src/shared.ts", sharedBody);
    await put(root, "src/a.ts", "import { shared } from './shared';\nexport const a = shared;\n");
    await put(root, "src/b.ts", "import { shared } from './shared';\nexport const b = shared;\n");
    await put(root, "src/c.ts", "import { shared } from './shared';\nexport const c = shared;\n");
    await put(root, "src/leaf.ts", "export const leaf = true;\n");

    const map = await scanRepository(root);
    const topology = await analyzeRepositoryTopology(root, map);
    const risk = analyzeStructuralRisk(map, topology, { topN: 5 });

    assert.equal(risk.schemaVersion, REPO_RISK_SCHEMA);
    assert.equal(risk.repositoryDigest, map.digest);
    assert.equal(risk.topologyDigest, topology.digest);
    assert.equal(risk.hotspots[0].path, "src/shared.ts");
    assert.ok(risk.hotspots[0].incomingImports >= 3);
    assert.ok(risk.hotspots[0].reasons.includes("medium-large-file"));
    assert.ok(risk.hotspots[0].reasons.includes("shared-dependency"));
    assert.match(risk.digest, /^sha256:[0-9a-f]{64}$/u);
  });
});

test("repository evidence bundle is deterministic and contains only artifact references plus metadata", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "evidence-fixture", private: true }));
    await put(root, "src/billing.ts", "const SECRET = 'source-body-must-not-leak';\nexport const billing = true;\n");
    await put(root, "src/index.ts", "import { billing } from './billing';\nexport { billing };\n");

    const map = await scanRepository(root);
    const topology = await analyzeRepositoryTopology(root, map);
    const context = selectRepositoryContext(map, { task: "billing change", maxFiles: 2, maxEstimatedTokens: 10_000 });
    const risk = analyzeStructuralRisk(map, topology);

    const input = {
      repoMap: map,
      topology,
      context,
      risk,
      provenance: { repository: "example/evidence-fixture", ref: "main", commit: "abc123", source: "local-checkout" }
    };
    const first = createRepositoryEvidenceBundle(input);
    const second = createRepositoryEvidenceBundle(input);

    assert.equal(first.schemaVersion, REPO_EVIDENCE_BUNDLE_SCHEMA);
    assert.equal(first.digest, second.digest);
    assert.equal(first.repositoryDigest, map.digest);
    assert.equal(first.artifacts.length, 4);
    assert.deepEqual(first.selectedPaths, context.selected.map((item) => item.path));
    assert.equal(JSON.stringify(first).includes("source-body-must-not-leak"), false);
    assert.match(first.digest, /^sha256:[0-9a-f]{64}$/u);
  });
});

test("risk and evidence refuse artifacts from a different repository map", async () => {
  await withFixture(async (root) => {
    const one = path.join(root, "one");
    const two = path.join(root, "two");
    await put(one, "package.json", JSON.stringify({ name: "one" }));
    await put(one, "src/index.js", "export const one = true;\n");
    await put(two, "package.json", JSON.stringify({ name: "two" }));
    await put(two, "src/index.js", "export const two = true;\n");

    const mapOne = await scanRepository(one);
    const mapTwo = await scanRepository(two);
    const topologyOne = await analyzeRepositoryTopology(one, mapOne);

    assert.throws(
      () => analyzeStructuralRisk(mapTwo, topologyOne),
      (error) => error instanceof RepoRiskError && error.code === "repo_topology_digest_mismatch"
    );

    assert.throws(
      () => createRepositoryEvidenceBundle({ repoMap: mapTwo, topology: topologyOne }),
      (error) => error instanceof RepoEvidenceError && error.code === "repo_topology_invalid_digest_mismatch"
    );
  });
});
