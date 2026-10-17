# RE-387 — Frink Flow + Work Queue convergence

Status: research complete; Phase A contract implementation in progress  
Canonical destination: Agent Work OS  
Coordination issue: #39

## 1. SourceManifest

### User-supplied source

- Reddit: `https://www.reddit.com/r/vibecoding/s/Y8PSJdVst0`
- Resolved post: “How I manage to ship over 100 PRs per day across all of my repositories... and still know what's going on”

### First-party product/source evidence

- Product: `https://www.frink.dev/`
- Public repository: `https://github.com/benord-labs/frink`
- License: MIT
- Exact source snapshot inspected: `e2f208c9bfe1820b6435558a9034578ceefc6d92`
- Snapshot release: Frink 0.2.0, 2026-10-05
- Product specification inspected: `PRODUCT.md`
- Flow skill/contracts inspected: `assets/skills/frink-flows/SKILL.md`
- Mobile product/runtime boundary inspected: `mobile/README.md`
- Desktop/runtime structure inspected under `src/main`, `src/preload`, `src/renderer`, and `src/shared`

### Community-feedback visibility

No substantive independent Reddit comments were visible in the research snapshot. This dossier therefore does not invent commenter feedback. Repository history, tests and first-party product documentation are used as the stronger evidence source.

### Claim classification

The Reddit author's statement that the system ships more than 100 quality PRs/day is an author-reported claim. RE-387 does not treat it as independently verified throughput, a benchmark, or a parity target.

## 2. ProductUnderstanding

Frink is a local-first AI development workspace intended to serve two audiences on one product spine:

1. a newcomer can start with a normal chat and sensible defaults;
2. a power user can convert repeat work into triggered, conditional and parallel Flows.

The most important product transition is:

`chat -> save as Flow -> trigger -> execute -> ask for attention only when necessary -> review`

This is more important than any individual screen. The product removes the operator from routine agent turns while retaining explicit visibility and review for consequential decisions.

Frink is not primarily a hosted application builder. Execution, source repositories, provider credentials and shipped-product infrastructure remain under the user's control. Its desktop process acts as a local orchestration/runtime layer.

### User jobs

- start a one-off coding or automation task without learning an orchestration language;
- turn a successful one-off task into a repeatable Flow;
- run multiple isolated tasks without branch/file collision;
- connect external events to work;
- see only work that genuinely needs human attention;
- review what an agent did before consequential shipping actions;
- continue or approve work remotely without exposing source/provider credentials to a hosted execution service.

### Core product loop reconstructed from public evidence

1. **Trigger** — manual, schedule, ticket/event/webhook or another supported event.
2. **Graph execution** — trigger feeds action/logic nodes.
3. **Start task/session** — an execution context is opened, optionally in a worktree.
4. **Agent/action execution** — agents and deterministic command/integration blocks execute.
5. **Logic** — conditions/fan-out/approvals route work.
6. **Human attention** — plans, questions, permission requests and blocked tasks are parked rather than guessed through.
7. **Resume** — explicit answer/approval resumes the exact blocked work.
8. **Review/ship** — work is reviewed and only then advances according to policy.
9. **Follow-on discovery** — agents can surface new work; another workflow can triage/reroute it.
10. **Re-dispatch** — ready work can be scheduled again, completing the autonomous loop.

## 3. EvidenceLedger

| Evidence | Classification | What it supports | What it does not prove |
| --- | --- | --- | --- |
| Reddit workflow description | author report | intended operating loop, Work Queue concept, deterministic gates, autonomous re-dispatch | 100+ PR/day quality or independent benchmark |
| `PRODUCT.md` | first-party product spec | target users, local-first positioning, friendly ladder, explicit human review | production reliability |
| public `README.md` | first-party docs | worktrees, provider reuse, MCP/plugins, permissions, local storage | every feature under all failure modes |
| `frink-flows` skill | executable product contract/docs | graph model, trigger/action/logic model, start-task/worktree semantics, batching | Agent Work OS design choices |
| `mobile/README.md` | first-party mobile/runtime docs | encrypted pairing model, Queue/Flow remote controls, mobile limits, UAT expectations | relay availability/SLA |
| repository migrations/source tree | source evidence | mature local schemas for flows/tasks/triggers/permissions/plugins | correctness by itself |
| focused regression commits/tests | source/test evidence | active correctness work around queue/run/hook semantics | full-suite universal stability |

## 4. ProductBehaviorModel

### Flow definition

A Flow is a versioned directed graph with one trigger. Nodes are explicit actions or logic; edges determine allowed transitions. Data passed between nodes is scoped rather than magical global context.

Useful donor semantics observed publicly include:

