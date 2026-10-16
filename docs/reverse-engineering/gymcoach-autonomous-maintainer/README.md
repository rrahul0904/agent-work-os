# GymCoach autonomous maintainer — REA report

Status: **donor/reference captured; clean-room implementation started in Agent Work OS**

Source target: `gymcoach-app/gymcoach`, surfaced from the Reddit post about the gym app that keeps building itself.

## 1. What we are actually reverse engineering

The valuable system is not the workout UI. GymCoach is a proof workload for an autonomous repository-maintainer loop. Public project documentation describes agents selecting work, implementing on branches, running verification, opening pull requests, challenging changes with review agents, requiring CI on the candidate head, and merging through a gate. A human keeps ownership of product direction and reserved classes of decisions.

Agent Work OS should therefore treat GymCoach as a **behavioral donor and evaluation corpus**, not as an application to clone. The owned product is a provider-neutral **Autonomous Maintainer / Self-Working Loop** that can operate across many repositories while preserving Agent Work OS authority, provenance, isolation, and Shipping OS release gates.

## 2. Roadmap + REA placement

Canonical flow:

1. **Source / target identity** — pin donor URL, repository identity, date, public evidence and license context.
2. **REA evidence + capability discovery** — extract observable capabilities and failure-derived controls; separate facts from inferred architecture.
3. **Clean-room decision** — mark each capability `adopt_pattern`, `compare_only`, or `reject` with constraints.
4. **Owned contract** — compile accepted findings into Agent Work OS work proposals and an `autonomy-contract/v1` policy.
5. **Isolated execution** — one task, one worktree, provider adapter owns only implementation activity.
6. **Deterministic verification** — tests, acceptance, security checks and any project-specific golden paths.
7. **Independent challenge** — required review lenses bound to the exact head/base SHAs.
8. **Policy gate** — reserved paths/actions require explicit head-bound human approval; stale review evidence fails closed.
9. **Shipping OS** — preview/UAT/deploy/exact deployed-SHA verification and release receipt remain the shipping authority.
10. **Observe + learn** — post-merge signals, cost/quality data, failures and review findings become regression tests, policy candidates or REA findings.
11. **Replay** — re-run representative tasks across agent/model versions to measure drift before widening autonomy.

REA is a discovery/evidence provider. It does **not** become the orchestration or release authority.

## 3. Public donor capabilities captured

| Donor pattern | REA decision | Owned Agent Work OS form |
| --- | --- | --- |
| Exact-head review + CI merge gate | Adopt pattern | `evaluateAutonomyGate()` with head/base SHA binding and required checks |
| Multi-lens adversarial review | Adopt pattern | Provider-neutral correctness / does-it-work / security lenses |
| Human-only classes of work | Adopt pattern | Reserved path/action policy with explicit exact-SHA approval |
| Failure journal and lessons | Adopt pattern | Evidence ledger + failure-to-guard promotion |
| Worktree separation | Adopt pattern | Existing Shipping OS Git worktree manager and future task worktree pool |
| Usage/cost capture | Adopt pattern | Agent Work OS cost/quality telemetry per attempt/reviewer/run |
| Contained maintainer evals | Adopt pattern with strict gate | Credential-free replay sandbox, file allowlist, network policy and tamper canaries |
| Claude-Code-specific hooks | Compare only | Generic adapter/policy hooks across Codex, Claude, OpenCode and future providers |
| Donor branding, UX, product copy | Reject | No reuse required |

The machine-readable extraction lives in `contracts/rea-gymcoach-autonomous-maintainer.example.json` and can be ranked or compiled into a backlog with `npm run autonomy -- rea-rank ...` / `rea-backlog ...`.

## 4. Failure-derived controls worth preserving

The donor's strongest contribution is the record of ways autonomous maintenance can fail:

- a green review can become stale after a fixup commit;
- one review lens can accidentally clear another lens's stop;
- two concurrent worktrees can collide through shared resource names;
- an evaluation container can have more host reachability than intended;
- an agent can tamper with the grader or test framework instead of solving the task;
- apparently sensible domain rules can break real existing scenarios;
- a safety hook can accidentally block the operator rather than only the subagent;
- deny-lists tend to lose against creative bypasses, so claims must stay narrower than the evidence.

Our implementation turns the first three into immediate hard gates and keeps contained agent-eval execution disabled-by-default until its own acceptance matrix is complete.

## 5. Owned architecture

```text
Market / issue / telemetry / operator intent
                 |
                 v
         REA evidence intake
   source identity + capability proof
                 |
                 v
       Clean-room backlog compiler
      score(value, confidence, risk, effort)
                 |
                 v
          Canonical WorkItem
                 |
        policy + budget selection
                 v
       Task worktree / implementer
       Codex | Claude | OpenCode | ...
                 |
                 v
      deterministic project checks
                 |
                 v
      independent review lenses
 correctness | runtime | security | domain
                 |
                 v
        Autonomy policy gate
 exact SHA + CI + latest review + approvals
                 |
                 v
             Shipping OS
 verify -> preview -> UAT -> deploy -> SHA proof
                 |
                 v
      receipt + post-merge observer
                 |
          failure / drift / cost
                 +--------------------> learning + replay
```

Authority boundary: implementer/reviewer agents may propose evidence; **Agent Work OS policy and Shipping OS decide progression and completion**.

## 6. v0.1 implemented in this branch

