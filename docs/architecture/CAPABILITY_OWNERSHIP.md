# Agent Work OS Capability Ownership

**Snapshot:** `main` at `a83ae526f32436cb1dc4458749ae18fa4f2061d9`; open PR/issue and branch status checked 2026-10-13 (America/New_York). This is a source and GitHub metadata audit, not a claim that open PRs are merged or production-ready. Phase 0 gate: complete for initial capability ownership and first Phase 1 slice selection.

## Authority decisions

| Capability | One canonical owner | Destination | Main status | Next action |
|---|---|---|---|---|
| Product/workspace truth | Agent Work OS domain | `packages/domain` (being introduced); API projection in `services/control-api` | PARTIAL: no canonical WorkItem/Task model on `main` | Establish versioned WorkItem + Run IDs/state transitions; migrate by vertical slices |
| Persistence | Agent Work OS persistence port; Postgres is target authority | `services/control-api/src/store.js`, `migrations/`; versioned domain repository added in Phase 1 | PARTIAL: one global snapshot row / local file | Use row-level versioned writes and append-only events; retain JSON compatibility path during migration |
| API / tenant authorization | Control API | `services/control-api` | PARTIAL: shared bearer token, no tenant identity/RBAC | Implement user/org membership and server-side tenant scoping before commercial exposure |
| Supervisor / scheduler | Agent Work OS Supervisor | `services/supervisor` (target; no service package on `main`) | MISSING as general work scheduler; Shipping Supervisor exists | Converge Flow, Work Queue, routines and fleet execution without adding another authority |
| Release truth | Shipping OS | Current `services/control-api/src/shipping-supervisor.js`, `shipping-store.js`, `shipping-receipts.js`; later `packages/shipping` | WORKING bounded local release slice | Keep release SHIPPED decisions receipt-gated; separate deploy authority from agent completion |
| Local machine/process truth | Local daemon | `runtime/daemon` | PARTIAL: registration, heartbeat, Echo/Codex, reconnect | Persist event sequence, command leases, restart reconciliation and machine revocation |
| Agent provider contract | Agent Work OS agent registry/adapters | `packages/agents` (target); `runtime/daemon/src/adapters.js` (current) | PARTIAL: Codex + Echo | Stabilize provider-neutral lifecycle contract; add Claude/OpenCode only after conformance tests |
| Reverse-engineering evidence | Governed REA provider | `packages/reverse-engineering` (target); current main only has REA product/docs artifacts | PARTIAL: contract implementation lives in open PR #146 | Extract provider contract into canonical package; REA cannot authorize or certify product work |
| Tool/MCP discovery and invocation | Agent Work OS Tool Registry + policy | `packages/tools`, `packages/mcp` (target) | PARTIAL: MCP work appears in stacked PR #50, not `main` | Extract tool schema, effect classification, invocation grant and receipt into one registry |
| Policy, grants, approvals | Agent Work OS policy plane | `packages/policy` (target) | MISSING on `main`; proposed in #26/#50 branches | Define one effect vocabulary and exact run/target/argument-bound grants |
| Evidence and verification | Agent Work OS Evidence + independent Verifier | `packages/evidence`, `services/verifier` (target) | PARTIAL: Shipping receipts and tests exist; general verifier absent | Bind implementation SHA, test outcomes, independent review and provider evidence |
| Memory/context | Agent Work OS Memory Plane; Project Desk facts remain authoritative | `packages/memory`, `packages/context` (target); Work Memory projection from #50 is candidate | MISSING on `main`; multiple open donor branches | Select one projection over canonical work/decision/evidence; do not merge competing memory stores |
| Browser/computer use | Governed Browser Runtime | `packages/browser` (target) | MISSING on `main`; donor research/issues exist | Define observation → exact grant → action → evidence contract before execution adapter |
| Fleet | Agent Work OS Fleet | `packages/fleet` (target); daemon is current machine owner | PARTIAL only in open PR #44 | Extract sequenced reconnect/replay lifecycle after canonical Run/Task IDs exist |
| Agent mesh/delegation | Agent Work OS Mesh, subordinate to Supervisor | `packages/mesh` (target) | MISSING | Defer until supervisor leases, identity, trust and delegation grants exist |
| Compute/model routing | Agent Work OS Compute/Inference | `packages/compute`, `packages/inference` (target) | MISSING; donor specifications exist | Defer; model/provider fallback must be explicit and authorized |
| UI/read models | Web app projections of API truth | `apps/web` | PARTIAL: operator console only | Add Project Desk/Work Queue/Agent Room as projections after canonical APIs |
| Donor intelligence | Evidence-backed catalog, no install authority | `packages/ecosystem` (target) | PARTIAL: issue/PR #147/#148 | Maintain provenance, license and freshness; a recommendation never installs code |
| Recursive improvement | Agent Work OS bounded experiment service | `packages/rsi` (target) | MISSING | Defer until policy, verifier, and shipping cannot be changed by the experiment |

