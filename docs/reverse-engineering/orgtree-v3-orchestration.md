# RE-360 — Orgtree v3 orchestration donor

Research snapshot: 2026-10-01

## Sources reviewed

- Supplied Reddit launch: https://www.reddit.com/r/claudeskills/comments/1wutlqo/orgtree_v3_its_fast/
- Upstream repository: https://github.com/Maurdekye/orgtree
- Upstream release examined: 3.0.8, commit `290f242791067f46ccbd2099fc33a4eef3eb2ec1`
- Upstream license: MIT
- Upstream macOS request: https://github.com/Maurdekye/orgtree/issues/1
- Agent Work OS overlap:
  - RE-244 / issue #7 — project desk, work leases, human approvals
  - RE-297 / issue #9 — durable decision memory / handoff
  - RE-359 / issue #16 — provider lanes, bounded execution and usage receipts

## Evidence classification

### Directly observed in current upstream/public materials

Orgtree v3 presents a persistent desktop workspace in which agents are organized under a visual authority hierarchy. Public material describes a shared work docket, agent mail, permission/delegation controls, usage/budget surfaces, background agents, an Attention view, multi-window operation and support for multiple coding-agent/provider lanes.

The v3 README describes an embedded PostgreSQL migration, partial/lazy loading for history and retired agents, bounded global agent-turn concurrency (default 16), FIFO waiting within an organization and fairness across organizations. The package manifest examined on 2026-10-01 reports version 3.0.8 and Electron/React/TypeScript packaging.

The public upstream repository is MIT licensed.

### Creator-reported, not independently reproduced

The supplied launch says the previous version could become slow with larger organizations/history and says v3 commonly keeps actions under roughly 100 ms and should scale to much larger agent counts subject to hardware. These statements are useful design hypotheses, not owned benchmark evidence.

### Public feedback

The exact supplied Reddit thread contains:
- positive feedback that a common interface matches how some users already coordinate agents;
- skepticism that the product can feel like “overkill” without a clear use case;
- creator response that it is used daily in the creator's own work.

No independently identifiable commenter-linked product was exposed in the accessible exact-thread discussion.

A separate public upstream issue requests macOS support. The maintainer states they do not own a Mac and invited a fork/contribution. This is evidence of a packaging/verification gap, not evidence that the architecture cannot run on macOS.

## Consolidation decision

Do not create a standalone Orgtree clone.

Canonical destination: `rrahul0904/agent-work-os`.

Agent Work OS already owns:
- authenticated local daemon/control-plane communication;
- machine presence and heartbeats;
- coding-agent session start/follow-up/interrupt;
- normalized agent events;
- persistent machine/session state;
- operator web UI;
- Codex and deterministic echo adapters;
- roadmap for durable storage, worktrees, approvals, budgets, desktop shell and routing.

Orgtree therefore contributes an organization-level coordination layer rather than a second execution substrate.

Related donors must remain deduplicated:
- RE-244: work ledger/lease/human approval semantics;
- RE-297: decision-memory/session-handoff semantics;
- RE-359: provider/cost/checkpoint policy;
- AgentDock RE-294: local multi-agent hive/PTy/operator-console primitives.

## Feedback-driven product improvements

1. **Use-case-first onboarding**  
   Ship bounded demo fixtures such as “builder + reviewer + human approval” and “researcher + implementer + verifier,” rather than an empty giant org chart.

2. **Human attention over ambient complexity**  
   One projection should explain exactly which approval, urgent message or blocked work item requires the operator.

3. **Visible queue semantics**  
   Queue receipts should say whether a turn is waiting for global capacity or fair rotation instead of presenting unexplained background latency.

4. **Evidence-bearing completion**  
   Work completion should inherit RE-244 receipts (tests, commit, CI, review evidence) so orchestration is auditable.

5. **Measured scale claims**  
   Latency, memory, queue fairness and restart behavior require an owned benchmark harness before any scale statement.

6. **Cross-platform verification**  
   Keep coordination/runtime contracts OS-neutral and add real macOS/Windows/Linux packaging/runtime checks before claiming support.

## Independent implementation plan

### Phase A — deterministic coordination core

- versioned organization/agent/delegation contracts;
- parent/child graph validation, bounded depth/size and cycle/orphan rejection;
- deterministic reparenting;
- fair bounded turn scheduler;
- FIFO within one organization and round-robin fairness across organizations;
- explicit queue receipts;
- unified human-attention projection with deterministic priority/age ordering;
- focused tests.

### Phase B — project desk integration

Bind agents/organizations to RE-244 work items, ownership leases, progress/evidence receipts, completion reports and human-only tasks.

### Phase C — durable state and migration

Add a database-backed adapter with versioned migrations, verification, restart reconciliation, lazy history loading and failure-safe cutover. PostgreSQL is an implementation option, not a performance claim.

### Phase D — operator experience

Organization tree, work docket, queue/wait state, attention inbox, agent desk, evidence drill-down and multi-window/desktop surfaces.

### Phase E — provider/budget/watchdog policy

Provider/account routing, inherited delegation budgets, usage receipts, exact-agent credential scoping, bounded background/watchdog tasks and explicit stop/revoke controls.

### Phase F — portability and benchmark certification

Exercise packaged builds on supported OSes. Benchmark queue fairness, p50/p95 control-plane latency, memory growth, restart recovery and large synthetic organizations.

## Phase A branch state

Branch: `reverse/orgtree-v3-orchestration`

Initial implementation:
- `services/control-api/src/coordination.js`
- `services/control-api/test/coordination.test.js`

The first slice is intentionally pure and additive. It does not mutate the existing daemon/session execution path and does not yet persist organizations or expose new API endpoints.

## Boundaries

- No Orgtree branding/UI/assets copied.
- No upstream source parity claim.
- No independent confirmation of creator-reported performance.
- No unrestricted execution/network policy.
- No automatic push, merge or deployment.
- No production-readiness claim from unit tests.
- No macOS claim without real packaged/runtime evidence.
