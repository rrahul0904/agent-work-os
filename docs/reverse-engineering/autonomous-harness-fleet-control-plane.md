# Autonomous Harness / Fleet → Agent Work OS convergence

Status: research + Phase A contract implementation in progress

Tracking issue: #43

## 1. Source identification

Primary donor/source set:

- Reddit launch/giveaway thread: https://www.reddit.com/r/coolgithubprojects/comments/1v3bujh/drop_your_repo_get_a_free_product/
- Product: https://www.autonomous.ai/harness
- Open-source implementation: https://github.com/autonomous-ai/openharness
- Architecture: https://github.com/autonomous-ai/openharness/blob/main/docs/architecture.md
- Product direction: https://github.com/autonomous-ai/openharness/blob/main/docs/product-direction.md
- Provider protocol: https://github.com/autonomous-ai/openharness/blob/main/provider/spec/README.md
- Runtime/UI divergence report: https://github.com/autonomous-ai/openharness/issues/105
- Setup/terminal failure report: https://github.com/autonomous-ai/openharness/issues/110
- Headless login lifecycle report: https://github.com/autonomous-ai/openharness/issues/112
- Entity-model confusion report: https://github.com/autonomous-ai/openharness/issues/113

Comparators:

- codexmux: https://github.com/xklob/codexmux
- OpenChamber: https://github.com/openchamber/openchamber
- PolyAgent CI: https://github.com/RishiiGamer2201/polyagent-ci

## 2. Evidence classes

### official-doc / official-source

The public OpenHarness repository describes a daemon-per-machine execution architecture, tmux-backed agent sessions, worktree isolation, transcript/event normalization, multiple operator surfaces, remote transport, and a provider protocol. These are implementation/design claims that can be inspected in source and docs.

### first-party-public

Autonomous describes Harness as a physical/voice control surface for dispatching and monitoring coding agents across local and remote machines, with Loops for scheduled work and Goals for goal-until-done execution. Marketing and scale/productivity statements are treated as first-party claims, not independent proof.

### observed issue evidence

Issue reports show concrete failure modes and user confusion. They are not proof that every deployment has the same behavior, but they are valid donor pain-point evidence.

### non-claims

This document does not claim Autonomous Harness parity, production readiness, E2EE certification, cross-machine migration, hardware parity, voice parity, or organization-scale throughput.

## 3. Reconstructed user workflow

The useful product loop is:

1. Link or discover one or more machines.
2. Select a project/repository and an agent/runtime.
3. Start or resume an execution session.
4. Observe progress without staying attached to the terminal.
5. Surface only human-attention events such as questions, approvals, failures, or completion.
6. Allow the human to answer/approve/intervene from another control surface.
7. Reconcile after disconnect/restart without lying about execution state.
8. Preserve history/evidence and produce a completion recap.

Higher-level modes:

- **Loop**: run a bounded task on a schedule.
- **Goal**: continue/iterate until an acceptance condition is satisfied or a guardrail stops the run.

The physical desk device is one optional interface to this loop, not the core product.

## 4. Capability and failure-mode decomposition

### Execution substrate

- one local daemon per machine;
- PTY/tmux or equivalent process ownership;
- multiple agent adapters (Codex, Claude Code, OpenCode, etc.);
- per-work-item or per-agent worktree isolation;
- runtime reconciliation after daemon/UI restart;
- local secret ownership.

### Control-plane truth

- stable workspace/project/machine/session/execution identities;
- durable work/run/approval facts;
- transport state separate from execution state;
- ordered events with replay/reconciliation;
- explicit attention states rather than raw terminal noise;
- evidence receipts for state transitions;
- exact authority boundaries for approvals and side effects.

### Transport

- authenticated daemon ↔ control-plane channel;
- sequence-aware event delivery and replay;
- eventual optional P2P/E2EE hardening only after protocol semantics are stable.

### Operator surfaces

- web first;
- desktop/mobile later as projections over the same authoritative state;
- optional voice/hardware surface after software runtime semantics are certified.