- one trigger per Flow;
- bounded graph size;
- start-task/session nodes create execution contexts;
- worktree isolation can be selected at task start;
- agents continue a task context rather than always opening new sessions;
- conditions branch explicitly;
- fan-out can create parallel work;
- approvals pause progression;
- batch plans separate planning/definition/start;
- run inspection is first-class.

### Attention model

The operator should not inspect every running task. Attention is a projection over execution facts. Examples:

- question waiting for user input;
- permission decision required;
- plan ready for approval;
- failed step with supported retry/skip path;
- task marked blocked or partial;
- review required before a protected transition.

The queue must not create a second source of truth. It should reference authoritative run/work/approval facts and disappear when those facts resolve.

### Isolation model

Parallelism is useful only if tasks do not silently collide. A task needs an explicit workspace identity and later a worktree lifecycle. Isolation state must be inspectable and receipt-backed; a UI badge alone is not proof.

### Mobile model

The donor's iPhone client is primarily a remote attention/review surface, not a second execution engine. That is the right product boundary for Agent Work OS too. Source, execution and provider credentials stay on the trusted machine. Remote control should carry narrowly scoped commands and encrypted state.

## 5. CapabilityMatrix

### MATCH — already present or represented in active Agent Work OS work

- trusted local daemon / control plane;
- Codex and additional provider adapter direction;
- durable sessions and normalized events;
- project work items and human-only completion semantics (RE-244);
- approval facts and exact-intent governance (RE-244 / RE-372);
- bounded repository intelligence and execution safety (RE-359);
- scheduling/attention-domain research (RE-360);
- shared provider Brain/context handoff (RE-370);
- operations/admin visibility (RE-371);
- Shared Rooms/routines/tool approvals (RE-372);
- Agent Studio and published agent specs (RE-374);
- independent review council direction (RE-385);
- federation contracts (RE-386).

### NEW — missing product spine

- `flow-graph/v1` as a canonical versioned orchestration contract;
- Flow-run/node-run state machine;
- durable transition receipts;
- queue projection from run/work/approval facts;
- task/worktree lifecycle binding;
- explicit agent outcome protocol: completed / needs-input / blocked / partial / failed;
- deterministic command/test gate binding;
- bounded retry / skip / resume;
- trigger contracts: manual / schedule / webhook / after-task;
- UI convergence that makes existing capabilities feel like one product rather than donor slices.

### IMPROVE — deliberate Agent Work OS differentiation

- evidence-gated completion instead of throughput claims;
- verifier independence for decisive success claims;
- exact graph/input/output/SHA digests;
- restart reconciliation with no inferred success;
- capability/policy/budget admission before dispatch;
- replay-resistant approvals and exact blocked-run resume;
- provider-neutral execution contracts;
- a clear control-plane/scheduler boundary so Autonomous Forge can plug in without becoming hidden UI state;
- deterministic audit/replay views;
- explicit failure-recovery UAT.

### OMIT

- donor branding/visual identity/assets/copy;
- byte-for-byte donor source/schema/test reproduction;
- unverified performance/parity claims;
- implicit push/merge/deploy;
- a second execution engine on mobile;
- a new authoritative work/approval database while existing RE-244/RE-372 work remains unreconciled.

## 6. ArchitectureSpec

### Canonical layers

```text
Operator surfaces
  Web / later Electron / later mobile attention client
                |
                v
Agent Work OS control plane
  Flow catalog + run projection + Work Queue projection
                |
                v
Governance contracts
  work items / approvals / policy / verifier evidence
                |
                v
Execution admission
  graph digest + capability check + budget + exact authorization
                |
                v
Trusted local daemon
  provider adapter / command gate / worktree runtime
                |
                v
Repository + agent CLI credentials remain local
```

Optional later scheduler path:

```text
Autonomous Forge executive brain
        |
        | bounded task/lease/evidence adapter
        v
Agent Work OS Flow admission
```

Agent Work OS remains the product/control plane. Autonomous Forge may become a scheduling/executive-brain capability provider but should not own UI truth or bypass Agent Work OS governance.

### State ownership rules

- Flow definition owns orchestration topology, not work-item truth.
- Flow run owns execution transitions, not project completion truth.
- Work Queue is a projection, not an independent lifecycle database.
- Approval store owns decision truth.
- Work item store owns project work truth.
- daemon/provider adapter owns live process/session execution facts.
- verifier receipt owns decisive verification evidence.
- deployment state must come from the deployment target/provider, not from an agent statement.

## 7. ImplementationPlan

### Phase A — deterministic Flow contract

Implement on current `main`, independent of stacked donor branches:

- `flow-graph/v1`;
- explicit supported node types;
- exactly one trigger;
- maximum 50 nodes;
- unique valid node/edge identifiers;
- edge endpoint checks;
- trigger cannot have incoming edges;
- end cannot have outgoing edges;
- condition must expose exact true/false branches;
- reject unreachable nodes;
- reject cycles;
- stable SHA-256 digest independent of node/edge ordering and object-key ordering;
- deterministic negative tests.

