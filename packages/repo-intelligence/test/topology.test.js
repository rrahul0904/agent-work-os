import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanRepository } from "../src/index.js";
import { analyzeRepositoryTopology, REPO_TOPOLOGY_SCHEMA, RepoTopologyError } from "../src/topology.js";

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-topology-"));
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

test("analyzeRepositoryTopology detects workspace modules and JS/TS dependencies", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({
      name: "acme-platform",
      private: true,
      workspaces: ["packages/*"]
    }));
    await put(root, "packages/api/package.json", JSON.stringify({
      name: "@acme/api",
      private: true,
      dependencies: { "@acme/shared": "workspace:*", express: "^5.0.0" }
    }));
    await put(root, "packages/shared/package.json", JSON.stringify({
      name: "@acme/shared",
      private: true,
      dependencies: { lodash: "^4.17.0" }
    }));
    await put(root, "packages/api/src/index.ts", [
      "import { shared } from '@acme/shared';",
      "import { handler } from './handler';",
      "export const api = () => handler(shared);"
    ].join("\n"));
    await put(root, "packages/api/src/handler.ts", "export const handler = (value) => value;\n");
    await put(root, "packages/shared/src/index.ts", [
      "import map from 'lodash/map';",
      "export const shared = map([1], (x) => x)[0];"
    ].join("\n"));

    const repoMap = await scanRepository(root);
    const topology = await analyzeRepositoryTopology(root, repoMap);

    assert.equal(topology.schemaVersion, REPO_TOPOLOGY_SCHEMA);
    assert.equal(topology.repositoryDigest, repoMap.digest);
    assert.deepEqual(topology.modules.map((module) => module.name), [
      "acme-platform",
      "@acme/api",
      "@acme/shared"
    ]);
    assert.ok(topology.moduleEdges.some((edge) =>
      edge.kind === "workspace-dependency" &&
      edge.from === "module:packages/api" &&
      edge.to === "module:packages/shared"
    ));
    assert.ok(topology.moduleEdges.some((edge) =>
      edge.kind === "external-dependency" &&
      edge.from === "module:packages/shared" &&
      edge.to === "npm:lodash"
    ));
    assert.ok(topology.fileImports.some((edge) =>
      edge.from === "packages/api/src/index.ts" &&
      edge.to === "packages/api/src/handler.ts" &&
      edge.boundary === "intra-module"
    ));
    assert.ok(topology.externalPackages.some((node) => node.name === "express"));
    assert.ok(topology.externalPackages.some((node) => node.name === "lodash"));
    assert.match(topology.digest, /^sha256:[0-9a-f]{64}$/u);
  });
});

test("analyzeRepositoryTopology is deterministic", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "fixture", dependencies: { zod: "^4.0.0" } }));
    await put(root, "src/a.js", "import './b.js';\nexport const a = true;\n");
    await put(root, "src/b.js", "export const b = true;\n");

    const repoMap = await scanRepository(root);
    const first = await analyzeRepositoryTopology(root, repoMap);
    const second = await analyzeRepositoryTopology(root, repoMap);
    assert.equal(first.digest, second.digest);
    assert.deepEqual(first, second);
  });
});

test("analyzeRepositoryTopology rejects invalid package manifests", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", "{ broken-json\n");
    await put(root, "src/index.js", "export const ok = true;\n");
    const repoMap = await scanRepository(root);

    await assert.rejects(
      () => analyzeRepositoryTopology(root, repoMap),
      (error) => error instanceof RepoTopologyError && error.code === "repo_package_json_invalid"
    );
  });
});
