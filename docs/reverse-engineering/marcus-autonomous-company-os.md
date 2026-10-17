# Marcus AI → Autonomous Company OS (REA intake)

**Coordination issue:** #234  
**Research branch:** `research/marcus-autonomous-company-os`  
**Snapshot:** 2026-10-16 ET  
**Classification:** donor / vertical of Agent Work OS  
**REA status:** public-evidence first pass only; no proprietary/runtime REA execution claimed

## 1. Source identity and evidence limits

User-supplied source:

- `https://www.reddit.com/r/founder/s/WwPkgmfKjD`

Current runtime could not resolve the opaque `/s/<token>` wrapper directly. Product identity and capability claims are corroborated by multiple current public posts from the Marcus founders:

- `https://www.reddit.com/r/founder/comments/1wymzo5/ill_work_for_you_for_free/`
- `https://www.reddit.com/r/StartupNinjas/comments/1x1iflg/looking_for_a_marketing_guru/`
- `https://www.reddit.com/r/founder/comments/1x6yg07/which_things_on_our_product_dont_seem_believable/`
- `https://www.reddit.com/r/StartupNinjas/comments/1x64ou8/need_a_real_feedback_on_our_product/`

The public target is **Marcus / Marcus-ai.co**, described by its founders as an agentic company-building and company-operating platform.

The current web runtime could not access `marcus-ai.co` directly. Do not invent hidden routes, stack, providers, agent framework, data model, legal provider, CRM, billing system, deployment backend, or social APIs.

## 2. Public capability graph

### OBSERVED / source-reported

Founder posts currently claim a one-prompt flow that can:

1. build AI apps and websites;
2. create branding;
3. create AI UGC/content;
4. promote a startup through an agent;
5. operate an AI BDR for fundraising and partnerships;
6. register a company in any of the 50 U.S. states;
7. continue operating the business after product creation;
8. complete the initial build in roughly 5–8 minutes.

Current creator-reported state:

- 120+ users and only a couple/few paying users in the latest founder follow-up;
- founder states ~95% of the product works;
- remaining social/marketing automation is described as blocked on Google/Reddit/Microsoft approvals;
- marketing/distribution is reported as a current weakness despite six UGC creators.

These are creator claims, not audited product/revenue evidence.

### DERIVED requirements for a credible product of this class

- venture/company state model;
- founder objective and success metrics;
- market/competitor/ICP research;
- product requirements and backlog;
- bounded code-generation workspace;
- test/build/preview verification;
- brand/content artifact generation;
- deployment adapters;
- CRM/lead/investor/partner pipeline;
- outreach proposal + approval state;
- legal-formation provider/advisory workflow;
- cost/budget policy;
- durable company memory;
- blocker/dependency model;
- KPI observations and experiments;
- proof-bearing action receipts;
- operating loop after launch.

### UNKNOWN

- Marcus implementation stack;
- exact agent topology;
- model providers/router;
- database/storage;
- browser/sandbox implementation;
- exact deployment providers;
- company-formation vendor;
- BDR/enrichment providers;
- social posting providers;
- billing/payments architecture;
- quality of generated apps;
- success rate of legal filings;
- actual retention/revenue beyond founder reports.

## 3. Repository routing

**Decision: do not create a Marcus clone repo.**

The target is a composition/productization pattern over Agent Work OS primitives. The owned missing capability is a first-class **Company/Venture Operating Model** and founder-facing vertical.

Canonical owner: `rrahul0904/agent-work-os`.

Reuse/converge:

- #88 REA evidence layer;
- #39 Flow / Work Queue;
- #99 Agent Workbench;
- #111 Agent Evaluation Harness;
- #166 Memory Plane;
- #211 Deep Research / AI Engineering Lab / multi-agent recipes;
- Presentation OS for pitch decks;
- Creator Console for content/publishing handoff;
- Opportunity/Application Agent pattern for application workflows;
- Shipping OS for preview/production truth.

## 4. Product thesis

Do not optimize for “company in 8 minutes.”

Owned promise:

> Give the system a company objective. It researches, builds, launches, and operates the business — while distinguishing generated, verified, deployed, externally executed, and business-outcome states.

