# ZeroSlop category → Agent Work OS Change Airlock

**Snapshot:** 2026-10-12  
**Coordination issue:** #153  
**Source:** https://www.reddit.com/r/coolgithubprojects/s/EneRjeZoOL  
**Identified product:** https://github.com/patrickswedish/zeroslop-action  
**Observed donor head:** `ba57f9799ade347d2f264894ef2e155dc6861462`  
**Donor license:** proprietary / NOASSERTION on GitHub metadata

## Executive decision

Do **not** reverse engineer, decompile, decode, benchmark against, or derive rules from the ZeroSlop executable. Its license expressly prohibits reconstruction of source code, algorithms, AST heuristics and invariant rules, and prohibits using its outputs to benchmark a competing automated reviewer.

Use the product only as **market/category evidence** for a clean-room capability we independently need in Agent Work OS:

> agent/worktree change → deterministic local evidence → fail-closed change policy → repository-native verification → immutable exact-SHA receipt → PR/deploy authorization

The resulting subsystem is named **Change Airlock**. It is not a ZeroSlop clone and does not use ZeroSlop code, assets, trademarks, telemetry, executable behavior or diagnostic outputs.

## Why this belongs inside Agent Work OS

Agent Work OS already has local agent execution, isolated worktree shipping, verification commands, exact tested/deployed SHA checks, receipts and a Shipping Supervisor. The missing layer is a deterministic pre-review gate that reasons about the **shape and safety of the proposed change itself** before expensive verification, PR creation or deployment.

The Change Airlock therefore sits between agent work completion and Shipping OS verification.

```text
Task / Work Contract
        |
        v
Isolated Worktree
        |
        v
Agent produces change
        |
        v
+----------------------------+
| Change Airlock             |
| - exact diff identity      |
| - change budget            |
| - test/assertion loss      |
| - dangerous text controls  |
| - policy findings          |
+----------------------------+
        |
   PASS | BLOCK
        |    \
        v     -> repair / human review
Repository-native build/test/security checks
        |
        v
Preview / UAT / production gates
        |
        v
Exact-SHA shipping receipt
```

## Source and evidence ledger

### OBSERVED / DOCUMENTED

- The Reddit post presents the product as a fast deterministic PR gate focused on local/static analysis, test-deletion defense and reduced review noise.
- The public website markets AST/diff minimization, local compiler/linter execution, security shields, a single PR verdict and no model-token cost.
- The GitHub repository is public but distributed under a proprietary license rather than an open-source license.
- The repository was created 2026-10-08 and was still being actively edited on 2026-10-12.
- The public website uses a private API/license-key activation model.
- The license states that pull-request diffs are transmitted over TLS to authorized Ribbsaeter Systems API endpoints and evaluated ephemerally with a zero-retention policy.

### CONTRADICTIONS / UNVERIFIED CLAIMS

1. **"Local / zero bytes leave runner" vs remote verification.** Reddit/README-style positioning describes a fully local architecture, while the license and product page describe a private API and transmitted PR diffs. The stronger interpretation is therefore "zero retention" rather than "zero egress."
2. **Proof attribution.** Public upstream pull requests can prove that those pull requests exist and were accepted; they do not independently prove that a particular commercial product or algorithm caused the result.
3. **Counts change.** Public surfaces use different counts such as 16, 18 and 34+ upstream contributions. Treat them as vendor claims until independently reconciled.
4. **Pricing changed rapidly.** An October 9 press-release snapshot described different tiers from the October 12 product page/README. Pricing is not a stable product invariant.
5. **"100% green" / merge-time / ROI claims.** These are marketing claims, not general guarantees. A deterministic preflight can reduce known classes of failure but cannot prove every external CI environment, reviewer decision or runtime behavior without executing the relevant checks.

## Transferable category lessons

The valuable idea is not a secret rule set. The transferable architecture is:

1. run before human review;
2. operate on a bounded change, not the whole product narrative;
3. make deterministic findings first;
4. fail closed on explicitly forbidden change classes;
5. execute repository-native verification rather than inventing a parallel toolchain;
6. minimize review noise by emitting one structured report;
7. keep policy and evidence machine-readable;
8. bind every verdict to exact source identity;
9. make repair/retry explicit;
10. separate deterministic authorization from optional generative explanation.

