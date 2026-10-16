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
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-report-cli-"));
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
  return execFileAsync(process.execPath, [CLI, ...args], { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
}

test("report CLI writes a self-contained HTML artifact with optional drift", async () => {
  await withFixture(async (root) => {
    const previousRepo = path.join(root, "previous");
    const currentRepo = path.join(root, "current");
    const previousMap = path.join(root, "previous-map.json");
    const reportPath = path.join(root, "repo-atlas.html");

    await put(previousRepo, "package.json", JSON.stringify({ name: "report-cli" }));
    await put(previousRepo, "src/index.ts", "export const value = 1;\n");
    await put(currentRepo, "package.json", JSON.stringify({ name: "report-cli" }));
    await put(currentRepo, "src/index.ts", "const SECRET = 'cli-report-secret';\nexport const value = 2;\n");
    await put(currentRepo, "src/new.ts", "export const created = true;\n");

    await invoke(["map", previousRepo, `--output=${previousMap}`]);
    const result = await invoke([
      "report", currentRepo,
      `--previous-map=${previousMap}`,
      "--title=Report CLI Fixture",
      `--output=${reportPath}`
    ]);

    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.ok, true);
    assert.equal(receipt.schemaVersion, "repo-report/v1");
    assert.equal(receipt.output, path.resolve(reportPath));
    assert.match(receipt.repositoryDigest, /^sha256:[0-9a-f]{64}$/u);

    const html = await readFile(reportPath, "utf8");
    assert.ok(html.includes("Report CLI Fixture"));
    assert.ok(html.includes("src/new.ts"));
    assert.ok(html.includes('"affectedFiles":2'));
    assert.equal(html.includes("cli-report-secret"), false);
    assert.equal(/<(?:script|link|img)[^>]+(?:src|href)=["']https?:/iu.test(html), false);
  });
});

test("report CLI can stream HTML to stdout without creating a file", async () => {
  await withFixture(async (root) => {
    await put(root, "src/index.js", "export const ok = true;\n");
    const result = await invoke(["report", root]);
    assert.match(result.stdout, /^<!doctype html>/u);
    assert.ok(result.stdout.includes("Repo Atlas"));
  });
});