Canonical loop:

```text
FounderIntent
  -> CompanySpec
  -> Validation / Evidence
  -> CompanyObjectives
  -> VenturePlan
  -> Workstreams
  -> ActionPlans
  -> Policy / Approval
  -> Bounded Execution
  -> Verification
  -> Receipts
  -> MetricObservation
  -> Diagnose / Learn
  -> Next Operating Cycle
```

Key invariant:

**Task completion is never equivalent to business outcome.**

Examples:

- generated landing page != deployed landing page;
- deployed landing page != traffic;
- generated prospect email != sent email;
- sent email != reply/meeting;
- incorporation checklist != filed entity;
- provider request != accepted filing;
- payment intent != successful charge;
- marketing plan != acquisition.

## 5. Contract reconciliation with current Agent Work OS

Current domain kernel already provides:

- canonical typed IDs for org/user/project/work/task/run/agent/session/artifact/evidence/approval/policy/grant/receipt/deployment/capability/service/command/credential;
- versioned `WorkItem` state with `backlog -> ready -> running -> blocked -> verifying -> complete|failed|interrupted` transitions;
- optimistic version conflict handling;
- deterministic canonical SHA-256 digesting.

Therefore do **not** create a second generic task/run/approval/receipt identity system for Company OS.

### Reuse directly

- `project_*` can represent the venture/company workspace at control-plane level;
- `work_*` / task/run identities remain the execution units;
- `approval_*`, `grant_*`, `receipt_*`, `artifact_*`, `evidence_*`, `deployment_*` remain cross-domain identity primitives;
- canonical digest helper remains the base hashing primitive;
- existing WorkItem `blocked`, `verifying`, `interrupted`, `failed` states remain generic execution truth.

### Add only company-domain semantics

Proposed company-specific records should reference generic canonical IDs rather than invent parallel authority models:

- `CompanySpec` — business intent and invariant business assumptions;
- `CompanyObjective` — metric target/horizon, not a task;
- `CompanyWorkstream` — product/growth/sales/fundraising/ops/legal grouping;
- `CompanyActionPlan` — domain plan that points to generic work/task/run identities;
- `CompanyBlocker` — business/external dependency metadata layered over generic blocked state;
- `CompanyMetricObservation` — source-bound KPI observation;
- `CompanyExperiment` — baseline/hypothesis/intervention/outcome;
- `CompanyStateSnapshot` — replayable company projection;
- `CompanyLaunchCertificate` — proof that bounded launch-readiness gates passed, not proof of PMF or revenue.

### Do not duplicate

- generic approval schema;
- generic grant schema;
- generic receipt schema;
- generic deployment receipt;
- generic work/task lifecycle;
- generic evidence/artifact IDs;
- generic memory store.

Company-specific action records should *compose* those primitives.

## 6. Owned role model

Roles are capability profiles, not independent autonomous authority domains.

Initial set:

- Founder/Cofounder;
- Chief of Staff;
- Market Research;
- Product;
- Engineering;
- Design/Brand;
- DevOps/Shipping;
- Growth/Content;
- BDR/Partnerships;
- Fundraising;
- Support/Success;
- Finance/Ops.

Rules:

- role can propose;
- role cannot self-grant consequential effects;
- builder cannot be decisive verifier;
- public send/post/payment/legal filing requires exact grant;
- one grant cannot silently widen target/provider/effect;
- provider uncertainty is represented as blocked/reconciliation state.

## 7. Phase-A owned vertical slice

Use an entirely source-owned/synthetic venture fixture.

Founder prompt:

> Build a SaaS that audits Snowflake spend for mid-sized companies.

### Sequence

1. create CompanySpec;
2. define one CompanyObjective: verified preview launch;
3. Market Research produces cited ICP/competitor/problem evidence;
4. Product produces PRD and acceptance criteria;
5. Engineering works in an owned fixture repo/worktree;
6. run deterministic tests/build;
7. create preview only through existing governed deployment lane;
8. browser smoke checks;
9. Design/Brand produces original design tokens/name/landing assets;
10. Growth produces draft launch/content plan only;
11. BDR creates synthetic prospects and draft messages only;
12. Fundraising produces synthetic investor dossier/pitch outline only;
13. Chief of Staff produces blockers + launch-readiness brief;
14. issue CompanyLaunchCertificate only if build/test/preview/evidence gates pass;
15. restart/replay reconstructs exact company projection.

