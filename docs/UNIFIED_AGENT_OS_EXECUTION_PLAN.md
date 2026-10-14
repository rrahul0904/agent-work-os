# Unified Agent OS Execution Plan

Status: canonical consolidation plan
Canonical repository: `rrahul0904/agent-work-os`
Canonical product: **Agent Work OS / Self-Working Agent**
Date: 2026-10-13

## 1. Product decision

All Agent OS, AI-agent infrastructure, agent runtime, reverse-engineering, memory, browser, fleet, mesh, verification, and shipping capabilities converge into **one authoritative platform repository**: `rrahul0904/agent-work-os`.

Do not create a second Agent OS, a second task database, a second memory authority, a second agent supervisor, or a standalone REA clone. Reverse-engineered systems are capability donors, providers, pattern sources, fixtures, or third-party corpora. Agent Work OS owns orchestration, authorization, policy, state, evidence, replay, verification, and shipping truth.

Standalone end-user products may remain separate only when they are genuinely distinct products. Shared agent infrastructure must be extracted into Agent Work OS first.

## 2. Canonical lifecycle

The system follows one proof-bearing lifecycle:

`Target / Goal -> Discovery -> REA Investigation -> Evidence -> Understanding -> Reconstruction -> Specification -> Plan -> Authorization -> Build -> Test -> Repair -> Verify -> Compare -> Deploy -> Production Verify -> Certify -> Retain Memory -> Advance`

The shorter autonomous execution loop is:

`Tracker -> Supervisor -> Plan -> Exact Grant -> Isolated Worktree/Sandbox -> Agent -> Test -> Repair -> Review -> PR/CI -> Preview -> Production Verification -> Receipt -> Tracker -> Next Work Item`

No stage may imply a later stage. In particular:

- capability does not imply authorization;
- plan does not imply execution permission;
- agent completion does not imply verification;
- CI success does not imply deployment;
- deployment does not imply production verification;
- an observation does not imply equivalence;
- a reverse-engineering result does not imply permission to reconstruct or mutate a target.

## 3. Governing architecture

### Authority plane

Agent Work OS is the final authority for:

- projects, work items, tasks, runs, actors, worktrees, sessions and artifacts;
- policy and exact authorization;
- human-only gates and irreversible-action controls;
- evidence/provenance;
- deterministic receipts;
- replay and restart reconciliation;
- verification and release state;
- Shipping OS deployment/certification;
- canonical project tracker status.

### Control plane

Keep the existing Node 22 control plane and evolve it into a durable multi-user/multi-machine service:

- REST/API and realtime gateway;
- machine registry and capability truth;
- session/run state machines;
- work-item scheduler;
- supervisor event loop;
- approvals/attention queue;
- audit and receipt APIs;
- Postgres durable state;
- Redis or NATS for horizontal realtime routing;
- idempotency and optimistic concurrency.

### Local execution plane

The local daemon remains the security boundary for private repositories, credentials, local tools and machine-specific execution:

- authenticated machine daemon;
- local repo custody;
- worktree lifecycle;
- Docker/E2B-like sandbox abstraction where appropriate;
- PTY/process ownership;
- filesystem and Git capability enforcement;
- local agent adapters;
- browser/runtime adapters;
- MCP servers and reverse-engineering providers;
- local model/compute adapters;
- cleanup, cancellation and crash reconciliation.

### Agent Runtime Abstraction Layer

Define stable runtime contracts instead of binding product logic to one framework.

Core domain objects:

`Agent`, `Task`, `Run`, `State`, `Artifact`, `Tool`, `Skill`, `Memory`, `Evidence`, `Checkpoint`, `Approval`, `Receipt`, `Evaluation`, `CapabilityProfile`.

Primary adapter lanes:

- Codex CLI — existing first-class coding adapter;
- Claude Code — execution/observation adapter;
- OpenCode / ACP-compatible coding agents;
- OpenHands-style coding executor/provider;
- LangGraph — Tier-1 bounded orchestration adapter;
- Microsoft Agent Framework — Tier-1 enterprise agent adapter;
- Langflow — Tier-1 visual workflow adapter where useful;
- CrewAI and Dify — pattern/provider sources, not platform authority;
- AutoGen — reference-only unless a concrete capability gap appears;
- Flowise — UX/reference donor, not authority.

