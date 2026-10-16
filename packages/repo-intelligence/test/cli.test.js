import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL("../../../scripts/repo-atlas.mjs", import.meta.url));

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-atlas-cli-"));
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

test("repo-atlas CLI emits map, topology and context JSON", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "cli-fixture", dependencies: { zod: "^4.0.0" } }));
    await put(root, "src/billing.ts", "export const billing = true;\n");
    await put(root, "src/index.ts", "import { billing } from './billing';\nexport { billing };\n");

    const mapResult = await invoke(["map", root]);
    const map = JSON.parse(mapResult.stdout);
    assert.equal(map.schemaVersion, "repo-map/v1");
    assert.equal(map.root.name, path.basename(root));

    const topologyResult = await invoke(["topology", root]);
    const topology = JSON.parse(topologyResult.stdout);
    assert.equal(topology.schemaVersion, "repo-topology/v1");
    assert.equal(topology.modules[0].name, "cli-fixture");
    assert.ok(topology.fileImports.some((edge) => edge.to === "src/billing.ts"));

    const contextResult = await invoke([
      "context", root,
      "--task=billing change",
      "--max-files=1",
      "--max-tokens=1000"
    ]);
    const context = JSON.parse(contextResult.stdout);
    assert.equal(context.schemaVersion, "repo-context-evidence/v1");
    assert.equal(context.selected.length, 1);
    assert.equal(context.selected[0].path, "src/billing.ts");
  });
});

test("repo-atlas CLI fails closed when context task is omitted", async () => {
  await withFixture(async (root) => {
    await put(root, "src/index.js", "export const ok = true;\n");
    await assert.rejects(
      () => invoke(["context", root]),
      (error) => {
        assert.equal(error.code, 1);
        const payload = JSON.parse(error.stderr);
        assert.equal(payload.error, "repo_atlas_task_required");
        return true;
      }
    );
  });
});
