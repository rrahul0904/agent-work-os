---
name: rea-forge
description: Governed reverse-engineering intake and evidence-first implementation in Agent Work OS. Use when the user says "start REA Forge", "start reverse engineering using our roadmap and REA", or asks to resume an existing REA Forge investigation.
---

# REA Forge — Codex workspace skill (initial integration)

This is a **workflow skill**, not a background agent scheduler. Do not claim autonomous multi-agent deployment exists until Agent Work OS's general supervisor, dependency DAG and execution-fabric contracts pass real verification. The visual control room at /forge.html shows recorded machines, sessions, runs and work items only.

## Trigger and plan

1. Parse user's target URLs, named requirements, intended output and stop/approval constraints; keep original text and links in evidence.
2. Inspect docs/architecture/CAPABILITY_OWNERSHIP.md, IMPLEMENTATION_TRACKER.md, CAPABILITY_DEPENDENCY_GRAPH.md, existing REA #88, Frink #39, Execution Fabric #267, Capability Fabric #259, Shipping OS #51, and associated portfolio tracker before creating work.
3. Read live GitHub repository/issue/PR metadata and identify any existing owner or in-flight work. Do not create a duplicate repository, tracker ID, supervisor authority or task state store.
4. For third-party targets, observe only accessible public artifacts or explicitly authorized sources. Distinguish directly observed, source claimed, inferred and unknown. Audit licensing and provenance before code reuse.
5. Propose a canonical destination: NEW_STANDALONE (new private repo after approval), DONOR_REFERENCE (research branch in owner repo), or EXTENSION/MODULE (bounded module branch). Favor convergence with Agent Work OS.
6. Produce a versioned, small task breakdown: inputs, dependencies, specialist skill, allowable tools/effects, test plan, evidence outputs, and done criteria. A task marked complete must include observed verification evidence.
7. For authorized engineering work, use an isolated branch/worktree, inspect clean working state, keep changes small and execute test/repair with bounded retries. Use existing Codex execution and controls; do not invent subagent spawning APIs.
8. Have an independent reviewer/test process inspect the diff and exact head. Do not treat self-reported agent success or process exit as deployment proof.
9. Open/update draft PR and evidence ledger. Do not push to protected branches, auto-merge, delete user data, deploy, pay for services, or perform irreversible mutations without explicit appropriate grants.
10. Report exact repository/branch/head, results, blockers, test/CI and runtime evidence, and the next authorized step.

## Local visual evidence

- If Agent Work OS is running, open http://127.0.0.1:8787/forge.html (authenticated using the existing local control plane).
- The graph is **read-only**. A visible session reflects a recorded session; it does not prove an autonomous supervisor dispatched it.
- No machine-to-task dependencies are displayed unless backed by canonical task relationships in a future API revision.
- When an agent is not observed, say UNKNOWN / NOT OBSERVED; do not backfill imagined activity.

## Codex acceptance workflow

Read docs/architecture/REA_FORGE_CONTROL_ROOM.md and complete the exact-head tests and browser verification first. Only after the control-room slice is independently verified should the next increment introduce a versioned real Task DAG and deterministic fake backend. Keep work/authorization/receipts under Agent Work OS authority, while treating REA as a research provider and Autonomous Forge as an optional scheduler adapter.

## Current executable intake (implemented, local-only)

To begin from a target URL, with the local API and daemon running and the repository hooks explicitly trusted:

```bash
AGENT_WORK_OS_TOKEN=dev-token npm run forge:intake -- --url https://example.org/product --cwd "$(pwd)" --title "Research + build target" --agent codex
```

The feature requires `AGENT_WORK_OS_ENABLE_FORGE_SUPERVISOR=true` on the local API, and the working directory must be under the approved `AGENT_WORK_OS_FORGE_WORKSPACE_ROOT`. The command reads currently online compatible machines and creates a deterministic six-task DRAFT: owner inventory, REA evidence, architecture, implementation, independent review, release-readiness. It never auto-approves dispatch. Codex workers are serialized until per-worker worktree isolation is implemented.

Open http://127.0.0.1:8787/forge.html in Codex's built-in browser, inspect the draft plan, then approve only if its effects are authorized. At each agent completion, inspect independent evidence, attach a real SHA-256 digest and reviewer identity, then attest to unlock dependent work. A human attestation is not a certified deployment receipt. No direct push, merge, provider writes or public deployment.

The control room also shows direct-Codex-session lifecycle hooks as non-authoritative observations; do not confuse them with the authorized Forge task DAG.

## Release integrity: all-feature readiness and independent review

Before calling REA Forge complete, load the local authenticated `/api/forge/readiness` endpoint and inspect the entire 14-feature inventory in the Control Room. Its implementation-stage entries are NOT release receipts. Canonical blockers remain in https://github.com/rrahul0904/agent-work-os/issues/359. Do not label a feature deployed from its files, CI success or agent narrative. The entire product remains NOT SHIPPED while any gate is unresolved.

For each Forge Codex worker, the daemon runs the independent, read-only Git verifier in a separate process after computing the worker's diff. Verification binds task, session, source SHA and actual patch digest; human attestation must reference the observed digest. This STATIC receipt never executes application tests or security checks and cannot authorize promotion or deployment.

To preflight a code handoff without writing to the receiving checkout, with the local API and worktree root configured, run:

    AGENT_WORK_OS_TOKEN=dev-token AGENT_WORK_OS_FORGE_WORKTREE_ROOT="$HOME/.local/share/rea-forge-worktrees" npm run forge:handoff -- --session ACTUAL_COMPLETED_SESSION_ID --destination /absolute/clean/receiving/repo

This command checks source and target exact HEAD, clean destination, worker Git diff and independent static verification, then runs git apply --check. It does NOT apply the patch, merge commits, grant deployment approval, or restart downstream work. If conflicts or missing receipts are found, preserve both worktrees and report BLOCKED.
