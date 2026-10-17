# Shapeshifting Software donor → Adaptive Application Runtime

Status: **SPECIFIED / SHIPPING-CONTRACT-READY / BLOCKED_WIP**  
Coordination issue: **#105**  
Tracker ID: **pending canonical reconciliation**  
Primary user source: https://www.reddit.com/r/AgentsOfAI/s/czkopTsghz

## 1. Decision

Treat `TriptoAfsin/shape-shifter` as a **capability donor** for Agent Work OS, not as a standalone product to clone.

Working owned capability: **Adaptive Application Runtime**.

The donor's useful pattern is a running application with a protected core and a mutable, declarative, versioned shape that can be proposed from natural-language intent and accepted only by deterministic policy/guard code.

Agent Work OS should absorb that pattern into its existing operator surfaces, work truth, approval system and Shipping OS evidence model. It must not create another task database, authorization system, autonomous execution path or runtime code-generation platform.

## 2. Source manifest

### Primary launch

- Reddit: https://www.reddit.com/r/AgentsOfAI/comments/1x2f6ef/shapeshifting_software_exploring_an_ainative/
- Original shared URL: https://www.reddit.com/r/AgentsOfAI/s/czkopTsghz

### Canonical public donor

- Repository: https://github.com/TriptoAfsin/shape-shifter
- Exact inspected `main` head: `21bbe26a2d7f57ed906e5b794bf78e102c6fc990`
- Snapshot date: 2026-10-10
- License: CC BY 4.0

### Public artifacts inspected

- `README.md`
- `ARCHITECTURE.md`
- demo tree under `demo/`
- current upstream roadmap
- supplied Reddit comments

Observed demo structure at the pinned head includes `demo/src/core`, `engine.js`, `pipeline`, `server.js`, `shape`, and `demo/test`.

## 3. Evidence classification

### Observed/documented donor behavior

The donor defines a running app whose UI, data views, workflows and selected configurable behavior may change from natural-language intent while domain semantics, authorization, audit and security boundaries remain core-owned.

The public architecture follows:

`intent -> brain/harness -> proposal -> deterministic guard -> preview -> apply version -> observe/rollback -> renderer/runtime`

Core donor principles:

1. the AI proposes; deterministic code decides;
2. mutable behavior is declarative data rather than runtime source code;
3. reshapeable paths are explicitly allowlisted;
4. redaction/authorization occur before rendering;
5. ambiguity causes clarification, not a guess;
6. accepted changes are versioned rather than mutated invisibly;
7. personal scope is the default and wider scope requires wider authority;
8. model/harness is replaceable and has no direct authority.

The donor's zero-dependency CRM demo uses a rule-based deterministic brain as a stand-in for a future model-backed planner and includes guardrail tests.

### Upstream open work

At the pinned snapshot the upstream roadmap still leaves these important areas open:

- model-backed brain + eval set;
- team scope and two-person org approval;
- automations as a reshapeable surface;
- migration policy for in-flight records.

These are not treated as solved behavior.

## 4. Supplied-thread feedback audit

The highest-value comment says to **separate changing the view from changing the underlying job**.

That critique is correct and materially changes our reconstruction. A dashboard reorder/filter is side-effect-free presentation state. A reminder may contact a real customer. Rolling back a configuration version cannot retract an already-sent message or reverse another external effect.

Owned requirement:

> Presentation/config adaptation and effectful automation use separate contracts, authority paths, receipts and recovery semantics.

A shape rollback may restore declarative application state. It must never imply that an external effect was undone.

A second comment points to **Agentic UIs** as an adjacent category. We use this as a comparator direction, not as proof of novelty or equivalence.

## 5. Competitive / research context

### A2UI

Google's A2UI is a declarative, framework-agnostic format for agent-driven UI. Its strongest relevant idea is separating agent-specified UI intent from host-native rendering through a trusted component catalog.

Transferable lesson: **an agent should select/compose trusted host capabilities, not inject arbitrary HTML/JS as authority.**

Difference from our target: A2UI primarily standardizes agent-to-UI representation. Adaptive Application Runtime also needs persistent versions, scoped authority, stale-base handling, data-access invariants, approval and eventually effect execution receipts.

### Generative UI / adaptive generative interfaces

Current Google Research work demonstrates runtime interfaces synthesized or adapted to user intent. This validates the broader product category, but also means "AI changes the UI" alone is not a sufficient differentiator.

Our owned wedge is **governed persistent adaptation with evidence and explicit separation between reversible shape state and real-world effects**.

### Classical self-adaptive systems

MAPE-K and self-adaptive-system research provide prior art for monitor/analyze/plan/execute loops. The distinctive product problem here is not the existence of adaptation; it is user-driven natural-language adaptation inside a live multi-user application with permissions, persistent state and business consequences.

## 6. License / clean-room boundary

The donor is CC BY 4.0. CC BY is common for content and unusual as a software-code license, so this project uses a conservative clean-room posture:

