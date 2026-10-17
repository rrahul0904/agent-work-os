import { canonicalDigest } from "./index.js";

export const REPO_IMPACT_V2_SCHEMA = "repo-impact/v2";

export class RepoImpactV2Error extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = "RepoImpactV2Error";
    this.code = code;
  }
}

export function analyzeSemanticRepositoryImpact({ repoMap, importAnalysis, moduleResolution, diff, topology = null, gitSignals = null, maxDepth = 5 } = {}) {
  assertRepoMap(repoMap);
  assertBoundArtifact(importAnalysis, "repo-import-analysis/v1", repoMap.digest, "repo_impact_v2_imports_invalid");
  assertBoundArtifact(moduleResolution, "repo-module-resolution/v1", repoMap.digest, "repo_impact_v2_resolution_invalid");
  if (moduleResolution.importAnalysisDigest !== importAnalysis.digest) {
    throw new RepoImpactV2Error("repo_impact_v2_resolution_import_mismatch", "Module resolution is not bound to the supplied import analysis");
  }
  assertDiff(diff, repoMap.digest);
  if (topology) assertBoundArtifact(topology, "repo-topology/v1", repoMap.digest, "repo_impact_v2_topology_invalid");
  if (gitSignals) assertBoundArtifact(gitSignals, "repo-git-signals/v1", repoMap.digest, "repo_impact_v2_git_invalid");
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 20) {
    throw new RepoImpactV2Error("repo_impact_v2_depth_invalid", "maxDepth must be an integer between 1 and 20");
  }

  const reverse = buildReverseGraph(moduleResolution.resolutions);
  const changeTypes = currentChanges(diff);
  const removedFiles = Object.freeze(diff.files.removed.map((file) => file.path).sort());
  const gitByPath = new Map((gitSignals?.files ?? []).map((file) => [file.path, file]));
  const fileImpacts = [];
  const allImpactedFiles = new Set();
  const allImpactedModules = new Set();

  for (const [filePath, changeType] of [...changeTypes.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const direct = [...(reverse.get(filePath) ?? [])].sort();
    const traversal = walkDependents(filePath, reverse, maxDepth);
    const transitive = traversal.paths.filter((candidate) => !direct.includes(candidate)).sort();
    const affected = [...new Set([filePath, ...direct, ...transitive])];
    const impactedModules = topology ? moduleIdsForPaths(affected, topology.modules) : [];
    const git = gitByPath.get(filePath);
    const churn = git?.churn ?? null;
    const score = impactScore({ direct: direct.length, transitive: transitive.length, modules: impactedModules.length, churn });
    const level = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
    const reasons = impactReasons({ direct: direct.length, transitive: transitive.length, modules: impactedModules.length, churn, maxDepthReached: traversal.maxDepthReached });

    for (const item of [...direct, ...transitive]) allImpactedFiles.add(item);
    for (const moduleId of impactedModules) allImpactedModules.add(moduleId);

    fileImpacts.push(Object.freeze({
      path: filePath,
      changeType,
      directDependents: Object.freeze(direct),
      transitiveDependents: Object.freeze(transitive),
      impactedModules: Object.freeze(impactedModules),
      maxDepthReached: traversal.maxDepthReached,
      churn,
      score,
      level,
      reasons: Object.freeze(reasons)
    }));
  }

  fileImpacts.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const changedCurrentPaths = new Set(changeTypes.keys());
  const downstreamOnly = [...allImpactedFiles].filter((filePath) => !changedCurrentPaths.has(filePath)).sort();

  const payload = {
    schemaVersion: REPO_IMPACT_V2_SCHEMA,
    repositoryDigest: repoMap.digest,
    importAnalysisDigest: importAnalysis.digest,
    moduleResolutionDigest: moduleResolution.digest,
    diffDigest: diff.digest,
    topologyDigest: topology?.digest ?? null,
    gitSignalsDigest: gitSignals?.digest ?? null,
    maxDepth,
    files: Object.freeze(fileImpacts),
    removedFiles,
    impactedFiles: Object.freeze(downstreamOnly),
    impactedModules: Object.freeze([...allImpactedModules].sort()),
    metrics: Object.freeze({
      changedCurrentFiles: changeTypes.size,
      removedFiles: removedFiles.length,
      impactedFiles: downstreamOnly.length,
      impactedModules: allImpactedModules.size,
      highImpactChanges: fileImpacts.filter((item) => item.level === "high").length,
      mediumImpactChanges: fileImpacts.filter((item) => item.level === "medium").length,
      lowImpactChanges: fileImpacts.filter((item) => item.level === "low").length,
      semanticallyResolvedFileEdges: moduleResolution.metrics.resolvedFiles,
      aliasResolvedEdges: moduleResolution.metrics.tsconfigPathResolved + moduleResolution.metrics.baseUrlResolved + moduleResolution.metrics.workspaceResolved
    }),
    methodology: Object.freeze({
      label: "semantic-bounded-change-impact-heuristic",
      note: "Scores estimate structural blast radius from reverse imports after deterministic static module resolution, module spread and optional Git churn. They are not defect, vulnerability, or failure probabilities.",
      typeOnlyEdgesIncluded: true,
      semanticResolution: true,
      removedFilePropagation: "not-inferred-without-previous-semantic-resolution-artifact"
    })
  };

  return Object.freeze({ ...payload, digest: canonicalDigest(payload) });
}

