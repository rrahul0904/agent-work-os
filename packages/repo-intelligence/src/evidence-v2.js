import { canonicalDigest } from "./index.js";

export const REPO_EVIDENCE_BUNDLE_V2_SCHEMA = "repo-evidence-bundle/v2";

export class RepoEvidenceV2Error extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = "RepoEvidenceV2Error";
    this.code = code;
  }
}

export function createRepositoryEvidenceBundleV2({
  repoMap,
  topology = null,
  context = null,
  risk = null,
  diff = null,
  gitSignals = null,
  importAnalysis = null,
  moduleResolution = null,
  semanticImpact = null,
  provenance = {}
} = {}) {
  assertRepoMap(repoMap);
  if (topology) assertArtifact(topology, "repo-topology/v1", repoMap.digest, "repo_topology_invalid");
  if (context) assertArtifact(context, "repo-context-evidence/v1", repoMap.digest, "repo_context_invalid");
  if (gitSignals) assertArtifact(gitSignals, "repo-git-signals/v1", repoMap.digest, "repo_git_signals_invalid");
  if (importAnalysis) assertArtifact(importAnalysis, "repo-import-analysis/v1", repoMap.digest, "repo_import_analysis_invalid");
  if (moduleResolution) {
    assertArtifact(moduleResolution, "repo-module-resolution/v1", repoMap.digest, "repo_module_resolution_invalid");
    if (!importAnalysis || moduleResolution.importAnalysisDigest !== importAnalysis.digest) {
      throw new RepoEvidenceV2Error("repo_module_resolution_import_mismatch", "Module resolution is not bound to the supplied import analysis");
    }
  }
  if (risk) {
    assertArtifact(risk, "repo-risk/v1", repoMap.digest, "repo_risk_invalid");
    if (topology && risk.topologyDigest !== topology.digest) {
      throw new RepoEvidenceV2Error("repo_risk_topology_mismatch", "Risk artifact is not bound to the supplied topology");
    }
  }
  if (diff) assertDiff(diff, repoMap.digest);
  if (semanticImpact) {
    assertArtifact(semanticImpact, "repo-impact/v2", repoMap.digest, "repo_semantic_impact_invalid");
    if (!importAnalysis || semanticImpact.importAnalysisDigest !== importAnalysis.digest) {
      throw new RepoEvidenceV2Error("repo_semantic_impact_import_mismatch", "Semantic impact is not bound to the supplied import analysis");
    }
    if (!moduleResolution || semanticImpact.moduleResolutionDigest !== moduleResolution.digest) {
      throw new RepoEvidenceV2Error("repo_semantic_impact_resolution_mismatch", "Semantic impact is not bound to the supplied module resolution");
    }
    if (!diff || semanticImpact.diffDigest !== diff.digest) {
      throw new RepoEvidenceV2Error("repo_semantic_impact_diff_mismatch", "Semantic impact is not bound to the supplied repository diff");
    }
    if (semanticImpact.topologyDigest !== null) {
      if (!topology || semanticImpact.topologyDigest !== topology.digest) {
        throw new RepoEvidenceV2Error("repo_semantic_impact_topology_mismatch", "Semantic impact topology binding cannot be reproduced from the supplied artifacts");
      }
    }
    if (semanticImpact.gitSignalsDigest !== null) {
      if (!gitSignals || semanticImpact.gitSignalsDigest !== gitSignals.digest) {
        throw new RepoEvidenceV2Error("repo_semantic_impact_git_mismatch", "Semantic impact Git binding cannot be reproduced from the supplied artifacts");
      }
    }
  }

  const artifactRefs = [artifactRef("repo-map", repoMap)];
  if (topology) artifactRefs.push(artifactRef("repo-topology", topology));
  if (context) artifactRefs.push(artifactRef("repo-context", context));
  if (risk) artifactRefs.push(artifactRef("repo-risk", risk));
  if (diff) artifactRefs.push(artifactRef("repo-diff", diff));
  if (gitSignals) artifactRefs.push(artifactRef("repo-git", gitSignals));
  if (importAnalysis) artifactRefs.push(artifactRef("repo-imports", importAnalysis));
  if (moduleResolution) artifactRefs.push(artifactRef("repo-resolution", moduleResolution));
  if (semanticImpact) artifactRefs.push(artifactRef("repo-semantic-impact", semanticImpact));

  const payload = {
    schemaVersion: REPO_EVIDENCE_BUNDLE_V2_SCHEMA,
    repositoryDigest: repoMap.digest,
    producer: Object.freeze({ name: "agent-work-os/repo-atlas", contractVersion: 2 }),
    provenance: normalizeProvenance(provenance),
    artifacts: Object.freeze(artifactRefs),
    claims: Object.freeze(buildClaims(repoMap, topology, context, risk, diff, gitSignals, importAnalysis, moduleResolution, semanticImpact)),
    selectedPaths: Object.freeze(context?.selected?.map((item) => item.path) ?? []),
    summary: Object.freeze({
      files: repoMap.metrics.files,
      lines: repoMap.metrics.lines,
      languages: Object.keys(repoMap.languages).length,
      modules: topology?.metrics?.modules ?? null,
      dependencyEdges: topology?.metrics?.moduleEdges ?? null,
      contextFiles: context?.selected?.length ?? null,
      highRiskFiles: risk?.metrics?.highRiskFiles ?? null,
      affectedFiles: diff?.summary?.affectedFiles ?? null,
      gitCommitsAnalyzed: gitSignals?.commitsAnalyzed ?? null,
      trackedFiles: gitSignals?.metrics?.trackedFiles ?? null,
      gitWorkingTreeDirty: gitSignals?.workingTreeDirty ?? null,
      parsedSourceFiles: importAnalysis?.metrics?.parserFiles ?? null,
      parserFallbackFiles: importAnalysis?.metrics?.fallbackFiles ?? null,
      resolvedImportFiles: moduleResolution?.metrics?.resolvedFiles ?? null,
      aliasResolvedEdges: moduleResolution ? moduleResolution.metrics.tsconfigPathResolved + moduleResolution.metrics.baseUrlResolved + moduleResolution.metrics.workspaceResolved : null,
      impactedFiles: semanticImpact?.metrics?.impactedFiles ?? null,
      impactedModules: semanticImpact?.metrics?.impactedModules ?? null,
      highImpactChanges: semanticImpact?.metrics?.highImpactChanges ?? null
    })
  };

  return Object.freeze({ ...payload, digest: canonicalDigest(payload) });
}

