import { lstatSync, realpathSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { scanRepository, selectRepositoryContext } from "./index.js";
import { analyzeRepositoryTopology } from "./topology.js";
import { analyzeStructuralRisk } from "./risk.js";
import { analyzeGitSignals } from "./git-signals.js";
import { createRepositoryEvidenceBundle } from "./evidence.js";
import { diffRepositoryMaps } from "./diff.js";

export const REPO_ATLAS_MCP_SERVER = Object.freeze({
  name: "agent-work-os-repo-atlas",
  version: "0.1.0"
});

export class RepoAtlasMcpError extends Error {
  constructor(code, message, details = {}) {
    super(message ?? code);
    this.name = "RepoAtlasMcpError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function createRepoAtlasMcpServer({ rootPath } = {}) {
  const root = normalizeConfiguredRoot(rootPath);
  const server = new McpServer(REPO_ATLAS_MCP_SERVER);

  server.registerTool(
    "repo_atlas_overview",
    {
      title: "Repo Atlas Overview",
      description: "Return a compact, metadata-only repository overview bounded to the server root.",
      inputSchema: z.object({ path: relativePathSchema.optional() })
    },
    async ({ path: relativePath = "." }) => safeToolCall(async () => {
      const repoPath = await resolveWithinRoot(root, relativePath, "directory");
      const map = await scanRepository(repoPath);
      return compactOverview(map);
    })
  );

  server.registerTool(
    "repo_atlas_context",
    {
      title: "Repo Atlas Task Context",
      description: "Select a bounded set of repository paths relevant to a task without returning source bodies.",
      inputSchema: z.object({
        path: relativePathSchema.optional(),
        task: z.string().min(1).max(20_000),
        maxFiles: z.number().int().min(1).max(100).optional(),
        maxEstimatedTokens: z.number().int().min(1).max(100_000).optional()
      })
    },
    async ({ path: relativePath = ".", task, maxFiles = 24, maxEstimatedTokens = 24_000 }) => safeToolCall(async () => {
      const repoPath = await resolveWithinRoot(root, relativePath, "directory");
      const map = await scanRepository(repoPath);
      return selectRepositoryContext(map, { task, maxFiles, maxEstimatedTokens });
    })
  );

  server.registerTool(
    "repo_atlas_topology",
    {
      title: "Repo Atlas Topology",
      description: "Return a bounded module/dependency topology summary for a repository.",
      inputSchema: z.object({
        path: relativePathSchema.optional(),
        limit: z.number().int().min(1).max(200).optional()
      })
    },
    async ({ path: relativePath = ".", limit = 60 }) => safeToolCall(async () => {
      const repoPath = await resolveWithinRoot(root, relativePath, "directory");
      const map = await scanRepository(repoPath);
      const topology = await analyzeRepositoryTopology(repoPath, map);
      return compactTopology(topology, limit);
    })
  );

  server.registerTool(
    "repo_atlas_hotspots",
    {
      title: "Repo Atlas Structural Hotspots",
      description: "Return bounded structural hotspot signals; scores are heuristics, not vulnerability or defect probabilities.",
      inputSchema: z.object({
        path: relativePathSchema.optional(),
        top: z.number().int().min(1).max(100).optional()
      })
    },
    async ({ path: relativePath = ".", top = 25 }) => safeToolCall(async () => {
      const repoPath = await resolveWithinRoot(root, relativePath, "directory");
      const map = await scanRepository(repoPath);
      const topology = await analyzeRepositoryTopology(repoPath, map);
      return analyzeStructuralRisk(map, topology, { topN: top });
    })
  );

  server.registerTool(
    "repo_atlas_git_signals",
    {
      title: "Repo Atlas Git Signals",
      description: "Return bounded privacy-preserving Git churn and ownership signals. Contributor identities are opaque hashes.",
      inputSchema: z.object({
        path: relativePathSchema.optional(),
        maxCommits: z.number().int().min(1).max(5_000).optional(),
        top: z.number().int().min(1).max(100).optional()
      })
    },
    async ({ path: relativePath = ".", maxCommits = 500, top = 25 }) => safeToolCall(async () => {
      const repoPath = await resolveWithinRoot(root, relativePath, "directory");
      const map = await scanRepository(repoPath);
      const signals = await analyzeGitSignals(repoPath, map, { maxCommits });
      return compactGitSignals(signals, top);
    })
  );

  server.registerTool(
    "repo_atlas_drift",
    {
      title: "Repo Atlas Drift",
      description: "Compare a persisted previous RepoMap to the current repository and return a bounded drift summary.",
      inputSchema: z.object({
        path: relativePathSchema.optional(),
        previousMapPath: relativePathSchema,
        maxAffectedFiles: z.number().int().min(1).max(500).optional()
      })
    },
    async ({ path: relativePath = ".", previousMapPath, maxAffectedFiles = 100 }) => safeToolCall(async () => {
      const repoPath = await resolveWithinRoot(root, relativePath, "directory");
      const previous = await readJsonWithinRoot(root, previousMapPath);
      const current = await scanRepository(repoPath);
      const diff = diffRepositoryMaps(previous, current);
      return compactDiff(diff, maxAffectedFiles);
    })
  );

  server.registerTool(
    "repo_atlas_bundle",
    {
      title: "Repo Atlas Evidence Bundle",
      description: "Create a compact content-addressed repository evidence bundle, optionally including task context, drift, and Git signals.",
      inputSchema: z.object({
        path: relativePathSchema.optional(),
        task: z.string().min(1).max(20_000).optional(),
        maxFiles: z.number().int().min(1).max(100).optional(),
        maxEstimatedTokens: z.number().int().min(1).max(100_000).optional(),
        previousMapPath: relativePathSchema.optional(),
        includeGit: z.boolean().optional(),
        gitMaxCommits: z.number().int().min(1).max(5_000).optional(),
        repository: z.string().min(1).max(2_000).optional(),
        ref: z.string().min(1).max(2_000).optional(),
        commit: z.string().min(1).max(2_000).optional()
      })
    },
    async ({
      path: relativePath = ".",
      task,
      maxFiles = 24,
      maxEstimatedTokens = 24_000,
      previousMapPath,
      includeGit = false,
      gitMaxCommits = 500,
      repository,
      ref,
      commit
    }) => safeToolCall(async () => {
      const repoPath = await resolveWithinRoot(root, relativePath, "directory");
      const map = await scanRepository(repoPath);
      const topology = await analyzeRepositoryTopology(repoPath, map);
      const risk = analyzeStructuralRisk(map, topology);
      const context = task ? selectRepositoryContext(map, { task, maxFiles, maxEstimatedTokens }) : null;
      const previous = previousMapPath ? await readJsonWithinRoot(root, previousMapPath) : null;
      const diff = previous ? diffRepositoryMaps(previous, map) : null;
      const gitSignals = includeGit ? await analyzeGitSignals(repoPath, map, { maxCommits: gitMaxCommits }) : null;
      return createRepositoryEvidenceBundle({
        repoMap: map,
        topology,
        risk,
        context,
        diff,
        gitSignals,
        provenance: { repository, ref, commit, source: "mcp-local-root" }
      });
    })
  );

  return server;
}

const relativePathSchema = z.string().min(1).max(2_000).refine((value) => !path.isAbsolute(value), {
  message: "path must be relative to the configured Repo Atlas root"
});

async function safeToolCall(work) {
  try {
    const value = await work();
    return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value };
  } catch (error) {
    const payload = {
      ok: false,
      error: typeof error?.code === "string" ? error.code : error?.name ?? "repo_atlas_mcp_failed",
      message: error?.message ?? String(error)
    };
    return { isError: true, content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
  }
}

function normalizeConfiguredRoot(rootPath) {
  if (typeof rootPath !== "string" || !rootPath.trim()) {
    throw new RepoAtlasMcpError("repo_atlas_root_required", "Repo Atlas MCP requires a configured root path");
  }
  const absolute = path.resolve(rootPath);
  let info;
  try {
    info = lstatSync(absolute);
  } catch (error) {
    throw new RepoAtlasMcpError("repo_atlas_root_unreadable", `Cannot read configured root: ${absolute}`, { cause: error?.code });
  }
  if (info.isSymbolicLink()) throw new RepoAtlasMcpError("repo_atlas_root_symlink_forbidden", "Configured MCP root cannot be a symlink");
  if (!info.isDirectory()) throw new RepoAtlasMcpError("repo_atlas_root_not_directory", "Configured MCP root must be a directory");
  return realpathSync(absolute);
}

async function resolveWithinRoot(root, relativePath, expectedKind) {
  if (typeof relativePath !== "string" || !relativePath.trim() || path.isAbsolute(relativePath)) {
    throw new RepoAtlasMcpError("repo_atlas_path_invalid", "Path must be a non-empty path relative to the configured root");
  }
  const lexical = path.resolve(root, relativePath);
  assertWithinRoot(root, lexical);
  let physical;
  try {
    physical = await realpath(lexical);
  } catch (error) {
    throw new RepoAtlasMcpError("repo_atlas_path_unreadable", `Cannot resolve path: ${relativePath}`, { cause: error?.code });
  }
  assertWithinRoot(root, physical);
  if (expectedKind === "directory") {
    const info = lstatSync(physical);
    if (!info.isDirectory()) throw new RepoAtlasMcpError("repo_atlas_path_not_directory", `Expected directory: ${relativePath}`);
  }
  return physical;
}

async function readJsonWithinRoot(root, relativePath) {
  const filename = await resolveWithinRoot(root, relativePath, "file");
  let text;
  try {
    text = await readFile(filename, "utf8");
  } catch (error) {
    throw new RepoAtlasMcpError("repo_atlas_artifact_unreadable", `Cannot read artifact: ${relativePath}`, { cause: error?.code });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new RepoAtlasMcpError("repo_atlas_artifact_invalid_json", `Artifact is not valid JSON: ${relativePath}`);
  }
}

function assertWithinRoot(root, candidate) {
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    throw new RepoAtlasMcpError("repo_atlas_path_escape", "Requested path escapes the configured Repo Atlas root");
  }
}

function compactOverview(map) {
  const directories = flattenDirectories(map.tree)
    .filter((item) => item.path !== ".")
    .sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path))
    .slice(0, 20);
  const languages = Object.entries(map.languages)
    .map(([language, stats]) => ({ language, ...stats }))
    .sort((a, b) => b.lines - a.lines || a.language.localeCompare(b.language));
  return Object.freeze({
    schemaVersion: "repo-atlas-overview/v1",
    repositoryDigest: map.digest,
    root: map.root,
    metrics: map.metrics,
    languages: Object.freeze(languages),
    largestDirectories: Object.freeze(directories),
    exclusions: map.exclusions
  });
}

