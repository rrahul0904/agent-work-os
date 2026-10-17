# REA dossier — parallel coding-agent landscape → Agent Execution Fabric

Issue: #267  
Primary source: https://www.reddit.com/r/WebAfterAI/s/A7caAq7L0X  
Snapshot: 2026-10-17 ET  
Canonical repo: `rrahul0904/agent-work-os`

## Disposition

**COMPARATOR / DONOR PACK into the existing Agent Work OS.**

The Reddit source is not one product to clone. It is a useful twelve-product landscape for the same broad problem: running multiple coding agents concurrently and supervising their work. The owned response is to synthesize the strongest mechanics into the existing Agent Work OS runtime, Workbench, Flow/Work Queue and Capability Fabric.

Do not create another top-level agent manager, terminal product, provider registry or one repository per donor.

## Canonical internal ownership

- REA: public evidence, source pins, provenance, license posture, observed/inferred/unknown classification.
- Agent Execution Fabric: work-attempt, workspace/worktree, runtime-session and reconciliation facts.
- Capability Fabric (#259): harness compilation, installation, capability compatibility and runtime certification.
- Flow + Work Queue (#39): dependencies, dispatch, human attention, approvals, retry/resume and terminal work outcome.
- Agent Workbench (#99): files, terminal, Git, browser, diff/review and fleet/session projections.
- Localix donor line (#251): local workspace/runtime foundations and WakeDelivery direction.
- Agent Evaluation Harness (#111): independent behavioral/reliability evaluation.
- Shipping OS: exact-SHA build, release and deployment truth.

## Commit-pinned source inventory

| Donor | Repository | Inspected head | License posture | High-value donor role |
|---|---|---|---|---|
| Superset | `superset-sh/superset` | `491ca53f4cd1d6a4ed06735cfd98a39a12480d67` | ELv2 | polished workbench; isolated workspaces; diff/tests/browser/review; remote + automation UX |
| Claude Squad | `smtg-ai/claude-squad` | `ce1ffb4392b01f38e2c4599c7c84d2a93973b138` | AGPL-3.0 | compact tmux/worktree multi-agent management and review |
| Emdash | `generalaction/emdash` | `79f37d920bd576dc18ca5421856fd2cc9ec8abac` | Apache-2.0 | local/SSH workspaces, ticket intake, lifecycle hooks, resumable sessions |
| Nimbalyst | `Nimbalyst/nimbalyst` | `b5d994092c27ebe1f6a402c61351081b0dd52c56` | MIT | session Kanban, visual-file editing, MCP widgets, mobile review |
| Agent of Empires | `agent-of-empires/agent-of-empires` | `d0d4466c5c12f4d36de65fde699db901199c24a6` | MIT | TUI/web/API, persistent sessions, worktree/container isolation, mobile/operator access |
| Agent Deck | `asheshgoplani/agent-deck` | `8d0f1fe1506dec1405d774c42c178291d1b20f40` | MIT | fleet state, grouping, cost, conductors, watchers and attention routing |
| agtx | `fynnfluegge/agtx` | `8ae68682f10b05ad77a8d1b307569946d871f814` | Apache-2.0 | phase-specific agents, worktree lifecycle, board/orchestrator, workflow plugins |
| cmux | `manaflow-ai/cmux` | `6249b33cdfda7004bd5316f1081e0b669e4850ac` | GPL-3.0-or-later; server components BSL 1.1 | rich attention UX, browser, native splits, notifications |
| herdr | `herdrdev/herdr` | `143bf5fd4781d164260c63fe28e7dc08054ad32f` | Apache-2.0 | durable agent runtime, detach/reconnect, local + SSH machines, status truth |
| CCUI | `yxwucq/CCUI` | `29ca1b253b188a14638aa594799f713dc3b47fb9` | MIT | real PTY process, worktree fork/attach, usage/context, file/diff browser |
| amux | `andyrewlee/amux` | `ae994c3ab2fcfbf4b067e99b035f787e35de15e9` | MIT | transactional workspace lifecycle, stale-base checks, session event recall |
| Claude Code Router | `musistudio/claude-code-router` | `057abaa1f95519ab8faf999e1ccef2b80ccdeb9e` | MIT | provider/model routing, fallback, credential pools and route/cost observability |

These are research pins, not dependency pins. Before any direct source reuse, re-check the exact file/revision license and record provenance/notice obligations. ELv2, AGPL, GPL and BSL donors are behavior/reference donors by default for the commercial core.

## Evidence map

### OBSERVED / SOURCE-REPORTED recurring patterns

1. **Worktree/branch isolation** — most mature tools avoid letting concurrent agents mutate one shared tree.
2. **Heterogeneous harnesses** — Claude Code, Codex and other CLIs are treated as replaceable execution clients rather than the product itself.
3. **Real runtime/session substrate** — PTY/tmux/background daemon semantics matter for durable work.
4. **Visible lifecycle state** — users need to know which agents are running, idle, waiting for input, blocked or finished.
5. **Diff/review before integration** — agent process completion is distinct from accepting its changes.
6. **Remote execution** — SSH and containers are common extensions of the local workspace model.
7. **Attention routing** — notification/watch/conductor patterns reduce the need to stare at every session.
8. **Workbench context** — browser preview, files, terminals and visual artifacts make review substantially better than raw terminal multiplexing.
9. **Ticket intake** — issue trackers can become work sources, but should not become execution authority.
10. **Model/provider routing** — routing/fallback/cost observability is valuable but orthogonal to workspace and effect authority.

### DERIVED for Agent Work OS

The reusable primitive is a provider-neutral execution graph:

```text
WorkItem
  -> WorkAttempt
  -> ExecutionWorkspace / exact worktree + revision
  -> Capability Fabric HarnessBinding
  -> RuntimeSession
  -> SessionStatusObservation / ActionObservation
  -> AttentionEvent
  -> WakeDelivery / Work Queue
  -> Diff + deterministic checks
  -> independent ReviewEvidence
  -> exact integration grant
  -> ExecutionReceipt
```

A model, terminal, worktree, issue tracker, mobile client or provider router is only one participant in that graph. None should become the source of truth for the whole workflow.

### UNKNOWN / must be independently proved

- fleet-scale throughput and resource ceilings;
- runtime-state correctness across crashes/restarts;
- security/isolation of every SSH/container mode;
- precision of inferred `waiting/blocked/idle` state for arbitrary CLIs;
- durability of all remote/mobile flows;
- safe concurrent merge behavior;
- safe autonomous push/deploy behavior;
- enterprise tenancy/compliance posture.

## Donor-by-donor extraction

### Superset

**Keep:** cohesive workbench, task workspaces, terminal/files/diff/browser/test review, visual change loop, remote/automation concepts.  
**Do not copy:** source/trade dress into hosted commercial core. ELv2 hosted-service limitation makes clean-room behavior reconstruction the default.

### Claude Squad

**Keep:** minimal mental model — one task/session, one isolated worktree, background runtime, diff/review.  
**Improve:** separate tmux/process liveness from semantic task success.  
**Boundary:** AGPL source is reference-only unless a deliberate compatible distribution decision is made.

### Emdash

**Keep:** local and SSH workspaces under one UI, issue-source adapters, resumable lifecycle hooks, local-first persistence, multiple agent CLIs.  
**Improve:** issue ingestion creates an owned WorkItem proposal; ticket provider state never directly grants execution.

### Nimbalyst

**Keep:** sessions + worktrees + tasks + visual artifacts in one context, structured visual editors, MCP result widgets, mobile review/response.  
**Improve:** mobile and MCP remain projections/adapters over canonical work and approval truth.

### Agent of Empires

**Keep:** durable tmux-backed sessions, TUI/web/API control surfaces, optional worktree and container isolation, notifications.  
**Improve:** normalize backend capabilities and reconciliation through owned contracts rather than making tmux/container existence equivalent to verification.

### Agent Deck

**Keep:** fleet-level state, grouping/search, cost visibility, parent/child conductor concept, watchers that trigger attention rather than directly launch uncontrolled work.  
**Improve:** `AttentionEvent -> WakeDelivery -> resolution receipt` becomes a first-class durable path.

### agtx

**Keep:** board-driven work, per-task worktree, phase-specific agent selection, explicit lifecycle/plugins, review/merge phase separation.  
**Improve:** phase selection must resolve through Flow policy + Capability Fabric certification; no hidden provider switch may widen authority.

### cmux

**Keep:** high-signal attention UI, native multi-agent split organization, browser/preview concepts.  
**Boundary:** GPL client and BSL server posture means independent behavior design by default.

### herdr

**Keep:** runtime as a service separate from individual agents, detach/reconnect, local + remote machines, agent status, agent-native socket/CLI.  
**Improve:** every status observation has source, freshness, confidence and reconciliation semantics.

### CCUI

**Keep:** real CLI process/PTY rather than mock chat, worktree fork or existing-branch attach, live activity/context/usage, file and diff browser.  
**Improve:** attach/fork authority binds exact repository/worktree/base revision and preserves dirty state.

### amux

**Keep:** workspace-first model, confirmation before commit/merge, base re-verification at integration time, transactional rollback safety, event recall.  
**Improve:** stale source/review/grant invalidation should be systemic across the platform, not only merge UI.

### Claude Code Router

**Keep:** provider/model/account routing, retry/fallback, usage/cost/latency observations.  
**Improve:** model routing is inference policy only; it cannot expand shell/file/network/Git permissions or act as a second harness registry.

## MATCH / IMPROVE / NEW / OMIT

### MATCH

- one attempt per isolated worktree/branch;
- heterogeneous CLI agents;
- real PTY/runtime sessions;
- reconnectable/durable sessions;
- diff/Git review;
- status + attention;
- local-first with SSH later;
- optional container isolation;
- browser/preview and visual review;
- issue/task intake;
- mobile/remote review;
- provider/model routing observations.

### IMPROVE

- exact workspace/revision binding;
- transactional worktree creation/cleanup/recovery;
- explicit runtime-session identity separate from attempt identity;
- `disappeared != completed` and `disconnect != failed`;
- restart-safe reconciliation with `unknown` when evidence is insufficient;
- normalized session state with observation source/confidence/freshness;
- exact effect grants for file/shell/network/Git/integration actions;
- secrets as references, never durable receipt payloads;
- notification idempotency, retries, dedupe and acknowledgement;
- stale review/authorization invalidation after source drift;
- builder/verifier separation;
- exact-SHA and exact-tool/harness/backend evidence.

### NEW owned differentiation

- provider-neutral execution backend contract spanning local, SSH and later certified container/cloud providers;
- durable attention event + wake-delivery protocol;
- Fleet/Workbench read model over attempts without creating another authority store;
- replay/reconciliation semantics for worktree + runtime lifecycle;
- phase-specific harness policy that composes Flow and Capability Fabric;
- complete correlation trail from work intent to verified integration;
- outcome metrics based on **verified results**, not number of concurrent agents or process exits.

### OMIT / DEFER

- twelve standalone clones;
- another task/approval database;
- another harness/provider registry;
- unrestricted auto-accept/yolo mode as a default;
- automatic push/merge/deploy;
- chat/mobile notification channels as authority;
- commercial source reuse from source-available/copyleft donors without explicit legal decision;
- fleet-scale marketing claims before owned load/recovery evidence;
- cloud fleet management before local/SSH semantics are proven.

## Phase A — fixture-only shipping contract

Reconcile contract names with #251 and existing Flow models before creating new primitives.

Required behavior:

1. create a WorkAttempt from an owned WorkItem/Flow node;
2. bind an exact synthetic ExecutionWorkspace identity;
3. bind a certified/fake harness profile;
4. start a deterministic fake runtime session;
5. consume normalized observations: `starting -> running -> waiting_input -> running -> completed`;
6. emit `AttentionEvent` when waiting input;
7. create idempotent `WakeDelivery` into the Work Queue projection;
8. accept an exact resolution and resume;
9. simulate restart while another attempt is active and transition it to `reconciling/unknown` until evidence resolves it;
10. require independent ReviewEvidence before `verified`;
11. emit immutable ExecutionReceipt;
12. perform no real shell, network or Git mutation in this phase.

### Proposed normalized attempt/session states

Attempt state should describe owned work truth; session observation describes backend/runtime truth. Do not collapse them blindly.

Potential attempt states:
- `planned`
- `ready`
- `starting`
- `running`
- `needs_input`
- `blocked`
- `reconciling`
- `verification_pending`
- `verified`
- `failed`
- `interrupted`
- `cancelled`
- `unknown`

Potential session observations:
- `starting`
- `running`
- `waiting_input`
- `idle`
- `exited_success`
- `exited_failure`
- `detached`
- `unreachable`
- `unknown`

A session `exited_success` is evidence for an attempt, not automatic proof that the work outcome is verified.

## Required negative/recovery matrix

### Workspace
- stale base revision invalidates plan/grant;
- repo/worktree identity mismatch fails closed;
- existing dirty user state is preserved/refused rather than overwritten;
- worktree cleanup failure is durable and retryable;
- one attempt cannot mutate another attempt's workspace.

### Runtime
- process disappearance cannot create `verified`;
- host restart produces reconcile/unknown state;
- duplicate runtime events are idempotent;
- out-of-order events cannot silently regress terminal facts;
- stale observations are marked stale;
- detach/reconnect preserves one runtime identity or explicitly records replacement.

### Attention
- duplicate WakeDelivery does not duplicate approval/action;
- failed notification stays retryable;
- acknowledgement does not mean work completion;
- remote/mobile reply cannot widen the original capability grant;
- attention stays bound to exact attempt/session/revision.

### Harness/provider
- provider/model fallback cannot widen effect authority;
- executable/version drift invalidates certification-sensitive dispatch;
- uncertified harness/mode fails closed where certification is required;
- raw credentials never enter durable logs/receipts.

### Review/integration
- builder cannot issue decisive verification for its own work;
- diff generation is not review;
- review is not merge authorization;
- merge authorization is not push/deploy authorization;
- source drift after review invalidates review/integration evidence.

## Roadmap

### P0 — research/dedupe — COMPLETE FIRST PASS
- source resolved;
- twelve upstreams identified;
- public behavior scanned;
- current heads pinned;
- first-pass licenses classified;
- internal overlap mapped;
- convergence thesis specified.

### P1 — pure contracts + fake backend
- reconcile #251/Flow contract names;
- execution workspace;
- runtime session/observation;
- attention event/wake delivery;
- deterministic digests/state machine;
- fake backend;
- restart/idempotency/recovery tests.

### P2 — disposable real worktree + one certified harness
- source-owned fixture only;
- use an already-certified Codex or Claude Code path from Capability Fabric;
- start/observe/interrupt/reconcile;
- capture exact receipts;
- no push/merge.

### P3 — deterministic checks + review + integration grant
- exact diff;
- tests/checks;
- independent verifier;
- keep/revert;
- separately scoped merge authorization;
- stale review invalidation.

### P4 — Workbench Fleet projection
- attempt/session grid;
- terminal/log/files/diff/browser;
- attention queue;
- evidence/freshness views;
- no duplicate authority.

### P5 — SSH execution backend
- exact remote machine identity;
- SFTP/worktree lifecycle;
- reconnect/reconcile;
- host-loss truth.

### P6 — certified container backend
- Docker/Podman/rootless capability profiles;
- bounded filesystem/network/resources;
- runtime-observed sandbox receipts;
- restart/cleanup/recovery.

### P7 — Flow phase routing
- research/planning/build/review harness rules;
- Capability Fabric certification lookup;
- structured handoff artifact;
- no hidden authority expansion.

### P8 — issue-source adapters
- GitHub first;
- external issue -> owned WorkItem proposal;
- explicit dispatch;
- lifecycle receipts.

### P9 — mobile/remote attention
- review/reply/bounded approvals;
- idempotent push/notification flow;
- device UAT before parity claims.

### P10 — reliability/evaluation/release
- concurrency and resource tests;
- orphan/reconcile rates;
- worktree leak/cleanup rates;
- harness comparison;
- time/cost per verified outcome;
- restart/replay tests;
- exact-SHA Shipping OS certification.

## Success criteria

Do not optimize for “number of agents running.” Optimize for proof-bearing useful work:

- verified-result throughput;
- attempts with exact workspace/runtime/harness evidence;
- unauthorized effects blocked;
- no fabricated success after process/host loss;
- worktree cleanup/recovery correctness;
- attention delivery latency, duplicates and acknowledgement integrity;
- builder/verifier separation;
- stale-review invalidation correctness;
- provider/harness cost per verified result;
- replay/restart drift rate.

## Clean-room / rights boundary

- Public behavior is requirement evidence, not permission to copy protected UX or implementation.
- No donor branding/assets/trade dress/prompt copying.
- No private endpoint probing or access-control bypass.
- MIT/Apache source reuse, if later intentional, must be exact-revision/file provenance with license/notice obligations retained.
- ELv2/AGPL/GPL/BSL donor code stays out of the commercial core unless a separate deliberate legal/distribution decision is recorded.
- Independently author owned contracts, tests, UI composition and runtime logic by default.

## Truth boundary

Current status:

`SOURCE=done / DONOR_SET=12 / SOURCE_PINS=done / LICENSE_POSTURE=first-pass / EVIDENCE=first-pass / INTERNAL_DEDUPE=done / ROUTING=agent-work-os / THESIS=specified / ISSUE=#267 / DOSSIER=committed-on-research-branch / CONTRACT_RECONCILIATION=next / IMPLEMENTATION=not-started / RUNTIME_UAT=none / DEPLOYMENT=none / SHIPPED=no`

No parity claim with any donor. No claim that donor internals beyond public source/docs were recovered. No production runtime, fleet-scale, mobile, SSH, container or deployment claim is made by this research artifact.
