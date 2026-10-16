# Awesome AI Agent Stack → Agent Ecosystem Intelligence

**Snapshot:** 2026-10-12  
**Coordination issue:** #147  
**Source:** https://www.reddit.com/r/coolgithubprojects/s/IIc4m8Zt7r  
**Canonical upstream:** https://github.com/tayyabimam1/awesome-ai-agent-stack  
**Inspected upstream head:** `14e54d4af57b299452d5c9cc28fa707e790677bf`  
**License:** CC BY 4.0

## Executive decision

Do **not** clone this project as another awesome-list.

The donor's strategic value is its combination of:

- a layered taxonomy of the agent stack;
- continuously refreshed discovery;
- freshness/archive/fork eligibility checks;
- review-before-adoption rather than silent list mutation;
- generated search/navigation from a canonical source;
- a bounded AI review path.

Agent Work OS should absorb those ideas as a **governed Agent Ecosystem Intelligence + Component Selector**.

The owned flow is:

> discover → fingerprint → normalize → enrich evidence → classify → score → compare → recommend → approve → pin exact version → controlled onboarding → drift watch → evidence receipt

A recommendation is advisory evidence. It is never installation, execution, provider-write, Git, merge, deployment or secret authority.

## Source truth

The supplied Reddit post describes a curated map of more than 3,300 open-source AI-agent tools across 32 categories, with an updater that scans for trending repositories on a five-hour cadence and surfaces new candidates for review.

The inspected repository confirms a deliberately small implementation:

1. `README.md` is the catalog source of truth.
2. `scripts/find_trending.py` gathers candidate repositories from multiple public trend/discovery sources.
3. Candidate filtering uses GitHub metadata and simple policy gates.
4. `.github/workflows/trending.yml` runs the discovery job every five hours and opens a review issue when candidates exist.
5. `scripts/pr_review.py` posts a bounded LLM review comment for pull requests.
6. `scripts/build_site.py` parses the README plus `site-data/stars.json` into generated site data.
7. `web/` is a Vite + React + TypeScript front end deployed to GitHub Pages.

The donor maintainer documentation explicitly states that the repo has no automated tests and that the static `site-data/stars.json` file has no updater in the repository.

## Reconstructed architecture

```text
                    ┌──────────────────────────────┐
                    │ public discovery sources     │
                    │ Trending / feeds / newsletters│
                    └──────────────┬───────────────┘
                                   │
                                   v
                    ┌──────────────────────────────┐
                    │ scripts/find_trending.py     │
                    │ collect + dedupe + filters   │
                    └──────────────┬───────────────┘
                                   │
                                   v
                    ┌──────────────────────────────┐
                    │ GitHub issue review queue    │
                    │ human curation boundary      │
                    └──────────────┬───────────────┘
                                   │ accepted edits
                                   v
                    ┌──────────────────────────────┐
                    │ README.md                    │
                    │ canonical taxonomy/catalog  │
                    └──────────────┬───────────────┘
                                   │
                  stars.json ──────┤
                                   v
                    ┌──────────────────────────────┐
                    │ scripts/build_site.py        │
                    │ Markdown → JSON projection   │
                    └──────────────┬───────────────┘
                                   │
                                   v
                    ┌──────────────────────────────┐
                    │ Vite/React searchable site  │
                    │ tiers / layers / ranking     │
                    └──────────────────────────────┘
```

A parallel PR path runs an AI review comment with a small monthly budget guard. The diff is deliberately framed as untrusted data rather than model instructions.

## Discovery pipeline

`find_trending.py` currently performs four useful jobs:

### 1. Candidate collection

It gathers repository references from multiple public sources, including GitHub Trending, Trendshift, a star-history newsletter feed and an open-source-project feed.

### 2. Deduplication

It excludes repositories already present in the README and repositories already surfaced in historical review issues.

### 3. Metadata enrichment

It queries GitHub GraphQL for:

- name/owner;
- description;
- star count;
- archived state;
- fork state;
- last push timestamp;
- repository topics.

### 4. Basic eligibility

New candidates must satisfy a simple bar:

- at least 1,000 stars;
- not archived;
- not a fork;
- pushed within the prior 12 months;
- AI-related by description/topic keyword match.

The script emits a Markdown checklist. It does not automatically edit the catalog.

### Transferable lesson

Discovery automation should be allowed to create **candidate evidence**, but adoption should be a separately authorized decision.

That maps directly to Agent Work OS's existing authority model.

## Taxonomy and site model

`build_site.py` organizes the catalog into seven high-level tiers:

1. How you build
2. What you build with
3. What agents act on
4. Where tokens come from
5. How you ship
6. Ready-made agents
7. Further reading

The generated site supports category/layer browsing, star ordering, curated ordering, global search, keyboard command-palette access and per-category pages.

This is useful as a **human navigation model**, but it is not yet a machine-usable capability graph.

## PR review pattern

The donor's PR reviewer has several patterns worth preserving conceptually:

