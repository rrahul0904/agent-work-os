# Reverse Engineering: Context-Isolated Subagent Runtime

**Intake:** Reddit `r/aiagents` short link `9NFWkDMSP0`  
**Captured:** 2026-10-14  
**Target pattern:** subagents that keep the supervisor/main thread clean by moving exploration, testing, logs, and other noisy intermediate work into isolated agent threads and returning distilled results.  
**Implementation home:** Agent Work OS  
**Provenance mode:** clean-room, public behavior/docs first; REA only when a claim later depends on a shipped artifact or runtime behavior that public/source evidence cannot establish.

## 1. Source identity and evidence

The Reddit post itself was moderator-removed, but the author's surviving comment links to the full article, **"Why subagents help: a 10-panel visual guide"** by Adithyan (2026-03-21).

Publicly observable claims from the article and current platform documentation:

1. The main/supervisor thread should retain requirements, constraints, decisions, and final outputs.
2. Exploration notes, test output, logs, errors, and other intermediate artifacts should be delegated away from the main thread.
3. Subagents should return summaries/distilled findings rather than dumping their entire working transcript upstream.
4. Independent read-heavy tasks are good candidates for parallelism.
5. Write-heavy parallelism requires stronger coordination because simultaneous edits can conflict.
6. Codex currently exposes built-in and custom subagents, thread/concurrency controls, model/reasoning selection, and project/user scoped agent manifests.
7. Codex subagents inherit important parent-session authority such as sandbox/approval settings; Agent Work OS should not copy that limitation blindly. Our independent design should support **capability attenuation**, so a child may receive less authority than its parent and can never silently escalate it.

## 2. What is actually valuable here

This is not mainly a "spawn N agents" feature. The valuable architectural pattern is **context isolation + bounded delegation + evidence-backed synthesis**.

Without isolation:

`human -> one long agent thread -> exploration + logs + tests + decisions + edits + summaries`

The same context must carry executive intent and low-level noise. Over a long run, relevant instructions become harder to recover and repeated raw tool output consumes context that should instead be reserved for the objective and decisions.

With isolation:

`human -> supervisor -> task decomposition -> bounded subagent contexts -> evidence packets -> synthesis`

The supervisor sees compact, typed return values. Raw artifacts remain addressable in the evidence store without being copied into the supervisor prompt unless requested.

## 3. Product we should build

### Working name

**Agent Work OS Delegation Runtime** (internal capability name: `delegation-runtime`).

### Product promise

Run complex engineering work across multiple coding/research agents without allowing the main task context, permissions, repository state, cost, or evidence trail to become uncontrolled.

This becomes a reusable execution layer for:

- Codex
- Claude Code
- OpenCode / ACP-compatible agents
- Gemini / Google ADK agents
- Cursor/IDE adapters where supported
- local/open-source agents
- REA as a governed research provider
- future specialist services over MCP/A2A

The orchestration model belongs to Agent Work OS. Provider-native subagents may be used as an optimization, but they do not become the canonical authority.

## 4. Clean-room differentiation

We should reproduce the **general behavior pattern**, not Codex implementation details.

Our differentiated design adds controls that matter for enterprise use:

1. **Provider-neutral delegation contract** — no provider-specific thread is canonical.
2. **Context packs** — children receive explicit, minimal inputs rather than an uncontrolled copy of parent history.
3. **Authority attenuation** — child scopes are a subset of the parent grant.
4. **Worktree/sandbox isolation** — write agents receive independent filesystem/worktree authority.
5. **Typed result envelopes** — summary, claims, evidence references, patches/artifacts, confidence, unresolved questions, cost, and timing.
6. **Evidence ledger** — raw logs/artifacts remain retrievable without polluting supervisor context.
7. **Deterministic reconciliation** — conflicts are surfaced as explicit merge/review work, never silently resolved.
8. **Budget and fan-out limits** — task-level token/cost/time/concurrency ceilings.
9. **Replay receipts** — enough execution metadata is retained to explain or reproduce a delegation decision.
10. **Independent verifier agents** — implementation agents cannot certify their own high-risk outputs.
11. **REA boundary** — REA may inspect approved targets and return evidence packages; it never gets implicit code/deploy/tracker mutation authority.

## 5. Canonical architecture

