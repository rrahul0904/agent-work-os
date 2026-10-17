# RE-360 — Orgtree v4.1.3 delta reconciliation

Research snapshot: 2026-10-10

## Decision

Treat Orgtree v4 as an upgrade to the existing RE-360 donor lane, not as a new product/repository.

Canonical destination remains `rrahul0904/agent-work-os`. The v3 coordination slice stays valid; v4 adds runtime, provider/account, migration, background-service, mobile-mail, portability and benchmark questions that should be integrated behind independent contracts.

## Sources pinned

- Supplied Reddit launch: https://www.reddit.com/r/claudeskills/s/892CSeVr5y
- Upstream repository: https://github.com/Maurdekye/orgtree
- Upstream release inspected: `v4.1.3`
- Annotated release tag resolves to commit `ff0a40ec4d59585343b78c1654efd29cd6454cd1`
- Orgtree 4.0.0 release notes: `docs/release-notes-4.0.0.md`
- Orgtree 4.1.0 release notes: `docs/release-notes-4.1.0.md`
- Companion Hubchat repository: https://github.com/Maurdekye/orgtree-hubchat
- Existing RE-360 v3 snapshot: release 3.0.8 at `290f242791067f46ccbd2099fc33a4eef3eb2ec1`

Upstream is MIT licensed. This branch remains clean-room: observed behavior and public contracts may inform independent design, but upstream implementation is not copied into Agent Work OS.

## What materially changed from v3

### 1. Dedicated Rust engine

Orgtree 4 replaces its earlier engine with a Rust engine while keeping the higher-level workspace. The current source is organized around an engine, per-agent runtime actors, provider-specific runtime adapters, events, accounts/credentials, usage, migrations, mail hub, networking and persistence.

For Agent Work OS the useful lesson is architectural, not linguistic: isolate the long-lived runtime from the UI/control API, keep agent live state behind a narrow message boundary, and make runtime state observable through explicit snapshots/events. Do not rewrite the existing substrate in Rust merely to imitate the donor.

### 2. Event-driven watchdogs

The 4.0 notes say watchdogs can react to turns, mail, tickets, account limits and active-agent thresholds without polling.

Independent contract for Agent Work OS:
- watchdog evaluation is triggered by normalized runtime events;
- rules are deterministic and bounded;
- duplicate event delivery is idempotent within a bounded replay window;
- a rule produces a receipt/request, not arbitrary shell execution;
- unsupported event/action types fail closed;
- polling is not required for ordinary event-triggered reactions.

Initial clean-room slice: `services/control-api/src/runtime-policy.js`.

### 3. Account/provider lifecycle semantics

Orgtree 4 allows accounts to be enabled/disabled independently. Disabling an account lets an in-flight turn finish while preventing new turns. Provider/model/account switches preserve the current session where possible; a switch during a running turn is deferred until that turn ends, while an idle agent can apply a queued switch immediately.

Independent contract:
- account admission is checked when a turn starts;
- disabling an account is non-preemptive by default;
- no new turn may start on a disabled account;
- an in-flight provider/account change is represented as a deferred transition rather than mutating the running turn;
- credential scope and provider routing remain separate from scheduler fairness.

Initial clean-room slice: `ProviderAccountGate` and `planProviderSwitch` in `runtime-policy.js`.

### 4. Explicit interruption/recovery boundaries

The 4.0 notes state that after engine interruption an agent gets a continuation message, while unfinished tool calls are not automatically reconciled. This is an important negative contract.

Agent Work OS must not infer exactly-once completion from a restarted process. Recovery needs durable receipts and a reconciliation policy owned by our system:
- distinguish `turn_interrupted`, `tool_unknown`, `tool_committed` and `tool_not_started` where evidence permits;
- never replay an irreversible external action solely because a turn restarted;
- require idempotency keys or explicit human review for uncertain writes;
- keep restart reconciliation separate from conversational continuation.

This should integrate with the existing evidence/replay lanes rather than copy the donor's behavior.

### 5. Bounded warm-process policy

The current Rust runtime has explicit process warming, an idle-process cap, bounded parallel warm-up and a machine-memory safety gate. These are implementation observations, not values to copy.

Agent Work OS contract:
- warm processes are optional optimization, never correctness dependencies;
- warming has configurable concurrency and total-idle caps;
- low-memory/pressure signals stop new warming before they threaten the supervisor;
- running turns are not killed merely to satisfy a warm-cache policy;
- owned load tests must prove memory stability.

### 6. Migration is read-only, retryable and rollback-friendly

The 4.0 upgrade path reads old data without deleting or modifying it, imports organizations into separate storage, skips successful imports on later starts, retries failed imports, and keeps older data available for rollback.

