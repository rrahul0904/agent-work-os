import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL("../../../scripts/repo-atlas.mjs", import.meta.url));

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-atlas-diff-cli-"));
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
  return execFileAsync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

test("repo-atlas CLI maps two snapshots and diffs them", async () => {
  await withFixture(async (root) => {
    const previousRepo = path.join(root, "previous");
    const currentRepo = path.join(root, "current");
    const previousMap = path.join(root, "previous-map.json");
    const currentMap = path.join(root, "current-map.json");

    await put(previousRepo, "src/index.ts", "export const value = 1;\n");
    await put(currentRepo, "src/index.ts", "export const value = 1;\nexport const extra = 2;\n");
    await put(currentRepo, "src/new.ts", "export const created = true;\n");

    await invoke(["map", previousRepo, `--output=${previousMap}`]);
    await invoke(["map", currentRepo, `--output=${currentMap}`]);

    const result = await invoke(["diff", previousMap, currentMap]);
    const diff = JSON.parse(result.stdout);
    assert.equal(diff.schemaVersion, "repo-diff/v1");
    assert.equal(diff.changed, true);
    assert.deepEqual(diff.files.added.map((file) => file.path), ["src/new.ts"]);
    assert.deepEqual(diff.files.changed.map((file) => file.path), ["src/index.ts"]);
    assert.equal(diff.summary.affectedFiles, 2);

    const persistedPrevious = JSON.parse(await readFile(previousMap, "utf8"));
    assert.equal(diff.previousDigest, persistedPrevious.digest);
  });
});

test("repo-atlas diff fails when current map argument is missing", async () => {
  await withFixture(async (root) => {
    const mapPath = path.join(root, "map.json");
    await put(root, "repo/src/index.js", "export const ok = true;\n");
    await invoke(["map", path.join(root, "repo"), `--output=${mapPath}`]);

    await assert.rejects(
      () => invoke(["diff", mapPath]),
      (error) => {
        assert.equal(error.code, 1);
        const payload = JSON.parse(error.stderr);
        assert.equal(payload.error, "repo_atlas_diff_arguments_required");
        return true;
      }
    );
  });
});
