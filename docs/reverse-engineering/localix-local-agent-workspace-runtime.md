# Localix — local agent workspace/runtime donor dossier

Research snapshot: 2026-10-16 ET  
Canonical tracking: `rrahul0904/agent-work-os#251`  
Research branch: `research/localix-local-agent-workspace-runtime`

## Source identity

- User-supplied Reddit share: https://www.reddit.com/r/SATNA_PROJECT/s/QN6P6oGhjv
- Resolved Reddit thread: https://www.reddit.com/r/SATNA_PROJECT/comments/1x7yfe7/localix_an_opensource_agentic_development/
- Upstream: https://github.com/rsaryev/localix
- Website: https://localix.ai
- Inspected upstream main SHA: `17b38b59ade54116ba0659a2d322e7d72fcef249`
- Observed release: `v0.1.0-beta.10`
- License: MIT

## Routing

Classification: **DONOR / REFERENCE FOR EXISTING AGENT WORK OS**.

Do not create a standalone Localix clone. Agent Work OS already owns the local daemon, hosted control plane, normalized agent adapters, capability governance, receipts/replay and Shipping OS. Localix contributes useful local workspace and execution-supervision patterns.

REA is evidence/reconstruction only. Agent Work OS remains policy, execution and release authority.

## Observed transferable patterns

### Provider-neutral agent runtime

Localix separates host-owned session state, tools, permissions, persistence and event publication from a provider-neutral runtime port. Pi is the current production adapter but does not define the host contract.

### Durable wake/work supervision

The strongest donor delta is runtime supervision:

- typed machine wake sources;
- durable priority queue;
- user input outranks machine wake traffic;
- delivery keys provide idempotency;
- wake provenance survives into the visible turn;
- background processes, monitors and sub-agents use stable work identities;
- stale running work is surfaced as lost after restart;
- bounded self-caused wake chains and stuck-run protection;
- mid-run facts can be delivered at controlled checkpoints.

### Team workflow separated from execution

The bundled Kanban board is passive. It owns work state but never starts an agent run. Team members can complete work into a review state and a leader verifies it before done. Human-owned cards remain human work rather than being silently taken by an agent.

### Capability/permission policy

Agent instructions and authority are separate. Capability rules can allow, deny or ask, can match call arguments, and are further narrowed by run shape/host/model support. Plugin/MCP schemas can be deferred until activated to control context cost.

Important donor limitation: these rules are application policy, not an operating-system sandbox.

### Workspace/read model

Files, terminals, browser/preview, diffs, chat, child sessions and plugin workbenches share one session-aware workspace. Structured context bindings are resolved authoritatively by the backend rather than trusting a UI preview.

### Execution backend limitation

Local execution is the supported path. SSH and Docker adapter classes exist as groundwork but are not a supported selectable product surface. Their presence must not be treated as production remote-execution support.

## Owned direction

The useful convergence target is a **governed local Work Supervisor** inside Agent Work OS:

```text
Goal
 -> work DAG / plan
 -> authority + backend resolution
 -> WorkAttempt
 -> normalized runtime events
 -> background work / monitor / sub-agent
 -> WakeDelivery
 -> verification/review
 -> append-only WorkTransitionReceipt
 -> replay/recovery
 -> Shipping OS gate
```

### Match

- normalized agent/harness adapter boundary;
- local daemon executing source-owned workspaces;
- durable session/event trace;
- team/delegated work;
- approvals and explicit interruption;
- capability registry and provider portability.

### Improve

- durable `WorkItem` / `WorkAttempt` lifecycle and restart reconciliation;
- explicit causal/idempotent wake delivery plane;
- filesystem/process/network sandbox contracts in addition to app policy;
- explicit execution backend identity and capability receipts;
- one authoritative workspace read model;
- tool-roster and context-budget observations per run;
- verification evidence required for completion where applicable.

### Omit / defer

- branding/trade dress/assets or exact UI cloning;
- Pi as a required runtime;
- unrestricted shell as the final security model;
- SSH exposure before host identity/credential/known-host/isolation design;
- dormant adapter capabilities presented as shipped features;
- Kanban state as execution authority;
- hidden chain-of-thought retention;
- copying donor thresholds/defaults without owned evaluation.

## Clean-room and license boundary

The upstream is MIT. Direct code reuse is possible only with the applicable MIT copyright/license notice preserved and explicit provenance. Default posture for this lane is independently authored contracts/tests informed by public behavior and documentation.

Any future intentional source reuse must record upstream file path, exact SHA and license/notice handling. No Localix branding or visual assets are imported.

## First implemented slice

This branch adds an independently authored `runtime/daemon/src/work-supervisor.js` with:

- stable work IDs and kinds;
- sequence-checked state transitions;
- append-only transition receipts with canonical SHA-256 digest;
- restart hydration that marks stale `running` work as `lost`;
- wake sources, priority and deterministic delivery keys;
- duplicate wake suppression;
- causal wake provenance;
- bounded self-caused wake depth;
- append-only wake settlement receipts.

The accompanying unit tests cover stale transitions, terminal double-completion protection, restart/lost-work recovery, user-vs-machine wake priority, duplicate delivery keys, causal provenance and self-wake bounds.

This is intentionally an in-memory contract slice. Persistence/control-plane protocol integration and execution-backend enforcement are subsequent gates.

## Next gates

1. Repository-level CI on this branch.
2. Reconcile these primitives with existing session/verification/shipping records to avoid duplicate state models.
3. Add persisted work/wake storage and restart replay.
4. Surface work/wake state in the daemon/control-plane snapshot.
5. Introduce `ExecutionBackendSpec` with deterministic fake + local backends and explicit sandbox capability state.
6. Add worktree/container isolation before considering SSH.
7. Bind real Codex/Claude adapter attempts to WorkAttempt lifecycle and receipts.

## Truthful status

`SOURCE=done / UPSTREAM_SHA_LICENSE=pinned / SOURCE_ARCHITECTURE=first-pass / ROUTING=AGENT_WORK_OS_DONOR / DOSSIER=committed / WORK_SUPERVISOR_CONTRACT=implemented-first-slice / ISOLATED_UNIT_TESTS=5-pass / FULL_REPO_CI=pending / PERSISTENCE=pending / CONTROL_PLANE_INTEGRATION=pending / EXECUTION_BACKEND_GOVERNANCE=pending / UAT=none / SHIPPED=no`
