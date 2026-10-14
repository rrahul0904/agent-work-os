# Library-First Engineering (LFE) → Agent Reliability & Governance Plane

**Status:** RESEARCHED / RECONSTRUCTED / SPECIFIED-FIRST-PASS / IMPLEMENTATION NOT STARTED  
**Research date:** 2026-10-14  
**Canonical destination:** `rrahul0904/agent-work-os`  
**Tracker ID:** pending collision-free reconciliation  

## 0. Source identity and pinned evidence

### User-supplied source

- Reddit short link: https://www.reddit.com/r/SATNA_PROJECT/s/Ou8nxDkIDp
- Resolved thread: https://www.reddit.com/r/SATNA_PROJECT/comments/1x3tesd/lfe_library_first_engineering/
- Thread title: **LFE - Library First Engineering**

### Public donor repositories

1. **Agnostic framework** — https://github.com/StChiotis/Library-First-Engineering  
   - inspected `main`: `d42f342c9b62dd1b076beed39470068bd9310b03`
   - public license: MIT
   - purpose: file-driven, persona-based, IDE/LLM-agnostic engineering protocol

2. **Claude distribution** — https://github.com/StChiotis/Claude-LFE  
   - inspected `main`: `96a23b9dfead1d95c3ae56f03823ce5d13f2d49e`
   - public license: MIT
   - purpose: Claude Code distribution that mechanizes parts of the agnostic protocol through hooks, skills, validators and an eval harness

### Related public essay

- https://pub.towardsai.net/the-bottleneck-in-agentic-software-isnt-capability-it-s-trust-claude-lfe-8665c0ff5fbd

### Evidence classification rule

This dossier separates:

- **OBSERVED** — directly visible in public source/docs/repository structure;
- **AUTHOR-REPORTED** — claims in Reddit/article/product prose;
- **INFERRED** — architectural reconstruction from observable behavior;
- **OWNED DECISION** — what Agent Work OS should build;
- **UNKNOWN** — anything not evidenced strongly enough.

Do not promote inference or author marketing into implementation truth.

---

# 1. Executive decision

Do **not** clone LFE as a second agent operating system and do not make Markdown files the ultimate execution authority in Agent Work OS.

Treat LFE as a high-value **reliability/governance donor** whose best mechanics should become an **Agent Reliability & Governance Plane** inside Agent Work OS.

The most transferable ideas are:

1. durable coordination artifacts instead of relying on conversational memory;
2. explicit Architect → Builder → Inspector → Archivist separation;
3. phase-transition gates;
4. crash/session recovery from persisted coordination state;
5. documentation/domain/ADR discipline;
6. specialist inspection roles;
7. mechanically enforced hooks in the vendor-specific distribution;
8. a planted-defect evaluation corpus that measures whether reliability skills actually catch defects;
9. explicit recognition that the agnostic core's discipline gates are not a true sandbox.

Our implementation should retain those strengths but raise the assurance level from **prompt/file discipline** to **runtime-enforced, proof-bearing authority**.

Canonical relationship:

```text
User / Work Intent
      |
      v
Agent Work OS — authoritative work, policy, authorization, state
      |
      +--> REA Reverse Engineering Capability Layer (#88)
      |      -> donor/source evidence
      |      -> capability observations
      |      -> provenance / unknowns
      |
      v
Agent Reliability & Governance Plane  <-- LFE donor
      |
      +--> Mission Contract
      +--> Context Manifest
      +--> Role/Capability Grants
      +--> Coordination Artifact Ledger
      +--> Phase Gate Engine
      +--> Independent Inspector
      +--> Reliability Eval Suites
      |
      +--> Agent Evaluation Harness (#111)
      |      -> deterministic rules
      |      -> planted-defect fixtures
      |      -> catch-rate / false-positive receipts
      |
      v
Agent Workbench / coding agents
      |
      v
Verification receipts
      |
      v
Shipping OS
      |
      v
Preview / Production / Certification
```

REA remains an evidence/capability provider. It does not become authority for phase transitions, code mutation, merge, deployment, or tracker completion.

---

