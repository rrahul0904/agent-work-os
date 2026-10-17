# Contract reconciliation — parallel-agent landscape vs existing Localix supervisor

Tracking: #267  
Compared branch: `research/localix-local-agent-workspace-runtime` (#251)  
Comparison date: 2026-10-17 ET

## Decision

Do **not** implement a second work/wake supervisor on #267.

The #251 Localix research branch already contains an independently authored first execution-supervision slice:

- `runtime/daemon/src/work-supervisor.js`
- `runtime/daemon/src/work-supervisor-store.js`
- `runtime/daemon/test/work-supervisor.test.js`
- `runtime/daemon/test/work-supervisor-store.test.js`

The twelve-donor landscape should therefore operate as an **extension/gap-analysis donor pack** over #251, not as a competing runtime branch.

## Existing capability already present on #251

From `work-supervisor.js`:

### Work lifecycle

- stable work identity and work kinds;
- explicit state machine: queued/running/blocked/waiting/review/complete/failed/interrupted/lost/unknown;
- optimistic sequence check on transitions;
- refusal of no-op/stale/invalid transitions;
- append-only transition receipts;
- canonical SHA-256 receipt digest;
- restart hydration that turns stale `running` work into `lost` with a `runtime_restart` reason;
- terminal-state protection.

### Wake delivery

- typed wake sources;
- deterministic delivery keys;
- duplicate suppression;
- priority ordering with user input above default machine wake traffic;
- causal delivery identity;
- bounded self-caused wake depth;
- explicit queued/delivered/coalesced/missed/failed settlement states;
- append-only settlement receipt with digest;
- hydration with duplicate/key validation.

### Persistence direction

The branch also contains `work-supervisor-store.js` and matching store tests. That means #267 should evaluate/reuse the current #251 store behavior rather than recreate persistence from the older dossier description.

## Gap matrix contributed by the twelve-donor landscape

| Capability | #251 supervisor today | Landscape evidence | Canonical next owner/action |
|---|---|---|---|
| WorkItem / attempt lifecycle | strong first slice | Localix/agtx/AoE/Agent Deck validate need | keep #251 model; reconcile with Flow #39 |
| Wake/attention delivery | strong first slice | Agent Deck/amux/AoE reinforce notification/attention patterns | keep #251; add Work Queue projection/ack semantics |
| Exact Git workspace/worktree identity | not represented in supervisor record | Superset/Emdash/Nimbalyst/agtx/CCUI/amux repeatedly isolate by worktree | extend attempt with exact repository/base/worktree/revision binding or linked immutable workspace record |
| Transactional worktree lifecycle | not owned by current supervisor | amux/agtx/Emdash emphasize create/attach/cleanup/rollback | add independent `ExecutionWorkspace` provider/receipts; do not embed raw Git side effects in state machine |
| Runtime session identity | work has `sessionId`, but backend runtime observation is not a separate first-class record | herdr/AoE/CCUI/Claude Squad show PTY/tmux lifecycle is distinct from task outcome | introduce `RuntimeSession`/observation layer linked to WorkAttempt |
| Status source/freshness/confidence | work state is authoritative transition state | herdr/AoE/Agent Deck expose runtime inferred status | represent runtime observations separately; never let a heuristic directly certify work outcome |
| Execution backend capability | `backendId` string only | Emdash/herdr/AoE/agtx show local/SSH/container differences matter | introduce certified `ExecutionBackendSpec` + observed capability receipt |
| Harness certification | `adapterId` string only | heterogeneous agents are universal across donors | resolve through existing Capability Fabric #259; no new harness registry |
| Provider/model routing | outside supervisor | CCR shows retry/fallback/cost route layer | keep inference routing separate; route changes cannot widen effect permissions |
| Diff/file/browser review | not supervisor responsibility | Superset/Nimbalyst/CCUI/Emdash show major UX value | Agent Workbench #99 projection over exact workspace/evidence |
| Independent verification | `review` state exists but reviewer evidence is not encoded here | donor tools separate diff review from execution but mostly lack strong verifier separation | bind #111 verifier evidence before owned `verified` outcome |
| Merge/push/deploy authority | intentionally absent | amux re-verifies base; multiple donors provide review/PR flows | separate exact integration/release grants; Shipping OS remains release authority |
| Remote/mobile control | absent | Nimbalyst/AoE/agtx/Agent Deck patterns | projection only after action grants/notification integrity are proven |
| Issue/ticket intake | absent | Emdash strong multi-source intake | external ticket -> owned WorkItem proposal; provider ticket state cannot execute work directly |

## Required conceptual split

The biggest correction from the wider landscape is to avoid overloading `WorkAttempt.state` with runtime heuristics.

```text
WorkAttempt                         RuntimeSession
-----------                         --------------
owned workflow truth                backend/process truth
queued/running/blocked/review/...   starting/running/waiting/idle/exited/unreachable/unknown
verified only with evidence          observation only
survives backend replacement         may be replaced/restarted
bound to exact work/revision          bound to executor/backend instance
```

A runtime observation can justify a work transition, but it is not itself the work outcome.

Examples:

- PTY exits `0` -> runtime observation `exited_success`; WorkAttempt may move to `review`, not automatically `complete`/`verified`.
- SSH host disappears -> runtime `unreachable`; WorkAttempt moves to `reconciling/unknown` or existing `lost` policy, never fabricated failure/success.
- agent text says “done” -> event evidence only; deterministic checks/review decide outcome.
- provider fallback changes model -> runtime/harness observation; effect grant remains unchanged.

## Proposed extension contracts

Names are provisional until reconciled with current schemas.

### `ExecutionWorkspace`

Bind:
- workspace id;
- repository identity;
- base ref + exact base SHA;
- worktree/branch identity;
- current observed head SHA;
- dirty-state policy/observation;
- provider: local / ssh / container / later cloud;
- creation/attach receipt;
- cleanup state/receipt;
- immutable workspace-spec digest.

### `RuntimeSession`

Bind:
- runtime session id;
- WorkAttempt id;
- ExecutionWorkspace id/digest;
- Capability Fabric harness id/version/mode;
- ExecutionBackend id/profile/version;
- process/PTY/tmux/container/remote identity where safe;
- start/restart generation;
- latest observation + freshness;
- terminal observation and reconciliation state;
- no secrets/raw credentials.

### `RuntimeObservation`

Bind:
- runtime session;
- monotonic sequence;
- status;
- source (`structured_event`, `process_exit`, `pty_probe`, `tmux_probe`, `heartbeat`, `provider_event`, `heuristic`);
- confidence where interpretation is non-deterministic;
- observed timestamp;
- raw-event digest/reference;
- tool/harness/backend revision;
- canonical observation digest.

### `ReviewEvidence`

Bind exact:
- work attempt;
- workspace/head SHA;
- diff digest;
- deterministic test/check receipts;
- reviewer/verifier identity and independence class;
- decision and findings;
- expiry/staleness inputs;
- evidence digest.

## Phase A' after reconciliation

Because #251 already implemented work/wake primitives, #267's first code change should **not** recreate those primitives.

Smallest non-overlapping slice:

1. add pure `ExecutionWorkspace` normalization/digest contract;
2. add pure `RuntimeSession` + `RuntimeObservation` contract;
3. fake execution backend emits deterministic observation sequences;
4. adapter translates selected observations into proposed work transitions but cannot mutate work state without explicit supervisor transition call;
5. restart simulation proves runtime becomes unknown/unreachable while WorkAttempt reconciliation remains explicit;
6. negative tests for workspace/revision mismatch, duplicate/out-of-order observations and stale harness/backend identity;
7. no real Git/shell/network mutation yet.

Only after that should a disposable owned fixture connect one already-certified Codex or Claude path from #259.

## Merge/dependency strategy

- #251 remains the source branch for current supervisor/wake/store primitives until merged/reconciled.
- #267 research branch carries comparative evidence and the non-overlap extension specification.
- Do not cherry-pick/reimplement #251 code independently into #267 merely to make the branch self-contained.
- When #251 primitives land on `main`, rebase #267 or open the first execution-fabric implementation branch from that canonical commit.
- If #251 changes contract names before merge, update #267 specifications instead of creating compatibility shims prematurely.

## Updated truth boundary

`LANDSCAPE_RESEARCH=done-first-pass / 12_SOURCE_PINS=done / DEDUPE=done / #251_EXISTING_SUPERVISOR=verified-by-source-inspection / WAKE_PRIMITIVES=existing-on-#251 / STORE_FILES_AND_TESTS=present-on-#251 / WORKSPACE_RUNTIME_GAP=specified / DUPLICATE_IMPLEMENTATION=avoided / #267_CODE_IMPLEMENTATION=not-started / RUNTIME_UAT=none / SHIPPED=no`