### Failure modes extracted from donor evidence

1. **UI/transport disconnect while agent keeps running.** A stale control surface must not fabricate `stopped` or `failed`.
2. **Missing output after reconnect.** Sequence gaps must trigger replay/reconciliation before the UI claims current truth.
3. **Entity-model ambiguity.** Workspace, project, machine, folder, session and execution must be typed separately.
4. **Headless lifecycle ambiguity.** Authentication/setup commands need deterministic completion/exit semantics.
5. **Shared helper/setup failures.** A single setup refresh failure must not silently disable unrelated terminal operations.
6. **Human-attention overload.** Terminal output is not the Work Queue; only bounded attention events should interrupt the operator.

## 5. User feedback and pain-point analysis

The strongest donor signal is the reported divergence between UI connectivity and actual runtime state: the desktop can appear Offline/frozen while the underlying tmux agent continues and may finish. This is a product-trust failure, not merely a rendering bug.

A second cluster concerns conceptual clarity: users can struggle to distinguish workspace/tab, harness, project, machine and folder. Our contract therefore treats identity typing as a correctness concern, not just terminology.

Headless-login and setup-refresh reports also show that lifecycle/error semantics need to be explicit enough for unattended machines.

## 6. Competitive comparison

### codexmux

Useful donor for deliberately coordinated independent sessions: private tmux sessions, readable monitoring, labels and queued peer messages. The important extension for Agent Work OS is governed cross-agent delegation/message passing without giving peers unconstrained authority.

### OpenChamber

Useful donor for mature multi-session agent UX. It reinforces that desktop software can be a first-class operator surface without requiring dedicated hardware.

### PolyAgent CI

Useful donor for parallel isolated branches, dependency/DAG execution, review/conflict resolution and handoffs. These map naturally to existing Agent Work OS flow/work contracts rather than a new orchestration engine.

## 7. Internal donor audit

This effort converges into **Agent Work OS**, not a new product repository.

Existing capabilities/workstreams to reuse:

- RE-387 Flow/run state: authoritative receipt-backed run lifecycle and restart reconciliation.
- RE-371 Operations Atlas: fleet/session/event observability surface.
- RE-359 provider/cost lanes: budgets and provider-level accounting.
- RE-360 orchestration hierarchy: scheduler/org-level fairness concepts.
- RE-294 AgentDock donor: persistent workspaces, inbox/outbox, supervisor/restart/operator console concepts.
- RE-244 work coordination: approvals, evidence and collision protection.
- JackHamr donor work: managed machines/jobs, staged execution, delegated scopes and evidence artifacts.
- Autonomous Forge: executive scheduling/planning capability behind Agent Work OS; it must not become a second operator UI or source of truth.

## 8. Product thesis and target boundary

### Thesis

**Agent Work OS Fleet** is a local-first, evidence-backed command center for directing many coding agents across many machines while preserving truthful execution state, explicit human attention, and verifiable authority.

The differentiator is not a round desk device. The differentiator is trustworthy, restart-surviving control of autonomous work.

### MATCH

- daemon-per-machine agent control;
- normalized agent events;
- multi-machine/session visibility;
- worktree-isolated execution;
- provider extensibility;
- scheduled and goal-oriented execution through the existing Flow/runtime architecture;
- lightweight remote operator surfaces.

### IMPROVE

- connection state and execution truth are distinct facts;
- ordered event replay/reconciliation is contractual;
- state transitions bind to evidence/receipts;
- entity identities are typed and non-interchangeable;
- restart recovery preserves authoritative run/work state;
- approvals and provider spend stay inside explicit policy boundaries;
- cross-agent delegation is governed and attributable.

### NEW

- a Work Queue/attention projection derived from authoritative run/work/approval facts;
- Autonomous Forge as scheduler/executive capability behind the control plane;
- Operations Atlas fleet health and recovery view;
- budget/evidence/approval receipts integrated with fleet execution.

### OMIT / DEFER

