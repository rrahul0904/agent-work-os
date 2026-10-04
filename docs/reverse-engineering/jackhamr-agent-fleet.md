# JackHamr capability donor — hosted autonomous agent fleet

Research snapshot: 2026-10-04  
Issue: #31  
Canonical destination: Agent Work OS  
Tracker ID: intentionally pending portfolio reconciliation

## Purpose

This dossier applies the project reverse-engineering roadmap to JackHamr as a **clean-room capability donor**, not as a cloning target. The goal is to extract publicly documented product patterns that can improve Agent Work OS while preserving independent architecture, code, UI, protocols, prompts, storage models, tests and branding.

Hard rule: no private-service inspection, no hidden API/network capture, no binary decompilation, no copying of proprietary source or protected implementation structure. Only public product behavior, public documentation and general engineering patterns are used as requirements evidence.

## Source manifest

### Primary creator source

- Reddit launch/announcement supplied by the user: https://www.reddit.com/r/SaaSSolopreneurs/comments/1wx7w09/me_and_my_friend_finally_launched_our_product/

### First-party product evidence

- Home: https://www.jackhamr.ai/
- Pricing: https://www.jackhamr.ai/pricing
- Product principles: https://www.jackhamr.ai/principles
- Why / comparisons: https://www.jackhamr.ai/why
- Release archive: https://www.jackhamr.ai/blogs
- Autonomous agents: https://www.jackhamr.ai/blogs/autonomous-agents
- ChatGPT / Claude / MCP integration: https://www.jackhamr.ai/blogs/your-agents-inside-claude-and-chatgpt
- MCP docs: https://www.jackhamr.ai/docs/mcp
- Devin comparison: https://www.jackhamr.ai/compare/devin
- OpenAI Codex comparison: https://www.jackhamr.ai/compare/openai-codex
- Replit comparison: https://www.jackhamr.ai/compare/replit
- Lovable comparison: https://www.jackhamr.ai/compare/lovable
- Desktop downloads: https://www.jackhamr.ai/download
- Privacy: https://www.jackhamr.ai/privacy
- Terms: https://www.jackhamr.ai/terms

## Evidence labels

- `OBSERVED`: directly visible in public product/site material.
- `DOCUMENTED`: explicitly stated in first-party docs/release notes.
- `CORROBORATED`: repeated across multiple first-party surfaces or aligned with public external evidence.
- `INFERRED`: engineering interpretation, not a claim about JackHamr internals.
- `UNKNOWN`: private behavior not established by public evidence.
- `CONFLICTED`: public sources differ or wording is ambiguous.

## Primary-source summary

The Reddit announcement presents JackHamr as a system for building an entire AI team, beginning with software development and extending to sales, SDR, finance, support and marketing. It claims the developer agent can handle implementation through deployment and that pricing is based on infrastructure usage rather than subscriptions or per-seat fees.

At the research snapshot, the supplied Reddit page exposed no substantive comments. No exact-post community feedback is invented. If comments accumulate, capture them separately from creator claims and separately from adjacent-market feedback.

## Timeline conflict

`CONFLICTED`: the 2026-10-04 Reddit post says the founders "finally launched" the product, but JackHamr's own release archive identifies a March 27, 2026 launch and lists feature releases throughout April-September 2026.

Interpretation: treat the Reddit post as a current announcement/relaunch/distribution event unless stronger first-party evidence establishes otherwise. Do not use it as proof that October 4 was the product's first availability date.

## Product decomposition

### 1. Agent identity and workforce model

`DOCUMENTED`

- Named agents with role/personality/skill identity.
- Agents can be shared across an organization.
- Agents can clone or fan work out.
- Agent-to-agent communication exists behind explicit trust.
- Specialist roles are used instead of one agent self-performing every stage.

Clean-room implication: preserve Agent Work OS actor identity and capability contracts; model specialization as explicit roles/capabilities rather than copied personas.

### 2. Persistent machine per agent

`DOCUMENTED`

JackHamr describes a persistent hosted machine per agent with a real filesystem and development tools. Public material mentions terminal, VS Code, browser, Docker, git, SSH access, configurable CPU/RAM/storage, persistence across tasks, pause/hibernate, snapshots and restore.

`UNKNOWN`

- VM vs container implementation.
- Hypervisor/orchestrator/provider.
- tenant isolation model.
- image layering/build system.
- network policy internals.
- secret injection implementation.
- snapshot backend.
- queue/scheduler internals.

Clean-room implication: create a provider-neutral runtime lifecycle and prove semantics using an independent fake/local provider before any real hosted provider.