function buildReverseGraph(resolutions) {
  const reverse = new Map();
  for (const item of resolutions) {
    if (typeof item.targetFile !== "string") continue;
    if (!reverse.has(item.targetFile)) reverse.set(item.targetFile, new Set());
    reverse.get(item.targetFile).add(item.from);
  }
  return reverse;
}

function walkDependents(start, reverse, maxDepth) {
  const visited = new Set([start]);
  const paths = [];
  let frontier = [start];
  let depth = 0;
  let maxDepthReached = 0;
  while (frontier.length > 0 && depth < maxDepth) {
    depth += 1;
    const next = [];
    for (const current of frontier.sort()) {
      for (const dependent of [...(reverse.get(current) ?? [])].sort()) {
        if (visited.has(dependent)) continue;
        visited.add(dependent);
        paths.push(dependent);
        next.push(dependent);
        maxDepthReached = depth;
      }
    }
    frontier = next;
  }
  return Object.freeze({ paths: Object.freeze(paths), maxDepthReached });
}

function currentChanges(diff) {
  const changes = new Map();
  for (const file of diff.files.added) changes.set(file.path, "added");
  for (const file of diff.files.changed) changes.set(file.path, "changed");
  return changes;
}

function moduleIdsForPaths(paths, modules) {
  const ids = new Set();
  for (const filePath of paths) {
    const owner = owningModule(filePath, modules);
    if (owner) ids.add(owner.id);
  }
  return [...ids].sort();
}

function owningModule(filePath, modules) {
  let best = null;
  for (const module of modules) {
    if (module.path === ".") {
      if (!best) best = module;
      continue;
    }
    if (filePath === module.path || filePath.startsWith(`${module.path}/`)) {
      if (!best || module.path.length > best.path.length) best = module;
    }
  }
  return best;
}

function impactScore({ direct, transitive, modules, churn }) {
  const directComponent = 30 * Math.min(1, direct / 5);
  const transitiveComponent = 35 * Math.min(1, transitive / 20);
  const moduleComponent = 20 * Math.min(1, modules / 5);
  const churnComponent = churn === null ? 0 : 15 * Math.min(1, churn / 500);
  return Math.min(100, Math.round(directComponent + transitiveComponent + moduleComponent + churnComponent));
}

function impactReasons({ direct, transitive, modules, churn, maxDepthReached }) {
  const reasons = [];
  if (direct > 0) reasons.push(`${direct} direct dependent${direct === 1 ? "" : "s"}`);
  if (transitive > 0) reasons.push(`${transitive} transitive dependent${transitive === 1 ? "" : "s"}`);
  if (modules > 1) reasons.push(`${modules} modules in blast radius`);
  if (churn !== null && churn >= 100) reasons.push(`historical churn ${churn}`);
  if (maxDepthReached > 1) reasons.push(`dependency propagation depth ${maxDepthReached}`);
  if (reasons.length === 0) reasons.push("no downstream dependency signal in bounded semantic graph");
  return reasons;
}

function assertDiff(value, currentDigest) {
  if (!value || value.schemaVersion !== "repo-diff/v1" || typeof value.digest !== "string" || !value.files) {
    throw new RepoImpactV2Error("repo_impact_v2_diff_invalid", "Expected repo-diff/v1");
  }
  if (value.currentDigest !== currentDigest) {
    throw new RepoImpactV2Error("repo_impact_v2_diff_mismatch", "Diff currentDigest does not match the supplied RepoMap");
  }
}

function assertBoundArtifact(value, schemaVersion, repositoryDigest, code) {
  if (!value || value.schemaVersion !== schemaVersion || typeof value.digest !== "string") {
    throw new RepoImpactV2Error(code, `Expected ${schemaVersion}`);
  }
  if (value.repositoryDigest !== repositoryDigest) {
    throw new RepoImpactV2Error(`${code}_digest_mismatch`, `${schemaVersion} does not belong to the supplied RepoMap`);
  }
}

function assertRepoMap(value) {
  if (!value || value.schemaVersion !== "repo-map/v1" || typeof value.digest !== "string" || !Array.isArray(value.files)) {
    throw new RepoImpactV2Error("repo_map_invalid", "Expected repo-map/v1");
  }
}
