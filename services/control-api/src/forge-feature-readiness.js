// Release readiness contract for the REA Forge capability in Agent Work OS.
// This is a MANUALLY MAINTAINED coverage record, not a replacement for the
// GitHub master issue / verification ledger and not a production release grant.
// "Implemented" only means code exists; it is never synonymous with SHIPPED.
const FEATURES = Object.freeze([
  { id: "codex-observer", title: "Native Codex lifecycle observations", stage: "implemented_local",
    evidence: [".codex/hooks.json", "services/control-api/test/forge-native-hooks.test.js"],
    unresolved: "Mac Codex session and subagent UAT not witnessed" },
  { id: "live-graph", title: "Interactive real-time Codex execution DAG", stage: "implemented_local",
    evidence: ["apps/web/public/forge.js", "services/control-api/test/forge-graph.test.js"],
    unresolved: "Codex in-app browser UX not independently verified; no native chat plugin" },
  { id: "durable-local-supervisor", title: "Bounded durable local task supervisor", stage: "implemented_local",
    evidence: ["services/control-api/src/forge-supervisor.js", "services/control-api/test/forge-supervisor-api.test.js"],
    unresolved: "Not a transactional multi-replica production scheduler" },
  { id: "worktree-isolation", title: "Per-worker exact-SHA Git isolation", stage: "implemented_local",
    evidence: ["runtime/daemon/src/forge-worktrees.js", "runtime/daemon/test/forge-worktrees.test.js"],
    unresolved: "Mac Codex execution and worktree cleanup still require UAT" },
  { id: "deterministic-static-review", title: "Independent Git diff reconciliation", stage: "implemented_local",
    evidence: ["runtime/verifier/forge-readonly-verifier.js", "runtime/daemon/test/forge-independent-review.test.js"],
    unresolved: "Static check only; test execution/security/UAT not independently certified" },
  { id: "handoff-preflight", title: "Cross-worktree patch handoff preflight", stage: "implemented_local",
    evidence: ["runtime/verifier/forge-handoff-check.js", "runtime/daemon/test/forge-handoff.test.js"],
    unresolved: "Does not promote/merge patches or reconcile dependent worktree branches" },
  { id: "rea-research", title: "Real REA public-source provider and provenance", stage: "not_implemented",
    evidence: [], unresolved: "No source-backed REA provider integration or licensing ledger" },
  { id: "dynamic-specialists", title: "Capability registry skill selection and worker routing", stage: "not_implemented",
    evidence: [], unresolved: "Intake uses deterministic Codex/echo roles; no governed dynamic capabilities" },
  { id: "parallel-code-integration", title: "Safely parallel Codex implementation and promotion", stage: "not_implemented",
    evidence: [], unresolved: "Code-writing maxParallel=1 pending independent conflict-safe promotion" },
  { id: "independent-tests-and-repair", title: "Independent tests, bounded repair and replay", stage: "not_implemented",
    evidence: [], unresolved: "No separately sandboxed deterministic application verifier or authorized repair loop" },
  { id: "production-scheduling", title: "Multi-replica Postgres leases, fencing, tenancy", stage: "not_implemented",
    evidence: [], unresolved: "Local JSON supervisor only; production API explicitly disabled" },
  { id: "shipping-integration", title: "Shipping OS approval, UAT, deploy and rollback receipts", stage: "not_implemented",
    evidence: [], unresolved: "No REA Forge-to-Shipping OS orchestrated release receipt" },
  { id: "tracker-sync", title: "Receipt-backed canonical portfolio tracker update", stage: "not_implemented",
    evidence: [], unresolved: "Evidence report export exists; canonical tracker writeback absent" },
  { id: "security-observability", title: "Production grant policy, audit, retention and secret scanning", stage: "not_implemented",
    evidence: [], unresolved: "Local auth and event redaction only; production hardening outstanding" }
]);
export function getForgeReleaseReadiness() {
  const features = FEATURES.map(f => ({ ...f, evidence: [...f.evidence] }));
  const implemented = features.filter(f => f.stage === "implemented_local").length;
  const missing = features.filter(f => f.stage !== "implemented_local").map(f => f.id);
  return {
    schema: "rea-forge-release-readiness/v1",
    sourceOfTruth: "rrahul0904/agent-work-os/issues/359",
    implementationPR: "rrahul0904/agent-work-os/pull/358",
    auditType: "declared-feature-coverage-not-independent-attestation",
    features, counts: { total: features.length, localImplementation: implemented,
      releaseVerified: 0, missingOrBlocked: features.length - implemented },
    releaseReady: false, deployed: false, missing,
    condition: "All release gates require exact-head test/UAT/approval evidence, not feature flags or agent narratives"
  };
}
