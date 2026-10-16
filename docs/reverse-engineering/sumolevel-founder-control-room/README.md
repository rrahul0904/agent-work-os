# Founder Control Room — clean-room reverse engineering record

## Purpose

This vertical slice explores a governed "AI business partner" / founder operating system inside Agent Work OS. It is inspired only by publicly observable product behavior and public marketing claims associated with SumoLevel and the linked Reddit discussion. It is not a source-code clone, brand clone, asset copy, or attempt to reproduce non-public implementation details.

Agent Work OS remains the authority for identity, authorization, policy, execution, evidence, replay, and shipping. Reverse-engineering providers such as REA may gather and structure evidence, but they do not decide what is safe to execute or what counts as verified completion.

## Public evidence captured

Observed from public pages and the linked Reddit thread:

- positioning as an AI business partner / co-founder rather than a single chat surface;
- guided launch flows for several online-business models;
- lead discovery and buyer-signal concepts;
- a multi-perspective "council" decision-support pattern;
- persistent business context / knowledge;
- tool and CRM integrations;
- API / MCP-oriented interoperability;
- progress / boards / content / notes concepts;
- advisor-style assistance that can use the user's current working context;
- a credit-metered subscription model.

These observations are treated as capability evidence, not proof of the target's private architecture, quality, reliability, or implementation.

## Clean-room boundary

The implementation MUST NOT copy or depend on:

- target source code, private endpoints, authenticated traffic, database schemas, prompts, model routing logic, or proprietary datasets;
- target trademarks, logos, screenshots, marketing copy, visual identity, or pixel-level layouts;
- private user data or access obtained by bypassing authentication;
- a claim that an observed marketing capability is technically verified when only marketing evidence exists.

The implementation MAY independently build generic capabilities that are common product ideas: business planning, opportunity scoring, model/provider routing, connector registries, approval policies, work queues, evidence receipts, and progress tracking.

## Product thesis

The useful product is not "another AI chat." It is a **Founder Control Room** that repeatedly runs this loop:

1. observe business context and external signals;
2. recommend the next highest-leverage action;
3. bind that action to a canonical WorkItem;
4. evaluate policy and required approvals;
5. execute through a permitted capability/provider;
6. capture evidence and a verification receipt;
7. update business memory, metrics, and the next recommendation.

That makes the product sellable as an operating layer across a founder's existing stack instead of a replacement CRM.

## Capability decomposition

| Capability | Public evidence | Clean-room implementation status | Agent Work OS owner |
|---|---|---|---|
| Founder dashboard / next actions | observed | MVP UI implemented | web/operator surface |
| Guided launch plan | observed | deterministic MVP implemented | planner + WorkItems next |
| Buyer signals | observed | representative scored feed implemented | signal adapters next |
| AI Council | observed | deterministic multi-role MVP implemented | provider router next |
| Persistent business context | observed | browser-local MVP only | durable business context next |
| Knowledge / notes | observed | represented in capability graph | knowledge service next |
| Connectors / API / MCP | observed | capability graph + policy states | connector registry next |
| Governed external actions | improvement | action queue + local receipts MVP | policy / execution authority |
| Evidence ledger | Agent Work OS differentiator | local MVP + existing server receipts | evidence ledger |
| Screen-aware advisor | observed | not implemented | desktop/browser context adapter later |
| Billing / credits | observed | not implemented | entitlement/billing service later |

## Architecture

```text
Public / connected evidence
        |
        v
+--------------------+       +-----------------------+
| Signal adapters    | ----> | Founder context store |
+--------------------+       +-----------------------+
        |                         |
        +------------+------------+
                     v
              +--------------+
              | Planner      |
              | / Recommender|
              +--------------+
                     |
                     v
              +--------------+       +------------------+
              | Canonical    | ----> | Policy / approval|
              | WorkItem     |       | engine           |
              +--------------+       +------------------+
                     |                         |
                     +-----------+-------------+
                                 v
                    +---------------------------+
                    | Capability / provider     |
                    | router                    |
                    +---------------------------+
                       |        |        |
                       v        v        v
                    Models    MCP     Local daemon
                       \        |        /
                        +-------+-------+
                                v
                       +----------------+
                       | Result verifier|
                       +----------------+
                                |
                                v
                       +----------------+
                       | Evidence ledger|
                       | + receipt      |
                       +----------------+
                                |
                                v
                         Context + KPIs
```

