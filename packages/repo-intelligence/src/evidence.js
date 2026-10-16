import { canonicalDigest } from "./index.js";

export const REPO_EVIDENCE_BUNDLE_SCHEMA = "repo-evidence-bundle/v1";

export class RepoEvidenceError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = "RepoEvidenceError";
    this.code = code;
  }
}

export function createRepositoryEvidenceBundle({ repoMap, topology = null, context = null, risk = null, diff = null, gitSignals = null, provenance = {} } = {}) {
  assertRepoMap(repoMap);
  if (topology) assertArtifact(topology, "repo-topology/v1", repoMap.digest, "repo_topology_invalid");
  if (context) assertArtifact(context, "repo-context-evidence/v1", repoMap.digest, "repo_context_invalid");
  if (gitSignals) assertArtifact(gitSignals, "repo-git-signals/v1", repoMap.digest, "repo_git_signals_invalid");
  if (risk) {
    assertArtifact(risk, "repo-risk/v1", repoMap.digest, "repo_risk_invalid");
    if (topology && risk.topologyDigest !== topology.digest) {
      throw new RepoEvidenceError("repo_risk_topology_mismatch", "Risk artifact is not bound to the supplied topology");
    }
  }
  if (diff) {
    if (diff.schemaVersion !== "repo-diff/v1" || typeof diff.digest !== "string") {
      throw new RepoEvidenceError("repo_diff_invalid", "Expected repo-diff/v1");
    }
    if (diff.currentDigest !== repoMap.digest) {
      throw new RepoEvidenceError("repo_diff_current_mismatch", "Diff currentDigest does not match the supplied repository map");
    }
  }

  const artifactRefs = [artifactRef("repo-map", repoMap)];
  if (topology) artifactRefs.push(artifactRef("repo-topology", topology));
  if (context) artifactRefs.push(artifactRef("repo-context", context));
  if (risk) artifactRefs.push(artifactRef("repo-risk", risk));
  if (diff) artifactRefs.push(artifactRef("repo-diff", diff));
  if (gitSignals) artifactRefs.push(artifactRef("repo-git", gitSignals));

  const payload = {
    schemaVersion: REPO_EVIDENCE_BUNDLE_SCHEMA,
    repositoryDigest: repoMap.digest,
    producer: Object.freeze({
      name: "agent-work-os/repo-atlas",
      contractVersion: 1
    }),
    provenance: normalizeProvenance(provenance),
    artifacts: Object.freeze(artifactRefs),
    claims: Object.freeze(buildClaims(repoMap, topology, context, risk, diff, gitSignals)),
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
      gitWorkingTreeDirty: gitSignals?.workingTreeDirty ?? null
    })
  };

  return Object.freeze({ ...payload, digest: canonicalDigest(payload) });
}

function buildClaims(repoMap, topology, context, risk, diff, gitSignals) {
  const claims = [
    Object.freeze({
      type: "repository-shape",
      text: `Repository map contains ${repoMap.metrics.files} recognized files and ${repoMap.metrics.lines} nonblank lines.`,
      artifactDigest: repoMap.digest
    })
  ];
  if (topology) {
    claims.push(Object.freeze({
      type: "repository-topology",
      text: `Topology contains ${topology.metrics.modules} modules and ${topology.metrics.moduleEdges} module dependency edges.`,
      artifactDigest: topology.digest
    }));
  }
  if (context) {
    claims.push(Object.freeze({
      type: "task-context",
      text: `Task context selected ${context.selected.length} files within an estimated ${context.estimatedTokens} token budget.`,
      artifactDigest: context.digest
    }));
  }
  if (risk) {
    claims.push(Object.freeze({
      type: "structural-hotspots",
      text: `Structural analysis scored ${risk.metrics.filesScored} files and identified ${risk.metrics.highRiskFiles} high-risk hotspots.`,
      artifactDigest: risk.digest
    }));
  }
  if (diff) {
    claims.push(Object.freeze({
      type: "repository-drift",
      text: `Repository drift affects ${diff.summary.affectedFiles} files: ${diff.summary.addedFiles} added, ${diff.summary.removedFiles} removed, ${diff.summary.changedFiles} changed.`,
      artifactDigest: diff.digest
    }));
  }
  if (gitSignals) {
    claims.push(Object.freeze({
      type: "repository-git-history",
      text: `Git analysis inspected ${gitSignals.commitsAnalyzed} commits across ${gitSignals.metrics.trackedFiles} tracked recognized files; working tree dirty=${gitSignals.workingTreeDirty}.`,
      artifactDigest: gitSignals.digest
    }));
  }
  return claims;
}

function artifactRef(kind, artifact) {
  return Object.freeze({
    kind,
    schemaVersion: artifact.schemaVersion,
    digest: artifact.digest
  });
}

function normalizeProvenance(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RepoEvidenceError("repo_provenance_invalid", "provenance must be an object");
  }
  const normalized = {};
  for (const key of ["repository", "ref", "commit", "source"]) {
    if (value[key] === undefined || value[key] === null) continue;
    if (typeof value[key] !== "string" || !value[key].trim() || value[key].length > 2_000) {
      throw new RepoEvidenceError("repo_provenance_invalid", `Invalid provenance field: ${key}`);
    }
    normalized[key] = value[key].trim();
  }
  return Object.freeze(normalized);
}

function assertRepoMap(value) {
  if (!value || value.schemaVersion !== "repo-map/v1" || typeof value.digest !== "string" || !value.metrics) {
    throw new RepoEvidenceError("repo_map_invalid", "Expected repo-map/v1");
  }
}

function assertArtifact(value, schemaVersion, repositoryDigest, code) {
  if (!value || value.schemaVersion !== schemaVersion || typeof value.digest !== "string") {
    throw new RepoEvidenceError(code, `Expected ${schemaVersion}`);
  }
  if (value.repositoryDigest !== repositoryDigest) {
    throw new RepoEvidenceError(`${code}_digest_mismatch`, `${schemaVersion} does not belong to the supplied repository map`);
  }
}