## Donor/capability inventory

Disposition meanings: **MERGE** integrate a ready branch; **REBASE** retarget a branch onto the canonical base; **EXTRACT** take a bounded capability into its owner while retaining branch isolation; **CONTINUE** keep working in the existing lane; **REFERENCE** preserve patterns/evidence without code integration; **ARCHIVE** retire a duplicate after retaining needed evidence; **KILL** stop work that conflicts with authority, policy, or legal boundaries. These are decisions for convergence; they do not merge or close GitHub work automatically.

| Donor / captured capability | Canonical destination | Main/branch evidence | Disposition | Status and next action |
|---|---|---|---|---|
| OpenAI Codex | `packages/agents` → local daemon adapter | `runtime/daemon/src/adapters.js` | CONTINUE | Existing adapter is the reference provider; formalize conformance and restart tests |
| Claude Code | `packages/agents` → local daemon adapter | Mentioned in main README as future; Agent Standup observer is open PR #96 | REFERENCE | No execution adapter on main; add only after provider contract and local CLI test |
| OpenCode / ACP | `packages/agents` | Main README future item; no implementation on main | REFERENCE | Prove adapter abstraction with one real non-Codex provider before ACP catalog |
| ACP-compatible agents | `packages/agents` ACP adapter family | No implementation on main | REFERENCE | Support protocol capability negotiation and explicit launch configuration; defer catalog breadth |
| OpenHands | `packages/agents` execution provider | No main implementation or dedicated active PR found in snapshot | REFERENCE | Evaluate provider boundary and sandbox requirements; no direct framework dependency yet |
| LangGraph | `services/supervisor` bounded orchestration adapter | No main implementation or tracked PR found | REFERENCE | Model as optional DAG executor; Work OS retains state, policy and receipts |
| Microsoft Agent Framework | `services/supervisor` enterprise orchestration adapter | No main implementation or tracked PR found | REFERENCE | Evaluate interoperability only after canonical run/task contracts |
| Langflow | `services/supervisor` workflow authoring provider | No main implementation or tracked PR found | REFERENCE | Treat diagrams as plans; execution still requires Work OS grants |
| CrewAI | `services/supervisor` multi-agent pattern/provider | No main implementation or tracked PR found | REFERENCE | No second supervisor; agents remain workers under one run authority |
| Dify | `services/supervisor` workflow provider patterns | No main implementation or tracked PR found | REFERENCE | Reuse API/flow concepts only if a bounded adapter is justified |
| AutoGen | `services/supervisor` orchestration reference | No main implementation or tracked PR found | REFERENCE | Do not add as second authority |
| Flowise | `apps/web` workflow authoring reference | No main implementation or tracked PR found | REFERENCE | UX reference only until workflow contracts exist |
| morluto/rea | `packages/reverse-engineering` provider | Issue #88; open implementation PR #146; contract core not on main | CONTINUE | Extract provider/tool/request/grant/evidence contracts; first fixture should be source-owned |
| Ghidra-derived patterns | `packages/reverse-engineering` native-binary adapter | No main implementation or tracked PR found | REFERENCE | Defer native target class; do not treat tool patterns as license clearance |
| Website/browser analysis providers | `packages/reverse-engineering` target adapters + `packages/browser` | Browser donor work #4/#63/#92; no unified provider on main | REFERENCE | Share target/evidence contracts; browser action grant remains separate |
| Native binary analysis providers | `packages/reverse-engineering` | No main implementation or tracked PR found | REFERENCE | Deferred target class; isolate provider install/runtime |
| Managed-code analysis providers | `packages/reverse-engineering` | No main implementation or tracked PR found | REFERENCE | Deferred until native/REA contracts are stable |
| Android analysis providers | `packages/reverse-engineering` | No main implementation or tracked PR found | REFERENCE | Deferred target class and device effects |
| Context MCP inspector | `packages/mcp` inspection harness | Issue #67; MCP v2 work described in open PR #50, not main | EXTRACT | One canonical server registry and tool/resource/prompt schemas; discovery never authorizes invocation |
| Shape | `apps/web` Agent Workbench projection | Open research PR #103 | REFERENCE | Adopt task-focused workbench patterns after canonical run/session events |
| Shape-shifter | `apps/web` adaptive read model | Open research PR #106 | REFERENCE | No adaptive UI can change policy or task truth |
| Agent Standup | `apps/web` Agent Room projection | Open PR #96 | EXTRACT | Retain multi-agent observability concept; bind to canonical machine/run state |
| Gary HQ / Agent Village | `apps/web` Agent Room spatial projection | Open research PR #102 | REFERENCE | Optional visualization only; no new state owner |
| DailyHub | `apps/web` Daily Command Center projection | Open research PR #84 | REFERENCE | Project today's tasks/approvals/incidents from canonical records |
| Frink | `services/supervisor` flow/queue/approval model | Issue #39; open PR #40 | CONTINUE | Keep run/flow contract as candidate; reconcile with canonical WorkItem and Task before merge |
| CortexDB | `packages/memory` | Issue #166; open dossier PR #167; implementation not on main | CONTINUE | Continue design under canonical scoped memory; no copied RDF/tool ecosystem without need |
| Dory | `packages/context` compiler over Memory/Project Desk | Issue #115; open dossier PR #116 | EXTRACT | Use bounded, provenance-aware context packs; do not add a second taskboard or decision store |
| Dotbrain | `packages/context` project handoff | Issue #79; open implementation PR #80 | EXTRACT | Retain deterministic private handoff/context patterns; integrate with one canonical Project/WorkItem model |
| Private Project Context work | `packages/context` | No checked-in main package; related handoff work in #80/#50 | CONTINUE | Reconcile local/private artifacts before implementing a separate context store |
| riru | `packages/browser` browser runtime | Open research PR #92 | REFERENCE | Governed observe/act boundary only; no stealth/CAPTCHA bypass |
| Browsentic | `packages/browser` logged-in browser bridge | Issue #3; open research PR #4 | CONTINUE | Preserve evidence-backed bridge contract; execution adapter is not on main |
| webcmd | `packages/browser` browser control + learning evidence | Issue #62; open PR #63 | EXTRACT | Merge only if its learned state is scoped and grant-bound; share Browser Runtime contract |
| Browser Learning | `packages/browser` observation memory | PR #63 and #92 research | EXTRACT | Store evidence as scoped observations, not implicit permissions |
| px0 | `services/verifier` human review projection | Issue #5; open PR #6 | REFERENCE | Human review is a gate/projection, not the verifier's evidence source |
| OpenHarness | `packages/fleet` worker lease/recovery | Issue #43; open PR #44 | EXTRACT | Use sequenced journal/replay after canonical Run identity; don't merge competing state owner |
| Autonomous Harness | `services/supervisor` autonomous loop | Issue #43; PR #44 describes fleet slice | CONTINUE | Scheduler and worker execution belong to one Supervisor; avoid a second control plane |
| JackHamr | `services/supervisor` hosted fleet/job patterns | Issue #31; open research PR #32 | REFERENCE | Keep local-first as core; cloud workers require separate authorization and cost gates |
| Pando | `apps/web` mobile approvals / `packages/context` | Issue #21; open PR #22 (stacked) | EXTRACT | Retain approval/context concepts; no shared Brain as independent authority |
| Swarmsay | `packages/mesh` A2A protocol donor | No tracked local issue/PR found in snapshot | REFERENCE | Defer until identities/trust and supervisor delegation are defined |
| ServerOS | `services/supervisor` SRE runbook/workflow donor | No tracked local issue/PR found in snapshot | REFERENCE | Any production mutation stays behind deployment grants and Shipping OS |
| RigSpark | `packages/compute` local compute router | Issue #81; open PR #82 | REFERENCE | Hardware discovery does not imply model/provider authorization |
| vllmops | `packages/inference` model serving operations | No tracked local issue/PR found in snapshot | REFERENCE | Defer until workload/cost/policy manifests exist |
| Anyscale patterns | `packages/inference` local/team gateway | Issue #86; open PR #87 | REFERENCE | Treat as routing evidence; fallback must be explicit and authorized |
| awesome-ai-agent-stack | `packages/ecosystem` component intelligence | Issue #147; open PR #148 | CONTINUE | Catalog provenance, license, revision, freshness and overlap; no auto-install |
| awesome-llm-apps | `packages/ecosystem` isolated application corpus | No tracked local issue/PR found in snapshot | REFERENCE | Evaluate apps as fixtures/components; never import wholesale |
| RSI-Anything | `packages/rsi` bounded experiment loop | No tracked local issue/PR found in snapshot | REFERENCE | Defer until policy, verifier and Shipping OS are immutable to experiment workers |
| ZeroSlop / Change Airlock | `packages/change-airlock` → Shipping OS gate | Issue #153; open implementation PR #154 | CONTINUE | Validate exact analyzed SHA and bind receipt into Shipping Supervisor before promotion |