## Our product boundary

### MATCH

- deterministic local CLI;
- PR/worktree diff analysis;
- assertion/test-loss guard;
- Unicode direction-control/Trojan-source guard;
- repository-native verification integration;
- compact structured verdict;
- exact source identity;
- CI integration.

### IMPROVE

- truly local core with **no mandatory remote verification API**;
- evidence-first receipts rather than marketing score;
- explicit policy configuration checked into the repository;
- exact base/head SHA binding;
- no claim that a heuristic "proves architecture";
- no auto-rewrite by default;
- independent verification commands already owned by Shipping OS;
- clean separation between observation, authorization and effect;
- replayable reports and stable rule identifiers;
- support for human waiver with reason + authority + expiry in later phases;
- SARIF export for GitHub-native security/code-scanning UX;
- signed/tamper-evident release evidence in later phases.

### NEW

- agent identity and work-contract binding;
- expected-files / allowed-scope policy from the task contract;
- generated-code/lockfile-aware budgets;
- dependency manifest delta policy;
- migration/schema destructive-change gates;
- secret/credential introduction scans;
- changed API/schema contract comparison;
- test-selection and coverage-delta adapters;
- provenance checks for generated artifacts;
- replay comparison against previous approved airlock receipts;
- risk classes that influence required UAT depth;
- fleet policy across repositories;
- policy packs for data engineering, web, infrastructure and agent code;
- integration with worktree isolation and Shipping Supervisor receipts.

### OMIT

- donor trademarks/branding/assets;
- proprietary donor rule reconstruction;
- donor executable inspection/decompilation;
- donor API/telemetry reverse engineering;
- vendor-specific pricing/license design;
- unsupported "mathematical proof" marketing;
- autonomous deletion/rewrite of user code before evidence/approval.

## Phase A implemented slice

The first implementation is intentionally small and independently authored with Node 22 standard-library code only.

### `change-airlock/v1`

Inputs:

- unified Git diff;
- optional exact `baseSha` / `headSha`;
- repository policy.

Deterministic checks:

- changed-file budget;
- added/deleted/total changed-line budgets;
- deleted test-file detection;
- assertion delta (`added assertions - deleted assertions`);
- added bidirectional/invisible direction-control Unicode;
- stable diff SHA-256 digest;
- stable receipt SHA-256 digest.

Decision:

- `PASS` when no blocker finding exists;
- `BLOCK` when one or more blocker findings exist.

CLI:

```bash
npm run airlock -- --base origin/main --head HEAD
npm run airlock -- --diff-file fixtures/example.diff
npm run airlock -- --base origin/main --head HEAD --policy config/change-airlock.json --output .agent-work-os/airlock.json
```

The CLI exits `0` for PASS, `1` for policy BLOCK and `2` for execution/input failure.

## v1 policy contract

Current defaults are conservative development defaults, not universal security truth:

```json
{
  "maxChangedFiles": 50,
  "maxAddedLines": 1500,
  "maxDeletedLines": 1500,
  "maxTotalChangedLines": 2500,
  "minAssertionDelta": 0,
  "blockOnDeletedTestFile": true,
  "blockOnBidiControl": true
}
```

Repositories should override these values with checked-in policy once real baselines exist.

## Required failure behavior

- malformed policy fails execution rather than silently relaxing policy;
- deleted test files are visible and block by default;
- negative assertion delta blocks by default;
- new bidi/direction-control text blocks by default;
- change budgets are deterministic and cannot be overridden by the coding agent unless policy authority explicitly changes the policy file;
- missing/invalid git refs fail execution;
- report digests bind the verdict to the analyzed diff;
- exact SHAs are recorded when analysis is run against Git refs;
- a PASS is **not** permission to deploy; it only satisfies this gate;
- an AI model can explain a finding later but cannot convert BLOCK to PASS.

## Known Phase A limitations

