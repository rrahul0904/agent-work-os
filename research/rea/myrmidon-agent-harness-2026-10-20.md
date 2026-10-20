# REA source audit — Myrmidon agent harness (2026-10-20)

> **Decision:** DONOR / REFERENCE into existing `rrahul0904/agent-work-os`. **No standalone clone.**
>
> **Status:** Source-inspected; initial differential architecture and executable acceptance *plan* recorded. Not a verified running integration, not a completed security review, not merged, not deployed.

## 1. Identity, date and provenance

- User URL: https://www.reddit.com/r/WebAfterAI/s/azlwOHHGzU
- Resolved: https://www.reddit.com/r/WebAfterAI/comments/1x5etvd/your_ai_tools_can_do_the_work_myrmidon_brings/
- Reddit author: u/robinclash3. Title: “Your AI tools can do the work. Myrmidon brings them together into one team.”
- Upstream: https://github.com/Robinbinu/myrmidon (owner Robinbinu); inspected `main` **e6ea366b15b36ad760bf4bd87fbd2513c0c93c9e**, dated 2026-10-11 12:09:20Z. **All paths in this report are relative to that SHA**; upstream can drift.
- Root license: Apache-2.0 (`LICENSE`, verified content). `NOTICE` requires preservation of attribution on derived redistribution. `THIRD_PARTY_NOTICES.md` separately covers MIT channel-adapter source donors, BSD-2 voice adapters, Apache-2.0 adapters, etc. Any adapted code/asset requires file-by-file attribution review, not license laundering.
- Runtime: TypeScript, Bun >=1.3.14; package scripts include typecheck, Biome lint, test, eval and desktop. macOS Apple Silicon beta; README says DMG signed but not yet notarized.
- Platform proof: `docs/ci.md` and `.github/workflows/ci.yml` run routine CI on **macOS**; Linux/Windows via manual workflow and tracked as pending (#27/#28 upstream). Treat cross-platform readiness as unproven.

This is a source-code inspection, **not** a full clone, software execution, external-service authorization, penetration test, or live-system observability audit.

## 2. Source anatomy and reconstructed execution flow

| Concern | Pinned upstream evidence | What it establishes |
| --- | --- | --- |
| Core state | [`packages/core/src/log.ts`](https://github.com/Robinbinu/myrmidon/blob/e6ea366b15b36ad760bf4bd87fbd2513c0c93c9e/packages/core/src/log.ts), `sqlite-store.ts`, `blobs.ts` | Event/SQLite-backed local state primitives |
| Canonical events | [`packages/protocol/src/event.ts`](https://github.com/Robinbinu/myrmidon/blob/e6ea366b15b36ad760bf4bd87fbd2513c0c93c9e/packages/protocol/src/event.ts), `colony-state.ts`, `audit.ts`, `run-diff.ts` | Typed event/projection/diff boundary |
| Agent orchestration | [`packages/runtime/src/colony.ts`](https://github.com/Robinbinu/myrmidon/blob/e6ea366b15b36ad760bf4bd87fbd2513c0c93c9e/packages/runtime/src/colony.ts), `agent.ts`, `specialists.ts`, `goal.ts` | One lead orchestrates worker execution and rounds |
| Independent reviewer | [`packages/runtime/src/verifier.ts`](https://github.com/Robinbinu/myrmidon/blob/e6ea366b15b36ad760bf4bd87fbd2513c0c93c9e/packages/runtime/src/verifier.ts) | Verifier actor writes task/colony verdicts; declared acceptance for colony |
| Workspace isolation | [`packages/runtime/src/worktrees.ts`](https://github.com/Robinbinu/myrmidon/blob/e6ea366b15b36ad760bf4bd87fbd2513c0c93c9e/packages/runtime/src/worktrees.ts), `checkpoints.ts`, `git.ts` | Git worktree-per-worker, merge/conflict, checkpoints |
| Sandboxed execution | [`packages/runtime/src/sandbox.ts`](https://github.com/Robinbinu/myrmidon/blob/e6ea366b15b36ad760bf4bd87fbd2513c0c93c9e/packages/runtime/src/sandbox.ts), `permissions.ts`, `read-access.ts` | Scoped shell/file boundaries, tool permissions, path checks |
| Browser and desktop | [`packages/runtime/src/browser.ts`](https://github.com/Robinbinu/myrmidon/blob/e6ea366b15b36ad760bf4bd87fbd2513c0c93c9e/packages/runtime/src/browser.ts), `computer/driver.ts`, `computer/grants.ts` | Browser CDP and local computer-use adapter surfaces |
| Long-running context | [`packages/runtime/src/memory.ts`](https://github.com/Robinbinu/myrmidon/blob/e6ea366b15b36ad760bf4bd87fbd2513c0c93c9e/packages/runtime/src/memory.ts), `recovery.ts`, `skill-scan.ts`, `hooks.ts` | Memory, recovery, policy hooks, intake scan |
| Real-model evaluation | [`apps/eval/src/main.ts`](https://github.com/Robinbinu/myrmidon/blob/e6ea366b15b36ad760bf4bd87fbd2513c0c93c9e/apps/eval/src/main.ts), `cases.ts`, `report.ts` | Optional model-spending trials, budgets and before/after comparisons |
| App surfaces | `apps/desktop`, `apps/web`, `apps/cli` | Desktop, browser, CLI clients around a common runtime/protocol |

Conceptual event flow reconstructed from the source: **user request / session -> lead & task planner -> isolated workers and authorized tools -> event stream & artifact state -> independent verifier with declared checks -> verified/rejected task and reviewable diff**. This is an interpretation of modules; real-world success is not established without end-to-end tests.

### Reviewer behavior nuance (important)

`Verifier.verifyColony()` explicitly returns **failure** if no acceptance checks are declared. `Verifier.verifyTask()` can initially mark a task as passing when it declares neither outputs nor files, treating its notes/messages as work; further model judging is conditional on `taskJudge`. **Do not generalize “independent reviewer” into “every task always ran tests.”** An owned verifier must bind a verdict to concrete acceptance criteria and artifact hashes, and fail closed for code/shipping lanes.

### Local isolation nuance

`worktrees.ts` snapshots the project's uncommitted edits into worker branches and serializes merges back into the user workspace. It can link ignored dependency directories (`node_modules`, `.venv`) from the base. This creates valuable parity targets *and* security tests for symlinks, path traversal, dirty trees, merge conflicts and mixed-trust caches. Static review is not a sandbox escape assessment.

## 3. Owned-platform comparison (confirmed code vs hypothesis)

Our canonical architecture is Node 22 control plane + local daemon/adapter over an authenticated socket (`docs/ARCHITECTURE.md`). The root project is MIT-licensed. Core `services/control-api/src/shipping-*.js` already defines contracts, worktrees, verification, receipts, exact SHA comparisons and blocked states; `runtime/daemon/src/command-receipts.js` already prevents duplicate command IDs within a bounded in-memory cache. Capability Fabric already compiles, installs, verifies and rolls back harness-native capabilities (`docs/CAPABILITY_FABRIC.md`, issue #259).

| Donor pattern | Existing owner and overlaps | Delta requiring empirical audit | Priority |
| --- | --- | --- | --- |
| Independent proof | Shipping supervisor/receipts; Capability Fabric verification; #111 | Require reviewer-vs-worker authority separation and reproducible artifact / exact-SHA attestation, independent of agent narration; confirm existing behavior before coding | P0 |
| Sandbox + permissions | Local daemon, shipping worktree, Capability Fabric safe install | Shell, browser, computer and remote-source policy parity including deny-by-default, symlink escapes, secrets and pre-action approval | P0 |
| Worktree/reconcile | Shipping `GitWorktreeManager`, #267 and #251 | Multi-worker conflict and clean base snapshot tests; interrupted recovery, no accidental writes to user's files | P1 |
| Replay, budgets and benchmarks | Shipping receipts, #111, #177, #291 | Failure injection + run comparison where tests measured the exact produced artifact | P1 |
| Same session, different clients | #99 workbench, #39 flow/work queue | Cross-client identity, scoped permissions, durable resume without privilege bleed | P1 |
| Capability/skill security scan | Capability Fabric, #259, #288 | Intake scan useful as advisory signal; deterministic policy must remain authority | P2 |
| Voice, channels, UI | Not core REA lane | Downstream only after cross-OS security + value proof; no provider token interception | P2 |

Related ongoing issues: #88 (REA), #99 (Workbench), #111 (Evaluation), #177 (Reliability), #251 (Localix), #259 (Capability Fabric), #267 (agent execution fabric), #288 (plugins), #291 (recovery), #322 (Airbnb multi-engine donor). Do not duplicate these owners.

## 4. Risk, rights and claim controls

1. **Proof confusion:** Event-sourced or append-only in an application store does *not* prove cryptographic tamper evidence, immutability across privileged admins, or replay determinism. Preserve hashes, event IDs, source SHA and independent reviewer identity; test replay mismatches.
2. **Overclaiming tests:** Upstream CI scripts and benchmark *harness existence* do not establish runs in this audit. Real-model evaluation deliberately incurs API cost and is excluded from ordinary `bun test`; no benchmark numbers are claimed here.
3. **Local privileges:** Computer use, developer shell, authenticated browser, memory and message channels are privileged surfaces. Treat retrieved pages/messages/skills as untrusted data. Require explicit per-action/credential approval; no unbounded network or live service writes.
4. **Third-party license chain:** Apache project with notice obligations includes separately acknowledged MIT/BSD/Apache components. Do not copy upstream branded visuals, app assets, provider auth flows or bundled code into this MIT repo without provenance and counsel as needed.
5. **Cross-platform mismatch:** Upstream is macOS-first; our Work OS platform strategy should not inherit Mac-only assumptions.
6. **Demo vs operational evidence:** README scenario and agent-generated review scores are illustrative unless reproduced with independent fixture data, reviewer, tests, receipts and telemetry.
7. **Subscription sign-in:** Provider policies and secret handling need a separate review before attempting to replicate any subscription-account sign-in behavior.

## 5. Proposed bounded owned implementation (not yet executed)

**First executable slice proposed:** proof-bound independent agent-review gate on top of the **existing** shipping/work-item infrastructure. This must pass a gap audit first (avoid rebuilding an existing mechanism).

- Input contract: candidate run ID; immutable source commit and worktree; worker actor; acceptance checks; output artifact/content hashes; allowed verification tool and policy snapshot.
- Reviewer: identity distinct from contributor; separate execution context; no inherited shell/browser write permissions; only checks pre-authorized by policy.
- Receipt: tested SHA and output checksums, reviewer actor, normalized command/tool results, event range and digests, score against each criterion, failure codes and retry budget.
- Fail-closed cases: absent criteria for code, same actor as reviewer, mutated worktree after tests, unexpected tool/network calls, broken symlink/path boundary, missing artifacts, conflicting results, replay digest mismatch, and lack of explicit promotion authority.
- Outcome: REVIEW_PASS / REVIEW_FAIL / BLOCKED; *never* automatic PR merge, push, deployment or irreversible action.
- Success gate: functional unit + adversarial tests; local hermetic integration with one 2-worker fixture and intentional merge conflict; exact-SHA receipt; independent audit and reviewed draft PR.

See `myrmidon-agent-harness-2026-10-20.acceptance.json` for acceptance fixture matrix.

## 6. Roadmap state / evidence ledger

| Phase | State as of 2026-10-20 | Evidence / next gate |
| --- | --- | --- |
| Target resolution + ownership | **DONE** | Reddit and verified GitHub upstream |
| Rights/provenance + pinned code survey | **DONE (static)** | Exact SHA, LICENSE, NOTICE, THIRD_PARTY_NOTICES, source path links |
| Current owned overlap scan | **DONE (initial)** | Work OS architecture, Capability Fabric, shipping modules, issues |
| Acceptance + threat model | **DRAFT** | Fixture matrix below; negative tests not executed |
| Gap-validated code change | **NOT STARTED** | Audit existing verifier/receipt authority, then smallest clean-room delta |
| Hermetic unit/integration/abuse tests | **NOT RUN** | Need runnable checkout and safe fixture environment |
| Real model/browser/desktop and OS matrix | **NOT RUN** | No macOS host, provider authorization or token budget in this read-only audit |
| Independent review, exact-SHA receipt and replay | **NOT VERIFIED** | Attach receipts to issue and PR only when observed |
| Merge, release and deploy | **BLOCKED** | Explicit governance/approval plus all tests required |

**Canonical issue:** https://github.com/rrahul0904/agent-work-os/issues/328

Do not advance tracker states without receipts proving that phase. Source changes on this research branch are not product completion.
