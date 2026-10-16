import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { scanRepository } from "../src/index.js";
import { analyzeRepositoryTopology } from "../src/topology.js";
import { analyzeStructuralRisk } from "../src/risk.js";
import { analyzeGitSignals } from "../src/git-signals.js";
import { createRepositoryEvidenceBundle } from "../src/evidence.js";
import { renderRepoAtlasHtml } from "../src/report.js";

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL("../../../scripts/repo-atlas.mjs", import.meta.url));

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-git-integration-"));
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

async function git(root, args, env = {}) {
  return execFileAsync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
}

async function commit(root, message, date, email) {
  await git(root, ["add", "."]);
  await git(root, [
    "-c", "user.name=Integration Test",
    "-c", `user.email=${email}`,
    "commit", "-m", message
  ], {
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date
  });
}

async function invoke(args) {
  return execFileAsync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024
  });
}

test("Git signals flow through evidence and offline report without identity leakage", async () => {
  await withFixture(async (root) => {
    await git(root, ["init", "-q"]);
    await put(root, "package.json", JSON.stringify({ name: "git-integration", private: true }));
    await put(root, "src/shared.ts", "export const shared = 1;\n");
    await put(root, "src/index.ts", "import { shared } from './shared';\nexport { shared };\n");
    await commit(root, "initial", "2026-01-01T12:00:00Z", "first@example.com");
    await put(root, "src/shared.ts", "export const shared = 2;\nexport const extra = 3;\n");
    await commit(root, "shared change", "2026-02-01T12:00:00Z", "second@example.com");

    const map = await scanRepository(root);
    const topology = await analyzeRepositoryTopology(root, map);
    const risk = analyzeStructuralRisk(map, topology);
    const gitSignals = await analyzeGitSignals(root, map, { maxCommits: 20 });
    const bundle = createRepositoryEvidenceBundle({ repoMap: map, topology, risk, gitSignals });
    const html = renderRepoAtlasHtml({ repoMap: map, topology, risk, gitSignals });

    assert.ok(bundle.artifacts.some((artifact) => artifact.kind === "repo-git"));
    assert.ok(bundle.claims.some((claim) => claim.type === "repository-git-history"));
    assert.equal(bundle.summary.gitCommitsAnalyzed, 2);
    assert.equal(bundle.summary.trackedFiles, 3);
    assert.equal(bundle.summary.gitWorkingTreeDirty, false);
    assert.equal(JSON.stringify(bundle).includes("first@example.com"), false);
    assert.equal(JSON.stringify(bundle).includes("second@example.com"), false);

    assert.ok(html.includes("Git history signals"));
    assert.ok(html.includes("2 commits"));
    assert.equal(html.includes("first@example.com"), false);
    assert.equal(html.includes("second@example.com"), false);
  });
});

test("CLI exposes Git signals and can include them in bundles", async () => {
  await withFixture(async (root) => {
    await git(root, ["init", "-q"]);
    await put(root, "package.json", JSON.stringify({ name: "git-cli", private: true }));
    await put(root, "src/index.js", "export const ok = true;\n");
    await commit(root, "initial", "2026-01-01T12:00:00Z", "cli-secret@example.com");

    const gitResult = JSON.parse((await invoke(["git", root, "--max-commits=10"])).stdout);
    assert.equal(gitResult.schemaVersion, "repo-git-signals/v1");
    assert.equal(gitResult.commitsAnalyzed, 1);
    assert.equal(gitResult.metrics.trackedFiles, 2);
    assert.equal(JSON.stringify(gitResult).includes("cli-secret@example.com"), false);

    const bundle = JSON.parse((await invoke([
      "bundle", root,
      "--include-git",
      "--git-max-commits=10",
      "--repository=example/git-cli"
    ])).stdout);
    assert.equal(bundle.schemaVersion, "repo-evidence-bundle/v1");
    assert.ok(bundle.artifacts.some((artifact) => artifact.kind === "repo-git"));
    assert.equal(bundle.summary.gitCommitsAnalyzed, 1);
    assert.equal(JSON.stringify(bundle).includes("cli-secret@example.com"), false);
  });
});