### 3. Guided delivery workflow

`DOCUMENTED`

Public product surfaces repeatedly describe staged delivery:

`spec -> plan -> build -> test/QA -> code/product review -> ship`

Human approvals are inserted before or between sensitive stages; separate QA/reviewer agents inspect builder work.

Clean-room implication: Agent Work OS should treat workflow stages as independently executed state transitions, each producing evidence. The builder must never be the sole authority certifying its own completion.

### 4. Parallel board execution

`DOCUMENTED`

- Kanban-like board.
- ready cards are dispatched to agents/clones.
- multiple tasks can execute concurrently.
- cards move through workflow stages.
- agents can create and supervise cards.
- decisions requiring humans are queued rather than repeatedly interrupting the user.

Clean-room implication: project work items remain canonical; the board is a projection/execution controller, not a second task database.

### 5. Autonomous job ownership

`DOCUMENTED`

The September 29 autonomy release describes a different unit from a one-shot prompt:

- define a job;
- define prioritized goals;
- define how the agent should work with the human;
- agent drafts a plan;
- nothing executes before plan sign-off;
- agent checks in on a schedule;
- agent works through a prioritized backlog;
- approval-required actions pause and surface a decision;
- learned preferences can reduce repeated approval prompts;
- the plan evolves as tasks finish or dead ends are removed.

Clean-room implication: this is the most important net-new product contract for the Self Working Agent direction. It maps directly to a durable, restart-safe goal/plan/backlog/check-in state machine.

### 6. Memory and learning

`DOCUMENTED`

Public materials describe:

- learning notes after sessions;
- periodic/nightly merge into a wiki;
- reuse of that memory in later runs;
- clones inheriting learned context;
- preference corrections becoming reusable operating rules.

`UNKNOWN`

The exact summarization, ranking, retrieval, merge/conflict-resolution and prompt-injection defenses are not public.

Clean-room implication: do not introduce an opaque second memory system. Project memory should be a bounded projection over RE-297 provenance-bearing decision/handoff facts, with explicit source references and correction/supersession.

### 7. MCP / remote delegation

`DOCUMENTED`

Public MCP docs expose a remote Streamable HTTP endpoint with OAuth or bearer API-key access. Public permission groups are conceptually separated into:

- read;
- delegate;
- automate;
- machine;
- manage agents.

The public task flow is delegation -> wait/poll -> human question if needed -> continue -> return reply/files/artifacts/preview links.

Clean-room implication: reuse exact-intent approvals from RE-372, but add external-client authorization, workspace binding, permission scoping, revocation and audit receipts.

### 8. Connected applications

`DOCUMENTED`

Public releases advertise connected apps including Gmail, Google Calendar, Slack, Notion, Linear, HubSpot, Salesforce and others, with grants assigned per agent and denied by default.

`UNKNOWN`

Connector backend/provider, token vault, webhook infrastructure and full reliability semantics are private.

Clean-room implication: implement a small provider-neutral capability-grant registry before any connector breadth claim. One or two real connectors should be certified before a catalog is advertised.

### 9. Git/repository workflow

`DOCUMENTED`

Public materials describe GitHub connection, repo clone, task branches, commit synchronization, Docker Compose bring-up and pull-request workflows. JackHamr's own comparison pages acknowledge gaps relative to GitLab/Bitbucket.

Clean-room implication: use worktree/task isolation, exact SHA provenance and CI evidence gates already planned for Agent Work OS. Do not claim successful "ship" until hosted runtime/browser/deployment evidence exists.

### 10. Artifacts

`DOCUMENTED`

- per-agent artifact library;
- folders and search;
- inline preview for common formats;
- immutable previous versions/restore;
- trash retention;
- artifacts can be referenced from chat.

Clean-room implication: implement version lineage and retention semantics independently; artifacts should carry source/run/work-item provenance.

### 11. Cost and billing model

`DOCUMENTED`

Public pricing breaks cost into infrastructure resources plus LLM usage, and says paused compute stops CPU/RAM billing while persistent storage remains. Credits are used as a prepaid accounting unit.

Clean-room implication: first build a measured cost/usage ledger, not a payment system. It should record provider, unit, quantity, price source/version and exact run/task identifiers. Billing UX comes only after measurement is trustworthy.

### 12. Desktop/mobile shells

`DOCUMENTED`

Public download pages describe desktop packages and an Android test build. These shells wrap the same dashboard and depend on a network connection to hosted agents.

