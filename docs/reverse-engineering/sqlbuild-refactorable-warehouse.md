# SQLBuild — refactorable warehouse reverse-engineering dossier

**Supplied source:** https://www.reddit.com/r/dataengineering/s/xV3ShBPKae  
**Governance issue:** #70  
**Research date:** 2026-10-07 America/New_York  
**Roadmap stage:** SPECIFIED / implementation destination pending  
**Tracker ID:** intentionally unassigned pending portfolio reconciliation  

## 1. Source identification

The supplied Reddit launch resolves to a SQLBuild launch/update by its creator. The public project is `chio-labs/sqlbuild`, an Apache-2.0 SQL/Python warehouse build framework whose current public positioning is **“The refactorable warehouse.”**

Primary evidence used for this dossier:

| Evidence | Class | Use |
| --- | --- | --- |
| Supplied Reddit launch + visible discussion | first-party-public / community feedback | Product intent, workflow, creator explanations, feedback |
| `sqlbuild.com` current docs | official-doc | Current user-facing behavior |
| `chio-labs/sqlbuild` current `main` | official-source | Current source-visible contracts and roadmap |
| SQLBuild roadmap | official-doc | Current planned / explicitly not-planned capabilities |
| Current dbt docs | competitor official-doc | Competitive boundary only |
| Current SQLMesh docs | competitor official-doc | Competitive boundary only |

Public upstream code may be studied as evidence because it is Apache-2.0, but this project will not copy donor source layout, branding, UI, fixtures, tests, or implementation. Acceptance is based on independently authored behavior contracts.

## 2. Evidence reconciliation

A material source-drift issue was found during research:

- The current SQLBuild roadmap explicitly lists **virtual environments as not planned**.
- Older package/search snapshots still describe virtual-environment behavior.
- Current repository activity is heavily migrating compiler/discovery stages toward native Rust while preserving behavior parity.

Rule: current `main` + current official docs outrank stale package/search snapshots for claims about present behavior. Historical snapshots remain useful only as evidence of product evolution.

## 3. Reconstructed user problem

Warehouse changes are unusually expensive when correctness is discovered only after executing against a remote warehouse or when a refactor implies a destructive rebuild. SQLBuild’s public product loop tries to move confidence earlier and make common structural changes reversible:

```text
edit SQL / config
  -> offline compile + references + types + contracts + rules
  -> fixture / scenario tests
  -> deterministic plan
  -> inspect row/data differences
  -> apply bounded migration / replay
  -> preserve compatibility where possible
  -> record state/evidence
  -> later archive stale objects before deletion
```

The strongest product idea is therefore **refactor safety**, not simply SQL orchestration.

## 4. Observed capability decomposition

### 4.1 Verify before execution

Observed current public behavior includes offline SQL/reference analysis, column-type inference, contracts, lineage, and custom compiler-integrated rules. A project can therefore reject some classes of errors before warehouse execution.

### 4.2 Test through the graph

Public docs describe SQL tests whose fixtures can mock sources while real intermediate models execute, plus end-to-end scenario fixtures and local replay in DuckDB. Macro, UDF and table-function tests are also documented.

### 4.3 Plan change rather than rebuild blindly

Public docs describe `sqb plan`, model-specific `replay_on_change`, and incremental strategies. The important reconstructed contract is that a changed model should state **why** prior data will or will not be replayed, and downstream history must not silently cascade just because an upstream definition changed.

### 4.4 Rename as a migration

Public docs describe model/folder moves and model/column renames that update references and migrate existing relations rather than treating every rename as drop/recreate. Compatibility views keep the old model name usable for a bounded period.

### 4.5 Scope declarations

Macros, enums and constants can be scoped near models. `sqb scope` previews whether a move would lose visibility and invalidate usages.

### 4.6 Compare real results

Public docs describe row-level data diffs between targets or arbitrary queries. This is more useful for refactoring than a schema-only comparison.

### 4.7 Clean up conservatively

The janitor identifies stale relations and archives them before deletion. Creator discussion emphasizes that this is deliberate cleanup rather than an automatic hidden destructive process.

### 4.8 Warehouse-native state

The public design stores append-only framework state next to warehouse data rather than requiring a separate production state database.

## 5. Feedback and public discussion

The visible Reddit discussion clarifies several product boundaries:

