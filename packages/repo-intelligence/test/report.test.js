import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanRepository } from "../src/index.js";
import { analyzeRepositoryTopology } from "../src/topology.js";
import { analyzeStructuralRisk } from "../src/risk.js";
import { diffRepositoryMaps } from "../src/diff.js";
import { renderRepoAtlasHtml, RepoReportError } from "../src/report.js";

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-report-"));
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

test("renderRepoAtlasHtml creates a self-contained metadata-only report", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "report-fixture", private: true }));
    await put(root, "src/shared.ts", "const SECRET = 'source-body-must-not-leak';\nexport const shared = true;\n");
    await put(root, "src/index.ts", "import { shared } from './shared';\nexport { shared };\n");

    const map = await scanRepository(root);
    const topology = await analyzeRepositoryTopology(root, map);
    const risk = analyzeStructuralRisk(map, topology);
    const html = renderRepoAtlasHtml({ repoMap: map, topology, risk, title: "Fixture Repo Atlas" });

    assert.match(html, /^<!doctype html>/u);
    assert.ok(html.includes("Fixture Repo Atlas"));
    assert.ok(html.includes("repo-report/v1"));
    assert.ok(html.includes("src/shared.ts"));
    assert.ok(html.includes("report-fixture"));
    assert.equal(html.includes("source-body-must-not-leak"), false);
    assert.equal(/<(?:script|link|img)[^>]+(?:src|href)=["']https?:/iu.test(html), false);
    assert.equal(html.includes("<script src="), false);
    assert.equal(html.includes("<link rel="), false);
  });
});

test("renderRepoAtlasHtml safely embeds adversarial title and repository metadata", async () => {
  await withFixture(async (root) => {
    await put(root, "src/escape.js", "export const escape = true;\n");
    const map = await scanRepository(root);
    const title = "Repo </script><script>globalThis.pwned=true</script> Atlas";
    const html = renderRepoAtlasHtml({ repoMap: map, title });

    assert.equal(html.includes("<title>Repo </script>"), false);
    assert.equal(html.includes("</script><script>globalThis.pwned=true</script>"), false);
    assert.ok(html.includes("&lt;/script&gt;"));
    assert.ok(html.includes("\\u003c/script\\u003e"));
  });
});

test("renderRepoAtlasHtml includes drift only when it targets the current map", async () => {
  await withFixture(async (root) => {
    const previousRoot = path.join(root, "previous");
    const currentRoot = path.join(root, "current");
    const otherRoot = path.join(root, "other");
    await put(previousRoot, "src/index.ts", "export const value = 1;\n");
    await put(currentRoot, "src/index.ts", "export const value = 1;\nexport const extra = 2;\n");
    await put(otherRoot, "src/index.ts", "export const other = true;\n");

    const previousMap = await scanRepository(previousRoot);
    const currentMap = await scanRepository(currentRoot);
    const otherMap = await scanRepository(otherRoot);
    const diff = diffRepositoryMaps(previousMap, currentMap);
    const html = renderRepoAtlasHtml({ repoMap: currentMap, diff });
    assert.ok(html.includes('"affectedFiles":1'));

    assert.throws(
      () => renderRepoAtlasHtml({ repoMap: otherMap, diff }),
      (error) => error instanceof RepoReportError && error.code === "repo_report_diff_invalid"
    );
  });
});