Clean-room implication: postpone native shells. The current responsive browser/PWA direction remains the correct first control surface until runtime/workflow semantics are stable.

## Existing Agent Work OS overlap

The donor should extend existing work rather than create duplicate subsystems.

| JackHamr pattern | Existing Agent Work OS foundation | Direction |
| --- | --- | --- |
| persistent agent/session | base daemon/control plane | extend to provider-neutral managed runtimes |
| governed human decisions | RE-244 / RE-372 | reuse exact-intent approvals |
| durable memory | RE-297 | add bounded learning projection, do not duplicate truth |
| multi-provider agents | RE-370 | reuse adapters/shared Brain boundary |
| operations visibility | RE-371 | add runtime/workflow/cost projections |
| shared multi-agent work | RE-372 | add job ownership and workflow execution |
| skills / agent studio | RE-374 | reuse published agent/skill definitions |
| lifecycle / hibernation | NodeTerm donor | generalize into machine provider state |
| organization hierarchy | RE-360 | reuse org/role/scheduling model |
| bounded harness | RE-359 | reuse capability/safety/receipt patterns |

## MATCH / IMPROVE / NEW / OMIT / UNKNOWN

### MATCH

- named role-specific agents;
- multi-agent coordination;
- human approvals;
- scheduled routines;
- persistent session state;
- memory/handoff capability;
- multi-provider model/runtime adapters;
- organization/operator surfaces;
- MCP-ready governed tool-call semantics.

### IMPROVE

- independent verification receipts at every quality gate;
- exact plan/action digests for approvals;
- restart reconciliation that never assumes success;
- default-deny external app/tool grants;
- bounded autonomous attempts/loops;
- measurable cost/latency/quality evidence;
- explicit distinction among code generated, tests passed, preview running, UAT passed and production certified.

### NEW

- managed-machine provider abstraction;
- hosted lifecycle with provision/start/ready/hibernate/restore/stop/error;
- autonomous-job contract with goals, signed plan, backlog and check-ins;
- independently executed board/workflow stages;
- external MCP delegation/auth service;
- versioned artifact library;
- compute/storage/network/model usage ledger;
- preview/publish receipt separate from production certification.

### OMIT INITIALLY

- branding/personas/marketing copy;
- 3D office UI;
- broad connector-count claims;
- payment/credit purchase flows;
- native package breadth.

### UNKNOWN

- cloud provider;
- scheduler/orchestrator internals;
- storage/database schema;
- private API contracts;
- secrets infrastructure;
- exact cost metering implementation;
- model router internals;
- memory merge algorithm;
- production SLOs/security certification.

## Proposed clean-room architecture

```text
Browser / Desktop later / MCP client
            |
            v
    Agent Work Control API
            |
   +--------+---------+----------------+----------------+
   |                  |                |                |
   v                  v                v                v
Identity/RBAC    Work + Workflow   Autonomy Engine   Artifact Store
   |                  |                |                |
   +------------------+--------+-------+----------------+
                             |
                             v
                     Approval/Policy Broker
                             |
                +------------+------------+
                |                         |
                v                         v
        Agent Runtime Router      Integration Router
                |                         |
       +--------+---------+          MCP / apps later
       |                  |
       v                  v
 Local daemon       Managed machine provider
       |                  |
       +--------+---------+
                |
        repo/worktree/browser
                |
                v
        Evidence + Usage Ledger
```

Design rule: the workflow engine never trusts an agent's self-reported success. Stage completion requires evidence from the relevant independent verifier or runtime adapter.

## Phase A — autonomous-job contract

Phase A should be additive on top of the RE-372 routines/work/approval foundation and expose no new external side effects.

### Data contracts

`autonomous-job/v1`

Suggested fields:

- `job_id`
- `workspace_id`
- `agent_id`
- `job_text`
- ordered `goals[]`
- `rules[]`
- `cadence`
- `status`
- `active_plan_id`
- `revision`
- created/updated actor/time metadata

`autonomous-plan/v1`

- `plan_id`
- `job_id`
- `job_revision`
- ordered work references/backlog projection
- recurring actions
- approval policy references
- plan digest
- approval actor/time/digest

`autonomous-checkin-receipt/v1`

- `receipt_id`
- `job_id`
- `plan_id`
- `checkin_key`
- leased work reference
- executor identity
- started/finished timestamps
- outcome state
- result/evidence digest
- approval references
- next-checkin timestamp
- redacted error classification

### State machine

```text
draft
  -> awaiting_plan_approval
  -> active
       -> waiting_approval
       -> active
       -> paused
       -> completed
       -> failed
```

