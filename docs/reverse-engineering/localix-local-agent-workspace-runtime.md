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

## Implemented owned runtime slice

This branch now carries an independently authored, durable supervisor rather than only an in-memory contract.

### Work lifecycle

`runtime/daemon/src/work-supervisor.js` provides:

- stable work IDs and kinds;
- sequence-checked state transitions;
- append-only transition receipts with canonical SHA-256 digests;
- explicit `queued | running | blocked | waiting | review | complete | failed | interrupted | lost | unknown` states;
- restart hydration that converts stale persisted `running` work to a new `lost` transition with reason `runtime_restart` while retaining prior history.

### Wake delivery

The same module provides:

- typed wake sources;
- user-vs-machine priority;
- deterministic delivery keys;
- duplicate suppression;
- causal wake provenance;
- bounded self-caused wake depth;
- append-only settlement receipts;
- restore of queued and settled wake records without changing identity or receipt digests.

### Durable daemon store

`runtime/daemon/src/work-supervisor-store.js` adds a versioned local supervisor snapshot:

- atomic temp-file + rename replacement;
- serialized write queue so concurrent session completions cannot regress the snapshot;
- work and wake hydration on boot;
- persisted wake idempotency across restart;
- recovered-work drain for publishing explicit lost-work facts;
- graceful daemon shutdown flush.

The default path is `.agent-work-os/runtime-supervisor.json` and can be overridden with `AGENT_WORK_OS_RUNTIME_SUPERVISOR_STATE`.

### Real session execution binding

`runtime/daemon/src/index.js` now binds actual `session.start`, `session.message`, and `session.interrupt` commands to the supervisor:

- a work identity is created as `run:<commandId>`;
- the selected adapter and current `local` backend identity are recorded;
- work is persisted before the daemon acknowledges execution admission;
- successful adapter completion produces a `complete` transition receipt;
- adapter failure produces a `failed` transition receipt;
- interrupt produces an `interrupted` transition receipt;
- only one tracked agent run may be active for a session at a time;
- a persisted `lost`/`unknown` command is not blindly rerun after restart and instead fails closed with reconciliation required.

### Control-plane visibility without a duplicate state model

Supervisor transitions are emitted through the existing `daemon.session.event` path as `kind: "work"` events. The existing control plane already durably persists session events and includes session history in client snapshots, so the first vertical slice does not create a second PostgreSQL work model that would collide with the existing task/domain `workItems` resource.

On daemon authentication after restart, recovered `lost` transitions are published into the owning session timeline.

This is intentionally not yet a top-level runtime-work query API. The canonical local supervisor ledger remains daemon-owned while the session event timeline provides durable operator evidence.

## Verification coverage

Unit coverage includes:

- stale transition refusal;
- terminal double-completion protection;
- restart/lost-work recovery without history loss;
- user-vs-machine wake priority;
- duplicate delivery keys;
- causal provenance;
- self-wake bounds;
- persisted queued/settled wake restoration;
- wake idempotency across process restart.

Acceptance coverage separately exercises concurrent supervisor persistence so filesystem scheduling does not perturb the control-plane replica test suite.

During this lane a pre-existing asynchronous assertion in the control-plane identity test was exposed: session failure can become observable while durable daemon-ack reconciliation is still `processing`. The test now waits for the documented reconciliation completion state rather than relying on timing; production reconciliation semantics are unchanged.

The authoritative CI result is always the GitHub Actions result for the current branch head; do not infer branch readiness from an older passing SHA.

## Next gates

1. Keep exact branch-head unit + acceptance CI green.
2. Introduce a canonical `ExecutionBackendSpec` and backend health/capability receipt; retain `local` and deterministic fake first.
3. Add workspace-root, filesystem, process and network authority contracts; make absence of sandboxing explicit.
4. Add source-owned worktree/container isolation before considering SSH.
5. Wire real work completion/monitor/sub-agent facts into the durable wake producer/consumer path; the wake queue is persistent today but not yet the universal session-start mechanism.
6. Add explicit command-reconciliation records for uncertain daemon death after an external effect, rather than treating every lost run as safely retryable.
7. Add a top-level operator read model only if it can be derived without duplicating session/task truth.
8. Add full daemon-process restart UAT: start real echo work, terminate daemon mid-run, restart, prove `lost` publication and no blind duplicate execution.
9. Reconcile completion/review with verification evidence and Shipping OS exact-SHA gates.

## Truthful status

`SOURCE=done / UPSTREAM_SHA_LICENSE=pinned / SOURCE_ARCHITECTURE=first-pass / ROUTING=AGENT_WORK_OS_DONOR / DOSSIER=updated / WORK_SUPERVISOR=implemented / DURABLE_STORE=implemented / WAKE_PERSISTENCE=implemented / REAL_SESSION_BINDING=implemented / RESTART_LOST_RECOVERY=implemented / SESSION_TIMELINE_VISIBILITY=implemented / EXECUTION_BACKEND_GOVERNANCE=next / SANDBOX=not-yet / UNIVERSAL_WAKE_EXECUTION=not-yet / FULL_DAEMON_RESTART_UAT=not-yet / SHIPPED=no`
