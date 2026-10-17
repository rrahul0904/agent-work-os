import { canonicalDigest } from "./index.js";

export const REPO_RISK_SCHEMA = "repo-risk/v1";

export class RepoRiskError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = "RepoRiskError";
    this.code = code;
  }
}

export function analyzeStructuralRisk(repoMap, topology, options = {}) {
  assertRepoMap(repoMap);
  assertTopology(topology, repoMap.digest);
  const topN = normalizeTopN(options.topN ?? 25);

  const importStats = new Map(repoMap.files.map((file) => [file.path, { incoming: 0, outgoing: 0 }]));
  for (const edge of topology.fileImports) {
    if (importStats.has(edge.from)) importStats.get(edge.from).outgoing += 1;
    if (importStats.has(edge.to)) importStats.get(edge.to).incoming += 1;
  }

  const fileRisks = repoMap.files.map((file) => {
    const stats = importStats.get(file.path) ?? { incoming: 0, outgoing: 0 };
    const sizeScore = Math.log2(Math.max(1, file.lines) + 1) * 8;
    const fanInScore = stats.incoming * 14;
    const fanOutScore = stats.outgoing * 7;
    const score = round(sizeScore + fanInScore + fanOutScore);
    return Object.freeze({
      path: file.path,
      language: file.language,
      lines: file.lines,
      incomingImports: stats.incoming,
      outgoingImports: stats.outgoing,
      score,
      level: riskLevel(score),
      reasons: Object.freeze(buildFileReasons(file.lines, stats))
    });
  }).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  const moduleFileStats = new Map(topology.modules.map((module) => [module.id, { lines: 0, files: 0 }]));
  for (const file of repoMap.files) {
    const owner = owningModule(file.path, topology.modules);
    if (!owner) continue;
    const stats = moduleFileStats.get(owner.id);
    stats.lines += file.lines;
    stats.files += 1;
  }
  const centrality = new Map(topology.centrality.map((item) => [item.moduleId, item]));

  const moduleRisks = topology.modules.map((module) => {
    const files = moduleFileStats.get(module.id) ?? { lines: 0, files: 0 };
    const graph = centrality.get(module.id) ?? { incoming: 0, outgoing: 0, degree: 0 };
    const score = round(
      Math.log2(Math.max(1, files.lines) + 1) * 10 +
      graph.incoming * 18 +
      graph.outgoing * 9
    );
    return Object.freeze({
      moduleId: module.id,
      name: module.name,
      path: module.path,
      files: files.files,
      lines: files.lines,
      incomingDependencies: graph.incoming,
      outgoingDependencies: graph.outgoing,
      score,
      level: riskLevel(score),
      reasons: Object.freeze(buildModuleReasons(files, graph))
    });
  }).sort((a, b) => b.score - a.score || a.moduleId.localeCompare(b.moduleId));

  const payload = {
    schemaVersion: REPO_RISK_SCHEMA,
    repositoryDigest: repoMap.digest,
    topologyDigest: topology.digest,
    methodology: Object.freeze({
      version: "structural-risk/v1",
      inputs: Object.freeze(["nonblank-lines", "file-import-fanin", "file-import-fanout", "module-degree"]),
      note: "Heuristic structural hotspot score; not a vulnerability or defect probability."
    }),
    hotspots: Object.freeze(fileRisks.slice(0, topN)),
    modules: Object.freeze(moduleRisks.slice(0, topN)),
    metrics: Object.freeze({
      filesScored: fileRisks.length,
      modulesScored: moduleRisks.length,
      highRiskFiles: fileRisks.filter((item) => item.level === "high").length,
      highRiskModules: moduleRisks.filter((item) => item.level === "high").length
    })
  };

  return Object.freeze({ ...payload, digest: canonicalDigest(payload) });
}

function buildFileReasons(lines, stats) {
  const reasons = [];
  if (lines >= 500) reasons.push("large-file");
  else if (lines >= 200) reasons.push("medium-large-file");
  if (stats.incoming >= 5) reasons.push("high-fanin");
  else if (stats.incoming >= 2) reasons.push("shared-dependency");
  if (stats.outgoing >= 8) reasons.push("high-fanout");
  else if (stats.outgoing >= 3) reasons.push("multi-dependency");
  if (reasons.length === 0) reasons.push("baseline-structure");
  return reasons;
}

function buildModuleReasons(files, graph) {
  const reasons = [];
  if (files.lines >= 5_000) reasons.push("large-module");
  else if (files.lines >= 1_500) reasons.push("medium-large-module");
  if (graph.incoming >= 4) reasons.push("central-upstream-module");
  else if (graph.incoming >= 2) reasons.push("shared-upstream-module");
  if (graph.outgoing >= 5) reasons.push("integration-heavy-module");
  if (reasons.length === 0) reasons.push("baseline-structure");
  return reasons;
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

function riskLevel(score) {
  if (score >= 90) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function round(value) {
  return Number(value.toFixed(3));
}

function normalizeTopN(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000) {
    throw new RepoRiskError("repo_risk_topn_invalid", "topN must be an integer from 1 to 1000");
  }
  return value;
}

function assertRepoMap(value) {
  if (!value || value.schemaVersion !== "repo-map/v1" || !Array.isArray(value.files) || typeof value.digest !== "string") {
    throw new RepoRiskError("repo_map_invalid", "Expected repo-map/v1");
  }
}

function assertTopology(value, repositoryDigest) {
  if (!value || value.schemaVersion !== "repo-topology/v1" || !Array.isArray(value.fileImports) || typeof value.digest !== "string") {
    throw new RepoRiskError("repo_topology_invalid", "Expected repo-topology/v1");
  }
  if (value.repositoryDigest !== repositoryDigest) {
    throw new RepoRiskError("repo_topology_digest_mismatch", "Topology does not belong to the supplied repository map");
  }
}