Agent Work OS migration contract:
- source is read-only;
- destination uses versioned migration receipts;
- each migration unit is independently idempotent;
- success is checkpointed; failed units can retry;
- rollback does not require reverse-writing into the old schema;
- bounded history import is explicit and measurable.

### 7. Hubchat is a separate interaction plane

Orgtree 4.1 introduces phone access through Hubchat and a native mail hub. Hubchat is a separate application/core with linked-device identity, QR-based setup, message sync and a relay model. The public documentation warns that the hub operator can read traffic passing through a hub and recommends trusted/private network paths such as Tailscale.

For Agent Work OS this is a donor for a future remote operator channel, not part of the core scheduler.

Independent contract before implementation:
- one-time, expiring device-link token;
- explicit trust record and revocation;
- least-privilege relay endpoint separate from any administrative/debug endpoint;
- authenticated per-identity reads;
- encrypted transport supplied by a private network or TLS boundary;
- no secrets in QR payloads beyond a short-lived bootstrap capability;
- mobile commands pass through the same approval/policy gates as desktop commands.

Do not expose the existing control API directly to the public internet as a shortcut.

### 8. Portability claims stay evidence-bound

Orgtree 4.1 introduced macOS/Linux prototype builds and explicitly described them as untested on real machines at release time. Agent Work OS should preserve its stronger rule: packaging/build success is not runtime certification.

A platform becomes supported only after real-device/runtime evidence covers startup, persistence, background service, CLI discovery, credentials, shutdown/restart and failure recovery.

## v4 clean-room implementation slices

### Slice V4-A — runtime policy contracts — STARTED

- event-triggered watchdog router;
- bounded duplicate-event memory;
- allowlisted non-shell watchdog outcomes;
- provider/account admission gate;
- non-preemptive account disable;
- deferred provider/account switch while a turn is running;
- negative tests for unsupported events/actions.

### Slice V4-B — durable recovery receipts

Add interruption and reconciliation states to the work/turn evidence model. Prove that restart does not duplicate irreversible writes and that unknown outcomes halt for reconciliation.

### Slice V4-C — migration harness

Build a synthetic previous-schema fixture, read-only importer, per-unit receipt ledger, retry/skip behavior, bounded history rules and rollback proof.

### Slice V4-D — runtime pressure and warm-process supervisor

Add configurable warm/idle caps and a pressure input. Verify bounded process count, no warm-up storm after restart and graceful refusal under memory pressure.

### Slice V4-E — remote operator channel

Design the device-link and relay protocol as a separate package/service. Keep it disabled by default until authentication, revocation, replay resistance, transport security and approval-gate tests are green.

### Slice V4-F — benchmark and portability certification

Owned benchmark harness for p50/p95 control latency, scheduler fairness, RSS/heap growth, process count, restart recovery and large synthetic organizations. Real-device matrix for macOS, Windows and Linux before support claims.

## Failure/adversarial matrix

| Failure | Required behavior |
|---|---|
| duplicate runtime event | no duplicate watchdog receipt within retained replay window |
| unknown watchdog event/action | fail closed |
| account disabled mid-turn | running turn may finish; new turn refused |
| provider switch during turn | defer until turn boundary |
| process/engine dies mid-tool | outcome remains unknown until evidence reconciles; no blind replay |
| migration crashes after one unit | successful unit skips on retry; failed unit retries |
| old data malformed | quarantine/report unit; do not mutate source |
| restart with many warm candidates | bounded warm fan-out and total idle process count |
| low-memory pressure | stop new warming; preserve supervisor correctness |
| device-link token replay | reject after use/expiry/replacement |
| remote channel unavailable | local orchestration continues |
| desktop app closed | background-runtime correctness remains independently testable |

## Benchmark policy

The Reddit headline reports major speed and memory gains. Treat those as creator-reported until our harness reproduces comparable measurements on our own implementation. We will not put a speedup or memory-reduction number into Agent Work OS release claims without:

1. pinned hardware/runtime versions;
2. identical workload fixtures;
3. warm/cold-run separation;
4. at least p50/p95 latency and peak/steady memory;
5. repeat runs and variance;
6. raw benchmark artifacts attached to the verification receipt.

## Boundaries

- No Orgtree branding, UI, assets or source copied.
- No claim of implementation parity with Orgtree.
- No claim that Rust itself is the source of upstream performance gains.
- No creator performance claim promoted as owned evidence.
- No automatic external writes from watchdog events.
- No blind replay of unknown tool outcomes after restart.
- No remote control plane exposed publicly without authentication, transport protection and approval policy.
- No merge/deploy from this donor lane without the existing Agent Work OS gates.
