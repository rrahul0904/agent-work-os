import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanRepository } from "../src/index.js";
import { diffRepositoryMaps, REPO_DIFF_SCHEMA, RepoDiffError } from "../src/diff.js";

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-diff-"));
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

test("diffRepositoryMaps reports added removed and changed files", async () => {
  await withFixture(async (root) => {
    const previousRoot = path.join(root, "previous");
    const currentRoot = path.join(root, "current");

    await put(previousRoot, "src/keep.ts", "export const value = 1;\n");
    await put(previousRoot, "src/remove.ts", "export const removed = true;\n");
    await put(previousRoot, "src/change.ts", "export const change = 1;\n");

    await put(currentRoot, "src/keep.ts", "export const value = 1;\n");
    await put(currentRoot, "src/add.ts", "export const added = true;\n");
    await put(currentRoot, "src/change.ts", "export const change = 1;\nexport const extra = 2;\n");

    const previous = await scanRepository(previousRoot);
    const current = await scanRepository(currentRoot);
    const first = diffRepositoryMaps(previous, current);
    const second = diffRepositoryMaps(previous, current);

    assert.equal(first.schemaVersion, REPO_DIFF_SCHEMA);
    assert.equal(first.changed, true);
    assert.deepEqual(first.files.added.map((file) => file.path), ["src/add.ts"]);
    assert.deepEqual(first.files.removed.map((file) => file.path), ["src/remove.ts"]);
    assert.deepEqual(first.files.changed.map((file) => file.path), ["src/change.ts"]);
    assert.ok(first.files.changed[0].changes.includes("lines"));
    assert.equal(first.summary.affectedFiles, 3);
    assert.equal(first.digest, second.digest);
  });
});

test("diffRepositoryMaps returns unchanged for equivalent maps", async () => {
  await withFixture(async (root) => {
    await put(root, "src/index.js", "export const ok = true;\n");
    const map = await scanRepository(root);
    const diff = diffRepositoryMaps(map, map);
    assert.equal(diff.changed, false);
    assert.equal(diff.summary.affectedFiles, 0);
    assert.deepEqual(diff.languageDelta, []);
  });
});

test("diffRepositoryMaps rejects non-map artifacts", () => {
  assert.throws(
    () => diffRepositoryMaps({ schemaVersion: "wrong" }, { schemaVersion: "wrong" }),
    (error) => error instanceof RepoDiffError && error.code === "repo_diff_map_invalid"
  );
});
