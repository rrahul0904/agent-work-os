import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanRepository } from "../src/index.js";
import { analyzeRepositoryImports } from "../src/import-analysis.js";
import { analyzeRepositoryTopology } from "../src/topology.js";
import { diffRepositoryMaps } from "../src/diff.js";
import { analyzeRepositoryImpact, RepoImpactError } from "../src/impact.js";

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-imports-"));
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

test("parser-backed import analysis classifies JS/TS imports without comment or string false positives", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "parser-fixture", private: true }));
    await put(root, "src/types.ts", "export type T = { id: string };\n");
    await put(root, "src/shared.ts", "export const shared = 1;\n");
    await put(root, "src/lazy.ts", "export const lazy = true;\n");
    await put(root, "src/main.tsx", [
      "import type { T } from './types';",
      "import { shared } from './shared';",
      "export { shared as again } from './shared';",
      "export type { T as PublicT } from './types';",
      "const lazy = () => import('./lazy');",
      "const pkg = require('@scope/pkg/subpath');",
      "const fake = \"require('./fake')\";",
      "// import './ghost';",
      "export const view = <div>{shared}{String(pkg)}{String(lazy)}{fake}</div>;"
    ].join("\n"));

    const map = await scanRepository(root);
    const first = await analyzeRepositoryImports(root, map);
    const second = await analyzeRepositoryImports(root, map);

    assert.equal(first.schemaVersion, "repo-import-analysis/v1");
    assert.equal(first.parser.package, "@typescript/typescript6");
    assert.equal(first.metrics.fallbackFiles, 0);
    assert.equal(first.digest, second.digest);

    const main = first.files.find((file) => file.path === "src/main.tsx");
    assert.equal(main.parseMode, "parser");
    assert.equal(main.diagnosticCount, 0);

    const kinds = first.edges.filter((edge) => edge.from === "src/main.tsx").map((edge) => edge.importKind);
    assert.ok(kinds.includes("type-import"));
    assert.ok(kinds.includes("static-import"));
    assert.ok(kinds.includes("export-from"));
    assert.ok(kinds.includes("type-export-from"));
    assert.ok(kinds.includes("dynamic-import"));
    assert.ok(kinds.includes("require"));

    assert.ok(first.edges.some((edge) => edge.specifier === "./types" && edge.typeOnly === true && edge.to === "src/types.ts"));
    assert.ok(first.edges.some((edge) => edge.specifier === "./lazy" && edge.targetKind === "file" && edge.to === "src/lazy.ts"));
    assert.ok(first.edges.some((edge) => edge.specifier === "@scope/pkg/subpath" && edge.targetKind === "package" && edge.to === "@scope/pkg"));
    assert.equal(first.edges.some((edge) => edge.specifier.includes("fake") || edge.specifier.includes("ghost")), false);
    assert.equal(JSON.stringify(first).includes("export const shared = 1"), false);
  });
});

test("malformed source uses explicit lexical fallback without retaining source bodies", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "fallback-fixture", private: true }));
    await put(root, "src/shared.ts", "export const shared = true;\n");
    await put(root, "src/broken.ts", "const SECRET_VALUE = 'never-retain';\nimport { from './shared';\nconst x = require('./shared');\n");

    const map = await scanRepository(root);
    const analysis = await analyzeRepositoryImports(root, map);
    const broken = analysis.files.find((file) => file.path === "src/broken.ts");

    assert.equal(broken.parseMode, "lexical-fallback");
    assert.ok(broken.diagnosticCount > 0);
    assert.ok(analysis.edges.some((edge) => edge.from === "src/broken.ts" && edge.importKind === "require" && edge.to === "src/shared.ts"));
    assert.equal(JSON.stringify(analysis).includes("never-retain"), false);
  });
});

test("change impact propagates reverse imports deterministically and obeys maxDepth", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "impact-fixture", private: true }));
    await put(root, "src/shared.ts", "export const shared = 1;\n");
    await put(root, "src/leaf.ts", "import { shared } from './shared';\nexport const leaf = shared;\n");
    await put(root, "src/page.ts", "import { leaf } from './leaf';\nexport const page = leaf;\n");
    await put(root, "src/main.ts", "import { page } from './page';\nexport const main = page;\n");

    const previous = await scanRepository(root);
    await put(root, "src/shared.ts", "export const shared = 2;\nexport const changed = true;\n");
    const current = await scanRepository(root);
    const diff = diffRepositoryMaps(previous, current);
    const imports = await analyzeRepositoryImports(root, current);
    const topology = await analyzeRepositoryTopology(root, current);

    const impact = analyzeRepositoryImpact({ repoMap: current, importAnalysis: imports, diff, topology, maxDepth: 2 });
    const changed = impact.files.find((file) => file.path === "src/shared.ts");

    assert.equal(impact.schemaVersion, "repo-impact/v1");
    assert.deepEqual(changed.directDependents, ["src/leaf.ts"]);
    assert.deepEqual(changed.transitiveDependents, ["src/page.ts"]);
    assert.equal(changed.transitiveDependents.includes("src/main.ts"), false);
    assert.equal(changed.maxDepthReached, 2);
    assert.deepEqual(impact.impactedFiles, ["src/leaf.ts", "src/page.ts"]);
    assert.equal(impact.methodology.typeOnlyEdgesIncluded, true);

    const repeated = analyzeRepositoryImpact({ repoMap: current, importAnalysis: imports, diff, topology, maxDepth: 2 });
    assert.equal(impact.digest, repeated.digest);
  });
});

test("change impact handles cycles and rejects artifacts from another snapshot", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "cycle-fixture", private: true }));
    await put(root, "src/a.ts", "import { b } from './b';\nexport const a = b;\n");
    await put(root, "src/b.ts", "import { a } from './a';\nexport const b = a;\n");
    const previous = await scanRepository(root);
    await put(root, "src/a.ts", "import { b } from './b';\nexport const a = b + 1;\n");
    const current = await scanRepository(root);
    const diff = diffRepositoryMaps(previous, current);
    const imports = await analyzeRepositoryImports(root, current);

    const impact = analyzeRepositoryImpact({ repoMap: current, importAnalysis: imports, diff, maxDepth: 10 });
    const a = impact.files.find((file) => file.path === "src/a.ts");
    assert.deepEqual(a.directDependents, ["src/b.ts"]);
    assert.equal(a.transitiveDependents.includes("src/a.ts"), false);

    await put(root, "src/c.ts", "export const c = true;\n");
    const newer = await scanRepository(root);
    assert.throws(
      () => analyzeRepositoryImpact({ repoMap: newer, importAnalysis: imports, diff }),
      (error) => error instanceof RepoImpactError && error.code.endsWith("digest_mismatch")
    );
  });
});