function compactTopology(topology, limit) {
  const centrality = topology.centrality.slice(0, limit);
  const selectedIds = new Set(centrality.map((item) => item.moduleId));
  const modules = topology.modules.filter((module) => selectedIds.has(module.id));
  const moduleEdges = topology.moduleEdges
    .filter((edge) => selectedIds.has(edge.from) || selectedIds.has(edge.to))
    .slice(0, limit * 5);
  return Object.freeze({
    schemaVersion: "repo-atlas-topology-summary/v1",
    repositoryDigest: topology.repositoryDigest,
    topologyDigest: topology.digest,
    metrics: topology.metrics,
    modules: Object.freeze(modules),
    centrality: Object.freeze(centrality),
    moduleEdges: Object.freeze(moduleEdges),
    truncation: Object.freeze({
      requestedLimit: limit,
      modulesReturned: modules.length,
      moduleEdgesReturned: moduleEdges.length,
      totalModules: topology.modules.length,
      totalModuleEdges: topology.moduleEdges.length
    })
  });
}

function compactGitSignals(signals, top) {
  return Object.freeze({
    schemaVersion: "repo-atlas-git-summary/v1",
    repositoryDigest: signals.repositoryDigest,
    gitSignalsDigest: signals.digest,
    headCommit: signals.headCommit,
    workingTreeDirty: signals.workingTreeDirty,
    historyLimit: signals.historyLimit,
    commitsAnalyzed: signals.commitsAnalyzed,
    contributorCount: signals.contributorCount,
    metrics: signals.metrics,
    hotspots: Object.freeze(signals.hotspots.slice(0, top)),
    truncation: Object.freeze({ requestedTop: top, returned: Math.min(top, signals.hotspots.length) })
  });
}

function compactDiff(diff, limit) {
  return Object.freeze({
    schemaVersion: "repo-atlas-drift-summary/v1",
    diffDigest: diff.digest,
    previousDigest: diff.previousDigest,
    currentDigest: diff.currentDigest,
    changed: diff.changed,
    metricsDelta: diff.metricsDelta,
    languageDelta: diff.languageDelta,
    summary: diff.summary,
    files: Object.freeze({
      added: Object.freeze(diff.files.added.slice(0, limit)),
      removed: Object.freeze(diff.files.removed.slice(0, limit)),
      changed: Object.freeze(diff.files.changed.slice(0, limit))
    }),
    truncation: Object.freeze({
      maxPerCategory: limit,
      addedReturned: Math.min(limit, diff.files.added.length),
      removedReturned: Math.min(limit, diff.files.removed.length),
      changedReturned: Math.min(limit, diff.files.changed.length)
    })
  });
}

function flattenDirectories(root) {
  const output = [];
  const visit = (node) => {
    output.push({ path: node.path, lines: node.lines, files: node.files });
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return output;
}