- model backend is replaceable;
- review is comments-only;
- drafts and bots are skipped;
- one automated review per PR;
- monthly budget guard;
- bounded diff size;
- diff content is explicitly treated as data, not instructions;
- code/workflow changes are checked for destructive behavior and secret leakage.

We should retain the separation between **analysis/recommendation** and **authority/effect**.

## Public feedback captured

The visible Reddit thread contains one useful product signal: a commenter argued that the auto-refresh bot should be more prominent because the repository's short About text makes the project look like another static awesome-list. The maintainer also confirmed that archived/stale links are intended to be filtered or pruned.

Product implication for us:

> freshness and evidence provenance are first-class product value, not implementation details hidden behind the catalog UI.

## Where the donor is strong

### Strong pattern: simple source of truth

The README-as-database model makes contribution and review easy.

### Strong pattern: human gate

Discovery does not directly mutate the canonical catalog.

### Strong pattern: understandable taxonomy

The stack layers are intuitive to practitioners.

### Strong pattern: low-cost automation

Python standard-library scripts plus GitHub Actions keep operations simple.

### Strong pattern: generated searchable surface

A canonical source projects into a human-friendly browser experience.

## Where the donor is insufficient for Agent Work OS

### 1. Stars are not a component-quality model

Popularity can be one weak signal. It cannot answer whether a component is safe, compatible, maintained, affordable or appropriate for a concrete workload.

### 2. No capability graph

Categories do not express typed capabilities, protocols, runtime requirements, effects, provider dependencies or compatibility edges.

### 3. No evidence separation

The catalog description, star count and category do not distinguish observed facts from derived claims or recommendation scores.

### 4. No license/commercial-use policy engine

The list has a license itself, but does not make a candidate's license posture part of adoption policy.

### 5. No dependency/supply-chain risk model

There is no CVE, maintainer, release, package-signing, provenance, dependency or secret-risk evidence.

### 6. No reproducible adoption pin

A list item points at a repository, not a certified exact commit/release/runtime combination.

### 7. No benchmark evidence

There is no deterministic task corpus or runtime evaluation proving that a tool works for the user's intended workload.

### 8. No cost/resource model

GPU/CPU/RAM/storage/API/provider requirements are not represented.

### 9. No integration-fit scoring

The donor cannot answer questions like:

- Which memory systems fit our local-first, restart-safe agent runtime?
- Which MCP servers are compatible with our effect-policy model?
- Which sandboxes can satisfy a no-unrestricted-network constraint?
- Which coding harnesses can produce exact-revision receipts?

### 10. No drift management after adoption

Archive events, license changes, major-version changes, security advisories or project abandonment do not flow into an owned replacement decision.

## Owned product: Agent Ecosystem Intelligence

### Product job

Given a task/capability need and policy constraints, return a ranked set of **evidence-backed candidate components** with explicit reasons, unknowns, refusals and exact-source pins.

### Canonical architecture

```text
Discovery adapters
    │
    v
Candidate Inbox
    │
    v
Identity + Deduplication
    │
    v
Evidence Enrichment
(GitHub / release / license / security / benchmark / protocol)
    │
    v
Canonical Component Registry
    │
    ├──────────────> Drift Watch
    │                  │
    │                  v
    │             advisory events
    │
    v
Policy-aware Scoring
    │
    v
Task-profile Matcher
    │
    v
Recommendation Receipt
    │
    v
Human / governed approval
    │
    v
Existing Agent Work OS capability onboarding + effect authority
```

## Phase-A contracts

### `ecosystem-component/v1`

Minimum fields:

- canonical repository identity;
- source URL;
- exact commit/release pin;
- observed push timestamp;
- stars/popularity signal;
- archive/fork state;
- license identifier;
- typed capability labels;
- evidence references;
- observation timestamp/source.

### `ecosystem-evaluation/v1`

Facts and derived scoring must be separate.

Dimensions in the initial policy:

- freshness;
- popularity signal;
- maintenance signal;
- license posture;
- integration fit;
- evidence completeness.

Missing evidence is represented as unknown, never silently converted into a positive score.

### `ecosystem-recommendation/v1`

Receipt must include:

- task profile;
- ranked candidates;
- refused candidates and reasons;
- duplicate identities;
- scoring-policy version/digest;
- catalog-snapshot digest;
- exact candidate revision pins;
- explicit `noInstallAuthority=true`;
- explicit `noExecutionAuthority=true`;
- deterministic receipt digest.

## Phase-A refusal conditions

The scorer/referrer must fail closed for policy-bound conditions including:

- archived repository;
- fork when forks are disallowed;
- stale repository;
- missing exact revision when pinning is required;
- unknown license when known license is required;
- disallowed license;
- missing required capability;
- malformed/non-GitHub identity in the Phase-A GitHub-only lane.

## Product UX

### Ecosystem Radar

Shows discovered components and evidence freshness without implying adoption.

### Compare

Select 2–5 candidates and compare facts, scores, unknowns, policy refusals and benchmark receipts.

### Ask the stack

Examples:

- "Find a local-first memory system compatible with Node and SQLite."
- "Which browser-control stack can run without unrestricted outbound network?"
- "Recommend an MCP gateway with audit receipts and explicit allowlists."

The answer must be grounded in catalog evidence and carry the scoring-policy/catalog digests.

### Adopt proposal

Creates a proposal for the existing capability registry / Agent Studio. It does not install by itself.

### Drift watch

After adoption, monitor for:

- archived repository;
- extended inactivity;
- new major release;
- license change;
- security advisory;
- replacement candidate with materially stronger evidence.

## Integration with existing Agent Work OS capabilities

### Agent Studio

Use intelligence recommendations when selecting capabilities for published agent definitions.

### Reverse Engineering

When a donor or dependency is discovered, pre-populate source evidence and alternatives.

### Shipping OS

Use the registry to validate exact-version and evidence completeness before a component is promoted into a shipping lane.

### Capability registry

Store only approved/pinned components there. Discovery candidates remain outside execution authority.

### Work Memory / Evidence

Retain recommendation receipts, policy digests, benchmark outputs and adoption decisions.

## Security and governance boundaries

1. Discovery/enrichment is separate from installation/execution.
2. No raw secrets in component records or recommendation receipts.
3. No shell, package-manager, container, Git, provider or deployment authority in Phase A.
4. Network adapters must be explicit bounded providers in later phases.
5. Recommendation output cannot mint a tool-execution grant.
6. Component identity is canonicalized and deduplicated before scoring.
7. Exact revisions/releases are required before adoption when policy says so.
8. Unknown evidence stays unknown.
9. Scores are derived from a versioned policy and are reproducible.
10. Effectful onboarding reuses existing Agent Work OS approval/grant paths.

## Clean-room / license posture

The donor is CC BY 4.0, but this work intentionally does not copy its README corpus, UI, branding, taxonomy text, scripts or generated data.

We are using the public project as a capability donor and independently implementing:

- our own data contracts;
- our own scoring policy;
- our own recommendation receipts;
- our own integration semantics;
- our own future UI.

The donor remains cited as research provenance.

## MATCH / IMPROVE / NEW / OMIT

### MATCH

- continuous discovery;
- dedupe;
- stale/archive/fork checks;
- layered capability taxonomy concept;
- review-before-adoption;
- searchable human surface.

### IMPROVE

- static list → evidence-backed registry;
- stars-first ranking → multi-dimensional policy-aware scoring;
- repo link → exact-version pin;
- category → typed capability graph;
- human checklist → deterministic recommendation receipt;
- one-time freshness → post-adoption drift watch.

### NEW

- compatibility graph;
- license policy;
- security/supply-chain evidence;
- benchmark/eval evidence;
- resource/cost evidence;
- task-profile matching;
- Agent Studio adoption proposal;
- approval-bound onboarding;
- replacement/drift recommendations.

### OMIT

- copying the donor's catalog corpus;
- creating a competing awesome-list;
- using stars as the primary quality decision;
- automatic install/merge/deploy from discovery;
- claiming ecosystem completeness.

## Roadmap

### P0 — source/evidence/reconstruction

Status: **done first pass**.

### P1 — Phase-A contracts + deterministic core

Deliver:

- canonical GitHub identity;
- deterministic policy/catalog/receipt digests;
- eligibility engine;
- evidence-aware scoring;
- required-capability matcher;
- recommendation receipt;
- authored fixtures/tests.

### P2 — GitHub enrichment adapter

Add bounded metadata retrieval with persisted observation evidence and rate-limit semantics.

### P3 — license + security + release evidence

Introduce provider adapters; keep each evidence family separately attributable and staleable.

### P4 — benchmark/evaluation evidence

Task-specific fixture suites with exact environment/version receipts.

### P5 — compare/radar UI

Human review surface with no effect authority.

### P6 — Agent Studio adoption proposal

Translate an approved candidate into an exact-version capability onboarding proposal.

### P7 — governed installation/integration

Reuse existing approval/effect paths. Add rollback and cleanup receipts.

### P8 — drift/replacement intelligence

Continuously re-evaluate adopted components against the active policy and alternatives.

## Verification ladder

A component intelligence release is not SHIPPED until the relevant layer has:

1. deterministic unit tests;
2. exact-head CI evidence;
3. source/evidence provenance;
4. policy-digest reproducibility;
5. negative/refusal coverage;
6. runtime adapter tests for each external enrichment provider;
7. browser/operator UAT for the compare/radar UI;
8. exact-version onboarding/rollback proof before any integration claim;
9. hosted evidence only when a hosted surface actually exists.

## Current truth

`SOURCE=done / EVIDENCE=done-first-pass / RECONSTRUCTION=done-first-pass / PRODUCT_THESIS=done / SPECIFICATION=done-first-pass / PHASE_A_CORE=building / PROVIDER_ENRICHMENT=not-started / UI=not-started / ONBOARDING=not-started / DEPLOYMENT=none`

No donor parity, ecosystem completeness, installation automation, runtime-provider certification, browser UAT, hosted deployment or production-readiness claim is made by this dossier.
