import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanRepository } from "../src/index.js";
import { analyzeRepositoryTopology } from "../src/topology.js";
import { analyzeRepositoryImports } from "../src/import-analysis.js";
import { analyzeRepositoryImpact } from "../src/impact.js";
import { diffRepositoryMaps } from "../src/diff.js";
import { renderRepoAtlasHtml, RepoReportError } from "../src/report.js";

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-report-m8-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

async function put(root, relative, content) {
  const destination = path.join(root, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content);
}

test("M8 report embeds parser and impact metadata without source bodies", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "report-m8", private: true }));
    await put(root, "src/core.ts", "export const core = 1;\n");
    await put(root, "src/api.ts", "import { core } from './core';\nexport const api = core;\n");
    const previous = await scanRepository(root);

    await put(root, "src/core.ts", "const SOURCE_SECRET = 'must-not-leak';\nexport const core = 2;\n");
    const current = await scanRepository(root);
    const topology = await analyzeRepositoryTopology(root, current);
    const imports = await analyzeRepositoryImports(root, current);
    const diff = diffRepositoryMaps(previous, current);
    const impact = analyzeRepositoryImpact({ repoMap: current, importAnalysis: imports, diff, topology, maxDepth: 3 });
    const html = renderRepoAtlasHtml({ repoMap: current, topology, diff, importAnalysis: imports, impact });

    assert.ok(html.includes("Parser import coverage"));
    assert.ok(html.includes("Change impact"));
    assert.ok(html.includes("src/core.ts"));
    assert.ok(html.includes("src/api.ts"));
    assert.ok(html.includes('"impactedFiles":1'));
    assert.ok(html.includes('"fallbackFiles":0'));
    assert.equal(html.includes("must-not-leak"), false);
  });
});

test("M8 report rejects impact not bound to supplied import analysis", async () => {
  await withFixture(async (root) => {
    const left = path.join(root, "left");
    const right = path.join(root, "right");
    await put(left, "src/core.ts", "export const core = 1;\n");
    const previous = await scanRepository(left);
    await put(left, "src/core.ts", "export const core = 2;\n");
    const current = await scanRepository(left);
    const leftImports = await analyzeRepositoryImports(left, current);
    const diff = diffRepositoryMaps(previous, current);
    const impact = analyzeRepositoryImpact({ repoMap: current, importAnalysis: leftImports, diff });

    await put(right, "src/other.ts", "export const other = true;\n");
    const rightMap = await scanRepository(right);
    const rightImports = await analyzeRepositoryImports(right, rightMap);

    assert.throws(
      () => renderRepoAtlasHtml({ repoMap: current, diff, importAnalysis: rightImports, impact }),
      (error) => error instanceof RepoReportError && error.code === "repo_report_imports_invalid"
    );
  });
});