Every adapter must normalize into the same Agent Work OS event, run, usage, artifact, approval and receipt contracts.

### Reverse Engineering Capability OS

REA is a governed investigation provider, never the supervisor or shipping authority.

Provider chain:

`Agent Work OS -> Reverse Engineering Capability Layer -> provider adapters -> REA / Ghidra / browser-runtime / managed-code / Android tools -> Evidence Graph -> clean-room specification -> implementation`

Core rules:

- pin exact provider version/revision and catalog/schema/effect digests;
- separate tool effects from authorization;
- exact target identity/digest binding;
- retained bounded Evidence and selected views;
- explicit Observed / Inferred / Hypothesis / Unknown / Verified states;
- cancellation and cleanup are receipt fields;
- provider failure cannot fabricate completion;
- no implicit installs, upgrades, pushes, deployments or tracker mutation;
- clean-room boundary before implementation when appropriate.

Current anchor: issue #88 and PR #146.

### Memory and Context Plane

Memory is a subsystem of Agent Work OS, not a separate product.

Unify existing private context handoffs, Work Memory, Dory/context ideas, CortexDB donor research and future vector/graph retrieval behind one lifecycle:

`propose -> policy/provenance gate -> commit -> index -> retrieve -> authorize -> context pack -> use -> receipt -> supersede/purge/replay`

Required scopes:

`global`, `project`, `repo`, `worktree`, `task`, `run`, `session`, `agent`.

Required truth:

- source/provenance/content hash;
- temporal validity;
- supersession/conflicts;
- retrieval-time authorization;
- lexical recall with no embedding provider;
- optional vector provider;
- bounded typed graph relations;
- append/replay changelog;
- explicit authorized purge;
- JSONL import/export;
- deterministic replay.

Current anchor: issue #166 / PR #167 plus the existing private project-context implementation.

### Tool / MCP plane

Use a provider-neutral tool registry and MCP inspection boundary.

Every tool/provider exposes:

- stable identity;
- capability manifest;
- exact input/output schemas;
- effect manifest;
- readiness/health;
- version/revision;
- authorization requirements;
- bounded invocation receipts;
- cancellation and cleanup semantics.

Current anchor: issue #67.

### Browser / Computer-use plane

Converge riru, Browsentic, px0, webcmd/Browser Learning, browser-runtime REA and related donor work into one governed browser runtime.

Required model:

`BrowserTarget -> Observation -> ProposedAction -> Policy -> Exact Grant -> Tab/Session Lease -> Action -> Evidence -> Receipt -> Replay`

Do not implement CAPTCHA bypass or stealth/evasion as default product behavior. Consequential actions require explicit policy/approval. Browser state and target identity must be replayable and attributable.

### Fleet / Mesh plane

Fleet orchestration owns machine/agent availability and recovery; Agent Mesh owns agent-to-agent communication and delegation but never supersedes the supervisor.

Fleet capabilities:

- machine and agent identities;
- reconnect/recovery;
- typed availability;
- durable run ownership;
- PTY/process/session reconciliation;
- usage/cost accounting;
- bounded parallelism.

Mesh capabilities:

- cryptographic/typed identities;
- capability discovery;
- trust/policy gateway;
- structured delegation;
- A2A for agent-to-agent messages;
- MCP for agent-to-tool calls;
- signed/hashed receipts;
- supervisor-visible delegation graph.

Swarmsay is a mesh/network capability donor, not the supervisor.

### Compute / Inference plane

Converge Local Compute Router, Local/Team Inference Gateway and bare-metal model-supervisor donor work into one provider-neutral execution plane.

Required truth:

`MachineProfile -> WorkloadManifest -> CapabilityPlan -> PolicyDecision -> ExecutionGrant -> Model/Provider Run -> Health/Usage -> OutcomeReceipt`

Support local/team/hosted lanes without silent fallback across policy boundaries.

### Verification / Shipping OS

Shipping OS is the release authority.

