import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { canonicalDigest } from "./index.js";

const execFileAsync = promisify(execFile);

export const REPO_GIT_SIGNALS_SCHEMA = "repo-git-signals/v1";

export class RepoGitSignalsError extends Error {
  constructor(code, message, details = {}) {
    super(message ?? code);
    this.name = "RepoGitSignalsError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export async function analyzeGitSignals(repoPath, repoMap, options = {}) {
  assertRepoMap(repoMap);
  const maxCommits = normalizeInteger(options.maxCommits ?? 500, "repo_git_max_commits_invalid", 1, 5_000);
  const timeoutMs = normalizeInteger(options.timeoutMs ?? 20_000, "repo_git_timeout_invalid", 100, 120_000);
  const maxBuffer = normalizeInteger(options.maxBuffer ?? 20 * 1024 * 1024, "repo_git_buffer_invalid", 1024, 200 * 1024 * 1024);
  const commandOptions = { cwd: repoPath, encoding: "utf8", timeout: timeoutMs, maxBuffer };

  await assertGitRepository(commandOptions);
  const [headCommit, statusOutput, trackedOutput, historyOutput] = await Promise.all([
    runGit(["rev-parse", "HEAD"], commandOptions),
    runGit(["status", "--porcelain=v1", "-z", "--untracked-files=normal", "--", "."], commandOptions),
    runGit(["ls-files", "-z", "--", "."], commandOptions),
    runGit([
      "log",
      "--relative",
      "--no-renames",
      "-n",
      String(maxCommits),
      "--date=iso-strict",
      "--format=@%H%x09%aI%x09%ae%x00",
      "--numstat",
      "-z",
      "--",
      "."
    ], commandOptions)
  ]);

  const recognized = new Map(repoMap.files.map((file) => [normalizePath(file.path), file]));
  const tracked = new Set(trackedOutput.split("\0").filter(Boolean).map(normalizePath));
  const stats = new Map(repoMap.files.map((file) => [normalizePath(file.path), createFileStats()]));
  const contributors = new Set();
  const commits = parseHistory(historyOutput, recognized, stats, contributors);

  const fileSignals = [...recognized.keys()].sort().map((filePath) => {
    const value = stats.get(filePath);
    const topContributor = [...value.contributors.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null;
    return Object.freeze({
      path: filePath,
      tracked: tracked.has(filePath),
      commitsTouched: value.commits.size,
      additions: value.additions,
      deletions: value.deletions,
      churn: value.additions + value.deletions,
      contributorCount: value.contributors.size,
      topContributorId: topContributor?.[0] ?? null,
      lastChangedAt: value.lastChangedAt
    });
  });

  const touched = fileSignals.filter((file) => file.commitsTouched > 0);
  const payload = {
    schemaVersion: REPO_GIT_SIGNALS_SCHEMA,
    repositoryDigest: repoMap.digest,
    headCommit: headCommit.trim(),
    workingTreeDirty: statusOutput.length > 0,
    historyLimit: maxCommits,
    commitsAnalyzed: commits.size,
    contributorCount: contributors.size,
    metrics: Object.freeze({
      filesAnalyzed: fileSignals.length,
      trackedFiles: fileSignals.filter((file) => file.tracked).length,
      filesWithHistory: touched.length,
      totalChurn: touched.reduce((sum, file) => sum + file.churn, 0)
    }),
    hotspots: Object.freeze(touched
      .slice()
      .sort((a, b) => b.churn - a.churn || b.commitsTouched - a.commitsTouched || a.path.localeCompare(b.path))
      .slice(0, 100)),
    files: Object.freeze(fileSignals)
  };

  return Object.freeze({ ...payload, digest: canonicalDigest(payload) });
}

function parseHistory(output, recognized, stats, contributors) {
  const commitIds = new Set();
  let current = null;
  for (const rawToken of output.split("\0")) {
    const token = rawToken.replace(/^\r?\n+/u, "");
    if (!token) continue;
    if (token.startsWith("@")) {
      const [commit, timestamp, email = ""] = token.slice(1).split("\t");
      if (!commit || !timestamp) continue;
      const contributorId = contributorHash(email || "unknown");
      current = { commit, timestamp, contributorId };
      commitIds.add(commit);
      contributors.add(contributorId);
      continue;
    }
    if (!current) continue;
    const firstTab = token.indexOf("\t");
    const secondTab = firstTab < 0 ? -1 : token.indexOf("\t", firstTab + 1);
    if (firstTab < 0 || secondTab < 0) continue;
    const additionsRaw = token.slice(0, firstTab);
    const deletionsRaw = token.slice(firstTab + 1, secondTab);
    const filePath = normalizePath(token.slice(secondTab + 1));
    if (!recognized.has(filePath) || !stats.has(filePath)) continue;
    const value = stats.get(filePath);
    const additions = parseNumstat(additionsRaw);
    const deletions = parseNumstat(deletionsRaw);
    value.additions += additions;
    value.deletions += deletions;
    value.commits.add(current.commit);
    value.contributors.set(current.contributorId, (value.contributors.get(current.contributorId) ?? 0) + 1);
    if (value.lastChangedAt === null) value.lastChangedAt = current.timestamp;
  }
  return commitIds;
}

function createFileStats() {
  return { additions: 0, deletions: 0, commits: new Set(), contributors: new Map(), lastChangedAt: null };
}

function parseNumstat(value) {
  if (value === "-") return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function contributorHash(identity) {
  return `contributor:${createHash("sha256").update(identity.trim().toLowerCase()).digest("hex").slice(0, 16)}`;
}

async function assertGitRepository(options) {
  try {
    const output = await runGit(["rev-parse", "--is-inside-work-tree"], options);
    if (output.trim() !== "true") throw new RepoGitSignalsError("repo_git_not_repository", "Path is not inside a Git working tree");
  } catch (error) {
    if (error instanceof RepoGitSignalsError) throw error;
    throw new RepoGitSignalsError("repo_git_not_repository", "Path is not inside a readable Git working tree", { cause: error?.code });
  }
}

async function runGit(args, options) {
  try {
    const { stdout } = await execFileAsync("git", args, options);
    return stdout;
  } catch (error) {
    if (error?.code === "ENOENT") throw new RepoGitSignalsError("repo_git_binary_unavailable", "git executable is unavailable");
    if (error?.killed || error?.signal) throw new RepoGitSignalsError("repo_git_timeout", "Git history command exceeded its bounded execution time");
    if (error?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      throw new RepoGitSignalsError("repo_git_output_limit_exceeded", "Git history output exceeded the configured buffer limit");
    }
    throw error;
  }
}

function normalizePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function normalizeInteger(value, code, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RepoGitSignalsError(code, code);
  return value;
}

function assertRepoMap(value) {
  if (!value || value.schemaVersion !== "repo-map/v1" || !Array.isArray(value.files) || typeof value.digest !== "string") {
    throw new RepoGitSignalsError("repo_map_invalid", "Expected repo-map/v1");
  }
}