function buildClaims(repoMap, topology, context, risk, diff, gitSignals, importAnalysis, moduleResolution, semanticImpact) {
  const claims = [claim("repository-shape", `Repository map contains ${repoMap.metrics.files} recognized files and ${repoMap.metrics.lines} nonblank lines.`, repoMap.digest)];
  if (topology) claims.push(claim("repository-topology", `Topology contains ${topology.metrics.modules} modules and ${topology.metrics.moduleEdges} module dependency edges.`, topology.digest));
  if (context) claims.push(claim("task-context", `Task context selected ${context.selected.length} files within an estimated ${context.estimatedTokens} token budget.`, context.digest));
  if (risk) claims.push(claim("structural-hotspots", `Structural analysis scored ${risk.metrics.filesScored} files and identified ${risk.metrics.highRiskFiles} high-risk hotspots.`, risk.digest));
  if (diff) claims.push(claim("repository-drift", `Repository drift affects ${diff.summary.affectedFiles} files: ${diff.summary.addedFiles} added, ${diff.summary.removedFiles} removed, ${diff.summary.changedFiles} changed.`, diff.digest));
  if (gitSignals) claims.push(claim("repository-git-history", `Git analysis inspected ${gitSignals.commitsAnalyzed} commits across ${gitSignals.metrics.trackedFiles} tracked recognized files; working tree dirty=${gitSignals.workingTreeDirty}.`, gitSignals.digest));
  if (importAnalysis) claims.push(claim("repository-import-analysis", `Parser import analysis inspected ${importAnalysis.metrics.sourceFiles} JS/TS source files with ${importAnalysis.metrics.fallbackFiles} explicit lexical fallbacks and ${importAnalysis.metrics.edges} import edges.`, importAnalysis.digest));
  if (moduleResolution) {
    const aliases = moduleResolution.metrics.tsconfigPathResolved + moduleResolution.metrics.baseUrlResolved + moduleResolution.metrics.workspaceResolved;
    claims.push(claim("repository-module-resolution", `Static semantic resolution mapped ${moduleResolution.metrics.resolvedFiles} imports to repository files, including ${aliases} alias/workspace-resolved edges, without executing project code.`, moduleResolution.digest));
  }
  if (semanticImpact) claims.push(claim("repository-semantic-change-impact", `Alias-aware bounded change-impact analysis identified ${semanticImpact.metrics.impactedFiles} downstream files across ${semanticImpact.metrics.impactedModules} modules.`, semanticImpact.digest));
  return claims;
}

function claim(type, text, artifactDigest) {
  return Object.freeze({ type, text, artifactDigest });
}

function artifactRef(kind, artifact) {
  return Object.freeze({ kind, schemaVersion: artifact.schemaVersion, digest: artifact.digest });
}

function normalizeProvenance(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RepoEvidenceV2Error("repo_provenance_invalid", "provenance must be an object");
  }
  const normalized = {};
  for (const key of ["repository", "ref", "commit", "source"]) {
    if (value[key] === undefined || value[key] === null) continue;
    if (typeof value[key] !== "string" || !value[key].trim() || value[key].length > 2_000) {
      throw new RepoEvidenceV2Error("repo_provenance_invalid", `Invalid provenance field: ${key}`);
    }
    normalized[key] = value[key].trim();
  }
  return Object.freeze(normalized);
}

function assertDiff(value, currentDigest) {
  if (!value || value.schemaVersion !== "repo-diff/v1" || typeof value.digest !== "string") {
    throw new RepoEvidenceV2Error("repo_diff_invalid", "Expected repo-diff/v1");
  }
  if (value.currentDigest !== currentDigest) {
    throw new RepoEvidenceV2Error("repo_diff_current_mismatch", "Diff currentDigest does not match the supplied repository map");
  }
}

function assertRepoMap(value) {
  if (!value || value.schemaVersion !== "repo-map/v1" || typeof value.digest !== "string" || !value.metrics) {
    throw new RepoEvidenceV2Error("repo_map_invalid", "Expected repo-map/v1");
  }
}

function assertArtifact(value, schemaVersion, repositoryDigest, code) {
  if (!value || value.schemaVersion !== schemaVersion || typeof value.digest !== "string") {
    throw new RepoEvidenceV2Error(code, `Expected ${schemaVersion}`);
  }
  if (value.repositoryDigest !== repositoryDigest) {
    throw new RepoEvidenceV2Error(`${code}_digest_mismatch`, `${schemaVersion} does not belong to the supplied repository map`);
  }
}
