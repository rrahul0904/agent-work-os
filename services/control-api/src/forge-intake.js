// Deterministic REA Forge project-intake template. This is not a completed
// REA research assessment: upstream source claims remain unverified until an
// authorized worker collects evidence and reviewers approve it.
export function buildForgeIntakeSpec({ sourceUrl, cwd, machineId, title, goal, agent = "codex" } = {}) {
  if (!["codex", "echo"].includes(agent)) throw new Error("forge_intake_agent_invalid");
  if (typeof sourceUrl !== "string" || !/^https:\/\/\S{3,2040}$/i.test(sourceUrl)) throw new Error("forge_intake_source_required");
  const safeGoal = typeof goal === "string" && goal.trim() ? goal.trim().slice(0, 600) : "Produce a clean-room functional equivalent with independent verification";
  const name = typeof title === "string" && title.trim() ? title.trim().slice(0, 150) : "REA investigation: " + sourceUrl.slice(0, 105);
  const guardrail = "Operate only in the approved local worktree. Do not push, merge, deploy, purchase, collect credentials, bypass terms, use unlicensed source, or mutate external providers. Identify assumptions, unknowns and independent evidence. Keep all stages in the approved worktree.";
  const tasks = [
    { id: "owner-inventory", title: "Find prior REA work and ownership", dependsOn: [], prompt:
      "ROLE: Portfolio / ownership investigator. Search the local Agent Work OS roadmap, related repos, existing issues, implementation ledger and tracker for this target. Classify STANDALONE, DONOR_REFERENCE or EXTENSION/MODULE. Produce a source-backed ownership brief and avoid duplicate repos. " + guardrail },
    { id: "source-research", title: "REA public-source evidence and licensing", dependsOn: [], prompt:
      "ROLE: REA clean-room researcher. Analyze the accessible public target at " + sourceUrl + ". Separate observed functionality, self-reported claims, inferred behavior and unknowns; evaluate licenses/provenance. Write the evidence ledger and implementation boundaries. No proprietary code copying. " + guardrail },
    { id: "architecture", title: "Design architecture and executable plan", dependsOn: ["owner-inventory", "source-research"], prompt:
      "ROLE: Principal architect. Review approved owner inventory and evidence; design a technically feasible clean-room alternative, data models, interfaces, user journeys, verification matrix, risk gates and prioritized execution plan aligned with the existing Agent Work OS. Goal: " + safeGoal + ". " + guardrail },
    { id: "implementation", title: "Implement bounded product vertical slice", dependsOn: ["architecture"], prompt:
      "ROLE: Senior engineer. Implement a small but working product vertical slice that follows the documented architecture. Add unit/integration tests and real accessible user workflows, not fake statuses. Preserve existing features; perform implementation only in the approved repo/worktree. " + guardrail },
    { id: "independent-review", title: "Independent code/security/UX review", dependsOn: ["implementation"], prompt:
      "ROLE: Independent verifier, not the builder. Independently inspect the exact working-tree diff, licensing, tests, UX and threat model. Execute tests, reproduce failures, record exact SHA or uncommitted diff ID and evidence digests. Identify repairs. Do not self-certify model output. " + guardrail },
    { id: "release-readiness", title: "Shipping OS release gate and tracker proposal", dependsOn: ["independent-review"], prompt:
      "ROLE: Shipping readiness reviewer. Evaluate real test evidence, UAT, provenance, tested SHA and release constraints. Produce a proposed tracker status and gated Shipping OS handoff. DO NOT deploy, publish, mark SHIPPED or automatically update canonical tracker without independent receipt and authorization. " + guardrail }
  ].map(task => ({ ...task, agent }));
  return {
    title: name, sourceUrl, cwd, machineId,
    maxParallel: agent === "codex" ? 1 : 2,
    tasks
  };
}