Plan/job mutation after approval must invalidate the old approval unless the changed fields are provably outside the authorization scope.

### Execution constraints

- one active lease per job/check-in key;
- bounded work attempts;
- no infinite self-trigger loop;
- fake/echo executor only in Phase A;
- no network, Git mutation, deployment or external-app side effects;
- interrupted work requires reconciliation and cannot be promoted to success on restart;
- completed work requires verifier evidence rather than builder assertion;
- secrets are never included in receipts.

### Acceptance / negative tests

1. job cannot execute before a plan is approved;
2. changed job/goals invalidate the signed plan;
3. concurrent check-ins cannot both own the same lease;
4. duplicate/replayed check-in is idempotent or deterministically rejected;
5. human-gated action stops in `waiting_approval`;
6. approval digest mismatch fails closed;
7. expired/revoked approval cannot execute;
8. restart converts in-flight unknown state into interrupted/reconciliation state;
9. builder result without verifier evidence cannot complete the work item;
10. attempt budget prevents indefinite self-looping;
11. secret-like fields/values are refused from durable receipt payloads;
12. Phase A exposes no external-effect executor path.

## Phase B — managed machine provider

Add a provider-neutral lifecycle contract after Phase A is green.

Suggested states:

```text
requested -> provisioning -> ready -> running
                                |        |
                                v        v
                            hibernating hibernating
                                |        |
                                v        v
                            hibernated -> restoring -> ready
                                |
                                v
                              stopped

any active state -> error
```

Required evidence:

- runtime/provider ID;
- workspace/agent binding;
- image/config digest;
- capacity profile;
- network policy class;
- created/ready/stop timestamps;
- health evidence;
- snapshot/restore lineage;
- measured usage records;
- restart/reconciliation state.

Begin with an in-memory/fake provider. A real cloud provider comes only after deterministic lifecycle tests pass.

## Phase C — workflow engine

- explicit versioned workflow definition;
- stage executor role/capability;
- entry/exit conditions;
- approval gates;
- stage evidence contract;
- failure/rework loop;
- deterministic restart/recovery;
- board as projection/control surface over canonical work.

Initial workflow:

`spec -> plan -> build -> QA -> code review -> product review -> release candidate`

Release candidate is not production.

## Phase D — MCP / external delegation

- OAuth and API-key principals;
- workspace binding;
- permission scopes;
- token/key revocation;
- exact-client/actor provenance;
- read/delegate/automate/machine/manage separation;
- no cross-workspace access;
- external client cannot answer a human approval automatically;
- audit receipts for every mutating delegation.

## Phase E — artifacts + bounded memory projection

Artifacts:

- immutable versions;
- folder/search projection;
- restore creates a new current version rather than destructive overwrite;
- retention/trash policy;
- run/work-item/source provenance.

Memory projection:

- session notes cite source decisions/work receipts;
- periodic merge is deterministic and reversible;
- superseded facts remain traceable;
- user corrections win over stale inferred preferences;
- untrusted external content stays marked untrusted.

## Phase F — Git/worktree/browser/preview

- isolated worktree per mutating task;
- exact branch/base/SHA lineage;
- PR creation/update contracts;
- CI collection;
- browser/runtime verification;
- preview URL evidence;
- deployment receipt with target/env/version;
- no production certification from URL existence alone.

## Phase G — hosted certification

Required before production-readiness claims:

- real hosted runtime;
- exact-head CI;
- crash/restart reconciliation;
- isolation/security negative tests;
- spend/quota enforcement;
- concurrency/fairness evidence;
- secrets leakage scans;
- real browser/device UAT;
- preview acceptance;
- production canary/smokes;
- post-deploy runtime error scan;
- auditable rollback.

## Product differentiator

The intended product is not "JackHamr but ours." It is **governed autonomous work with proof**:

- local and cloud runtimes share the same contracts;
- every autonomous transition has an authorization/evidence receipt;
- memory is provenance bearing;
- cost claims are measured;
- deployment state is distinguished from verification state;
- humans are interrupted only at explicit decision gates;
- restart never silently upgrades uncertainty into success.

## Explicit non-claims

This dossier does not establish:

- JackHamr implementation internals;
- JackHamr parity;
- hosted machines in Agent Work OS;
- live MCP server support in Agent Work OS;
- connector catalog parity;
- billing/credits;
- browser/device certification;
- hosted deployment;
- production readiness.

The next repository action after this research PR is accepted is the bounded Phase A autonomous-job domain implementation and deterministic negative tests.