# 2. What LFE actually is

LFE is not mainly a code generator. It is a **development protocol for long-running AI-assisted software work**.

Its central problem statement is that model capability is not enough for dependable software development across sessions. Without durable project context and disciplined transitions, an agent may re-litigate decisions, lose intent, duplicate logic, drift from architecture, or declare work complete too early.

The framework attacks that problem with four linked mechanisms:

### A. A “Library of Truth”

A project maintains structured documentation for domain knowledge, architecture, ADRs, quality/debt, strategy and protocol state.

### B. Persona separation

The work is divided among personas such as:

- Architect
- Builder
- Inspector
- Archivist
- human “Brain”

The intended boundary is that each persona owns a narrow part of the lifecycle.

### C. File-based coordination

Intermediate work is persisted into `.plans/` artifacts rather than assumed to survive in chat context.

Representative handoff chain:

```text
conversation
 -> grill summary
 -> PRD
 -> vertical slices
 -> active plan
 -> plan critique
 -> builder completion artifact
 -> TDD report
 -> specialist check findings
 -> inspection report
 -> archivist/documentation update
```

These files also support restart/resume after an interrupted session.

### D. Discipline and mechanical gates

The agnostic framework defines discipline gates and ordering rules. The Claude distribution goes further with hooks/validators for concerns such as:

- boot preconditions;
- command/bash posture;
- “no mission” state;
- persona/path locks;
- persona transitions;
- plan critique gating;
- skill invocation ordering;
- status/pipeline narrative validation;
- frontmatter validation;
- session start reminders;
- checkpoint flips.

This is an important distinction: the generic framework is a protocol, while a host-specific distribution can enforce parts of that protocol mechanically.

---

# 3. Reconstructed LFE lifecycle

The observed major-change path is approximately:

```text
BOOT / ORIENTATION
  -> COMPLEXITY GATE
  -> ARCHITECT
       grill with docs
       -> PRD
       -> issues/slices
       -> implementation plan
       -> plan critique (PASS/WARN/BLOCK)
  -> BUILDER
       implement
       -> TDD pass
  -> INSPECTOR
       system context / zoom-out
       -> general inspection
       -> optional security/performance/complexity/dependency/mutation/visual checks
       -> diagnose first failure where appropriate
  -> ARCHIVIST
       synchronize permanent knowledge / changelog / status
  -> PERIODIC HYGIENE
       structural audit
       -> architecture improvement
```

A smaller “minor fix” path exists with a narrower scout-style boundary.

The protocol also maintains a compact entrance/status card and retention rules so active context does not grow indefinitely.

---

# 4. The strongest donor pattern: coordination artifacts as durable handoffs

The highest-value LFE mechanic is not the filename convention. It is the invariant:

> **A phase consumes a durable artifact produced by the previous phase rather than relying on the model to reconstruct critical state from conversational memory.**

This gives several useful properties:

- interruption recovery;
- explicit inputs and outputs per phase;
- human inspectability;
- less accidental cross-role scope creep;
- bounded context loading;
- a record of how a mission arrived at its current state.

However, plain files alone are not enough for our target assurance level. Agent Work OS should make coordination artifacts typed, immutable/versioned where appropriate, digest-bound to exact project/worktree/revision identities, and projected to files/UI only as needed.

---

# 5. The second strongest pattern: measured reliability through planted defects

Claude-LFE contains an evaluation corpus for reasoning/checking skills. The public `_evals` structure includes known-bad fixtures with planted defects and known-good controls, paired with expected-result sidecars.

Current public categories include:

- security defects such as SQL injection / command injection;
- performance defects such as N+1 and unbounded growth;
- complexity defects such as deep nesting / god-function patterns;
- mutation-oriented implementation/test pairs;
- plan-critique fixtures;
- clean controls to measure false positives.

The distribution uses a deterministic grader and protects fixture integrity so the defect is not simply telegraphed to the checker.

This is extremely valuable for Agent Work OS because it changes the question from:

> “Did the Inspector say it inspected the code?”

into:

> “Against this exact fixture corpus and checker/model/version, what defect classes did the Inspector reliably catch, and how often did it falsely flag clean inputs?”

This should become a specialization of the existing **Agent Evaluation Harness (#111)** rather than a second evaluation platform.

---

# 6. Public feedback / pressure points

The supplied Reddit launch is early and should not be treated as large-scale independent validation.

The most useful discussion pressure point is whether this level of scaffolding remains worthwhile as stronger models gain native subagents, skills, hooks and better context management.

That question becomes a requirement for us:

> **Our reliability plane must create value that survives model improvements.**

Therefore the durable product cannot depend on “the model is bad at remembering.” It should instead provide properties a model cannot self-assert into existence:

- authority separation;
- deterministic phase invariants;
- immutable provenance;
- independent verification;
- replay;
- measurable evaluator quality;
- exact revision binding;
- restart reconciliation;
- policy compliance;
- deployment evidence.

A better model should make the system faster, not make the governance layer irrelevant.

---

# 7. REA role in this reverse-engineering intake

This intake follows the Agent Work OS / REA evidence discipline:

```text
Source identity
 -> exact donor revision
 -> capability discovery
 -> workflow reconstruction
 -> failure/limitation discovery
 -> evidence classification
 -> owned clean-room behavior contracts
 -> implementation only after contracts
```

REA's canonical place remains issue #88: a governed reverse-engineering capability provider under Agent Work OS.

For LFE specifically, the useful REA evidence targets are:

- repository topology;
- skill inventory and contracts;
- hook inventory;
- coordination-file state transitions;
- validator/eval behavior;
- fixture/eval corpus structure;
- exact release/revision differences;
- public-source failure cases and limitations.

No REA result may authorize code changes. Evidence feeds this dossier/specification; Agent Work OS remains the authority boundary.

---

# 8. Internal dedupe and convergence

## #88 — Reverse Engineering Capability Layer

LFE research evidence enters through the same governed evidence boundary. No duplicate RE framework.

## #111 — Agent Evaluation Harness

This is the most important convergence.

Do **not** implement a second generic LFE eval engine.

Use #111 for:

- fixture/scenario identity;
- deterministic grading rules;
- semantic judge metadata where allowed;
- repeated-run distributions;
- baseline compatibility;
- exact model/tool/config identity;
- evaluation receipts;
- Shipping OS gate integration.

LFE contributes a new suite family:

**`reliability-inspector`** — planted defects + clean controls that measure the quality of inspectors, plan critics and specialist checks.

## Agent Studio (#27)

Published agent definitions/capabilities can later reference role profiles and reliability policies rather than inventing another agent-definition store.

## Agent Workbench / Workspace Runtime

Workbench remains the human and coding-agent interaction surface. Reliability roles become controlled execution modes, not a second desktop product.

## Memory Plane

Durable project/domain/decision context should converge with governed memory/provenance rather than duplicate long-term truth into arbitrary Markdown copies.

## Shipping OS

Shipping OS remains final release/certification authority. Passing the LFE-style protocol is evidence, not permission to deploy.

---

# 9. Product thesis — Agent Reliability & Governance Plane

Build a provider-neutral reliability subsystem inside Agent Work OS that transforms natural-language engineering work into a **proof-bearing mission state machine**.

Owned flow:

```text
intent
 -> MissionContract
 -> ContextManifest
 -> phase plan
 -> exact RoleCapabilityGrant
 -> bounded execution
 -> CoordinationArtifact
 -> phase-gate validation
 -> next role
 -> independent inspection/evals
 -> MissionReceipt
 -> Shipping OS
```

Key separations:

1. **Intent** — what the operator wants.
2. **Mission contract** — what completion means and what effects are allowed.
3. **Context** — exact source/domain/decision evidence loaded for this phase.
4. **Role** — what this persona/agent is allowed to do.
5. **Artifact** — durable handoff produced by the phase.
6. **Gate** — deterministic transition criteria.
7. **Evaluation** — whether a checker/agent actually performs reliably against known fixtures.
8. **Verification** — whether the real changed system satisfies acceptance conditions.
9. **Shipping** — whether evidence is sufficient to advance the product lifecycle.

No model message can directly advance canonical mission or shipping state.

---

# 10. MATCH / IMPROVE / NEW / OMIT

## MATCH

Adopt the following patterns conceptually:

- persisted coordination artifacts;
- Architect → Builder → Inspector → Archivist separation;
- major/minor complexity routing;
- explicit plan critique before build;
- specialist inspections;
- crash/session recovery;
- domain/ADR/document navigation discipline;
- context retention/hygiene;
- human review gates;
- planted-defect reliability evaluations;
- clean controls and false-positive measurement;
- file/browser/CLI projections over one workflow state.

## IMPROVE

### 1. Runtime authority instead of persona prose

A “Builder cannot edit X” rule must be enforced by an exact capability/path/effect grant, not merely written in a prompt.

### 2. Typed canonical state instead of Markdown-as-absolute-authority

Documentation remains important human-readable knowledge, but executable workflow truth lives in versioned structured records with schemas and digests.

Markdown is a projection/input class, not magical authority by filename.

### 3. Bind every phase to exact identities

Every artifact/gate carries:

- project/work/task/mission IDs;
- repository/worktree identity;
- base/head/source-tree digest where relevant;
- role definition version;
- policy version;
- context-manifest digest;
- input artifact digests.

### 4. Independent verification

The Builder cannot self-certify completion. An Inspector authored by the same model/config may provide evidence but decisive completion can require an independently configured verifier or deterministic checks.

### 5. Measured gates, not self-estimates

No fake token/cost/reliability self-report. Use actual platform/runtime telemetry where available, and exact eval outcomes for quality.

### 6. Provider/model drift awareness

Changing the model, checker prompt, tool catalog, policy, fixture corpus or evaluator version affects comparability. Baselines must be invalidated or explicitly downgraded.

### 7. Explicit restart reconciliation

An interrupted phase does not become complete because a coordination file exists. On restart, state is reconstructed from validated artifacts and execution receipts.

### 8. Evidence classes

Every claim can be tagged as observed / derived / inferred / unknown / verified. Missing evidence remains unknown.

### 9. Context economics as a measured product feature

Retain LFE's bounded-context discipline, but measure actual loaded bytes/tokens/artifact counts rather than relying on assumptions.

### 10. Cross-host neutrality

Claude Code hooks are one adapter. Codex, Claude, other agents and local runtimes should all consume the same canonical mission/role/gate contracts.

## NEW

Introduce owned contracts/capabilities:

- `mission-contract/v1`
- `context-manifest/v1`
- `role-capability-profile/v1`
- `role-execution-grant/v1`
- `coordination-artifact/v1`
- `phase-gate/v1`
- `phase-gate-receipt/v1`
- `mission-state/v1`
- `mission-receipt/v1`
- `protocol-debt/v1`
- `governance-drift/v1`
- `reliability-eval-suite/v1`
- `reliability-eval-receipt/v1`
- later `mission-replay/v1`

Reuse #111 contracts where they already cover scenario/run/evaluation semantics.

## OMIT / DEFER

- LFE branding/trade dress;
- copying donor prompts/prose as our product identity;
- fixed slash-command UX as the canonical interface;
- vendor-specific Claude hooks as universal authority;
- skill-directory mirroring as a core architecture requirement;
- blanket “one change per session” as a universal hard rule;
- treating all docs as more authoritative than signed/typed runtime truth;
- relying on role instructions as a security sandbox;
- exposing hidden chain-of-thought as a correctness artifact;
- unrestricted autonomous Git push/merge/deploy;
- automatic production advancement from Inspector prose;
- duplicating #111's generic evaluation kernel.

---

# 11. Phase-A behavior contracts

Phase A should be **side-effect-free and fixture-first**. Prove the governance state machine before wiring real coding agents.

## `MissionContract`

Required fields:

- mission ID/revision;
- project/work/task references;
- stated goal;
- accepted source/base revision;
- allowed repository/worktree roots;
- completion criteria;
- allowed effect classes;
- required roles/phases;
- required verification/eval suites;
- policy version;
- timeout/resource ceilings where configured;
- deterministic contract digest.

A MissionContract is not execution authority.

## `ContextManifest`

Records exactly what context a phase is allowed/expected to consume:

- source documents/files/decision records;
- revision/content digests;
- trust/evidence class;
- freshness state;
- scope/visibility classification;
- selected excerpts/views where needed;
- generated-at timestamp;
- deterministic manifest digest.

Changing a relevant source invalidates stale context-dependent phase grants according to policy.

## `RoleCapabilityProfile`

Example roles:

- Architect — read project/context; write plan artifacts; no production/source mutation.
- Builder — read approved plan/context; write only approved workspace/source paths; cannot alter accepted plan/gate artifacts.
- Inspector — read changed source/tests/evidence; write findings/reports; cannot modify production source in the decisive inspection lane.
- Archivist — write documentation/knowledge projections after verified mission result; cannot alter production behavior.

Capabilities are typed, e.g.:

- `read_source`
- `write_source`
- `write_tests`
- `write_plan_artifact`
- `write_inspection_artifact`
- `update_documentation_projection`
- `run_local_test`
- `invoke_external_tool`
- `network`
- `git_commit`
- `git_push`
- `merge`
- `deploy`

Unknown capabilities fail closed.

## `RoleExecutionGrant`

Binds exact:

- mission/phase;
- role profile digest;
- project/worktree/root;
- input artifact/context digests;
- approved effect classes;
- allowed paths/capabilities;
- expiry/attempt identity.

A role cannot widen its own grant.

## `CoordinationArtifact`

Generic envelope:

- artifact type/schema;
- mission/phase/producer role;
- exact input digests;
- canonical structured body;
- attachments/evidence references;
- created-at;
- producer runtime/model/tool identity where relevant;
- validation status;
- immutable digest.

Representative types:

- discovery/grill summary;
- PRD;
- slice set;
- active plan;
- plan critique;
- builder result;
- test result;
- specialist finding set;
- inspection result;
- archival/doc-sync proposal.

## `PhaseGate`

Pure policy defining:

- source phase;
- destination phase;
- required input artifact types;
- required validation/eval/verification receipts;
- freshness and revision conditions;
- allowed terminal outcomes;
- required human approval when configured;
- deterministic gate digest.

## `PhaseGateReceipt`

Records:

- gate/mission/phase/input digests;
- validations actually run;
- satisfied/unsatisfied conditions;
- warnings/unknowns;
- transition result `PASS | WARN | BLOCK | NEEDS_HUMAN`;
- exact next canonical state if allowed;
- immutable receipt digest.

Only the control plane applies the transition.

---

# 12. Canonical phase model

Proposed initial state machine:

```text
DISCOVERED
  -> CONTEXT_READY
  -> SPECIFIED
  -> PLANNED
  -> PLAN_REVIEWED
  -> BUILDING
  -> BUILT
  -> VERIFIED
  -> ARCHIVED
  -> READY_FOR_SHIPPING_GATE
```

Additional states:

- `BLOCKED`
- `NEEDS_HUMAN`
- `INTERRUPTED`
- `RECOVERY_REQUIRED`
- `SUPERSEDED`
- `CANCELLED`

A state transition must reference a gate receipt; canonical state cannot be advanced by free-form model prose.

---

# 13. Reliability eval design

This is the most important LFE-derived capability.

## Eval suite structure

A reliability suite contains:

- exact checker/role target;
- fixture corpus revision;
- known-bad cases;
- known-good controls;
- expected defect families;
- forbidden false-positive classes;
- scoring policy;
- run count / sampling policy;
- model/provider/tool configuration;
- grader revision;
- fixture-integrity/anti-telegraph checks.

## Metrics

At minimum:

- defect catch rate / recall;
- false-positive rate;
- precision where appropriate;
- per-defect-family result;
- deterministic vs probabilistic evidence class;
- run-to-run variance;
- timeout/error/abstain rate;
- cost/latency from measured telemetry when available.

Never convert one semantic-judge pass into deterministic truth.

## Initial fixture families

Start independently authored fixtures inspired by the public categories, not copied verbatim:

1. security
   - SQL injection
   - command injection
   - secret leakage
   - path traversal / unsafe filesystem boundary
2. performance
   - N+1 data access
   - unbounded collection/cache growth
   - blocking operation in latency-sensitive path
3. complexity / maintainability
   - deep control-flow nesting
   - god-function/module
   - architecture-boundary violation
4. test quality
   - mutation survives weak test
   - assertion that passes for wrong output
   - test coupled to implementation rather than contract
5. plan critique
   - acceptance criterion missing from plan
   - undocumented behavioral change
   - irreversible effect without recovery plan
6. governance
   - stale plan digest
   - builder attempts scope widening
   - inspector attempts source mutation
   - artifact from wrong role/mission/revision

Each family includes clean controls.

## Integration with #111

Implement these as a specialized #111 scenario/fixture profile where possible. The new reliability layer contributes role/gate semantics and the fixture corpus; #111 remains the reusable runner/receipt engine.

---

# 14. Required negative / recovery tests

### Authority and role isolation

- Architect grant cannot edit production source.
- Builder grant cannot modify accepted plan/gate policy artifacts.
- Inspector decisive lane cannot modify production source.
- Archivist cannot modify runtime behavior.
- role text/prompt cannot widen its own capabilities.
- a tool unavailable to the grant remains unavailable even if the model requests it.

### Mission/artifact identity

- artifact from another mission cannot satisfy the current gate;
- artifact from stale base/head/source digest is rejected;
- modified coordination artifact invalidates its digest and downstream gate;
- changed context source invalidates a freshness-bound grant;
- plan for worktree A cannot authorize worktree B;
- one project cannot read another project's restricted context by accidental filename collision.

### Phase ordering

- Builder cannot start without required approved plan gate;
- Inspector cannot certify missing/invalid build evidence;
- Archivist cannot mark mission complete before verification;
- direct invocation of later phase fails with a typed refusal;
- plan `WARN` policy cannot silently become `PASS` downstream.

### Independent verification

- Builder-authored “tests passed” prose is not verification evidence;
- missing verifier receipt leaves mission unverified;
- failed independent verification cannot be overwritten by builder status;
- deterministic verifier and probabilistic inspector disagreement remains explicit.

### Eval integrity

- fixture must not contain hidden metadata that directly names the expected defect in checker-visible inputs;
- known-good control prevents a checker from earning a high score by flagging everything;
- model/checker version change is visible in the receipt;
- grader policy/corpus change invalidates strict baseline comparability;
- repeated stochastic runs preserve distribution, not one cherry-picked result;
- timeout/error is not counted as a catch;
- abstention/unknown remains distinct from pass/fail.

### Recovery

- crash after artifact persistence but before state transition resumes safely;
- crash after an effect but before receipt persistence enters reconciliation, not automatic retry;
- restart reconstructs mission state from validated canonical records;
- duplicate exact retry is idempotent;
- conflicting operation identity is rejected;
- missing/corrupt projection file can be rebuilt from canonical state;
- corrupt canonical artifact blocks affected transition and preserves prior good state.

### Documentation/context hygiene

- oversized/stale active context is detectable;
- archived history remains addressable without being loaded into every phase;
- documentation update cannot rewrite accepted runtime history;
- stale ADR/domain record conflict is surfaced rather than silently resolved by priority guessing.

---

# 15. Phased implementation roadmap

## P0 — Source / evidence — FIRST PASS COMPLETE

- [x] resolve supplied Reddit source;
- [x] identify agnostic and Claude-specific donors;
- [x] pin exact inspected donor revisions;
- [x] inspect canonical LFE workflow/coordination model;
- [x] inspect Claude mechanical hook surface;
- [x] inspect skill-eval fixture model;
- [x] capture direct launch pressure point around framework overhead vs stronger native models;
- [x] perform initial internal dedupe against REA and Agent Evaluation Harness;
- [ ] archive additional public issues/commit failure cases where they materially change contracts;
- [ ] run future REA provider adapter over pinned source when #88 adapter is available/certified; do not block this source-level specification on that adapter.

## P1 — Contract kernel

Target location: existing Agent Work OS protocol/control-plane architecture; do not create a new product repo.

- [ ] implement schemas/canonicalization for MissionContract, ContextManifest, RoleCapabilityProfile, RoleExecutionGrant, CoordinationArtifact, PhaseGate and PhaseGateReceipt;
- [ ] deterministic digest tests;
- [ ] invalid/unknown-version fail-closed tests;
- [ ] no external provider credentials;
- [ ] no real source mutation.

## P2 — Fake mission state machine

- [ ] deterministic in-memory/local fixture runtime;
- [ ] Architect → Builder → Inspector → Archivist transition path;
- [ ] phase-gate engine;
- [ ] role-scope enforcement;
- [ ] interruption/restart fixture;
- [ ] stale artifact/context invalidation;
- [ ] mission receipt.

## P3 — Reliability eval corpus on #111

- [ ] independently authored security/perf/complexity/test/plan/governance fixtures;
- [ ] known-bad + known-good controls;
- [ ] deterministic expected sidecars where appropriate;
- [ ] anti-telegraph linter;
- [ ] catch-rate + false-positive scorecard;
- [ ] exact checker/model/config/corpus receipt;
- [ ] baseline comparison rules.

## P4 — Governed coding-agent adapter

- [ ] bind one local coding-agent adapter to the role/grant runtime;
- [ ] one disposable owned fixture repository/worktree;
- [ ] Architect cannot mutate source;
- [ ] Builder can mutate only approved paths;
- [ ] Inspector gets read/test/findings scope only;
- [ ] no push/merge/deploy;
- [ ] exact tool/effect receipts.

## P5 — Durable coordination ledger + recovery

- [ ] persist canonical mission/artifact/gate state;
- [ ] project/worktree scoping;
- [ ] restart reconciliation;
- [ ] crash points around artifact write / effect / receipt / transition;
- [ ] idempotency and conflict handling;
- [ ] projection into human-readable `.plans/`-style files only as a convenience, not sole truth.

## P6 — Workbench UX

- [ ] mission timeline;
- [ ] active role/phase;
- [ ] context manifest viewer;
- [ ] plan/critique/build/inspection artifact viewer;
- [ ] capability/authority explanation;
- [ ] gate failures with actionable reasons;
- [ ] human approval surface where configured;
- [ ] reliability scorecard and baseline diff.

## P7 — Documentation/knowledge synchronization

- [ ] governed Archivist projection into docs/ADR/domain/quality records;
- [ ] retention/hot-vs-cold context policy;
- [ ] drift detector between structured canonical decisions and documentation projections;
- [ ] no silent doc overwrite on conflict;
- [ ] Memory Plane integration where appropriate.

## P8 — Shipping OS integration

- [ ] Shipping Contract can require mission/gate/eval receipts;
- [ ] exact implementation SHA and mission receipt binding;
- [ ] verifier identity and independence policy;
- [ ] release gate refuses stale/incompatible reliability receipts;
- [ ] no automatic production mutation from reliability subsystem.

## P9 — Multi-agent / multi-provider certification

- [ ] Codex adapter;
- [ ] Claude adapter;
- [ ] at least one additional/local provider if useful;
- [ ] same canonical contracts across adapters;
- [ ] provider-specific capability differences explicit;
- [ ] scorecards do not compare incompatible configurations as if equivalent.

## P10 — enterprise hardening / commercial layer

Only after the core is proven:

- team/org policy;
- RBAC/SSO integration;
- centralized evidence/audit export;
- organization reliability baselines;
- approved role/capability templates;
- policy packs;
- fleet eval campaigns;
- compliance retention controls;
- signed release/verification records.

---

# 16. First vertical slice

The smallest convincing owned slice is:

```text
owned fixture repo
  -> MissionContract
  -> Architect reads bounded context, writes plan
  -> plan critique gate
  -> Builder receives exact source-path grant and implements one change
  -> deterministic test run
  -> Inspector receives read-only source/test scope
  -> Inspector checks a planted defect + one clean control
  -> independent deterministic verification
  -> Archivist proposes doc update
  -> mission receipt
  -> restart and replay prove the same canonical outcome
```

Required adversarial variant:

- Builder attempts to alter the approved plan after grant issuance → blocked.
- Inspector attempts to fix source directly → blocked.
- Source revision changes between plan and build → stale grant refused.
- Planted defect is missed → reliability eval fails even if the Inspector writes “PASS”.
- Clean control is falsely flagged → false-positive metric records the failure.

This slice demonstrates why the product remains useful even with stronger foundation models: the guarantees come from system authority and evidence, not model obedience.

---

# 17. Deployment / productization boundary

This capability should ship as part of Agent Work OS, not as a standalone “LFE clone.”

Potential commercial packaging later:

### Community / local

- local mission protocol;
- role templates;
- deterministic gate engine;
- basic local reliability suites;
- receipt export.

### Pro / team

- richer Workbench UX;
- historical reliability scorecards;
- model/config baseline comparison;
- reusable organization protocol templates;
- shared mission dashboards;
- extended fixture packs.

### Enterprise

- centrally governed role/effect policy;
- SSO/RBAC;
- evidence retention/export;
- approved model/tool catalogs;
- audit/compliance integrations;
- fleet-scale eval campaigns;
- policy-as-code release gates;
- signed proof bundles.

The sellable value is not “more prompts.” It is **measurable, enforceable reliability for AI-driven software delivery**.

---

# 18. Clean-room / license boundary

Both inspected donor repositories are publicly MIT-licensed, so direct code reuse may be legally possible subject to preserving license/copyright obligations.

Default Agent Work OS posture remains independently authored contracts and implementation because:

- we are assimilating concepts into an existing authority architecture;
- our state/receipt/grant model is materially different;
- copying vendor-specific hooks wholesale would create unnecessary coupling;
- independent implementation simplifies provenance and product identity.

If any source is intentionally reused later:

- pin exact upstream repository/revision/file;
- preserve MIT notice/license as required;
- record provenance;
- isolate reused helper logic from Agent Work OS canonical contracts;
- independently verify behavior/security.

Do not copy donor branding, marketing prose, screenshots, or visual identity.

---

# 19. Evidence ladder and tracker truth

Canonical evidence ladder:

```text
Source
 -> Understanding
 -> Evidence
 -> Reconstruction Model
 -> Specification
 -> Contract Tests
 -> Controlled Implementation
 -> Runtime Verification
 -> Recovery / Replay
 -> Operator UAT
 -> Shipping Gate
 -> Preview / Production
 -> Certification
```

Do not mark stronger states from weaker evidence.

Current truthful state:

```text
SOURCE=done
EVIDENCE=done-first-pass
RECONSTRUCTION=done-first-pass
INTERNAL_DEDUPE=done-first-pass
PRODUCT_THESIS=done
SPECIFICATION=done-first-pass
CONTRACT_IMPLEMENTATION=not-started
RUNTIME=none
EVAL_INTEGRATION=not-started
UAT=none
DEPLOYMENT=none
SHIPPED=no
```

Explicit non-claims:

- no LFE parity claim;
- no donor source copied;
- no Agent Reliability runtime implemented yet;
- no REA provider runtime execution claimed for this intake;
- no #111 integration implemented yet;
- no coding-agent role sandbox certified;
- no deployment or production readiness;
- no tracker RE-* ID assigned yet;
- no “shipped” status without exact-SHA implementation, verification, recovery and release evidence.

---

# 20. Next executable action

When a bounded BUILDING slot is assigned:

1. implement the Phase-A contract kernel in Agent Work OS;
2. build the deterministic fake mission state machine;
3. add one planted-defect + one clean-control reliability suite through #111;
4. prove role/grant isolation and restart recovery;
5. attach exact-head CI and mission/eval receipts;
6. only then connect a real coding-agent adapter;
7. only after that expose Workbench UX and Shipping OS gating.

Until implementation evidence exists, keep this project **SPECIFIED / SHIPPING-CONTRACT-READY**, not “complete.”