A run may be marked `SHIPPED` only when the exact artifact/SHA has passed the applicable sequence:

- deterministic unit/contract tests;
- integration/acceptance tests;
- adversarial/negative tests;
- runtime UAT;
- browser/device/provider certification where relevant;
- PR and CI evidence;
- preview verification;
- production deployment receipt;
- production behavior verification;
- rollback/recovery proof where required;
- immutable certification receipt.

The builder cannot certify its own work without independent verification.

### Agent Room / Workbench / Command Center

UI surfaces are projections over canonical truth, not new authorities.

Converge:

- Agent Room multi-agent observability;
- Agent Workbench Ask/Plan/Build/Visual/Review modes;
- Daily Command Center;
- Shipping Console;
- Project Desk / Work Queue;
- spatial/village projections;
- mobile attention/approval workbench.

The UI may request actions; authority remains in policy/grant/state-machine layers.

### Agent Ecosystem Intelligence

The `awesome-ai-agent-stack` and `awesome-llm-apps` corpora become searchable donor/catalog inputs for a Component Selector and capability-gap engine.

The selector may recommend candidates based on evidence, freshness, license, maintenance, required capabilities and integration fit. It must not install or execute recommendations by itself.

The imported `Shubhamsaboo/awesome-llm-apps` corpus remains isolated under `third_party/` with provenance until individual capabilities are classified and intentionally integrated.

### Recursive improvement

RSI/self-improvement is a governed optimization layer, not permission to rewrite arbitrary parts of the platform.

Lifecycle:

`Propose -> Predict -> Select -> Sandbox -> Evaluate -> Compare -> Human/Policy Gate -> Retain or Revert -> Receipt`

Require immutable candidate versions, benchmarks/evals, deterministic replay, provenance, rollback and bounded domains. No self-modification may bypass policy, verification or Shipping OS.

## 4. Reverse-engineered donor disposition

| Donor / line | Canonical disposition |
|---|---|
| REA / morluto/rea | First-class governed reverse-engineering provider behind capability layer |
| Ghidra / Ghidra MCP patterns | Binary-analysis provider/pattern source; do not rebuild Ghidra |
| OpenHands | Coding execution provider/reference |
| LangGraph | Tier-1 orchestration adapter |
| Microsoft Agent Framework | Tier-1 enterprise adapter |
| Langflow | Tier-1 visual workflow adapter |
| CrewAI | bounded specialist-agent pattern/provider source |
| Dify | workflow/provider pattern source |
| AutoGen | reference-only by default |
| Flowise | UX/reference donor |
| CortexDB | Memory Plane donor |
| Dory / Dotbrain | context-pack and private context donor lines |
| Agent Standup | Agent Room observability donor |
| Shape | unified Agent Workbench donor; clean-room behavior only |
| riru / Browsentic / webcmd | governed browser runtime donors |
| px0 | human verification/review-console donor |
| OpenHarness / Autonomous Harness | fleet/recovery donor |
| Swarmsay | Agent Mesh/A2A donor |
| ServerOS | governed infrastructure/SRE execution donor |
| RigSpark / vllmops / Anyscale blueprint | compute/model/inference plane donors |
| Frink | flow graph, triggers, approvals, work queue donor |
| JackHamr | managed agent machines/jobs/fleet donor |
| Pando | mobile workbench/shared memory/approval donor |
| awesome-ai-agent-stack | Agent Ecosystem Intelligence catalog donor |
| awesome-llm-apps | isolated third-party corpus for classification, extraction and examples |
| RSI-Anything | recursive-improvement donor |
| Change Airlock / ZeroSlop category | pre-verification change-risk gate |

## 5. Target monorepo layout