- cloning Autonomous branding, industrial design, assets or visual identity;
- physical desk-device implementation in the first software milestones;
- voice hardware before fleet/recovery semantics are certified;
- unsupported productivity or parity claims;
- premature E2EE/P2P reimplementation before the durable event/replay model is proven.

## 9. Behavior contracts and Phase A acceptance tests

Phase A introduces `fleet-status/v1`.

Required behavior:

1. `transportState` is independent of `executionState`.
2. `disconnected` must never imply `stopped`, `failed` or `interrupted` without runtime evidence.
3. Event sequence gaps set a replay requirement.
4. Event sequence regression is rejected.
5. Terminal execution state is sticky for an execution identity; a new run requires a new execution identity.
6. Attention is derived explicitly (`input_required`, `approval_required`, `replay_required`, `reconnect_required`, `none`).
7. Workspace/project/machine/session/execution identifiers are typed.
8. The donor failure case is a required test: runtime continues during disconnect; reconnect/replay resolves to the real terminal state.

Implementation:

- `services/control-api/src/fleet-state.js`
- `services/control-api/test/fleet-state.test.js`

## 10. Implementation roadmap

### Phase A — truth model (current)

- fleet session snapshot contract;
- transport/execution separation;
- sequence gap/replay contract;
- typed identities;
- attention derivation;
- negative tests.

### Phase B — durable reconciliation

- bind fleet snapshots to durable Agent Work OS storage;
- daemon heartbeat and process/session reconciliation;
- append-only/replayable event journal;
- restart tests proving no fabricated completion/failure;
- exact execution identity binding to Flow runs.

### Phase C — real executor integration

- Codex and Claude/OpenCode PTY/tmux adapters;
- worktree lifecycle ownership;
- attach/resume/interrupt semantics;
- local secrets only;
- bounded provider protocol bridge.

### Phase D — Work Queue + executive scheduling

- authoritative attention projection;
- RE-387 Flow integration;
- Autonomous Forge scheduler API behind the control plane;
- budget/provider lane integration;
- governed peer delegation/message passing.

### Phase E — operator surfaces and certification

- Operations Atlas fleet dashboard;
- browser UAT for reconnect/replay/input/approval/completion;
- desktop/mobile projections if justified;
- recovery/daemon-restart certification;
- hosted/remote transport certification.

### Phase F — optional device/voice surface

Only after software semantics are stable:

- voice task capture;
- compact status/approval surface;
- no secrets or execution on the accessory;
- hardware remains an optional projection, not system authority.

## 11. Independent verification gates

No phase is complete from implementation alone.

Required evidence includes:

- exact-head unit/negative tests;
- exact-head acceptance tests;
- restart/reconnect/replay receipts;
- deterministic fake adapter before real provider claims;
- real-provider tests isolated from acceptance-state truth;
- browser UAT for operator claims;
- deployment evidence before hosted claims;
- issue/PR/tracker state updated only after those receipts exist.

## 12. Architecture boundary

```text
Browser / Desktop / Mobile / optional device
                  |
                  v
        Agent Work OS Control Plane
  work + flow + approval + cost + evidence truth
          |                    |
          |                    +--> Autonomous Forge
          |                         scheduler/executive API
          v
  authenticated, replayable transport
          |
     Local Daemon per machine
  process/session reconciler + adapters
          |
      PTY/tmux + worktrees
          |
  Codex / Claude / OpenCode / other agents
```

Rules:

- Agent Work OS is the source of operator/control-plane truth.
- The local daemon is the source of live process/runtime truth.
- A UI is never the source of execution truth.
- Autonomous Forge may choose/plan/schedule work but may not create a parallel work-state authority.
- Human approvals and irreversible/external effects remain policy-gated.

## 13. Tracker status

Use evidence-only status transitions:

- Research: evidence collected
- Product thesis: defined
- Contract: implemented in Phase A branch
- Unit verification: pending exact-head CI receipt until branch Actions completes
- Runtime integration: not started
- Browser UAT: not started
- Deployment: not started
- Parity: not claimed
