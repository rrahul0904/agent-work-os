import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { scanRepository } from "../src/index.js";

const execFileAsync = promisify(execFile);
const SERVER = fileURLToPath(new URL("../../../scripts/repo-atlas-mcp.mjs", import.meta.url));

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "awos-repo-mcp-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

async function put(root, relative, content) {
  const destination = path.join(root, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content);
}

async function git(root, args, env = {}) {
  return execFileAsync("git", ["-C", root, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
}

async function initializeGitFixture(root) {
  await git(root, ["init", "-q"]);
  await git(root, ["add", "."]);
  await git(root, ["-c", "user.name=Repo Atlas Test", "-c", "user.email=repo-atlas-test@example.com", "commit", "-m", "initial"], {
    GIT_AUTHOR_DATE: "2026-01-01T12:00:00Z",
    GIT_COMMITTER_DATE: "2026-01-01T12:00:00Z"
  });
}

async function connect(root) {
  const client = new Client(
    { name: "repo-atlas-test", version: "1.0.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } }
  );
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER, `--root=${root}`] });
  await client.connect(transport);
  return client;
}

test("Repo Atlas MCP exposes bounded read-only M1-M8 tools over current stdio protocol", async () => {
  await withFixture(async (root) => {
    const workspace = path.join(root, "workspace");
    await put(workspace, "package.json", JSON.stringify({ name: "mcp-fixture", private: true }));
    await put(workspace, "src/billing.ts", "export const billing = true;\n");
    await put(workspace, "src/index.ts", "import { billing } from './billing';\nexport { billing };\n");
    const previous = await scanRepository(workspace);
    await writeFile(path.join(root, "previous-map.json"), JSON.stringify(previous), "utf8");
    await put(workspace, "src/billing.ts", "export const billing = true;\nexport const changed = true;\n");
    await initializeGitFixture(workspace);

    const client = await connect(root);
    try {
      assert.equal(client.getProtocolEra(), "modern");
      const { tools } = await client.listTools();
      assert.deepEqual(tools.map((tool) => tool.name), [
        "repo_atlas_overview",
        "repo_atlas_context",
        "repo_atlas_topology",
        "repo_atlas_imports",
        "repo_atlas_hotspots",
        "repo_atlas_git_signals",
        "repo_atlas_drift",
        "repo_atlas_impact",
        "repo_atlas_bundle"
      ]);

      const overview = await client.callTool({ name: "repo_atlas_overview", arguments: { path: "workspace" } });
      assert.notEqual(overview.isError, true);
      assert.equal(overview.structuredContent.schemaVersion, "repo-atlas-overview/v1");
      assert.equal(overview.structuredContent.metrics.files, 3);
      assert.equal(JSON.stringify(overview.structuredContent).includes("export const"), false);

      const context = await client.callTool({
        name: "repo_atlas_context",
        arguments: { path: "workspace", task: "billing change", maxFiles: 1, maxEstimatedTokens: 1000 }
      });
      assert.notEqual(context.isError, true);
      assert.equal(context.structuredContent.schemaVersion, "repo-context-evidence/v1");
      assert.equal(context.structuredContent.selected.length, 1);
      assert.equal(context.structuredContent.selected[0].path, "src/billing.ts");

      const imports = await client.callTool({ name: "repo_atlas_imports", arguments: { path: "workspace", limit: 20 } });
      assert.notEqual(imports.isError, true);
      assert.equal(imports.structuredContent.schemaVersion, "repo-atlas-import-summary/v1");
      assert.equal(imports.structuredContent.metrics.fallbackFiles, 0);
      assert.ok(imports.structuredContent.edges.some((edge) => edge.from === "src/index.ts" && edge.to === "src/billing.ts"));
      assert.equal(JSON.stringify(imports.structuredContent).includes("export const billing"), false);

      const impact = await client.callTool({
        name: "repo_atlas_impact",
        arguments: { path: "workspace", previousMapPath: "previous-map.json", maxDepth: 3, top: 10 }
      });
      assert.notEqual(impact.isError, true);
      assert.equal(impact.structuredContent.schemaVersion, "repo-atlas-impact-summary/v1");
      assert.ok(impact.structuredContent.impactedFiles.includes("src/index.ts"));

      const gitSignals = await client.callTool({ name: "repo_atlas_git_signals", arguments: { path: "workspace", maxCommits: 20, top: 5 } });
      assert.notEqual(gitSignals.isError, true);
      assert.equal(gitSignals.structuredContent.schemaVersion, "repo-atlas-git-summary/v1");
      assert.equal(gitSignals.structuredContent.commitsAnalyzed, 1);
      assert.equal(gitSignals.structuredContent.workingTreeDirty, false);
      assert.equal(gitSignals.structuredContent.metrics.trackedFiles, 3);
      assert.equal(JSON.stringify(gitSignals.structuredContent).includes("repo-atlas-test@example.com"), false);

      const bundle = await client.callTool({
        name: "repo_atlas_bundle",
        arguments: {
          path: "workspace",
          task: "billing change",
          previousMapPath: "previous-map.json",
          includeGit: true,
          includeImports: true,
          includeImpact: true,
          maxDepth: 3,
          gitMaxCommits: 20
        }
      });
      assert.notEqual(bundle.isError, true);
      assert.equal(bundle.structuredContent.schemaVersion, "repo-evidence-bundle/v1");
      for (const kind of ["repo-git", "repo-imports", "repo-impact"]) {
        assert.ok(bundle.structuredContent.artifacts.some((artifact) => artifact.kind === kind));
      }
      assert.ok(bundle.structuredContent.claims.some((claim) => claim.type === "repository-change-impact"));
      assert.equal(JSON.stringify(bundle.structuredContent).includes("repo-atlas-test@example.com"), false);
      assert.equal(JSON.stringify(bundle.structuredContent).includes("export const billing"), false);
    } finally {
      await client.close();
    }
  });
});

test("Repo Atlas MCP refuses lexical root escapes", async () => {
  await withFixture(async (root) => {
    const workspace = path.join(root, "workspace");
    const outside = path.join(root, "outside");
    await put(workspace, "src/index.js", "export const inside = true;\n");
    await put(outside, "secret.js", "export const OUTSIDE_SECRET = 'must-not-read';\n");

    const client = await connect(workspace);
    try {
      const result = await client.callTool({ name: "repo_atlas_overview", arguments: { path: "../outside" } });
      assert.equal(result.isError, true);
      const text = result.content.find((item) => item.type === "text")?.text ?? "";
      assert.ok(text.includes("repo_atlas_path_escape"));
      assert.equal(text.includes("OUTSIDE_SECRET"), false);
    } finally {
      await client.close();
    }
  });
});
