import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanRepository } from "../src/index.js";
import { analyzeRepositoryImports } from "../src/import-analysis.js";
import { analyzeModuleResolution, RepoModuleResolutionError } from "../src/module-resolution.js";
import { analyzeSemanticRepositoryImpact, RepoImpactV2Error } from "../src/impact-v2.js";
import { analyzeRepositoryTopology } from "../src/topology.js";
import { diffRepositoryMaps } from "../src/diff.js";

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-resolution-"));
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

test("module resolution handles tsconfig paths, baseUrl, workspace packages and external packages deterministically", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "root-app", private: true }));
    await put(root, "tsconfig.json", JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@core/*": ["src/core/*"],
          "@root": ["src/index"]
        }
      }
    }));
    await put(root, "src/core/util.ts", "export const util = 1;\n");
    await put(root, "src/index.ts", [
      "import { util } from '@core/util';",
      "import { util as viaBase } from 'src/core/util';",
      "import { shared } from '@acme/shared';",
      "import { nested } from '@acme/shared/src/nested';",
      "import external from 'external-pkg/subpath';",
      "export const value = util + viaBase + shared + nested + Number(Boolean(external));"
    ].join("\n"));
    await put(root, "packages/shared/package.json", JSON.stringify({ name: "@acme/shared", private: true, types: "src/index.ts" }));
    await put(root, "packages/shared/src/index.ts", "export const shared = 2;\n");
    await put(root, "packages/shared/src/nested.ts", "export const nested = 3;\n");

    const map = await scanRepository(root);
    const imports = await analyzeRepositoryImports(root, map);
    const first = await analyzeModuleResolution(root, map, imports);
    const second = await analyzeModuleResolution(root, map, imports);

    assert.equal(first.schemaVersion, "repo-module-resolution/v1");
    assert.equal(first.digest, second.digest);
    assert.equal(first.metrics.configs, 1);
    assert.equal(first.metrics.workspacePackages, 2);
    assert.equal(first.metrics.tsconfigPathResolved, 1);
    assert.equal(first.metrics.baseUrlResolved, 1);
    assert.equal(first.metrics.workspaceResolved, 2);
    assert.equal(first.metrics.externalPackages, 1);

    const alias = first.resolutions.find((item) => item.specifier === "@core/util");
    assert.equal(alias.resolutionKind, "tsconfig-path");
    assert.equal(alias.targetFile, "src/core/util.ts");
    assert.equal(alias.configPath, "tsconfig.json");

    const viaBase = first.resolutions.find((item) => item.specifier === "src/core/util");
    assert.equal(viaBase.resolutionKind, "base-url");
    assert.equal(viaBase.targetFile, "src/core/util.ts");

    const workspaceRoot = first.resolutions.find((item) => item.specifier === "@acme/shared");
    assert.equal(workspaceRoot.resolutionKind, "workspace-package");
    assert.equal(workspaceRoot.targetFile, "packages/shared/src/index.ts");
    assert.equal(workspaceRoot.workspaceModulePath, "packages/shared");

    const workspaceSubpath = first.resolutions.find((item) => item.specifier === "@acme/shared/src/nested");
    assert.equal(workspaceSubpath.targetFile, "packages/shared/src/nested.ts");

    const external = first.resolutions.find((item) => item.specifier === "external-pkg/subpath");
    assert.equal(external.resolutionKind, "external-package");
    assert.equal(external.packageName, "external-pkg");
    assert.equal(external.targetFile, null);
    assert.equal(JSON.stringify(first).includes("export const util = 1"), false);
  });
});

test("module resolution follows bounded local extends and records package-based extends without loading them", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "extends-fixture", private: true }));
    await put(root, "configs/base.json", JSON.stringify({
      compilerOptions: {
        baseUrl: "..",
        paths: { "@lib/*": ["src/lib/*"] }
      }
    }));
    await put(root, "tsconfig.json", JSON.stringify({ extends: "./configs/base.json" }));
    await put(root, "packages/app/package.json", JSON.stringify({ name: "app", private: true }));
    await put(root, "packages/app/tsconfig.json", JSON.stringify({ extends: "@tsconfig/node22/tsconfig.json" }));
    await put(root, "src/lib/tool.ts", "export const tool = true;\n");
    await put(root, "src/main.ts", "import { tool } from '@lib/tool';\nexport const ok = tool;\n");
    await put(root, "packages/app/src/index.ts", "import thing from 'external-thing';\nexport default thing;\n");

    const map = await scanRepository(root);
    const imports = await analyzeRepositoryImports(root, map);
    const resolution = await analyzeModuleResolution(root, map, imports);

    const rootConfig = resolution.configs.find((item) => item.path === "tsconfig.json");
    assert.equal(rootConfig.resolvedExtends, "configs/base.json");
    assert.equal(rootConfig.baseUrl.rootRelative, ".");
    assert.equal(rootConfig.paths[0].sourceConfig, "configs/base.json");

    const appConfig = resolution.configs.find((item) => item.path === "packages/app/tsconfig.json");
    assert.equal(appConfig.externalExtends, "@tsconfig/node22/tsconfig.json");
    assert.equal(resolution.metrics.unsupportedExtends, 1);

    const alias = resolution.resolutions.find((item) => item.specifier === "@lib/tool");
    assert.equal(alias.targetFile, "src/lib/tool.ts");
    assert.equal(alias.resolutionKind, "tsconfig-path");
  });
});

test("module resolution fails closed on local extends cycles", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "cycle-config", private: true }));
    await put(root, "tsconfig.json", JSON.stringify({ extends: "./configs/a.json" }));
    await put(root, "configs/a.json", JSON.stringify({ extends: "../tsconfig.json" }));
    await put(root, "src/index.ts", "export const value = true;\n");

    const map = await scanRepository(root);
    const imports = await analyzeRepositoryImports(root, map);
    await assert.rejects(
      () => analyzeModuleResolution(root, map, imports),
      (error) => error instanceof RepoModuleResolutionError && error.code === "repo_module_extends_cycle"
    );
  });
});

test("semantic impact propagates through tsconfig aliases that M8 import edges classify as packages", async () => {
  await withFixture(async (root) => {
    await put(root, "package.json", JSON.stringify({ name: "impact-alias", private: true }));
    await put(root, "tsconfig.json", JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@shared": ["src/shared"] } } }));
    await put(root, "src/shared.ts", "export const shared = 1;\n");
    await put(root, "src/consumer.ts", "import { shared } from '@shared';\nexport const consumer = shared;\n");
    await put(root, "src/main.ts", "import { consumer } from './consumer';\nexport const main = consumer;\n");

    const previous = await scanRepository(root);
    await put(root, "src/shared.ts", "export const shared = 2;\nexport const changed = true;\n");
    const current = await scanRepository(root);
    const diff = diffRepositoryMaps(previous, current);
    const imports = await analyzeRepositoryImports(root, current);
    const resolution = await analyzeModuleResolution(root, current, imports);
    const topology = await analyzeRepositoryTopology(root, current);
    const impact = analyzeSemanticRepositoryImpact({
      repoMap: current,
      importAnalysis: imports,
      moduleResolution: resolution,
      diff,
      topology,
      maxDepth: 5
    });

    assert.equal(impact.schemaVersion, "repo-impact/v2");
    assert.equal(impact.moduleResolutionDigest, resolution.digest);
    const shared = impact.files.find((item) => item.path === "src/shared.ts");
    assert.deepEqual(shared.directDependents, ["src/consumer.ts"]);
    assert.deepEqual(shared.transitiveDependents, ["src/main.ts"]);
    assert.deepEqual(impact.impactedFiles, ["src/consumer.ts", "src/main.ts"]);
    assert.equal(impact.metrics.aliasResolvedEdges, 1);
    assert.equal(impact.methodology.semanticResolution, true);

    await put(root, "src/newer.ts", "export const newer = true;\n");
    const newer = await scanRepository(root);
    assert.throws(
      () => analyzeSemanticRepositoryImpact({ repoMap: newer, importAnalysis: imports, moduleResolution: resolution, diff }),
      (error) => error instanceof RepoImpactV2Error && error.code.endsWith("digest_mismatch")
    );
  });
});