### Authority rules

- REA and other reverse-engineering sources are evidence providers only.
- The planner can recommend; it cannot bypass policy.
- Read-only research can be auto-allowed when policy permits.
- External writes (outreach, publishing, CRM mutation, money movement, production deploy) default to explicit scope and/or approval.
- A task is not "done" because a model said it is done. Completion requires configured verification evidence.
- Provider identity must remain replaceable. Product state cannot depend on one model vendor.

## Phase plan

### Phase 0 — evidence + vertical slice (this branch)

- clean-room evidence record;
- original responsive Founder Control Room UI;
- guided launch-plan generator;
- representative buyer-signal ranking;
- deterministic five-perspective council;
- capability graph;
- governed action queue;
- local verification-receipt ledger;
- deployment smoke test.

### Phase 1 — canonical business domain

Add `BusinessProfile`, `Goal`, `Opportunity`, `Signal`, `Decision`, `ActionProposal`, and `Outcome` domain objects. Actions that can execute become canonical WorkItems and use optimistic concurrency + idempotent commands.

Acceptance: durable create/read/update flows, transition events, restart persistence, organization isolation, and tests for stale/idempotent writes.

### Phase 2 — provider-agnostic intelligence

Add an advisor/council interface over pluggable model providers. Persist the question, provider/model metadata, evidence references, costs, and the synthesized verdict. Do not persist provider-specific reasoning internals as business truth.

Acceptance: provider fallback, deterministic test adapter, budget limits, timeout behavior, and provenance per response.

### Phase 3 — opportunity and signal engine

Add read-only adapters for public web/community sources and connected business systems. Normalize signals into an evidence-backed schema with source, timestamp, confidence, match rationale, and deduplication key.

Acceptance: repeatable ingestion, dedupe, source links, scoring tests, expiry rules, and no autonomous outbound writes.

### Phase 4 — capability registry and governed execution

Register MCP, API, and local-daemon capabilities with scopes such as read, draft, write, publish, deploy, and money movement. Route every proposed action through policy before execution.

Acceptance: deny-by-default for unknown capabilities, approval receipts, replay safety, provider timeouts, retries, and audit events.

### Phase 5 — business memory and progress

Persist structured business facts, decisions, experiments, outcomes, tasks, metrics, and knowledge references. Recommendations must identify the facts/evidence they used.

Acceptance: history survives restart, conflicting facts are versioned, recommendations expose provenance, and stale context can be expired.

### Phase 6 — sellable SaaS boundary

Add production authentication, organizations/RBAC, billing/entitlements, quotas, metering, export/delete, observability, rate limiting, abuse controls, and tenant isolation. Add free, solo/pro, and enterprise policies without coupling product logic to a specific billing provider.

Acceptance: multi-tenant authorization tests, billing lifecycle tests, quota enforcement, audit export, backup/restore, security review, and production readiness receipt.

### Phase 7 — advisor surfaces

Only after the underlying authority model is mature, add browser/desktop context adapters and mobile/PWA controls. Context capture must be explicit, scoped, inspectable, and revocable.

## Phase-0 definition of done

A Phase-0 deployment is acceptable when:

1. the page renders without third-party runtime dependencies;
2. mobile and desktop layouts remain usable;
3. launch-plan generation works and persists locally;
4. council output is generated from an explicit user decision;
5. governed actions distinguish auto, approval, and blocked capability states;
6. a successful demo action creates a receipt in the local ledger;
7. no target branding or copied assets appear in the implementation;
8. the feature ships from an isolated branch and preview deployment before any production promotion.

## Product differentiation to carry forward

The target pattern is useful, but the enterprise-grade opportunity is stronger when the product can answer four questions for every autonomous action:

- **Why this action?** Evidence and expected outcome.
- **Who authorized it?** Policy and human approval when required.
- **What actually happened?** Provider/tool response and verifier output.
- **Can we reproduce or undo it safely?** Idempotency, replay information, and compensation/rollback path.

That governed action loop is the core advantage Agent Work OS should preserve as Founder Control Room grows beyond the Phase-0 UI.