- public architecture, docs and source are evidence and conceptual donors;
- Agent Work OS contracts, tests and implementation are independently authored;
- conceptual provenance/attribution is retained in this dossier;
- do not copy donor branding, assets, prose, schemas, tests, skill text, fixtures or implementation structure;
- if direct code reuse is ever proposed, stop and perform a separate licensing review before reuse.

No donor parity is intended.

## 7. Internal dedupe / canonical placement

Canonical destination: `rrahul0904/agent-work-os`.

Relevant owned capabilities to reuse:

- Project Desk / Work Queue — authoritative work/decision truth;
- governed exact-intent approval patterns — authority;
- RE-387 Flow/run-state — workflow execution truth;
- Work Memory / context handoffs — durable context;
- Agent Workbench/operator surfaces — presentation host;
- provider-neutral Brain/harness work — model boundary;
- Shipping OS — exact-SHA verification and release truth.

Do not create:

- a second authoritative work database;
- a second generic workflow engine;
- a new authorization model;
- a standalone app builder;
- a model-to-shell/network escape path.

## 8. Owned product thesis

Canonical flow:

`natural-language intent`
` -> classify presentation | effectful | mixed | ambiguous`
` -> typed proposal`
` -> deterministic authority/policy/surface guard`
` -> preview + exact diff`
` -> confirmation / approval`
` -> shape version OR separately granted effect execution`
` -> observed result + immutable receipts`
` -> shape rollback OR effect compensation/manual recovery truth`

Core rule:

**The model may propose. The deterministic runtime owns authority. A proposal, preview, plan or model confidence never implies execution permission.**

## 9. MATCH / IMPROVE / NEW / OMIT

### MATCH

- natural-language adaptation of an existing app;
- declarative mutable layer;
- explicit reshapeable allowlist;
- deterministic guard outside the model;
- personal/team/org scope concepts;
- preview before commit;
- immutable/versioned history;
- shape rollback;
- clarification instead of guessing;
- authorization/redaction before render;
- replaceable non-authoritative brain.

### IMPROVE

- classify every intent before proposal/apply;
- never mix side-effect-free presentation state with external effects under one rollback model;
- bind proposals/approvals to exact shape, policy and vocabulary digests;
- stale base or changed policy invalidates old confirmation;
- unknown impact/field/capability remains unknown;
- scope escalation raises approval requirements;
- renderer may hide but never reveal new data authority;
- structural workflow changes require an explicit in-flight migration policy;
- effect execution later uses idempotency, postcondition checks and durable receipts;
- external effects distinguish `rollback`, `compensation`, `irreversible`, and `manual_recovery`;
- independent runtime/verifier evidence is separate from the brain's own judgment;
- model planner quality gets an eval corpus for correct patch, clarification and refusal.

### NEW

- `adaptive-intent/v1`
- `adaptive-shape/v1`
- `adaptive-shape-patch/v1`
- `adaptive-shape-preview/v1`
- `adaptive-shape-version/v1`
- later `adaptive-effect-plan/v1`
- later `adaptive-effect-grant/v1`
- later `adaptive-effect-receipt/v1`
- later `adaptive-migration-plan/v1`

### OMIT / DEFER

- donor branding/assets/trade dress/source/test/skill reuse;
- arbitrary runtime source-code generation;
- arbitrary SQL/shell/URLs/webhooks inside shapes;
- permission/domain-schema/auth/security mutation from natural language;
- effectful automation in Phase A;
- autonomous org-wide mutation;
- production claims from the donor demo;
- standalone competing builder/IDE.

## 10. Phase A — side-effect-free shape contract

Phase A is intentionally narrow: **presentation/read-model adaptation only**.

No network call, provider write, external action, database mutation, Git mutation or deployment is in scope.

### `AdaptiveIntent`

Required facts:

- actor/project/work/surface identity;
- bounded natural-language request for audit;
- classified kind: `presentation | effectful | mixed | ambiguous`;
- requested scope: `personal | team | org`;
- current shape revision/digest;
- current policy/vocabulary revision/digest;
- protected constraints;
- canonical intent digest.

Phase A accepts only `presentation`. `effectful`, `mixed` and unresolved `ambiguous` inputs fail closed with typed reasons.

### `AdaptiveShape`

A pure declarative document that references core-owned vocabulary only.

Phase-A mutable classes:

- layout/order;
- visible columns/fields already readable by the actor;
- filters;
- sort/grouping;
- named KPI/card selection;
- named chart/view selection;
- display-density/presentation preferences.

Forbidden content includes executable code, SQL, URLs, webhooks, secrets, network destinations, new formulas/metrics, new domain fields, permissions and domain-semantic changes.

### `AdaptiveShapePatch`

- exact allowlisted operations/paths only;
- known typed values only;
- binds exact base-shape digest;
- binds exact policy/vocabulary digest;
- includes scope and human-readable summary;
- no execution/persistence authority;
- deterministic patch digest.

