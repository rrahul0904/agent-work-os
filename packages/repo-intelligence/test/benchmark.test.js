import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { RepoScanError, scanRepository, selectRepositoryContext } from "../src/index.js";
import { analyzeRepositoryTopology } from "../src/topology.js";

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-bench-"));
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

test("wide repository corpus remains deterministic and context selection stays bounded", async () => {
  await withFixture(async (root) => {
    const writes = [];
    for (let i = 0; i < 500; i += 1) {
      const area = String(i % 20).padStart(2, "0");
      const name = String(i).padStart(4, "0");
      writes.push(put(root, `src/area-${area}/feature-${name}.ts`, `export const feature${i} = ${i};\n`));
    }
    writes.push(put(root, "src/billing/stripe-cancel.ts", "export const cancelStripeSubscription = true;\n"));
    await Promise.all(writes);

    const first = await scanRepository(root);
    const second = await scanRepository(root);
    assert.equal(first.metrics.files, 501);
    assert.equal(first.digest, second.digest);

    const context = selectRepositoryContext(first, {
      task: "stripe billing subscription cancellation",
      maxFiles: 8,
      maxEstimatedTokens: 1_000
    });
    assert.ok(context.selected.length <= 8);
    assert.ok(context.estimatedTokens <= 1_000);
    assert.equal(context.selected[0].path, "src/billing/stripe-cancel.ts");
  });
});

test("deep repository corpus succeeds within limit and fails closed beyond configured depth", async () => {
  await withFixture(async (root) => {
    let relative = "src";
    for (let i = 0; i < 35; i += 1) relative += `/level-${String(i).padStart(2, "0")}`;
    await put(root, `${relative}/leaf.js`, "export const leaf = true;\n");

    const map = await scanRepository(root, { limits: { maxDepth: 50 } });
    assert.equal(map.metrics.files, 1);

    await assert.rejects(
      () => scanRepository(root, { limits: { maxDepth: 20 } }),
      (error) => error instanceof RepoScanError && error.code === "repo_depth_limit_exceeded"
    );
  });
});

test("synthetic 30-module monorepo produces deterministic workspace topology", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({
      name: "synthetic-monorepo",
      private: true,
      workspaces: ["packages/*"]
    }));

    for (let i = 0; i < 30; i += 1) {
      const name = `@synthetic/pkg-${String(i).padStart(2, "0")}`;
      const dependencies = i === 0 ? {} : { [`@synthetic/pkg-${String(i - 1).padStart(2, "0")}`]: "workspace:*" };
      await put(root, `packages/pkg-${String(i).padStart(2, "0")}/package.json`, JSON.stringify({
        name,
        private: true,
        dependencies
      }));
      const source = i === 0
        ? "export const value = 0;\n"
        : `import { value as previous } from '@synthetic/pkg-${String(i - 1).padStart(2, "0")}';\nexport const value = previous + 1;\n`;
      await put(root, `packages/pkg-${String(i).padStart(2, "0")}/src/index.ts`, source);
    }

    const map = await scanRepository(root);
    const first = await analyzeRepositoryTopology(root, map);
    const second = await analyzeRepositoryTopology(root, map);

    assert.equal(first.metrics.modules, 31);
    assert.equal(first.moduleEdges.filter((edge) => edge.kind === "workspace-dependency").length, 29);
    assert.equal(first.digest, second.digest);
    assert.ok(first.centrality[0].degree >= 1);
  });
});

test("file-count limit fails closed on wide repositories", async () => {
  await withFixture(async (root) => {
    await Promise.all(Array.from({ length: 12 }, (_, i) => put(root, `src/file-${i}.js`, `export const x${i} = ${i};\n`)));
    await assert.rejects(
      () => scanRepository(root, { limits: { maxFiles: 10 } }),
      (error) => error instanceof RepoScanError && error.code === "repo_file_limit_exceeded"
    );
  });
});