- assertion detection is lexical and intentionally small; it is not yet AST-aware;
- quoted Git paths and complex rename/copy diff syntax need a stronger parser;
- generated code and lockfiles are not yet separated from authored code budgets;
- no dependency graph or blast-radius model yet;
- no SARIF output yet;
- no Semgrep/CodeQL/ast-grep adapter yet;
- no language-specific AST adapters yet;
- no coverage delta yet;
- no waiver model yet;
- no Shipping Supervisor integration yet;
- no UI/PR check summary yet.

These are tracked as later phases rather than hidden behind a single "slop score."

## Open-source / standards donors we can legally use

- **Git** unified diff and exact commit identity for source evidence;
- **GitHub SARIF/code scanning** for native structured findings;
- **Semgrep CE/local CLI** for optional deterministic/static rules;
- **ast-grep** for structural AST search and rewrite where appropriate;
- repository-native tools such as ESLint, Ruff, Clippy, gofmt, tests and compilers;
- CodeQL where the repository/license/environment permits it;
- Unicode Trojan Source guidance/CVE-2021-42574 class checks;
- standard cryptographic digests for evidence identity.

No one external scanner becomes the authority. The Change Airlock normalizes their evidence into policy decisions owned by the repository/work contract.

## Target architecture

```text
                     Work Contract / Policy
                              |
                              v
Git base SHA -----> ChangeSet Collector <----- Git head SHA
                              |
                              v
                    Deterministic Core
          +-------------------+--------------------+
          |                   |                    |
      Diff Budget       Test Preservation    Text Safety
          |                   |                    |
          +-------------------+--------------------+
                              |
                    Normalized Findings
                              |
             +----------------+----------------+
             |                                 |
        Policy Engine                    Evidence Writer
             |                                 |
         PASS/BLOCK                 change-airlock/v1 receipt
             |
             v
       Shipping Supervisor
             |
   repository-native verification
             |
      preview/UAT/production
```

Later adapters:

```text
Semgrep / CodeQL / ast-grep / dependency audit / schema diff / coverage
                              |
                              v
                     normalized findings
                              |
                              v
                       same policy engine
```

## Integration with Shipping OS

Recommended contract evolution:

1. add `preflight[]` commands before `builder.command`;
2. require a machine-readable receipt path for preflight gates that claim evidence;
3. persist preflight command evidence in Shipping Supervisor events;
4. bind Change Airlock `headSha` to the worktree SHA analyzed;
5. after repair, rerun Change Airlock because the diff changed;
6. require final airlock receipt digest in the release receipt;
7. block if analyzed SHA differs from tested SHA;
8. only then permit preview/production paths.

Target lifecycle:

`WORKTREE_READY → AIRLOCK_VERIFYING → AIRLOCK_PASS → BUILD_COMPLETE → VERIFIED → PREVIEW_UAT_PASS → PRODUCTION_VERIFIED → SHIPPED`

A block should remain explicit:

`AIRLOCK_BLOCKED` with rule IDs, receipt digest and repair/human-review path.

## Roadmap

### P0 — Discover / Understand / Prove — COMPLETE for category discovery

- [x] resolve Reddit short link;
- [x] identify canonical product/repository;
- [x] pin observed donor head;
- [x] inspect public product/marketing documentation;
- [x] identify proprietary license boundary;
- [x] stop executable-level reverse engineering;
- [x] identify public claim contradictions;
- [x] map opportunity into Agent Work OS.

### P1 — Model / Specify — COMPLETE for v1

- [x] clean-room target boundary;
- [x] MATCH / IMPROVE / NEW / OMIT matrix;
- [x] `change-airlock/v1` report contract;
- [x] fail-closed decision semantics;
- [x] initial policy schema;
- [x] explicit non-claims and limitations.

### P2 — Build smallest Phase A — IMPLEMENTED_LOCAL candidate

- [x] pure Node deterministic diff analyzer;
- [x] change budgets;
- [x] test-file deletion guard;
- [x] assertion delta guard;
- [x] bidi control guard;
- [x] exact git SHA capture in CLI;
- [x] diff + receipt digests;
- [x] unit tests;
- [ ] CI green on branch/PR;
- [ ] runtime fixture against a real temporary git history.

