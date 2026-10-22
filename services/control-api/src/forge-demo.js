// Deterministic, non-destructive REA Forge demo scenarios.
// This file does not dispatch or attest workers; the operator must explicitly
// approve any real Codex execution after inspecting the draft.
export function forgeDemoSpec({ mode, machineId, cwd }) {
  if (!["echo", "codex"].includes(mode)) throw new Error("forge_demo_mode_invalid");
  if (!machineId || !cwd) throw new Error("forge_demo_machine_and_cwd_required");
  if (mode === "echo") {
    return {
      title: "REA Forge DEMO — dependency + approval gates (echo)",
      machineId, cwd, maxParallel: 2,
      tasks: [
        { id: "discover", title: "Discover evidence (fixture)", agent: "echo",
          prompt: "REA Forge fixture: emit actual echo execution events. No network or writes.",
          dependsOn: [] },
        { id: "inventory", title: "Inventory ownership (fixture)", agent: "echo",
          prompt: "REA Forge fixture: echo an independent inventory stage. No network or writes.",
          dependsOn: [] },
        { id: "integrate", title: "Blocked until both predecessors verified", agent: "echo",
          prompt: "REA Forge fixture: verify downstream scheduling only after prior attestations.",
          dependsOn: ["discover", "inventory"] }
      ]
    };
  }
  return {
    title: "REA Forge DEMO — observed real Codex actions (read-only)",
    machineId, cwd, maxParallel: 1,
    tasks: [{
      id: "inspect", title: "Read-only architecture and risk inspection", agent: "codex",
      dependsOn: [], expectChanges: false,
      prompt: [
        "You are running a REAL REA Forge observability acceptance demo.",
        "Inspect this repository only; do not change files, install dependencies, fetch network resources, push, merge, deploy or access secrets.",
        "Use available read-only tools to inspect package.json, REA Forge architecture, and the tests.",
        "If subagents are available and authorized, ask one to review the graph and another to review the supervisor independently; never fabricate subagent activity if unsupported.",
        "Report 3 observed strengths, 3 genuine gaps and a concise exact-file evidence list.",
        "Do not claim all tests passed unless you actually ran them. Keep execution bounded."
      ].join(" ")
    }]
  };
}

/** Report observed source facts, not simulated agent activity. */
export function summarizeForgeDemo(plan, sessions = {}) {
  if (!plan || !Array.isArray(plan.tasks)) throw new Error("forge_demo_plan_invalid");
  const tasks = plan.tasks.map(task => {
    const session = task.sessionId ? sessions[task.sessionId] : null;
    const events = Array.isArray(session?.events) ? session.events : [];
    const codex = events.filter(event => event.kind === "codex.activity");
    const hook = events.filter(event => event.kind === "workspace" || event.kind === "workspace.diff" || event.kind === "workspace.review");
    return {
      id: task.id, taskState: task.state, sessionId: task.sessionId,
      observedSessionStatus: session?.status ?? "not_observed",
      eventCount: events.length, observedCodexItems: codex.length,
      observedDelegations: codex.filter(event => Array.isArray(event.receiverThreadIds) && event.receiverThreadIds.length).length,
      worktreeReceiptObserved: hook.some(e => e.kind === "workspace"),
      diffReceiptObserved: hook.some(e => e.kind === "workspace.diff"),
      independentStaticReviewObserved: hook.some(e => e.kind === "workspace.review")
    };
  });
  return {
    schema: "rea-forge-demo-observations/v1",
    planId: plan.id, state: plan.state, tasks,
    demonstrated: {
      localExecution: tasks.some(t => t.eventCount > 0),
      approvalGate: plan.state === "draft" && tasks.every(t => t.sessionId == null),
      independentDependencyGate: plan.tasks.some(t =>
        t.dependsOn?.length && t.state === "pending" &&
        t.dependsOn.some(dep => !plan.tasks.find(x => x.id === dep && x.state === "verified"))),
      codexActivity: tasks.some(t => t.observedCodexItems > 0),
      nativeSubagentEvent: tasks.some(t => t.observedDelegations > 0),
      isolatedGitWorktree: tasks.some(t => t.worktreeReceiptObserved),
      independentStaticReview: tasks.some(t => t.independentStaticReviewObserved)
    },
    unsupportedConclusions: [
      "CI success is not proof of Codex desktop UX.",
      "Echo activity is not autonomous reasoning.",
      "A static Git reviewer is not application or deployment verification.",
      "An absent subagent signal cannot be represented as an observed child agent."
    ]
  };
}