```text
agent-work-os/
  apps/
    web/                       # operator console / workbench / room / shipping UI
    desktop/                   # future Electron/Tauri shell
    mobile/                    # future PWA/native remote control surface
  services/
    control-api/               # authoritative API + realtime control plane
    supervisor/                # planner/scheduler/autonomous work loop
    verifier/                  # independent verification coordinator
    deployer/                  # preview/prod deployment adapters
  runtime/
    daemon/                    # local execution boundary
    sandbox/                   # worktree/container/process abstraction
  packages/
    protocol/                  # envelopes/events/protocol versions
    domain/                    # Project/Work/Task/Run/Actor/Artifact state machines
    policy/                    # effects, grants, approvals, RBAC/ABAC
    agents/                    # runtime abstraction + adapters
    tools/                     # MCP/tool registry and normalized invocation
    reverse-engineering/       # provider-neutral RE contracts + REA adapter
    memory/                    # durable Memory Plane
    context/                   # deterministic context packs/handoffs
    browser/                   # governed browser target/action/receipt model
    fleet/                     # machine/agent fleet/recovery
    mesh/                      # A2A identities/messages/delegation
    compute/                   # machine/workload capability routing
    inference/                 # model/provider routing
    evidence/                  # evidence graph/provenance/coverage
    receipts/                  # canonical receipt schemas/digests
    replay/                    # deterministic replay/fixture comparison
    evals/                     # evaluation/benchmark contracts
    shipping/                  # Shipping OS release state/gates
    ecosystem/                 # component selector / donor intelligence
    rsi/                       # governed recursive-improvement loop
  contracts/                   # JSON schemas and Shipping Contracts
  migrations/                  # durable state migrations
  fixtures/                    # deterministic source-owned fixtures
  evals/                       # behavioral/adversarial/e2e eval suites
  docs/
    architecture/
    reverse-engineering/
    adr/
    runbooks/
  receipts/                    # committed release/certification receipts where appropriate
  third_party/                 # isolated licensed donor corpora only
  scripts/
  .github/workflows/
```

The exact move can be incremental. Do not break the working vertical slice merely to match this layout.

## 6. Phased implementation roadmap

### Phase 0 — Reconcile and freeze authority boundaries

Goal: one truthful map of what exists before more implementation.

Deliverables:

- inventory main + all open Agent OS PRs/issues/branches;
- classify each as `MERGE`, `REBASE`, `EXTRACT`, `ARCHIVE`, `REFERENCE`, or `KILL`;
- map duplicate contracts/state stores/supervisors/memory/tool registries;
- create architecture ADRs for authority, provider boundaries, clean-room boundary and Shipping OS truth;
- create one epic dependency graph;
- establish bounded WIP and stop spawning competing implementation lanes.

Exit gate: every active Agent OS donor/capability has one canonical owner/package and one next action.

### Phase 1 — Canonical domain + durable state

Goal: replace fragmented/project-local truth with one durable domain model.

Implement:

- Project, WorkItem, Task, Run, Actor, Machine, Agent, Worktree, Session, Artifact, Evidence, Approval, Grant, Receipt, Evaluation;
- explicit state machines and invariants;
- Postgres storage + migrations;
- idempotency keys, optimistic versioning and append-only activity/evidence history;
- Redis/NATS abstraction for realtime fan-out;
- migration from JSON state with rollback and compatibility tests.

Exit gate: restart/replay and concurrent mutation tests pass; existing Codex vertical slice still passes acceptance.

### Phase 2 — Worktree/sandbox/process execution kernel

Goal: safe repeatable autonomous execution.

Implement:

- repo/worktree binding;
- isolated branch/worktree lifecycle;
- dirty-tree refusal/preservation;
- sandbox abstraction for local process/Docker/E2B-compatible adapters;
- PTY/process ownership;
- cancellation, timeout and cleanup receipts;
- filesystem/Git/network effect enforcement;
- crash/restart reconciliation.

Exit gate: a source-owned fixture can be planned, executed, cancelled, resumed/reconciled and cleaned without corrupting repo state.

### Phase 3 — Agent runtime abstraction + supervisor

Goal: turn the existing session system into the Self-Working Agent loop.

Implement:

- normalized Agent Runtime contracts;
- Codex adapter hardening;
- Claude Code / OpenCode adapters;
- bounded specialist/subagent model;
- Supervisor planner and dependency scheduler;
- claim/lease semantics for work items;
- automatic test/repair loops;
- token/cost/time budgets;
- checkpoint/resume;
- human attention queue only for credentials, ambiguity, policy gates and irreversible actions.