```text
                         +---------------------------+
Human / API / Workflow ->| Agent Work OS Supervisor  |
                         +-------------+-------------+
                                       |
                                       v
                         +---------------------------+
                         | Planner / Task Decomposer |
                         +-------------+-------------+
                                       |
                   +-------------------+-------------------+
                   |                                       |
                   v                                       v
        +-----------------------+              +-----------------------+
        | Context Pack Builder  |              | Policy / Grant Engine |
        +-----------+-----------+              +-----------+-----------+
                    |                                      |
                    +------------------+-------------------+
                                       v
                         +---------------------------+
                         | Delegation Scheduler      |
                         | fanout / budgets / leases |
                         +------+---------+----------+
                                |         |
                +---------------+         +----------------+
                v                                          v
      +--------------------+                      +--------------------+
      | Isolated Agent A   | ...                  | Isolated Agent N   |
      | provider adapter   |                      | provider adapter   |
      | worktree/sandbox   |                      | worktree/sandbox   |
      +---------+----------+                      +---------+----------+
                |                                           |
                +-------------------+-----------------------+
                                    v
                         +---------------------------+
                         | Result Distiller          |
                         | + Evidence Normalizer     |
                         +-------------+-------------+
                                       |
                    +------------------+------------------+
                    |                                     |
                    v                                     v
          +--------------------+               +-----------------------+
          | Evidence Ledger    |               | Synthesis / Reviewer  |
          | raw logs/artifacts |               | conflicts / decision  |
          +--------------------+               +-----------+-----------+
                                                          |
                                                          v
                                               Supervisor compact state
```

## 6. Core contracts

### AgentDefinition

```json
{
  "id": "agent_reviewer",
  "provider": "codex",
  "role": "reviewer",
  "capabilities": ["repo.read", "tests.read", "web.docs"],
  "effects": [],
  "modelPolicy": {"class": "reasoning", "maxCostUsd": 2.0},
  "contextPolicy": {"maxInputTokens": 60000, "includeParentHistory": false},
  "resultSchema": "delegation-result/v1"
}
```

### ContextPack

A child gets only what its assigned task needs:

- objective and success criteria
- relevant constraints/decisions
- selected repository paths/symbols
- allowed tools and effect grants
- evidence references rather than copied raw logs
- relevant parent conclusions with provenance
- explicit exclusions

A ContextPack must have a content digest. The digest is part of the run receipt.

### DelegationRun

```json
{
  "id": "run_...",
  "parentRunId": "run_...",
  "taskId": "task_...",
  "agentDefinitionId": "agent_reviewer",
  "contextDigest": "sha256:...",
  "grantId": "grant_...",
  "workspaceId": "worktree_...",
  "status": "queued|running|completed|failed|cancelled|expired",
  "attempt": 1,
  "leaseExpiresAt": "..."
}
```

### DelegationResult

```json
{
  "runId": "run_...",
  "summary": "...",
  "claims": [
    {"text": "...", "confidence": 0.94, "evidenceIds": ["ev_1"]}
  ],
  "artifacts": ["artifact_..."],
  "patch": null,
  "unresolved": [],
  "recommendedNextActions": [],
  "usage": {"inputTokens": 0, "outputTokens": 0, "costUsd": 0},
  "resultDigest": "sha256:..."
}
```

Raw transcripts/tool logs are **not** embedded in the result. They are referenced by evidence IDs.

## 7. Delegation rules

### Delegate when

- workstreams are substantially independent;
- exploration is read-heavy;
- different expertise/tool surfaces are useful;
- a verifier should be isolated from the implementer;
- a large source can be partitioned safely;
- logs/tests would otherwise flood the supervisor context.

### Do not delegate when

- the operation is a trivial direct lookup/edit;
- tasks have tight sequential state dependencies;
- multiple writers would touch the same ownership region without worktree isolation;
- authority cannot be safely scoped;
- the expected coordination overhead exceeds the work itself.

### Hard safety invariant

`child_effects ⊆ parent_effects ∩ task_grant`

A subagent can receive equal or less authority than its parent, never more.

## 8. Repository/write isolation model

Read-only agents can share an immutable source snapshot.

Write agents must receive one of:

1. isolated Git worktree pinned to an exact base SHA;
2. ephemeral sandbox/container with an exported patch/artifact;
3. provider-hosted sandbox whose input/output digest can be recorded.

Two writers should not own the same file/path set concurrently unless an explicit conflict/reconciliation strategy exists.

The supervisor never treats "agent said it edited the file" as completion. Completion requires an artifact/patch digest and validation evidence.

