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
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-m9-cli-"));
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

test("CLI emits semantic module resolution without source bodies", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "m9-cli", private: true }));
    await put(root, "tsconfig.json", JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@core/*": ["src/core/*"] } } }));
    await put(root, "src/core/secret.ts", "export const NEVER_EMBED_THIS_SOURCE = 1;\n");
    await put(root, "src/index.ts", "import { NEVER_EMBED_THIS_SOURCE } from '@core/secret';\nexport const value = NEVER_EMBED_THIS_SOURCE;\n");

    const resolution = JSON.parse((await invoke(["resolve", root])).stdout);
    assert.equal(resolution.schemaVersion, "repo-module-resolution/v1");
    assert.ok(resolution.resolutions.some((item) => item.specifier === "@core/secret" && item.targetFile === "src/core/secret.ts"));
    assert.equal(JSON.stringify(resolution).includes("NEVER_EMBED_THIS_SOURCE"), false);
  });
});

test("CLI semantic-impact follows aliased dependencies and requires a previous map", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "m9-impact-cli", private: true }));
    await put(root, "tsconfig.json", JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@shared": ["src/shared"] } } }));
    await put(root, "src/shared.ts", "export const shared = 1;\n");
    await put(root, "src/consumer.ts", "import { shared } from '@shared';\nexport const consumer = shared;\n");
    await put(root, "src/main.ts", "import { consumer } from './consumer';\nexport const main = consumer;\n");

    const previous = await scanRepository(root);
    const previousPath = path.join(root, "previous-map.json");
    await writeFile(previousPath, JSON.stringify(previous), "utf8");
    await put(root, "src/shared.ts", "export const shared = 2;\nexport const changed = true;\n");

    const impact = JSON.parse((await invoke(["semantic-impact", root, `--previous-map=${previousPath}`, "--max-depth=5"])).stdout);
    assert.equal(impact.schemaVersion, "repo-impact/v2");
    assert.ok(impact.impactedFiles.includes("src/consumer.ts"));
    assert.ok(impact.impactedFiles.includes("src/main.ts"));
    assert.ok(impact.metrics.aliasResolvedEdges >= 1);

    await assert.rejects(
      () => invoke(["semantic-impact", root]),
      (error) => JSON.parse(error.stderr).error === "repo_atlas_previous_map_required"
    );
  });
});