Exit gate: tracker work item -> isolated worktree -> agent -> tests -> repair -> completion report executes end-to-end with durable replay.

### Phase 4 — Policy, approvals, MCP and exact grants

Goal: no tool/provider action is authorized by capability alone.

Implement:

- effect manifests;
- capability vs authorization separation;
- exact grants bound to actor/run/tool/target/effects/digests/expiry;
- MCP server registration/inspection;
- schema-driven invocation;
- OAuth/RBAC/provider auth references without secret persistence;
- bounded tool results/logs/evidence;
- cancellation and transport/auth/protocol failure truth.

Exit gate: deterministic fake MCP providers prove positive and adversarial paths.

### Phase 5 — REA / Reverse Engineering Capability Layer

Goal: make reverse engineering a normal governed provider capability.

Build from #88/#146:

- generic provider/tool/request/plan/grant/receipt contracts;
- fake MCP RE provider first;
- exact-version REA adapter;
- source-owned JavaScript/Electron fixture;
- website/browser lane;
- native/managed/Android lanes independently;
- Evidence Graph and selected-view continuation;
- reconstruction packet with MATCH/IMPROVE/NEW/OMIT;
- clean-room implementation handoff;
- drift/cancellation/oversized-output/restart/cleanup certification.

Exit gate: target -> REA evidence -> clean-room spec -> implementation task -> independent comparison receipt works end-to-end.

### Phase 6 — Memory + context plane

Goal: persistent, scoped, provenance-aware memory without contaminating authority.

Merge the proven private context line with #166/#167:

- durable scoped store;
- propose/commit lifecycle;
- provenance/content hashes/evidence grades;
- lexical retrieval;
- optional vector interface;
- typed graph relations;
- supersession/conflict/purge;
- context-pack generation;
- donor/REA evidence isolation from implementation memory;
- replay and JSONL import/export;
- memory authorization tests.

Exit gate: deterministic replay reconstructs equivalent memory; no cross-repo leakage; purge/supersession semantics verified.

### Phase 7 — Browser, fleet, mesh, compute and inference providers

Goal: complete the reusable execution substrate without creating new authorities.

Implement governed provider packages for:

- browser computer-use runtime;
- fleet/reconnect/recovery;
- A2A Agent Mesh;
- local compute routing;
- bare-metal model supervision;
- local/team/hosted inference gateway;
- usage/cost/latency telemetry.

Exit gate: supervisor can delegate across two agent/runtime providers and one tool/browser provider with exact receipts and restart recovery.

### Phase 8 — Verification, replay, evals and Shipping OS

Goal: make truthful completion automatic.

Implement:

- Change Airlock pre-verification gate;
- deterministic test matrices;
- replay fixtures;
- evaluator/verifier agent separation;
- source-vs-runtime comparisons;
- exact-SHA PR/CI evidence;
- preview deployment adapters;
- production verification;
- rollback/recovery tests;
- immutable Shipping Receipt;
- tracker promotion only from evidence.

Exit gate: one real Agent Work OS change flows automatically from work item to production verification with a complete receipt chain.

### Phase 9 — Unified operator UX

Goal: one product surface over one truth model.

Consolidate:

- Project Desk / Work Queue;
- Agent Room;
- Ask / Plan / Build / Visual / Review Workbench;
- browser/session review;
- Memory/context inspection;
- approvals and attention;
- reverse-engineering evidence views;
- Shipping Console;
- Daily Command Center;
- mobile/PWA remote approvals.

Exit gate: an operator can understand why work is blocked, what is running, what changed, what evidence exists and what is safe to ship without opening raw logs.

### Phase 10 — Recursive improvement + ecosystem intelligence

Goal: improve the platform from evidence, not uncontrolled self-modification.

Implement:

- component catalog + capability-gap analysis from donor corpora;
- provider recommendation with license/freshness/maintenance evidence;
- skills promotion from verified outcomes;
- benchmark/eval registry;
- RSI propose/predict/select/evaluate/retain loop;
- automatic rollback when candidate regressions fail gates;
- no autonomous dependency onboarding without policy and verification.