- The creator positions SQLBuild primarily as an alternative to dbt, not a complementary layer, while noting some dbt interoperability.
- For users who require virtual data environments, the creator explicitly points toward SQLMesh instead of claiming SQLBuild should reproduce that model.
- Creator responses highlight tests, custom Rules, row-level diffs, scoped declarations and safe renames as standout capabilities.
- A beta-user comment praises compile speed and expresses interest in the planned UI; treat this as anecdotal community evidence, not benchmark proof.

No private architecture or performance claim should be inferred from these comments.

## 6. Competitive comparison — boundary, not marketing copy

### dbt

Current dbt v2/Fusion documentation describes strict static analysis and compile-time column lineage. Therefore our product must **not** claim that static analysis alone is novel.

### SQLMesh

Current SQLMesh documentation already includes plans, environments, unit tests/audits, table diffing and janitor concepts. SQLBuild’s public creator explicitly accepts virtual environments as a case where SQLMesh is a better fit.

### Defensible target distinction

The implementation should focus on the integrated chain:

**offline verification + graph-spanning fixture tests + explainable replay policy + history-preserving rename + compatibility alias + bounded row diff + archive-before-delete cleanup.**

That complete loop is the target behavior to prove.

## 7. Internal donor/repository audit

- `rrahul0904/snowflake-brain` is a SnowPro certification product; it is not the right runtime destination.
- Historical dbt, migration, catalyst and data-warehouse repositories in the account are useful test/donor material but are not an established clean-room warehouse framework destination.
- Agent Work OS remains the orchestration/provenance/evidence control plane only.

**Decision:** a dedicated warehouse-engineering implementation boundary is justified. Do not contaminate Agent Work OS with the SQL compiler/runtime itself.

## 8. Product thesis for our build

Working description:

> A local-first warehouse refactoring engine that proves a SQL change before execution, explains its historical-data consequences, and makes renames/cleanup reversible by default.

Do not reuse `SQLBuild` as our eventual product name.

## 9. Phase A behavior contracts

Phase A is deliberately DuckDB-first and small enough to verify end to end.

### Contract A — project graph

Given a bounded directory of model SQL and source declarations, discovery emits stable model identities and a deterministic DAG.

Must reject duplicate identities, cycles, missing references and unsupported ambiguous constructs with source locations.

### Contract B — compile and contract diagnostics

For the supported SQL subset, compilation resolves model/source references and checks declared output columns/types without connecting to a remote warehouse.

Must fail closed when analysis cannot establish a safe answer. No guessed lineage.

### Contract C — deterministic rules

A rule receives immutable model metadata, dependencies and normalized authored SQL facts and returns typed findings. The same project snapshot must yield byte-stable finding ordering.

### Contract D — multi-model fixture test

A test may provide source rows and assert rows at a downstream model while real intermediate model SQL executes against an isolated DuckDB database.

Test execution must not mutate a developer’s normal target.

### Contract E — change plan

`plan(base, candidate)` emits a machine-readable action graph containing:

- changed resource and reason;
- dependency impact;
- schema action;
- data-history action;
- replay policy and resolved interval;
- compatibility action;
- destructive flag;
- unresolved gates.

Planning has no write side effects.

### Contract F — history-preserving model rename

When identity continuity is explicitly declared and no collision exists, a rename plan maps the old physical relation/history identity to the new logical name and proposes a time-bounded compatibility alias.

A rename without proof of identity continuity is not inferred from filename similarity.

### Contract G — lineage-safe column rename

A column rename is allowed automatically only when the compiler can prove one unambiguous lineage mapping and all known references can be rewritten. Otherwise planning fails closed and requires an explicit migration decision.

### Contract H — replay-on-change

Supported policies in Phase A:

- `new_only`
- `window:<duration>`
- `full`

The resolved plan states exactly which historical interval will be recomputed and why. Missing historical input must block an unsafe replay rather than truncate silently.

### Contract I — row diff

Diff compares two deterministic queries/relations with an explicit key. It reports inserted/deleted/changed rows, column-level differences, numeric tolerance and bounded evidence samples.

Duplicate or null comparison keys fail validation unless an explicit multiset mode is later added.

### Contract J — janitor safety

Janitor discovery may classify relations as owned/orphaned/unknown. Only proven-owned orphaned relations can become archive proposals. Delete is a separate gated action and cannot proceed unless archive has succeeded and a receipt exists.

### Contract K — operation receipts

