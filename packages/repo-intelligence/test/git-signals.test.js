import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { scanRepository } from "../src/index.js";
import { analyzeGitSignals, REPO_GIT_SIGNALS_SCHEMA, RepoGitSignalsError } from "../src/git-signals.js";

const execFileAsync = promisify(execFile);

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-git-"));
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

async function commit(root, message, date, email = "alice@example.com") {
  await git(root, ["add", "."]);
  await git(root, ["-c", "user.name=Alice Example", "-c", `user.email=${email}`, "commit", "-m", message], {
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date
  });
}

test("analyzeGitSignals records churn without leaking contributor emails", async () => {
  await withFixture(async (root) => {
    await git(root, ["init", "-q"]);
    await put(root, "src/shared.ts", "export const shared = 1;\n");
    await put(root, "src/leaf.ts", "export const leaf = true;\n");
    await commit(root, "initial", "2026-01-01T12:00:00Z");

    await put(root, "src/shared.ts", "export const shared = 1;\nexport const extra = 2;\n");
    await commit(root, "expand shared", "2026-02-01T12:00:00Z", "bob@example.com");

    await put(root, "src/shared.ts", "export const shared = 2;\nexport const extra = 2;\nexport const third = 3;\n");
    await commit(root, "change shared again", "2026-03-01T12:00:00Z");

    const map = await scanRepository(root);
    const first = await analyzeGitSignals(root, map, { maxCommits: 20 });
    const second = await analyzeGitSignals(root, map, { maxCommits: 20 });

    assert.equal(first.schemaVersion, REPO_GIT_SIGNALS_SCHEMA);
    assert.equal(first.repositoryDigest, map.digest);
    assert.equal(first.workingTreeDirty, false);
    assert.equal(first.commitsAnalyzed, 3);
    assert.equal(first.contributorCount, 2);
    assert.equal(first.digest, second.digest);
    assert.match(first.headCommit, /^[0-9a-f]{40}$/u);

    const shared = first.files.find((file) => file.path === "src/shared.ts");
    const leaf = first.files.find((file) => file.path === "src/leaf.ts");
    assert.equal(shared.commitsTouched, 3);
    assert.equal(shared.contributorCount, 2);
    assert.ok(shared.churn > leaf.churn);
    assert.match(shared.topContributorId, /^contributor:[0-9a-f]{16}$/u);
    assert.equal(shared.lastChangedAt, "2026-03-01T12:00:00+00:00");
    assert.equal(JSON.stringify(first).includes("alice@example.com"), false);
    assert.equal(JSON.stringify(first).includes("bob@example.com"), false);
  });
});

test("analyzeGitSignals marks a dirty working tree while preserving the committed HEAD", async () => {
  await withFixture(async (root) => {
    await git(root, ["init", "-q"]);
    await put(root, "src/index.js", "export const value = 1;\n");
    await commit(root, "initial", "2026-01-01T12:00:00Z");
    await put(root, "src/index.js", "export const value = 2;\n");

    const map = await scanRepository(root);
    const signals = await analyzeGitSignals(root, map);
    assert.equal(signals.workingTreeDirty, true);
    assert.equal(signals.metrics.trackedFiles, 1);
    assert.equal(signals.files[0].tracked, true);
  });
});

test("analyzeGitSignals fails clearly outside a Git working tree", async () => {
  await withFixture(async (root) => {
    await put(root, "src/index.js", "export const ok = true;\n");
    const map = await scanRepository(root);
    await assert.rejects(
      () => analyzeGitSignals(root, map),
      (error) => error instanceof RepoGitSignalsError && error.code === "repo_git_not_repository"
    );
  });
});