Exit gate: a bounded subsystem can propose two improvements, evaluate both in isolated branches, select a winner from measured evidence and create a reviewable PR/receipt without bypassing policy.

### Phase 11 — Production hardening and deployable release

Goal: a platform we can actually use and monetize.

Complete:

- orgs/users/RBAC;
- secure auth/session lifecycle;
- encrypted credential references and secret-manager integration;
- rate limits/quotas/budgets;
- audit retention/redaction;
- backups/disaster recovery;
- dependency/SBOM/security scans;
- observability/SLOs;
- multi-node control plane;
- desktop packaging where needed;
- deployment runbooks;
- billing/plan entitlements only after core product truth is stable;
- documentation and onboarding.

Exit gate: fresh-environment installation, first machine pairing, first repo, first work item, autonomous execution, verification, deployment and receipt all pass from documented steps.

## 7. Milestone release definitions

### M0 — Consolidated

One repo, one authority map, no ambiguous duplicate subsystem ownership.

### M1 — Self-Working Local

A local repo task can autonomously plan, create an isolated worktree, run Codex/another agent, test, repair, verify and produce a receipt.

### M2 — Governed Provider OS

MCP + REA + browser + memory providers run behind exact grants and evidence receipts.

### M3 — Multi-Agent Production Loop

Supervisor coordinates bounded multiple agents/providers with fleet recovery, independent verification and PR/CI automation.

### M4 — Shipping OS

Preview/prod deployment and exact-SHA production verification automatically govern `SHIPPED` state.

### M5 — Agent Work OS v1

Unified Workbench/Agent Room/Shipping Console, durable memory, REA, browser, fleet/mesh, provider routing, production auth, recovery and deployable docs.

## 8. Global definition of done

A capability is not complete because code exists. It is complete only when:

1. authority and contract are explicit;
2. deterministic positive and negative tests exist;
3. restart/recovery behavior is proven where applicable;
4. exact implementation SHA is known;
5. CI passed on that SHA;
6. runtime/browser/provider/device UAT passed where applicable;
7. security/privacy/effect boundaries passed;
8. receipts and provenance are retained;
9. deployment/production verification passed if a deployed surface is claimed;
10. tracker state is updated from proof, not agent prose.

## 9. Codex master execution prompt

Use the prompt below as the persistent implementation directive for Codex or another coding agent.