## Active PR and branch reconciliation

GitHub metadata snapshot is summarized below. A passing `verify` job does not imply every deployment check passes. PR checks for #146 and #154 show `verify` passing and Coding Fleet preview complete, while unrelated product previews fail; #170 has `verify` passing but Vercel checks rate-limited. PR #50 includes one passing and one failing `verify` run. PR #44/#40/#20/#11 have passing observed `verify` checks. These PRs remain open and unmerged at snapshot time.

| PR / branch | Scope | Decision | Reason / merge condition |
|---|---|---|---|
| [#170 `plan/unified-agent-os-roadmap`](https://github.com/rrahul0904/agent-work-os/pull/170) | Current unified execution plan | REFERENCE | This master brief is the execution source; avoid merging duplicate roadmap documents before Phase 0 artifacts are reconciled |
| [#146 `build/issue-88-reverse-engineering-core`](https://github.com/rrahul0904/agent-work-os/pull/146) | REA provider/grant/evidence core | CONTINUE | Verify latest head and integrate contract package after canonical IDs and effect vocabulary are fixed |
| [#154 `reverse-engineering/zeroslop-change-airlock`](https://github.com/rrahul0904/agent-work-os/pull/154) | Change Airlock v1 | CONTINUE | Keep scoped; merge only after exact-SHA binding into Shipping OS and full verify checks |
| [#40 `reverse/re387-frink-flow-control-plane`](https://github.com/rrahul0904/agent-work-os/pull/40) | Flow/run state | CONTINUE | Candidate run state; reconcile state machine and canonical IDs first |
| [#44 `reverse/openharness-fleet-control-plane`](https://github.com/rrahul0904/agent-work-os/pull/44) | Fleet sequenced event journal/replay | REBASE | Stacked on #40; extract replay guarantees onto canonical Task/Run model, don't merge second state model |
| [#8 `reverse/comuna-agent-project-desk`](https://github.com/rrahul0904/agent-work-os/pull/8) | Project Desk / work / decisions | EXTRACT | WorkItem/decision concepts should converge with #50 and the canonical domain package |
| [#50 `integrate/work-truth-memory`](https://github.com/rrahul0904/agent-work-os/pull/50) | Project Desk + projection + handoffs + MCP; stacked on #26 | EXTRACT | Broad integration has one failing verify run and is based on other open PRs; split canonical domain, context projection and MCP slices |
| [#42 `research/saltmd-work-memory`](https://github.com/rrahul0904/agent-work-os/pull/42) | Separate append-only Work Memory store | ARCHIVE | Retain tests/patterns only where #50's projection lacks them; avoid two memory authorities |
| [#22 `feat/re370-pando-shared-brain`](https://github.com/rrahul0904/agent-work-os/pull/22) | Multi-provider Brain; stacked on #11 | EXTRACT | Keep provider exchange ideas; canonical memory/context remains local scoped evidence |
| [#20 `reverse/orgtree-v3-persistence-api`](https://github.com/rrahul0904/agent-work-os/pull/20) | Organization persistence; stacked on #19 | EXTRACT | Retain bounded organization semantics after Phase 1 IDs; no separate org/task schema |
| [#19 `reverse/orgtree-v3-orchestration`](https://github.com/rrahul0904/agent-work-os/pull/19) | Hierarchy/scheduling | REFERENCE | Candidate dependency resolution only; canonical Supervisor owns scheduling |
| [#26/#24/#22 stack](https://github.com/rrahul0904/agent-work-os/pull/26) | Shared rooms, Operations Atlas, shared Brain | EXTRACT | Extract approval schemas, read models, provider patterns separately; don't merge stack as a second authority |
| [#167 `research/cortexdb-memory-plane`](https://github.com/rrahul0904/agent-work-os/pull/167) / issue #166 | Memory Plane research | CONTINUE | Spec-only; implementation follows canonical domain/persistence and Work Memory dedupe |
| [#116 `research/dory-context-memory`](https://github.com/rrahul0904/agent-work-os/pull/116) / issue #115 | Context-pack research | EXTRACT | Keep spec and acceptance criteria; implement as projection only |
| [#80 `reverse/dotbrain-context-spine`](https://github.com/rrahul0904/agent-work-os/pull/80) / issue #79 | Project context handoff | EXTRACT | Bind to canonical task/work IDs and Memory provenance |
| [#96 `reverse/agent-standup-observability`](https://github.com/rrahul0904/agent-work-os/pull/96) | Agent Room observability | EXTRACT | Projection only; defer UI merge until state API contract stabilizes |
| [#63 `reverse/webcmd-browser-learning-memory`](https://github.com/rrahul0904/agent-work-os/pull/63) | Browser learning memory | EXTRACT | One browser and memory authority; preserve evidence/guard logic |
| [#169 `rea/bruteforceai-auth-assurance`](https://github.com/rrahul0904/agent-work-os/pull/169) | Auth QA capability | REFERENCE | Separate bounded provider capability; not a core auth implementation or platform authority |
| [#148 `research/agent-ecosystem-intelligence-147`](https://github.com/rrahul0904/agent-work-os/pull/148) | Donor/component catalog | CONTINUE | Add source metadata and recommendation gate; no automated install |
| Product-specific REA PRs #165/#164/#160/#159/#158/#152/#150/#143/#119/#114/#101/#71/#65/#60/#58/#46/#34 | Independent products or donor-specific apps | REFERENCE | Keep product artifacts in their lanes; extract only reusable contracts/capabilities with explicit ownership evidence |

No remote branch was merged, deleted, pushed, or closed during this audit. Local branch `ship/vicoa-commercial-v1` is based on current `main` and holds the previously committed security/audit milestone.

## Duplicate-authority findings

1. WorkItem/task/run concepts appear across Project Desk (#8/#50), Frink Flow (#40), autonomous job (#31), Fleet (#44), organizations (#19/#20), and shipping. Canonical `packages/domain` must own IDs and state contracts; each subsystem may only project/execute these records.
2. Memory systems overlap across separate Work Memory (#42), Project Context/Dotbrain (#80), Dory (#116), CortexDB (#167), and shared Brain (#22/#50). Canonical `packages/memory` owns scoped facts; `packages/context` compiles approved projections. Do not merge #42 as a second store.
3. Agent registries are currently only daemon-local adapter maps. Provider catalog, machine capability advertisement and authorization are distinct; consolidate provider metadata under `packages/agents`, keep machine availability under Fleet, and keep grants under Policy.
4. Tool schemas are represented in MCP/room PRs without a main registry. `packages/tools` owns schemas/effects; `packages/mcp` owns transport/session integration; policy decides invocation.
5. Browser abstractions across riru, Browsentic, webcmd and browser learning must share one Browser Runtime contract and one receipt model.
6. There is one existing Shipping Supervisor and one release receipt chain. General task scheduling belongs in a separate Agent Work OS Supervisor service; it cannot promote itself to release authority.
7. Evidence and release receipts currently coexist with product receipts in the same repo. `packages/evidence` defines evidence references; `packages/shipping` owns release certification. Product-specific receipts remain isolated.

## Phase 1 smallest useful vertical slice

Canonical prefixed IDs (`work_<uuid>`), a versioned WorkItem state machine, a persistence port, JSON compatibility adapter, PostgreSQL row/event implementation, optimistic concurrency, idempotent transition commands, and restart/concurrency tests. It changes no existing sessions or Shipping Run lifecycle; those migrate only after equivalence tests.
