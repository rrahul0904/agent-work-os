# Autonomous Company OS — Phase A Contract + Test Matrix

**Parent intake:** #234  
**Branch:** `research/marcus-autonomous-company-os`  
**Purpose:** freeze the smallest company-domain delta without duplicating existing Agent Work OS authority/state systems.

## 1. Ownership map

| Concern | Canonical owner | Company OS rule |
|---|---|---|
| generic work/task lifecycle | Flow / Work Queue (#39) + domain kernel | reuse; no company-specific task database |
| human attention / needs-input | Flow / Work Queue (#39) | project CompanyBlocker facts into the shared attention queue |
| workbench UI / code / terminal / browser | Agent Workbench (#99) | Company OS is a vertical/projection, not a second IDE |
| durable verified context | Memory Plane (#166) | company facts enter memory only through provenance/policy lifecycle |
| agent/scenario quality | Agent Evaluation Harness (#111) | reuse scenarios/receipts for company-agent behavior and regression tests |
| reverse-engineering evidence | REA (#88) | evidence provider only; never grants company execution authority |
| approvals / grants / receipts | Agent Work OS core | reuse generic canonical identities and policy/effect semantics |
| deploy / release truth | Shipping OS | CompanyLaunchCertificate may reference preview evidence but cannot replace Shipping OS production certification |
| company strategy / objectives / KPIs | **Company OS domain delta** | new typed company-domain records below |

## 2. Phase-A schema delta

Do not add new global canonical ID kinds unless implementation proves a real need. Company-domain records can use stable domain strings/UUIDs plus existing canonical `project`, `work`, `task`, `run`, `artifact`, `evidence`, `approval`, `grant`, `receipt`, and `deployment` references.

### `CompanySpec/v1`

Required:

```text
schemaVersion = company-spec/v1
companyId
projectId
revision
founderIntent
problemStatement
targetCustomer
valueProposition
businessModelHypothesis
productForm
launchConstraints[]
geographyAssumptions[]
budgetPolicyRef
successMetricIds[]
allowedCapabilityIds[]
provenance[]
createdBy
createdAt
specDigest
```

Invariants:
- `projectId` is canonical Agent Work OS project identity;
- revision is monotonic;
- business assumptions are explicit, never silently inferred into authoritative state;
- material founder edits create a new revision;
- digest excludes transient UI data;
- no secret value stored in the spec.

### `CompanyObjective/v1`

```text
schemaVersion
objectiveId
companyId
companySpecDigest
name
metricIds[]
baselineObservationRefs[]
target
horizon
constraints[]
budgetPolicyRef
state = planned | active | blocked | achieved | failed | cancelled
evidenceRequirements[]
createdAt
updatedAt
objectiveDigest
```

Invariants:
- `achieved` requires compatible metric evidence; work completion alone is insufficient;
- baseline may be `unknown` but never fabricated;
- a new CompanySpec revision can invalidate an objective if its assumptions changed materially.

### `CompanyWorkstream/v1`

Initial enum:

```text
product | engineering | design | shipping | growth | sales | partnerships |
fundraising | support | finance | operations | legal
```

This is classification/ownership metadata only. It does not create execution authority.

### `CompanyActionPlan/v1`

```text
schemaVersion
planId
companyId
companySpecDigest
objectiveId
workstream
workItemId
baseStateSnapshotDigest
intent
expectedOutputs[]
expectedEffects[]
requestedCapabilityIds[]
externalDependencies[]
riskClass
reversibility
budgetEstimate
approvalRequirement
postconditionChecks[]
createdBy
createdAt
planDigest
```

Invariants:
- plan is side-effect-free;
- plan digest binds exact company/spec/objective/base snapshot;
- unknown effect or unknown consequential-provider behavior fails closed;
- plan never substitutes for generic approval/grant.

### `CompanyBlocker/v1`

```text
schemaVersion
blockerId
companyId
objectiveId?
workItemId?
category
status = open | resolved | superseded
reason
externalProvider?
evidenceRefs[]
requiresHuman
firstObservedAt
lastObservedAt
resolvedAt?
blockerDigest
```

Initial categories:

```text
provider_approval_pending
credential_required
human_decision_required
legal_review_required
payment_authority_required
quota_or_rate_limit
external_dependency
verification_failed
deployment_failed
policy_denied
insufficient_evidence
reconciliation_required
```

Projection rule: an open blocker can drive shared Work Queue `blocked/needs attention`, but the blocker record itself does not become a second work-state engine.

### `CompanyMetricObservation/v1`

```text
schemaVersion
observationId
companyId
metricId
value | unknown
unit
sourceType
sourceRef
observedAt
windowStart?
windowEnd?
quality
provenance[]
evidenceRefs[]
observationDigest
```

Invariants:
- no metric without source/provenance;
- generated estimate is labeled estimate, not observed KPI;
- missing data remains `unknown`;
- later correction supersedes but does not erase historical observation.

### `CompanyExperiment/v1`

```text
schemaVersion
experimentId
companyId
objectiveId
hypothesis
baselineObservationRefs[]
interventionPlanDigest
startAt
endAt?
outcomeObservationRefs[]
state = planned | active | complete | cancelled | invalid
conclusion = win | loss | inconclusive | unknown
limitations[]
experimentDigest
```

### `CompanyStateSnapshot/v1`

A deterministic projection, not a second database.

```text
schemaVersion
snapshotId
companyId
companySpecDigest
objectiveDigests[]
openWorkItemIds[]
openBlockerDigests[]
latestMetricObservationDigests[]
artifactRefs[]
deploymentRefs[]
receiptRefs[]
memoryContextRef?
projectedAt
snapshotDigest
```

Invariants:
- snapshot is rebuildable from canonical records/events;
- historical snapshots immutable;
- projection loss must be recoverable without altering canonical evidence.

### `CompanyLaunchCertificate/v1`

```text
schemaVersion
certificateId
companyId
companySpecDigest
sourceRevision
buildReceiptRefs[]
testReceiptRefs[]
previewDeploymentRef
browserUatReceiptRefs[]
researchEvidenceRefs[]
openBlockerRefs[]
prohibitedExternalActionsConfirmedAbsent[]
verifierRef
issuedAt
outcome = passed | failed | blocked
certificateDigest
```

This proves only declared **launch-readiness criteria for a bounded preview**. It cannot assert incorporation, revenue, customer traction, social publication, successful outreach, or production release unless those are separately evidenced by appropriate systems.

## 3. Mapping to generic Agent Work OS authority

Company OS should compose generic action authority as follows:

```text
CompanyActionPlan
  -> generic policy/effect evaluation
  -> generic Approval (when required)
  -> generic exact Grant
  -> Work/Task/Run execution
  -> generic Artifact/Evidence/Receipt
  -> CompanyMetricObservation / CompanyBlocker projection
  -> new CompanyStateSnapshot
```

Do **not** create `CompanyActionGrant` or `CompanyActionReceipt` as independent authority primitives if generic grant/receipt contracts can carry company-domain metadata. If implementation needs domain views, expose projections/wrappers whose canonical authority remains the generic grant/receipt.

## 4. Phase-A fixture

Source-owned synthetic venture:

> **SnowSpend Lab** — a SaaS that audits Snowflake spend for mid-sized companies.

This is a fixture name, not launch branding.

Seed data must be synthetic:
- fake organization;
- fake buyer personas;
- fake competitors where testing outbound workflow mechanics;
- fake prospects/investors;
- source-owned sample warehouse cost data;
- no production credentials;
- no real outreach targets.

## 5. Phase-A execution graph

```text
FounderIntent
 -> CompanySpec
 -> objective: verified_preview
 -> Market Research work item
 -> evidence-backed ICP/problem/competitor dossier
 -> Product work item
 -> PRD + acceptance criteria
 -> Engineering work item
 -> source-owned app implementation
 -> deterministic build/tests
 -> preview plan + explicit deployment grant
 -> preview deployment
 -> browser smoke/UAT
 -> Design/Brand artifacts
 -> Growth drafts only
 -> synthetic BDR drafts only
 -> synthetic fundraising dossier only
 -> Chief-of-Staff readiness projection
 -> independent verifier
 -> CompanyLaunchCertificate
 -> restart/replay comparison
```

## 6. Required deterministic tests

### Contract / digest

- same canonical CompanySpec yields same digest;
- object-key ordering does not change digest;
- material field change changes digest;
- unknown schema version fails closed;
- missing mandatory provenance fails where required;
- transient UI fields never affect canonical digest.

### Revision / stale-state

- plan bound to CompanySpec revision N cannot execute after material revision N+1 without explicit re-plan;
- stale CompanyStateSnapshot blocks exact-effect execution;
- stale preview/source revision cannot satisfy LaunchCertificate;
- superseded founder decision remains historically queryable.

### Work Queue integration

- open CompanyBlocker projects shared work to blocked/needs-attention state;
- resolving blocker does not auto-complete work;
- blocker from company A cannot block/resolve company B work;
- provider approval pending survives restart.

### Memory Plane integration

- company fact write includes project/company scope + provenance;
- unapproved REA donor evidence cannot become implementation truth automatically;
- superseded company assumption is not returned as current truth;
- historical source/provenance remains queryable;
- cross-company/project memory leakage is denied.

### Workbench authority

- research/ask mode cannot mutate code;
- plan mode cannot mutate workspace;
- engineering action is bound to exact worktree/source revision/path scope;
- browser observation cannot imply source change success;
- visual/generated artifact remains unverified until corresponding checks pass.

### Evaluation Harness

Create a deterministic Company OS scenario suite asserting:
- agent does not fabricate missing KPI;
- agent reports provider approval blocker truthfully;
- agent does not mark draft email as sent;
- agent does not mark legal checklist as filed entity;
- agent refuses prohibited live external action in synthetic Phase A;
- restart preserves exact objective/blocker/action state;
- same deterministic fixture produces stable deterministic receipt fields.

### External-action truth

- draft != sent;
- planned deployment != deployed;
- deployed != healthy/verified;
- legal form generated != filed;
- payment intent != charge;
- content generated != published;
- lead found != contacted;
- contact attempt != qualified response;
- task complete != business objective achieved.

### Retry / ambiguity

- timeout before observed external effect -> `unknown/reconciliation_required`;
- duplicate idempotency key cannot duplicate external effect;
- provider approval/API permission missing -> blocker, not failed-success fallback;
- a changed provider/tool/effect manifest invalidates stale grant;
- interrupted run cannot infer completion from missing process/session.

### Security / privacy

- secrets are absent from CompanySpec, snapshots and durable receipts;
- target-controlled webpage/email text is untrusted evidence;
- generic “run the company” text cannot grant browser/network/shell/payment/legal effects;
- fake PII fixture redacted according to policy;
- no network is required for deterministic Phase-A domain/eval tests.

## 7. Launch-certificate acceptance gates

`passed` requires all declared gates:

1. CompanySpec valid and exact digest recorded;
2. objective and success criteria defined before execution;
3. research dossier has source-bound evidence;
4. PRD and acceptance criteria persisted;
5. implementation exact source revision known;
6. deterministic build/test evidence passes;
7. preview deployment is observed and bound to exact source/artifact;
8. browser UAT/smoke passes declared assertions;
9. independent verifier is not the same builder authority;
10. open blockers are explicit and none violates the certificate policy;
11. prohibited Phase-A effects are proven absent from the run;
12. restart/replay reproduces equivalent canonical company state.

Any failed required gate => `failed`. Any unavailable required evidence/dependency => `blocked`, not fabricated `passed`.

## 8. WIP gate / implementation routing

Current surrounding Agent Work OS issues explicitly use a bounded-WIP rule. This Marcus lane is therefore advanced to:

`EVIDENCE -> RECONSTRUCTION -> ROUTED -> CONTRACTS_FROZEN_FIRST_PASS -> TEST_MATRIX_FROZEN_FIRST_PASS`

but **not automatically to BUILDING**.

When a bounded implementation slot exists, recommended branch:

`feature/company-os-phase-a`

First code slice must be limited to:
- schemas/validators/canonical digesting for company-domain delta;
- synthetic SnowSpend fixture;
- deterministic projection/replay;
- fake/no-network execution graph;
- Company OS eval scenarios;
- no real provider writes.

Only after that passes independent review should preview deployment integration be enabled through existing governed deployment primitives.

## 9. Exit criteria for research lane

Research/spec lane is review-ready when:
- #234 references this contract matrix;
- no duplicate authority/task/memory/eval system is introduced;
- all company-specific contracts have clear canonical-owner dependencies;
- Phase-A prohibited-effect list is explicit;
- test matrix covers stale state, restart, blockers, authority, business-outcome truth and secret handling;
- implementation branch is not opened merely to inflate progress.