Phase-A exclusions:

- no real external email;
- no real social publishing;
- no legal filing;
- no card/payment use;
- no production deploy;
- no real customer/lead data.

## 8. Launch certificate semantics

The first certificate should prove only:

- CompanySpec is complete and versioned;
- objective/acceptance metrics defined before build;
- research claims have source evidence;
- PRD exists;
- owned source revision is known;
- build/tests pass at exact revision;
- preview deployment is observed and bound to exact revision/artifact;
- browser smoke/UAT passes declared checks;
- required blockers are explicit;
- no restricted external action was represented as completed.

It must **not** claim:

- PMF;
- revenue;
- incorporation;
- successful outreach;
- social publication;
- customer traction;
- production readiness unless Shipping OS separately certifies it.

## 9. Adversarial / recovery acceptance matrix

### Authority

- CompanyActionPlan cannot execute itself;
- role text cannot widen capability;
- expired grant fails closed;
- grant for company A cannot execute against company B;
- grant for draft creation cannot be reused for send/publish;
- provider/effect drift invalidates stale grant.

### State / replay

- restart reconstructs company state from durable records;
- stale CompanySpec revision invalidates dependent action plans;
- founder decision supersession remains in history;
- blocked external dependency remains blocked across restart;
- replay never changes historical receipt digests.

### External truth

- send timeout with uncertain outcome enters reconciliation, never blind retry;
- duplicate idempotency key cannot double-send/double-charge/double-create;
- social app-review pending cannot be represented as publishing complete;
- legal provider request pending cannot be represented as filed entity;
- deployment URL without smoke/health evidence cannot receive verified state.

### Metrics

- task complete cannot achieve revenue objective without metric evidence;
- missing analytics remains unknown;
- KPI value requires source/provenance/observed-at;
- experiment stores baseline + intervention + observation window;
- business strategy cannot silently rewrite historical observations.

### Security

- secrets never enter durable receipts;
- target-controlled web/email content is untrusted input;
- no arbitrary network/shell authority from “run the company” prompt;
- synthetic Phase-A fixture uses no production credentials/customer data.

## 10. Competitive lesson from current Marcus signal

The current founder-reported conversion gap is strategically important:

- broad capability claims create skepticism;
- generated output alone does not establish trust;
- external-platform approvals create real blockers;
- marketing/distribution remains unsolved despite automated content creation.

Therefore the owned wedge is **proof-bearing operating truth**:

```text
What did the system plan?
What did it actually execute?
What did it verify?
What is still blocked?
What requires the founder?
What business metric changed?
```

That evidence board is more defensible than an “AI CEO” persona or an eight-minute timer.

## 11. Delivery state

```text
SOURCE_IDENTITY = corroborated / opaque share redirect still unresolved in current runtime
PUBLIC_EVIDENCE = first-pass complete
REA_RUNTIME = not run
INTERNAL_DEDUPE = complete
ROUTING = Agent Work OS vertical
CONTRACT_RECONCILIATION = first pass complete
PRODUCT_THESIS = complete
PHASE_A_SPEC = complete
IMPLEMENTATION = not started by this research branch
UAT = none
DEPLOYMENT = none
SHIPPED = no
```

## 12. Next executable gate

Before code:

1. reconcile CompanySpec/Objective/Blocker/Snapshot semantics against Flow/Work Queue and Memory Plane implementations;
2. freeze the smallest company-domain schema delta;
3. create deterministic synthetic Snowflake-cost SaaS fixture;
4. implement only the CompanySpec -> research -> PRD -> build -> verify -> preview -> LaunchCertificate slice in a bounded implementation branch when the current WIP policy allows it;
5. attach exact implementation/CI/browser receipts to #234;
6. only then add real growth/BDR/provider actions one effect class at a time.