## 9. Provider adapter contract

Each adapter should expose approximately:

```ts
interface AgentAdapter {
  describeCapabilities(): Promise<ProviderCapabilities>;
  start(input: StartAgentRun): Promise<ProviderRunHandle>;
  send?(handle: ProviderRunHandle, message: string): Promise<void>;
  interrupt(handle: ProviderRunHandle): Promise<void>;
  collect(handle: ProviderRunHandle): AsyncIterable<NormalizedAgentEvent>;
  close(handle: ProviderRunHandle): Promise<void>;
}
```

Native provider subagents are allowed behind the adapter, but Agent Work OS persists the canonical parent/child graph, grants, evidence references, status, and result digests.

## 10. REA integration

REA is useful when a delegated research task concerns a shipped binary/package, passive runtime observation, version comparison, controlled replay, or behavior not established by available source/public docs.

Example specialist:

`reverse_engineering_researcher`

Allowed:

- inspect an explicitly approved target;
- return evidence-backed behavioral claims;
- retain REA target digest/provider/version in evidence metadata.

Not implicitly allowed:

- modify the repository;
- write tracker state;
- install analysis providers;
- push/merge/deploy;
- retain secrets or unrestricted network access.

Its result enters the same `DelegationResult` + Evidence Ledger contract as any other research agent.

## 11. Failure and recovery model

Every child run needs a durable lease and attempt number.

Expected failure classes:

- provider unavailable/rate-limited
- model/tool failure
- lease expired / worker disappeared
- context pack invalid or stale
- authority denied
- workspace conflict
- result schema invalid
- evidence missing
- budget exhausted
- parent cancelled

Retry is allowed only when the effect contract is idempotent or when a fresh isolated workspace is created. A retry produces a new attempt and receipt; it never overwrites prior evidence.

## 12. Synthesis and conflict handling

The supervisor should receive **structured claims**, not a concatenation of subagent prose.

For each claim:

- which agent/run produced it?
- what evidence supports it?
- confidence?
- does another run disagree?
- is the evidence independent or duplicated?

Conflicting findings create an explicit reconciliation task. For consequential decisions, the system can spawn an independent verifier that receives the evidence but not the implementer's hidden working context.

## 13. Context-rot telemetry

We should measure whether delegation is actually helping.

Candidate metrics:

- supervisor context size over time
- raw tool-output bytes kept out of supervisor context
- percentage of child output reduced to summaries/evidence refs
- average context-pack size
- fan-out and depth
- duplicate research rate
- cross-agent contradiction rate
- rework caused by stale context
- cost per accepted claim / accepted patch
- completion latency vs equivalent single-agent baseline

This gives the product an evaluable claim instead of assuming "more agents = better".

## 14. Mapping to the Agent Work OS roadmap

This intake should extend existing phases rather than create a new authority:

- **P3 Task/Run model** — add parent/child run relationships, attempt leases and result digests.
- **P4 execution kernel** — durable subagent scheduling, crash recovery and cancellation.
- **P5 worktree isolation** — exact-SHA per-writer workspace and conflict ownership.
- **P6 provider-neutral lifecycle** — provider adapters and capability manifests.
- **P8 replay/reconnect** — child run event cursors and evidence retrieval.
- **P9 grants/approvals** — attenuated child effect grants.
- **P10 supervisor** — decomposition, fan-out, synthesis and recovery.
- **P11 REA** — bounded research provider returning evidence packages.
- **P15 observability** — parent/child trace IDs, budgets, quality and context metrics.

## 15. Implementation phases

### Phase A — contracts and deterministic local simulator

Deliver:

- `AgentDefinition`, `ContextPack`, `DelegationRun`, `DelegationResult` schemas
- parent/child run graph
- deterministic fake adapter capable of fan-out and delayed/failing results
- context-pack digesting
- result/evidence references

Acceptance:

- one parent delegates 3 independent tasks;
- raw child logs never enter parent compact state;
- final result is deterministic from the same child results;
- cancellation propagates to children;
- concurrency ceiling is enforced.

### Phase B — read-only multi-agent execution

Deliver:

- Codex adapter delegation through Agent Work OS (not direct provider-native authority)
- optional second provider adapter for conformance
- read-only specialists: explorer, test analyst, docs researcher, reviewer
- budget/time/depth policies

Acceptance:

- same task can run across two providers and normalize into the same result contract;
- no child can request an effect outside its grant;
- evidence is independently retrievable.