### P3 — Shipping Supervisor integration

- [ ] preflight command stage;
- [ ] receipt ingestion and digest binding;
- [ ] rerun after repair;
- [ ] tested-SHA equality gate;
- [ ] blocker taxonomy + UI state;
- [ ] immutable inclusion in release receipt.

### P4 — Structural/static adapters

- [ ] ast-grep adapter + rule packs;
- [ ] Semgrep local adapter;
- [ ] optional CodeQL/SARIF adapter;
- [ ] normalize external findings;
- [ ] tool/version/config digests in receipts.

### P5 — Scope / architecture contracts

- [ ] task expected-files/allowed-scope contract;
- [ ] package/dependency delta policy;
- [ ] public API/schema diff;
- [ ] DB migration destructive-change checks;
- [ ] generated/lockfile-aware budgets;
- [ ] repository topology/blast-radius evidence.

### P6 — Test intelligence

- [ ] AST-aware test/assertion inventory by language;
- [ ] coverage delta adapters;
- [ ] mutation-test adapter where useful;
- [ ] test-selection evidence;
- [ ] flaky-test/retry evidence without hiding failures.

### P7 — Security hardening

- [ ] secret introduction scanner;
- [ ] GitHub Actions trust-boundary rules;
- [ ] dependency provenance/advisory checks;
- [ ] shell/injection policy packs;
- [ ] path/symlink/worktree escape checks;
- [ ] sandboxed handling of untrusted PR code.

### P8 — Product UX

- [ ] single PR check summary;
- [ ] SARIF annotations;
- [ ] local CLI explain mode;
- [ ] policy editor with review/authority boundaries;
- [ ] waiver request/approval workflow;
- [ ] history/replay/comparison view.

### P9 — Self-working agent loop

- [ ] agent receives structured blocker evidence;
- [ ] bounded repair plan;
- [ ] change → rerun → compare loop;
- [ ] repair budget;
- [ ] escalate when policy/requirements conflict;
- [ ] no self-waiver or self-policy-relaxation.

### P10 — Verification / Compare / Deploy / Certify

- [ ] CI green on exact SHA;
- [ ] runtime acceptance fixtures;
- [ ] adversarial diff corpus;
- [ ] false-positive/false-negative evaluation per rule pack;
- [ ] Shipping OS end-to-end receipt;
- [ ] preview/UAT evidence;
- [ ] deployment state tracked separately;
- [ ] only then mark SHIPPED/CERTIFIED.

## Competitive/product opportunity

The commercial product is broader than "AI slop detection." A stronger wedge is:

**Agent Change Control / AI Coding Governance**

For teams using coding agents, every autonomous change gets a local, reproducible, policy-bound evidence package before merge/deploy. This can serve regulated enterprises, platform engineering teams and organizations running many coding agents in parallel.

Potential packaging:

- open local CLI/core;
- GitHub/GitLab/Bitbucket CI adapters;
- Agent Work OS integrated edition;
- enterprise policy packs and fleet governance;
- self-hosted evidence/control plane;
- signed compliance exports;
- organization-wide analytics based on metadata/receipts rather than source-code retention.

## Explicit non-claims

No ZeroSlop algorithm parity. No inspection of its bundled implementation. No use of its diagnostic outputs as a benchmark. No claim that our lexical v1 is an AST engine. No claim of universal security coverage. No claim that PASS means code correctness. No claim that tests, runtime, UAT or deployment are complete until separately proven. No SHIPPED state yet.

## Public sources reviewed

- Reddit source post: https://www.reddit.com/r/coolgithubprojects/s/EneRjeZoOL
- ZeroSlop public repository/README/license: https://github.com/patrickswedish/zeroslop-action
- Product page: https://www.ribbsaetersystems.com/zeroslop
- GitHub SARIF documentation: https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/integrate-with-existing-tools/upload-sarif-file
- GitHub `pull_request_target` security guidance: https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target
- Semgrep local/CI documentation: https://semgrep.dev/docs/category/local-and-cli-scans
- ast-grep documentation: https://ast-grep.github.io/guide/quick-start
