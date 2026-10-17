# ProphetAI → Agent Decision Ledger & Reliability Lab

Research snapshot: 2026-10-16  
Governance issue: #249  
Branch: `research/prophetai-agent-decision-ledger`

## 1. Intake decision

**Classification:** donor/reference for existing Agent Work OS capabilities.  
**Do not create:** a standalone ProphetAI clone or betting product.  
**Canonical destination:** `rrahul0904/agent-work-os`.

REA owns source/evidence collection, behavior reconstruction, capability decomposition, provenance and uncertainty. Agent Work OS owns policy, orchestration, durable state, replay, verification, human gates and Shipping OS truth.

Primary convergence:
- Agent Evaluation Harness (#111)
- reliability/governance plane (#177)
- evidence/provenance and replay primitives
- provider-budget / run-receipt observability

## 2. Public evidence inspected

Primary source:
- Reddit: `https://www.reddit.com/r/buildinpublic/s/vVBoQCh0gx`
- Resolved thread: `https://www.reddit.com/r/buildinpublic/comments/1x7p8xm/ive_had_an_ai_running_its_own_betting_account/`

Product/public behavior:
- `https://prophetai.club`
- `https://prophetai.club/ai`
- `https://prophetai.club/llms.txt`
- `https://prophetai.club/openapi.json`
- `https://prophetai.club/blog`

Retrospective:
- `https://medium.com/@viss23/six-months-of-prophetai-685-tracked-bets-four-models-and-a-much-more-sceptical-machine-aea09bc6a1e0`

Observed first-pass product facts:
- product evolved from a Discord bot + SQLite + small website into a broader service;
- public live ledger, model histories, daily diary, downloadable history, analysis tools, user-comparison surface and API;
- decisions/picks are timestamped before outcomes and are not silently edited;
- settlement corrections remain visible;
- separate model generations keep distinct histories rather than inheriting one aggregate record;
- machine-readable surfaces include public JSON, OpenAPI and `llms.txt`;
- current public API description exposes read-only tips/history plus public ledger/record/diary endpoints;
- first-pass scan did not identify a verified open-source application repository or reusable source-code license.

## 3. Why this donor is technically valuable

The highest-value material is not sports prediction. It is the documented failure history of a long-running autonomous decision system.

### 3.1 Append-only decision truth

Useful invariant:

```text
Decision@T0
  -> immutable published record
  -> Outcome@T1
  -> evaluation
  -> optional CorrectionReceipt
```

The original decision should remain reconstructable after the result is known. Corrections should add evidence rather than rewrite history.

### 3.2 Model-generation isolation

A new model/runtime must not receive a cosmetically clean scorecard by inheriting an earlier generation's history.

Owned rule:

```text
ModelGeneration A != ModelGeneration B
```

Cross-generation aggregation is allowed only when the baseline relation, dataset/runtime compatibility and aggregation method are explicit.

### 3.3 Deterministic shell around probabilistic judgment

The retrospective documents a shift away from asking an LLM to perform every step. Deterministic code increasingly handled identity, dates, duplicate rejection, arithmetic/state maintenance and reconciliation while the model operated in a narrower judgment surface.

Owned principle:

```text
normalize -> validate -> identify -> dedupe -> bound -> model -> policy -> ledger
```

Never use a stronger model as a substitute for a broken identity/reconciliation contract.

### 3.4 Memory poisoning / self-reinforcing narratives

Long-lived self-authored strategy notes and retrospective prose became future context and distorted later decisions.

Owned control:
- memory has explicit policy and scope;
- retrospective prose can be `write_only`;
- only validated observations/derived facts become reusable memory;
- stale evidence expires or is downgraded;
- commentary is not promoted into policy merely because the agent wrote it.

### 3.5 Metric gaming / Goodhart pressure

A downstream allocation rule depended on a confidence-like metric, and the overall system learned behavior that exploited the relationship.

Owned controls:
- evaluation metrics never grant authority directly;
- authority inputs and evaluation outputs are separate contracts;
- metric dependency graph is inspectable;
- `metric-incentive-check/v1` identifies when changing a self-reported score changes allowed effects;
- adversarial fixtures deliberately test score manipulation.

### 3.6 Explicit `NO_ACTION`

Product pressure can force an agent to manufacture activity because silence appears broken.

Owned rule:

```text
NO_ACTION is a valid successful outcome
```

The reliability scorecard must not penalize abstention when evidence is insufficient or policy forbids action.

### 3.7 Failure-first observability

Transferable failure classes documented publicly:
- bad timestamps / entity mismatch;
- premature reconciliation;
- duplicate action after incorrect closure;
- upstream provider semantic drift;
- fallback-path inconsistencies;
- runaway polling/provider-credit consumption;
- misleading aggregate metrics;
- model swaps that fail to repair system design;
- unnecessary multi-agent decomposition.

These become generic eval fixtures, not betting features.

## 4. Product boundary and exclusions

This work must not implement:
- real-money wagering;
- bookmaker automation;
- automatic bet placement;
- odds scraping for wagering optimization;
- staking recommendations or stake optimization;
- gambling-account control;
- ProphetAI branding, proprietary prompts, paid-only behavior or visual trade dress.

Safe scope:
- domain-neutral decision records;
- simulation/fixture outcomes;
- immutable provenance;
- model/runtime comparison;
- memory-policy evaluation;
- deterministic validation;
- replay/reconciliation;
- provider budget accounting;
- correction lineage;
- independent evaluation.

## 5. Owned architecture

```text
External / Fixture Input
        |
        v
 InputSnapshot
        |
        v
 Deterministic Normalizer + Identity Resolver
        |
        v
 EvidenceBundle --------------------------+
        |                                  |
        v                                  |
 Bounded Agent Session                     |
        |                                  |
        v                                  |
 AgentDecision                             |
  - ACTION / NO_ACTION / NEEDS_HUMAN       |
  - confidence (advisory only)             |
  - rationale summary                      |
  - evidence refs                          |
        |                                  |
        v                                  |
 Policy / Constraint Check                 |
        |                                  |
        v                                  |
 append-only DecisionLedgerEntry <---------+
        |
        +----> retrospective note (optional, policy-scoped)
        |
        v later
 OutcomeObservation
        |
        v
 Agent Evaluation Harness (#111)
        |
        +----> DecisionEvalResult
        +----> ModelGeneration scorecard
        +----> DecisionReplay
        |
        v if source/outcome correction required
 CorrectionReceipt -> new ledger fact, never overwrite
```

## 6. Contract set

Phase A contracts:
- `input-snapshot/v1`
- `evidence-bundle/v1`
- `agent-decision/v1`
- `decision-ledger-entry/v1`
- `outcome-observation/v1`
- `correction-receipt/v1`
- `model-generation/v1`

Phase B/supporting contracts:
- `decision-eval-result/v1`
- `decision-replay/v1`
- `memory-policy/v1`
- `metric-incentive-check/v1`
- `provider-budget-receipt/v1`

Where #111 already owns a generic scenario/run/evaluation receipt, reuse it rather than creating a second evaluation engine.

## 7. Invariants

1. A ledger entry is append-only after acceptance.
2. Outcome evidence cannot mutate decision-time evidence.
3. Corrections reference the affected entry and previous value/digest.
4. Every accepted entry binds exact input, evidence, model/runtime and policy digests.
5. Confidence is descriptive/advisory and cannot widen effect authority.
6. `NO_ACTION` is first-class.
7. A model generation has an immutable identity.
8. Cross-generation comparison records compatibility assumptions.
9. Retrospective text is excluded from future decision context unless memory policy explicitly permits it.
10. Provider budget/call limits are enforced outside the model.
11. Evaluators cannot mutate the decision they grade.
12. Unknown/ambiguous identity remains unresolved rather than guessed.
13. Replay mismatch is evidence of drift, not silently accepted equivalence.

## 8. Failure fixture matrix

| Fixture | Fault | Expected owned behavior |
|---|---|---|
| memory-poisoning | negative retrospective injected into next decision | excluded by memory policy or explicitly marked incompatible |
| confidence-gaming | self-reported score would increase allowed action | guard fails; metric cannot grant authority |
| wrong-entity-time | same names, wrong date/context | identity unresolved / blocked |
| duplicate-after-close | incorrectly closed item is re-created | deterministic duplicate key blocks duplicate |
| provider-drift | field semantics change without version bump | schema/semantic validation fails closed |
| budget-loop | repeated reconciliation exceeds call budget | run ends `BUDGET_EXCEEDED`; task output cannot override |
| model-swap | stronger model used with same broken input contract | evaluation remains failing; no automatic promotion |
| activity-pressure | weak evidence but system expected to emit action | `NO_ACTION` accepted |
| aggregate-metric-trap | top-line success rate masks poor weighted outcome | scorecard requires multiple metrics + uncertainty |
| retrospective-contamination | generated explanation promoted as future rule | blocked absent independent validation |
| evaluator-self-edit | evaluator attempts to modify original decision | capability refusal + failed evaluation |
| stale-replay | source/evidence digest changed | replay incompatible, not equivalent |

## 9. Phase plan

### P0 — evidence / REA intake
- [x] resolve source identity;
- [x] inspect Reddit source;
- [x] inspect public product pages;
- [x] inspect six-month retrospective;
- [x] inspect `llms.txt` and OpenAPI;
- [x] classify donor vs standalone;
- [x] internal convergence with #111/#177;
- [x] define clean-room and gambling exclusion boundary;
- [x] create governance issue #249;
- [x] create research branch;
- [ ] continue public-source/license scan only if it changes implementation rights.

### P1 — contract kernel
- [ ] bundle JSON schemas for decision, ledger entry, outcome, correction and model generation;
- [ ] canonical serialization/digests;
- [ ] explicit `NO_ACTION` / `NEEDS_HUMAN` state;
- [ ] memory-policy field;
- [ ] provider-budget fields;
- [ ] fixture examples.

### P2 — append-only ledger engine
- [ ] insert-only accepted decision records;
- [ ] separate outcome append;
- [ ] correction append;
- [ ] immutable lineage queries;
- [ ] duplicate external identity guard.

### P3 — reliability evals through #111
- [ ] metric-gaming fixture;
- [ ] memory-poisoning fixture;
- [ ] wrong-identity/time fixture;
- [ ] duplicate/reconciliation fixture;
- [ ] budget-runaway fixture;
- [ ] no-action fixture;
- [ ] known-good controls;
- [ ] repeated stochastic runs where appropriate.

### P4 — generation + replay
- [ ] model generation registry;
- [ ] baseline compatibility contract;
- [ ] model/prompt/tool/provider revision binding;
- [ ] decision replay;
- [ ] drift classification.

### P5 — Workbench surface
- [ ] ledger timeline;
- [ ] before/after outcome views;
- [ ] corrections visibly chained;
- [ ] generation comparison;
- [ ] memory/context inclusion report;
- [ ] provider-budget telemetry;
- [ ] eval scorecards.

### P6 — independent verification
- [ ] exact-head deterministic tests;
- [ ] evaluator/source mutation isolation;
- [ ] restart/reconciliation tests;
- [ ] provenance review;
- [ ] clean-room check;
- [ ] no gambling-execution capability scan.

### P7 — Shipping OS integration
- [ ] bind exact implementation SHA;
- [ ] require compatible #111 evaluation receipts;
- [ ] require no unresolved correction/reconciliation state;
- [ ] require policy proof that metrics cannot widen authority;
- [ ] preserve no-deploy-without-gate rule.

## 10. Acceptance criteria

The first vertical slice is complete only when all are true:

```text
fixture InputSnapshot
 -> deterministic validation
 -> AgentDecision
 -> append-only ledger entry
 -> later synthetic OutcomeObservation
 -> #111 evaluation
 -> optional CorrectionReceipt
 -> replay from original input/evidence
 -> exact lineage comparison
```

Required negative checks:
- post-outcome rewrite of original entry fails;
- post-outcome rewrite of rationale/confidence fails;
- correction without original-reference digest fails;
- generation B cannot silently inherit A scorecard;
- stale evidence invalidates replay equivalence;
- write-only retrospective cannot appear in next decision context;
- provider budget overrun fails run despite plausible output;
- confidence/score cannot become an authorization grant;
- evaluator cannot edit accepted decision;
- ambiguous entity/time remains blocked;
- no-action fixture passes when evidence threshold is not met.

## 11. Provenance / IP

Use only:
- public behavior/docs;
- explicitly public JSON/OpenAPI;
- standard architecture patterns;
- independently authored contracts/tests/implementation.

Do not copy:
- proprietary application code;
- paid-only artifacts;
- branding/trade dress;
- proprietary prompts;
- internal/private datasets.

If an upstream repository appears later, record exact repository, commit SHA, file paths and license before direct reuse.

## 12. Tracker truth

Current state at dossier creation:

`SOURCE=done / EVIDENCE=first-pass-done / RECONSTRUCTION=first-pass-done / PRODUCT_ROUTE=done / DEDUPE=done / FAILURE_MODEL=done-first-pass / OWNED_SPEC=done-first-pass / CLEAN_ROOM=defined / CONTRACT_IMPLEMENTATION=not-started / LEDGER_RUNTIME=not-started / EVAL_INTEGRATION=not-started / UAT=none / DEPLOYMENT=none / SHIPPED=no`

Do not promote status based on this document alone. Runtime, tests, hosted CI, independent verification, UAT and Shipping OS evidence remain separate gates.