Every applied migration/replay/archive action records an append-only receipt containing input snapshot digest, plan digest, operation identity, before/after facts and outcome. Replaying the same operation identity is idempotent.

## 10. Required failure-mode suite

1. Unknown model/source reference.
2. Missing selected column.
3. Declared/inferred type conflict.
4. Dependency cycle.
5. Duplicate model identity.
6. Rename target collision.
7. Rename leaves unresolved downstream reference.
8. Column lineage has multiple plausible origins.
9. Replay window requires unavailable history.
10. Diff contains duplicate/null keys.
11. Janitor sees relation with uncertain ownership.
12. Archive operation fails.
13. A stale plan is applied after project snapshot changed.
14. Identical operation receipt is replayed.
15. Compatibility alias would shadow a real relation.

The safe outcome for uncertainty is a blocked plan with a concrete diagnostic, not an inferred destructive action.

## 11. Phase A acceptance scenario

Use an original synthetic commerce fixture, not donor examples.

1. Create `raw_orders` and `raw_payments` fixtures.
2. Build `stg_orders` -> `order_facts` incrementally.
3. Compile and run a downstream multi-model fixture test.
4. Introduce a contract-breaking column typo and prove offline compile rejects it.
5. Restore it; change calculation logic and produce a bounded replay plan.
6. Rename `order_facts` to `commerce_orders` with explicit identity continuity.
7. Prove existing historical rows are retained and a compatibility alias serves the old logical name.
8. Run a row diff between the pre-change and candidate results.
9. Mark an owned legacy relation stale; prove janitor archives it and cannot delete before archive receipt.
10. Replay the exact migration operation and prove idempotency.

Exit evidence must include tests, before/after data facts, serialized plan, operation receipts and exact-head CI SHA.

## 12. Implementation sequence

### Phase 0 — contracts and fixtures

- Domain objects: `ProjectSnapshot`, `ModelSpec`, `ColumnContract`, `GraphEdge`, `Diagnostic`, `ChangePlan`, `PlanAction`, `ReplayPolicy`, `DiffResult`, `ArchiveProposal`, `OperationReceipt`.
- Original synthetic project fixture.
- Serialization and deterministic ordering tests.

### Phase 1 — compile / graph / rule core

- Discovery.
- Reference graph.
- Supported SQL analyzer.
- Contract checks.
- Rules interface.
- Negative corpus.

### Phase 2 — fixture execution + diff

- Isolated DuckDB test harness.
- Multi-model test execution.
- Keyed row diff and tolerance rules.

### Phase 3 — refactor planner

- Snapshot comparison.
- Model/column rename declarations.
- Compatibility aliases.
- Replay resolution.
- Stale-plan protection.

### Phase 4 — safe apply / janitor

- Local DuckDB migration executor.
- Append-only receipts.
- Archive-before-delete flow.
- Replay/idempotency recovery tests.

### Phase 5 — independent verification

- Clean checkout.
- Full negative corpus.
- Exact-SHA CI.
- Receipt inspection.
- No hosted/production claim yet.

## 13. Deferred capability map

| Capability | Decision |
| --- | --- |
| DuckDB | Phase A |
| Snowflake production adapter | later |
| PostgreSQL / BigQuery / Databricks / SQL Server | later |
| Rust/native compiler acceleration | later, benchmark-driven |
| Scoped macros/enums/constants | after core refactor loop |
| dbt manifest interoperability | later |
| source loaders / ingestion | later |
| Python tasks/assets/checks/factories/providers | later |
| zero-copy cloning | later |
| self-hosted UI | later |
| SSO/RBAC/audit UX | later |
| scheduler / cost telemetry | later |
| virtual environments | OMIT unless independent user evidence changes thesis |

## 14. Evidence/status policy

Research does not equal implementation. The status ladder for this target is:

`RESEARCHING -> RESEARCH_COMPLETE -> SPECIFIED -> IMPLEMENTING -> LOCALLY_VERIFIED -> UAT -> PREVIEW_VERIFIED -> PRODUCTION_VERIFIED -> COMPLETE`

No stage advances without an evidence receipt tied to an exact commit or external observation. Phase A cannot be called parity with SQLBuild; it proves only the independently specified refactor-safety vertical slice above.

## 15. Immediate next gate

Provision or select the dedicated implementation repository, then create Phase 0/Phase 1 contracts and the original DuckDB fixture. The tracker ID is assigned only after current parallel portfolio intake is reconciled beyond canonical RE-379.