- `services/control-api/src/autonomy-policy.js`
  - validates `autonomy-contract/v1`;
  - requires isolated worktrees, independent review, exact-head merge evidence and bounded budgets;
  - requires every configured CI check to be green on the exact candidate SHA;
  - requires independent `READY` evidence for each review lens on the exact head/base pair;
  - uses only the latest record for each reviewer and blocks edited or `NEEDS_CHANGES` records;
  - turns reserved paths/actions into `HUMAN_APPROVAL_REQUIRED` unless approval is bound to the exact head SHA;
  - returns a deterministic evidence digest for the gate decision.
- `services/control-api/src/rea-intake.js`
  - rejects REA findings without evidence;
  - records clean-room decisions and constraints;
  - ranks findings by value/confidence/risk/effort;
  - emits only `adopt_pattern` findings as proposed backlog items with evidence digests.
- `scripts/autonomy.mjs`
  - contract validation;
  - gate evaluation;
  - REA ranking and backlog compilation.
- Tests cover stale review SHA, self-review, blocking latest review records, reserved path approval, evidence requirements and clean-room filtering.

This is intentionally an **autonomy decision layer above Shipping OS**, not a second release engine.

## 7. Autonomy ladder

We should widen authority only when evidence supports the next level:

- **L0 — Observe:** REA/telemetry finds work; system only recommends.
- **L1 — Plan:** system writes bounded work proposals and acceptance criteria.
- **L2 — PR-only:** agents may build/test/review and open PRs; humans merge.
- **L3 — Low-risk auto-merge:** exact-SHA gates may merge pre-approved low-risk work classes.
- **L4 — Preview auto-deploy:** green changes deploy automatically to isolated previews and undergo UAT.
- **L5 — Canary production:** Shipping OS may deploy reversible canaries under SLO/rollback policy.
- **L6 — Portfolio autonomy:** the control plane allocates a bounded budget across multiple repos based on value, risk and maintenance health.

The current implementation is foundation for L1/L2 and the gate required before L3. Production actions remain reserved.

## 8. What else we can build from this

### Product surfaces

1. **Repository Autopilot** — connect a repo, select an autonomy level, define reserved paths/actions and let the system maintain low-risk work continuously.
2. **Portfolio Maintainer** — score all owned repositories for broken CI, stale dependencies, coverage gaps, security findings, docs drift, dead code and operational toil; allocate agents against the highest-value safe work.
3. **Market-to-Code Loop** — ingest Reddit/GitHub/customer feedback through REA, deduplicate capability requests, prove demand, generate clean-room specs and safely build validated opportunities.
4. **Repo Rescue Mode** — take an unhealthy repository, establish a reproducible baseline, stabilize tests/builds, produce an evidence ledger and graduate it onto the autonomy ladder.
5. **Agent Benchmark Lab** — replay the same maintenance tasks across Codex/Claude/OpenCode/model versions and compare correctness, security findings, retries, cost and latency.
6. **Policy Compiler** — turn a human charter into machine-readable path/action/risk/budget/review rules and test the rules before enabling autonomy.
7. **Failure Memory / Guard Factory** — cluster CI failures, review findings and production incidents; propose a regression test or policy rule; measure whether recurrence falls.
8. **Release Evidence Vault** — exact-SHA review, CI, preview, UAT, deployment and rollback receipts for audit-sensitive teams.
9. **Cross-model Review Mesh** — deliberately use different providers for author and reviewer to reduce correlated mistakes and measure disagreement.
10. **Self-healing CI** — specialize one loop in flaky-test diagnosis, dependency mirror failures, runner drift and deterministic build repair without widening product-write authority.
11. **Documentation Maintainer** — compare behavior/API/schema against docs and examples, open evidence-backed updates, and verify code snippets automatically.
12. **Launch Packager** — after a verified release, generate changelog, screenshots/tutorial media, docs updates and social drafts from accepted receipts—not from unverified branch claims.

### Defensible differentiation

The moat should not be “we run Claude in a loop.” It should be **governed evidence-backed autonomy**:

`REA evidence -> canonical WorkItem -> isolated execution -> independent exact-SHA review -> machine policy -> Shipping OS receipt -> replay + learning`.

That architecture can survive model/vendor churn because the authority, evidence model and release truth stay ours.

## 9. Next implementation waves

### Wave A — PR-only maintainer
- connect WorkItems to isolated task worktrees;
- add provider-neutral reviewer jobs;
- collect GitHub checks and immutable review records;
- create/update PRs but do not merge automatically;
- expose the autonomy gate in the operator console.

### Wave B — learning and replay
- append attempt/review/cost telemetry;
- turn failures into candidate tests/guards;
- build a credential-free replay sandbox and known-cheat canary corpus;
- compare model/provider changes before promotion.

### Wave C — bounded merge authority
- repo-configured risk classifier;
- human-approved low-risk work classes;
- branch protection/ruleset verification;
- exact-SHA merge receipt;
- post-merge observation window and auto-filed rollback recommendation.

### Wave D — portfolio autonomy
- health/value/risk scoring across repos;
- budget allocator;
- concurrency and machine-load scheduler;
- cross-repo dashboards and SLOs;
- optional canary deployment via Shipping OS.

## 10. Clean-room boundary

This implementation uses publicly observable behavior and public documentation as evidence. It does not copy GymCoach source, product branding, private prompts, database state, test fixtures or protected assets. Donor-specific implementation details are either generalized independently or left as comparison-only findings. Agent Work OS owns its policy schema, evidence digest, state model, provider interfaces and Shipping OS integration.