No side effects are permitted in Phase A.

### Phase B — run state machine, fake executor first

Add typed states such as:

- queued
- admitted
- running
- waiting_for_input
- waiting_for_approval
- blocked
- partial
- failed
- completed
- cancelled
- interrupted

A restart must reconcile nonterminal states to explicit interrupted/recoverable facts rather than silently declaring failure or completion.

Use deterministic fake/echo execution before real provider dispatch.

### Phase C — authoritative Work Queue

After branch reconciliation with RE-244/RE-372:

- project existing work/approval/run facts into attention items;
- exact source references on every queue row;
- resolve rows automatically when source facts resolve;
- resume only the exact blocked run/node;
- idempotent approve/deny/answer actions;
- replay rejection;
- supported retry/skip with receipts.

### Phase D — real isolated execution

- worktree create/reuse/cleanup lifecycle;
- agent launch through existing daemon adapters;
- bounded repository context;
- deterministic command/test gates;
- exact commit/head receipts;
- separate builder and verifier where required;
- explicit no-push/no-merge/no-deploy default.

### Phase E — triggers and autonomous loop

- schedules;
- authenticated webhooks;
- after-task trigger;
- follow-on ticket/work discovery;
- deterministic triage/routing;
- optional Autonomous Forge scheduler bridge;
- hard budgets and bounded recurrence.

### Phase F — product surfaces

- Flow list/editor and run inspector;
- Work Queue/Needs Attention;
- task/worktree visibility;
- review/receipt surface;
- Electron shell only after browser/runtime behavior is stable;
- encrypted mobile/PWA attention client afterward.

## 8. RuntimeVerification plan

Verification ladder:

1. **Static** — syntax/type/contract shape.
2. **Unit** — graph/state/projection refusal paths.
3. **Integration** — control API + daemon + fake executor.
4. **Contract** — digests, approvals, work-item ownership, exact resume.
5. **Runtime** — real Codex/Claude process execution.
6. **Browser** — real operator Flow/Queue interactions.
7. **Persistence** — restart with durable runs/attention facts.
8. **Failure recovery** — process disappearance, invalid worktree, failed test, stale approval, duplicate webhook.
9. **Preview** — packaged/pre-release environment.
10. **Production** — only after exact deployed revision and post-deploy smoke/UAT receipts.

## 9. ProductUAT scenarios

Minimum eventual UAT:

1. Create a manual Flow and run it.
2. Create isolated worktree and prove branch/path identity.
3. Agent produces a change.
4. Deterministic test gate fails; run pauses truthfully.
5. Operator retries or skips only if policy supports it.
6. Agent asks a question; Work Queue shows exactly one attention item.
7. Answer resumes the exact blocked node.
8. Approval is denied; protected transition does not execute.
9. New approval is granted for the exact current digest; protected transition advances once.
10. Kill/restart daemon during a run; system reconciles without assuming success.
11. Verifier checks exact resulting SHA/evidence.
12. Run reaches terminal completed only with required evidence.
13. No implicit push, merge or deploy occurs.

Mobile later:

14. Pair remote client with one-time credential.
15. Inspect attention item without exposing source/provider credential.
16. Approve/deny exact request remotely.
17. Revocation prevents further commands.

## 10. TrackerTruth

RE-387 status can only advance from evidence:

- **Research complete**: source manifest + product understanding + evidence ledger + capability matrix present.
- **Phase A implemented**: code exists on exact branch/head and deterministic tests exist.
- **Phase A verified**: exact-head CI green.
- **Runtime complete**: actual Flow state machine + fake executor integration proven.
- **Provider verified**: real provider run evidence captured.
- **UAT verified**: browser/device scenario receipts captured.
- **Deployable**: build/package/deploy configuration proven for an exact revision.
- **Deployed**: target environment reports exact revision and smoke checks pass.
- **Parity/complete**: only after capability matrix and UAT gaps are evidence-closed; donor marketing claims are never inherited as proof.

## 11. Current truth at dossier creation

Completed:

- source identification and exact upstream snapshot;
- source/product architecture inspection;
- mobile/security-boundary inspection;
- overlap analysis against Agent Work OS and Autonomous Forge;
- canonical placement decision;
- RE-387 coordination issue;
- Phase A deterministic Flow contract started on a dedicated branch.

Not yet proven:

- Phase A CI;
- Flow runtime execution;
- Work Queue integration;
- worktree lifecycle;
- real-provider Flow execution;
- browser UAT;
- Electron/mobile build;
- deployment;
- Frink parity or throughput parity.