### Guard order

1. intent-kind gate;
2. actor/scope authority;
3. base/policy/vocabulary freshness;
4. op/path allowlist;
5. apply to a copy;
6. schema validation;
7. read-permission/data-access check;
8. core-invariant validation;
9. candidate digest;
10. preview generation.

### `AdaptiveShapePreview`

Carries:

- actor/scope/base/patch/candidate digests;
- machine-readable changed paths;
- deterministic plain-language diff source facts;
- `data_access_delta` which must be `none` or narrower;
- warnings/unknowns;
- confirmation requirement and expiry.

Preview never persists a change.

### `AdaptiveShapeVersion`

A confirmed accepted patch creates an immutable version bound to:

- previous version/digest;
- accepted patch/preview digest;
- actor/scope;
- policy/vocabulary revision;
- confirmation identity;
- resulting shape digest;
- durable order/timestamp identity.

Rollback creates another explicit version/result; history is not rewritten.

## 11. Phase A negative / recovery matrix

Must prove:

- `effectful` intent is refused;
- `mixed` intent is not partially reported as full success;
- ambiguous intent is clarified/refused rather than guessed;
- URL/webhook/code/query/credential/executable payload is rejected;
- non-allowlisted path is rejected;
- actor cannot widen scope without authority;
- stale base shape invalidates preview/confirmation;
- changed policy/vocabulary invalidates preview/confirmation;
- newly referenced unreadable field/metric is rejected;
- UI adaptation cannot widen source-data access;
- hiding a field never mutates authorization truth;
- duplicate retry is idempotent for the same operation identity;
- conflicting operation-ID reuse is rejected;
- invalid schema/invariant fails before persistence;
- canonical inputs produce stable digests independent of object-key ordering;
- restart reconstructs committed version lineage;
- tampered/corrupt stored version fails integrity checks;
- rollback never claims to undo external effects.

## 12. Later slices

### B — adaptive UI projection

Bind one existing Agent Work OS operator surface to `adaptive-shape/v1`; browser-certify real layout/filter/group/KPI/chart adaptation while preserving canonical data/work truth.

### C — model-backed brain

Provider-neutral structured-output planner with bounded vocabulary/context and an eval set for patch/question/refusal correctness. Model output remains untrusted until deterministic guard acceptance.

### D — team/org scope

Team authority, org structural-change policy, optional two-person approval, overlay conflict/rebase and policy-revision invalidation.

### E — separate effect plan

`adaptive-effect-plan/v1` may reference only named existing Agent Work OS capabilities. Each effect declares exact target/arguments, effect class, expected postcondition, idempotency, approval requirement and recovery class.

A plan cannot execute.

### F — effect grant + effect receipt

Reuse governed approval/execution paths. Grant binds exact plan/target/args/effect/policy and expires. Receipt records actual observed outcome. Shape version and effect receipt stay separate facts.

### G — workflow migration

Structural workflow changes require one explicit policy for in-flight records:

`grandfather | migrate | block_for_review | new_records_only`

Unknown migration state blocks affected execution.

### H — recovery/provider/browser certification

Concurrency, stale overlay, approval expiry, retries, timeouts, partial effects, compensation failure, restart/reconciliation and independent verifier evidence.

### I — release gate

Exact-head CI -> runtime -> browser UAT -> persistence/recovery -> provider/effect proof -> Shipping OS release receipt -> tracker advancement.

## 13. Verification ladder

`Static -> Unit -> Integration -> Contract -> Runtime -> Browser -> Persistence/Recovery -> Provider/Effect -> Preview/Release -> Production`

Never promote a lower-level green check into a higher-level product claim.

Every decisive receipt must bind the exact implementation SHA and relevant shape/policy/contract revisions.

## 14. WIP / tracker truth

Agent Work OS currently has more active draft BUILDING lanes than the intended bounded WIP. This donor therefore stops at:

**`SPECIFIED / SHIPPING-CONTRACT-READY / BLOCKED_WIP`**

until a BUILDING slot is explicitly available.

Tracker ID remains pending canonical reconciliation. Do not invent the next `RE-*` value from a local workbook snapshot while same-day intake work is concurrent.

## 15. Explicit non-claims

This dossier does **not** claim:

- Shapeshifting Software parity;
- donor source/test/skill reuse;
- an implemented Adaptive Application Runtime;
- a model-backed brain;
- effectful automation;
- team/org runtime approvals;
- browser UAT;
- Preview or production deployment;
- an assigned tracker ID;
- `SHIPPED` status.

## 16. Smallest next executable action

When a BUILDING slot opens, execute only Phase A from `contracts/adaptive-shape-runtime.phase-a.json`: independently author the pure side-effect-free domain module and deterministic tests, then attach exact-SHA CI evidence before any UI or model integration.