```text
You are the implementation lead for Agent Work OS / Self-Working Agent.

CANONICAL REPOSITORY
- Work only in: rrahul0904/agent-work-os
- Do not create a second Agent OS repository.
- Reverse-engineered Agent OS / AI-agent projects are donors, providers, fixtures, pattern sources or isolated third-party corpora unless this plan explicitly says otherwise.
- Preserve provenance/licenses for any intentionally reused code.

PRIMARY GOAL
Build a deployable, production-grade Agent Work OS that autonomously moves work through:
Tracker -> Supervisor -> Plan -> Exact Authorization -> Isolated Worktree/Sandbox -> Agent Execution -> Tests -> Repair -> Independent Verification -> PR/CI -> Preview -> Production Verification -> Receipt -> Tracker -> Next Work Item.

GOVERNANCE
- Agent Work OS owns orchestration, policy, authorization, canonical state, evidence, replay, verification and Shipping OS.
- REA is a governed reverse-engineering provider, never the orchestrator or completion authority.
- Plan != authorization.
- Capability != authorization.
- Agent completion != verification.
- CI != deployment.
- Deployment != production verification.
- Observation != equivalence.
- Builder != final verifier.
- No unrestricted network writes, push/merge/deploy, destructive action or irreversible external effect without its required gate.
- Preserve the clean-room boundary when donor licensing/product boundaries require it.
- Fail closed on unknown/stale capability, identity, digest, policy or cleanup state.

READ FIRST
1. README.md
2. docs/ARCHITECTURE.md
3. docs/UNIFIED_AGENT_OS_EXECUTION_PLAN.md
4. docs/reverse-engineering/** relevant to the current phase
5. contracts/** relevant to the current phase
6. open Agent OS issues/PRs, especially #67, #88/#146, #95/#96, #147/#148, #166/#167 and context/compute/inference/browser/fleet lines.

PHASE 0: RECONCILE BEFORE BUILDING
A. Inspect main and all open Agent OS-related PRs/branches.
B. Produce docs/architecture/CAPABILITY_OWNERSHIP.md containing one row per capability with:
   capability; canonical package/service; donor(s); issue/PR; maturity; disposition MERGE/REBASE/EXTRACT/ARCHIVE/REFERENCE/KILL; dependencies; next gate.
C. Identify duplicate state stores, supervisors, memory stores, policy models, tool registries and receipt formats.
D. Do not blindly merge stale donor branches. Extract the best independently verified capability into the canonical package.
E. Preserve existing acceptance behavior while consolidating.

IMPLEMENTATION ORDER
Execute Phases 1-11 from docs/UNIFIED_AGENT_OS_EXECUTION_PLAN.md. Do not skip phase exit gates. Within each phase:
1. Write/update the Shipping Contract and ADR first.
2. Implement the smallest end-to-end vertical slice.
3. Add deterministic positive, negative, adversarial and restart/recovery tests.
4. Run focused tests, then repository-wide tests and acceptance.
5. Record exact SHA and CI evidence.
6. Run independent verification against the contract.
7. Create/update a phase receipt.
8. Only then promote the capability state.

MONOREPO TARGET
Evolve toward the following packages/services without breaking the working vertical slice:
- packages/domain
- packages/policy
- packages/agents
- packages/tools
- packages/reverse-engineering
- packages/memory
- packages/context
- packages/browser
- packages/fleet
- packages/mesh
- packages/compute
- packages/inference
- packages/evidence
- packages/receipts
- packages/replay
- packages/evals
- packages/shipping
- packages/ecosystem
- packages/rsi
- services/control-api
- services/supervisor
- services/verifier
- services/deployer
- runtime/daemon
- runtime/sandbox
Do moves incrementally; no cosmetic big-bang rewrite.

CORE CONTRACTS
Establish versioned canonical contracts for:
Project, WorkItem, Task, Run, Actor, Machine, Agent, Worktree, Session, Artifact, Tool, Skill, Memory, Evidence, Checkpoint, Approval, Grant, Receipt, Evaluation, CapabilityProfile.
Use deterministic canonical serialization/digests for authority-sensitive artifacts.

DURABILITY
- Migrate authoritative runtime state to Postgres with migrations and rollback.
- Add idempotency, optimistic concurrency and append-only evidence/activity lineage.
- Add Redis/NATS abstraction for realtime fan-out only after single-node behavior is deterministic.
- Never let cache/event-bus state become authoritative truth.

EXECUTION KERNEL
- Bind every run to project/work/task/run/repo/worktree identities.
- Use isolated Git worktrees and bounded sandboxes.
- Refuse unsafe dirty-tree/symlink/path conditions.
- Track processes, timeouts, cancellation and cleanup explicitly.
- Restart must reconcile in-flight work; never fabricate success.

AGENT RUNTIME
- Keep Codex working.
- Add provider-neutral adapters for Claude Code/OpenCode and later LangGraph/Microsoft Agent Framework as bounded runtime providers.
- Normalize text/tool/status/usage/log/error/artifact/checkpoint events.
- Implement supervisor leases, budgets, checkpoints, repair loops and human-attention gating.

MCP / TOOLS
- Complete #67 as the provider-neutral inspection/invocation boundary.
- Tool effects are policy inputs, never execution authority.
- Exact grants bind provider/tool/schema/effects/target/request/digests/expiry.
- Persist redacted bounded invocation receipts.

REA
- Continue #88/#146.
- Fake RE provider first.
- Then exact-version REA adapter.
- First real fixture must be source-owned and read-only.
- Pin provider revision/catalog/schema/effect digests.
- Retain Evidence locally; return bounded views/references.
- Implement cancellation/cleanup/oversize/restart/drift certification.
- Produce reconstruction packets with Observed/Inferred/Hypothesis/Unknown/Verified and MATCH/IMPROVE/NEW/OMIT.

MEMORY
- Merge existing private context handoffs with #166/#167 into one Memory Plane.
- Scopes: global/project/repo/worktree/task/run/session/agent.
- Provenance/content hashes, temporal validity, supersession/conflicts, authorized purge, lexical recall, optional vector provider, graph relations, context packs and deterministic replay are required.
- REA/donor evidence must not silently become implementation-agent memory; cross through an approved derived contract.

BROWSER
- Build one governed browser runtime from the riru/Browsentic/webcmd/px0 donor lines.
- Use target identity, observation, proposed action, policy, exact grant, tab lease, action receipt and replay.
- Do not add CAPTCHA bypass or stealth/evasion as a default capability.

FLEET / MESH
- Fold OpenHarness/JackHamr/Pando fleet patterns into machine/agent availability, reconnect, process/session recovery and bounded parallelism.
- Fold Swarmsay into an Agent Mesh for A2A identity, capability discovery and delegation.
- Mesh cannot bypass supervisor/policy.

COMPUTE / INFERENCE
- Consolidate RigSpark/vllmops/Anyscale patterns into MachineProfile -> WorkloadManifest -> CapabilityPlan -> Policy -> Grant -> Run -> Usage/Health -> Receipt.
- No silent local-to-hosted or provider fallback across policy boundaries.

VERIFICATION / SHIPPING
- Integrate Change Airlock.
- Independent verifier must compare source, runtime behavior, tests, evidence and contract.
- Exact-SHA CI, preview and production receipts are mandatory for shipped claims.
- Tracker is promoted only from evidence.

UI
- Consolidate Agent Room, Workbench, Shipping Console, Project Desk/Work Queue and Daily Command Center as projections over the same domain/state/evidence model.
- UI must clearly separate Working, Waiting, Blocked, Done, Verified, Deployed and Shipped.

ECOSYSTEM INTELLIGENCE
- Keep awesome-llm-apps under third_party until classified.
- Use awesome-ai-agent-stack/awesome-llm-apps to build a recommendation/catalog layer, not auto-install authority.
- Score evidence, freshness, maintenance, license and capability fit.

RSI
- Self-improvement is Propose -> Predict -> Select -> Sandbox -> Evaluate -> Compare -> Gate -> Retain/Revert -> Receipt.
- No self-modification bypasses tests, policy, clean-room boundaries, review or Shipping OS.

QUALITY BAR
For every phase require:
- deterministic unit/contract tests;
- integration/acceptance tests;
- negative/adversarial tests;
- recovery/restart tests where relevant;
- no secret leakage in persisted data;
- bounded payloads;
- explicit unknown/stale states;
- exact SHA;
- CI pass;
- independent verification;
- receipt.

WORK STYLE
- Prefer vertical slices over broad stubs.
- Reuse proven current code before adding dependencies.
- Do not rewrite the product merely to change frameworks.
- Do not claim parity, deployment or production readiness without proof.
- Never update canonical status because an agent says a task is done.
- Keep WIP bounded. Finish/merge/extract/kill active lanes before spawning more.
- After every completed slice, update capability ownership, architecture docs, tests and receipt in the same PR.

FIRST EXECUTION TASK
Start with Phase 0 now.
1. Audit main plus all Agent OS-related open PRs/issues/branches.
2. Create CAPABILITY_OWNERSHIP.md and a dependency graph.
3. Identify the minimum set of PRs/slices that should be extracted or rebased to establish Phase 1.
4. Create an implementation branch from current main.
5. Implement the first Phase-1 vertical slice: canonical domain identifiers/state transitions + Postgres repository interface behind compatibility adapters, without breaking the existing JSON-backed acceptance path until migration tests are green.
6. Add migration/restart/concurrency tests.
7. Run npm test and npm run acceptance.
8. Produce an evidence receipt with exact SHA and remaining gaps.
9. Open a draft PR. Do not merge/deploy until independent verification and required gates pass.
```

## 10. Immediate next action

Run the Codex prompt beginning at **Phase 0**, not another donor intake. The fastest path to a deployable Agent Work OS is consolidation plus completion of the execution kernel, supervisor, REA, memory and Shipping OS chain—not additional parallel reverse-engineering branches.