### Phase C — isolated write agents

Deliver:

- one worktree/sandbox per writer
- path ownership hints
- patch/artifact capture
- merge/reconciliation queue
- independent review agent

Acceptance:

- two writers on disjoint ownership regions can run concurrently;
- overlapping writes are detected and cannot silently clobber each other;
- accepted patch is bound to base SHA, child run and validation evidence.

### Phase D — supervisor automation and recovery

Deliver:

- decomposition heuristics
- bounded fan-out/depth
- orphan recovery
- retry policy
- verifier/reconciliation tasks
- compact supervisor memory/state

Acceptance:

- worker crash is recovered without duplicating unsafe effects;
- stale child result cannot mutate a newer task version;
- supervisor can resume from persisted state after restart.

### Phase E — REA research specialist

Deliver:

- REA readiness/target binding adapter behind explicit policy
- Evidence Ledger normalization
- source/runtime confidence labels
- no-effect research default

Acceptance:

- authorized target produces evidence-linked result;
- changed target digest invalidates stale evidence;
- REA output cannot mutate repository/deploy/tracker without a separate grant.

### Phase F — product UX and enterprise controls

Deliver:

- delegation graph UI
- inspect child threads without injecting them into parent context
- cost/token/time budgets
- approvals
- per-agent/provider policy
- replay receipt export
- org/RBAC scoping

Acceptance:

- operator can see why an agent was spawned, its authority, context digest, evidence, cost, status, and output;
- an admin can disable a provider/role centrally;
- audit trail explains consequential actions after the fact.

## 16. Initial specialist set

Start small. A useful default fleet is:

- `repo_explorer` — read-only code path mapping
- `docs_researcher` — current public docs/API verification
- `test_analyst` — run/read tests and cluster failures
- `security_reviewer` — adversarial review, no edits
- `implementation_worker` — targeted edits in isolated worktree
- `verification_worker` — validates claimed behavior independently
- `rea_researcher` — approved artifact/runtime investigation only

Specialists should be narrow and composable. Avoid one giant "expert agent" catalog.

## 17. Sellable product surface

This is an enterprise-grade feature when sold as **governed multi-agent execution**, not as a novelty "swarm".

Potential packaging:

- **Free/local:** 2-3 concurrent local agents, local evidence store, Codex/OpenCode adapter, basic graph.
- **Pro:** higher concurrency, multi-provider routing, budgets, reusable specialist packs, remote control, shared workspaces.
- **Enterprise:** SSO/RBAC, provider policy, immutable audit/evidence, approvals, private runners, secret isolation, centralized observability, compliance retention, custom specialist registry, deployment gates.

The moat is not spawning agents. The moat is **control, isolation, evidence, recovery, provider neutrality, and governance**.

## 18. Immediate next engineering tasks

1. Add canonical schemas for context packs, parent/child runs and delegation results under the existing domain/protocol packages.
2. Extend the echo/fake adapter so CI can simulate fan-out, delay, failure, cancellation and conflicting claims deterministically.
3. Add a `DelegationScheduler` with max concurrency, depth, budget and lease checks.
4. Persist parent/child relationships under the canonical Task/Run authority rather than session-local JSON.
5. Implement a compact-state builder that stores evidence references instead of child transcript text.
6. Wire a read-only Codex specialist behind the normalized adapter and prove one real end-to-end delegation.
7. Add one independent provider conformance adapter.
8. Extend worktree isolation to writer subagents only after read-only delegation is stable.
9. Integrate REA only after the target/grant/evidence contract is enforced in the execution path.
10. Add acceptance tests before exposing multi-agent controls in the customer UI.

## 19. Non-goals for the first slice

- uncontrolled recursive swarms
- autonomous production deploys
- shared writable checkout across parallel agents
- copying provider-specific hidden state into the canonical model
- giving every agent the full parent conversation
- auto-installing REA/native analysis tooling
- treating subagent prose as verification
- claiming production readiness before exact-SHA evidence gates pass

## 20. Decision

**BUILD.** This pattern belongs in Agent Work OS and directly advances the existing P3/P4/P5/P6/P9/P10/P11 roadmap.

The implementation should be more rigorous than the source pattern: isolated contexts, explicit grants, isolated writers, evidence-backed results, durable recovery and provider-neutral orchestration. Codex subagents are one execution provider; they are not the product architecture.
