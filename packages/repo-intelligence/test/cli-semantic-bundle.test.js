import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { scanRepository } from "../src/index.js";

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL("../../../scripts/repo-atlas.mjs", import.meta.url));

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-semantic-bundle-cli-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

async function put(root, relative, content) {
  const destination = path.join(root, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content);
}

async function invoke(args) {
  return execFileAsync(process.execPath, [CLI, ...args], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}

test("semantic-bundle CLI emits v2 resolution and semantic impact references without source bodies", async () => {
  await withFixture(async (root) => {
    const repo = path.join(root, "repo");
    const previousPath = path.join(root, "previous-map.json");
    await put(repo, "package.json", JSON.stringify({ name: "semantic-bundle-cli", private: true }));
    await put(repo, "tsconfig.json", JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@shared": ["src/shared"] } } }));
    await put(repo, "src/shared.ts", "export const CLI_SOURCE_SECRET = 1;\n");
    await put(repo, "src/index.ts", "import { CLI_SOURCE_SECRET } from '@shared';\nexport const value = CLI_SOURCE_SECRET;\n");

    const previous = await scanRepository(repo);
    await writeFile(previousPath, JSON.stringify(previous), "utf8");
    await put(repo, "src/shared.ts", "export const CLI_SOURCE_SECRET = 2;\nexport const changed = true;\n");

    const bundle = JSON.parse((await invoke([
      "semantic-bundle",
      repo,
      `--previous-map=${previousPath}`,
      "--task=shared alias change",
      "--repository=example/semantic-bundle-cli",
      "--ref=main",
      "--commit=abc123"
    ])).stdout);

    assert.equal(bundle.schemaVersion, "repo-evidence-bundle/v2");
    assert.equal(bundle.producer.contractVersion, 2);
    assert.equal(bundle.provenance.repository, "example/semantic-bundle-cli");
    assert.ok(bundle.artifacts.some((artifact) => artifact.kind === "repo-resolution"));
    assert.ok(bundle.artifacts.some((artifact) => artifact.kind === "repo-semantic-impact"));
    assert.ok(bundle.claims.some((claim) => claim.type === "repository-module-resolution"));
    assert.ok(bundle.claims.some((claim) => claim.type === "repository-semantic-change-impact"));
    assert.ok(bundle.summary.aliasResolvedEdges >= 1);
    assert.equal(JSON.stringify(bundle).includes("CLI_SOURCE_SECRET"), false);
  });
});

test("semantic-bundle CLI without previous map still emits semantic resolution but no impact claim", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "resolution-only", private: true }));
    await put(root, "tsconfig.json", JSON.stringify({ compilerOptions: { paths: { "@x": ["./src/x"] } } }));
    await put(root, "src/x.ts", "export const x = true;\n");
    await put(root, "src/index.ts", "import { x } from '@x';\nexport { x };\n");

    const bundle = JSON.parse((await invoke(["semantic-bundle", root])).stdout);
    assert.equal(bundle.schemaVersion, "repo-evidence-bundle/v2");
    assert.ok(bundle.artifacts.some((artifact) => artifact.kind === "repo-resolution"));
    assert.equal(bundle.artifacts.some((artifact) => artifact.kind === "repo-semantic-impact"), false);
    assert.equal(bundle.claims.some((claim) => claim.type === "repository-semantic-change-impact"), false);
    assert.equal(bundle.summary.impactedFiles, null);
  });
});
