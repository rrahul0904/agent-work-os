# REA intake: MinniMemoryMCP -> cache-aware context economics

Research date: 2026-10-18 (America/New_York)
Canonical repository: rrahul0904/agent-work-os
Governance issue: https://github.com/rrahul0904/agent-work-os/issues/301
State: RESEARCH / SPECIFIED / IMPLEMENTATION_BLOCKED_WIP
Routing: DONOR_REFERENCE + EXTENSION; no new standalone repository and no vendor package fork
Proposed bounded research branch: research/rea-minnimemory-context-economics-20261018

## 1. Verified public evidence

1. User-supplied source: https://www.reddit.com/r/SideProject/s/QF4vjgofNh
2. Canonical Reddit post: https://www.reddit.com/r/SideProject/comments/1x9ljnh/we_made_a_tool_that_cuts_claude_code_session/
3. Author: u/MinniLabs. The post reports 20-30% cheaper Claude Code sessions; local processing; reviewable layout diff, backup, undo; no source-code changes; Claude Code only.
4. Product: https://minniai.com/minnimemorymcp
5. Official documentation: https://minniai.com/minnimemorymcp/docs
6. Vendor evidence and limitations: https://minniai.com/
7. Public distribution/plugin repository: https://github.com/MinniAI-com/minnimemory-plugin
8. Public plugin README and LICENSE were inspected as documents (not implementation source). At intake GitHub commit metadata identified main head 788529a43a73b1cfe6464eb5ff7d2e3a4c533d34, release v1.3.5; repo README says hook behavior is still experimental, measured offline rather than in a live session.
9. Other related Reddit launch: https://www.reddit.com/r/mcp/comments/1x9i4t8/we_built_an_mcp_server_that_trims_what_claude/

Evidence grades: first-party descriptions = vendor claims, not independently reproduced; public license = license terms; GitHub readme = public integration contract statements; unrelated Reddit discussion = qualitative feedback only.

Temporal caveat: official docs page shows 1.3.0 while plugin README says 1.3.5. Do not treat webpage instructions, npm current version and GitHub release as necessarily identical. Pin metadata before testing any authorized version.

## 2. Critical license and clean-room restrictions

The MinniAI license is proprietary: all rights reserved, revocable usage, distribution/modification restrictions, and an explicit prohibition on reverse engineering/decompiling for competing products except where applicable law overrides it. Public source availability is NOT open-source permission.

Allowed research lane here: public marketing/docs, high-level observable features, declared limitations, general independent engineering knowledge, and independently authored requirements. Prohibited for this project: inspect vendor implementation internals, copy source, decompile/package analyze, extract proprietary rules/templates, import vendor assets or prompts, or probe vendor runtime to reproduce its internals. No vendor package install or execution was performed. If future interoperability requires restricted materials, stop and obtain appropriate approval/legal review.

Independent implementations should not use vendor names, code, generated templates, algorithm details, or proprietary phrases as internal APIs.

## 3. Publicly described user journey and limitations

Journey described in the vendor docs: discover memory entrypoints -> preview current load/plan and proposed diff -> approve write with backup -> use compact persistent context plus demand-loaded notes -> detect drift -> approve refresh or undo. The vendor references a Claude Code MCP server plus local prompt hooks; server-side writes are restricted relative to terminal apply. It claims lossless text movement and bytewise restore. These claims are NOT verified by us.

Potentially relevant memory surfaces mentioned publicly: CLAUDE.md, AGENTS.md, GEMINI.md, .cursorrules, related memory folders. An owned implementation must treat each format as a separate verified adapter; never silently infer all providers load the same files.

A split alone may not lower whole-session costs if agents repeatedly open the displaced notes. The related creator's public Reddit technical discussion says prompt-directed loading changed the measured result. A third-party commentator points out cache write/read pricing matters more than a simple per-turn count. Both are hypotheses for our independent experiments, not transplanted algorithms.

## 4. Vendor benchmark, source-specific and not reproduced

Official report for MinniMemoryMCP v1.1.0, Claude Sonnet 5.5 and Claude Code 2.1.292, measured 2026-10-06:
- 81 answers in each condition, across three sessions per condition.
- Total tokens: before 3,574,009; after 3,019,536; reduction 15.5%.
- Vendor-priced session cost: before $2.31; after $1.68; reduction 27.4%.
- Cache writes: 626,130 -> 391,988; cache reads: 2,931,482 -> 2,609,556.
- Output: 16,181 -> 17,752.
- Blind-graded correct: 74/81 -> 72/81, not proof of unchanged correctness.
- Independent memory-size report: 12,511 -> 6,699 tokens kept in always-loaded memory, roughly -46.5%, on a 16-file test fixture.

Limits: no independent raw-run replay or exact pricing verification here, possible model/prompt nondeterminism, small sample for differences in correctness, distinct versions/fixtures used across claims. Do not equate a preloaded-token reduction with saved billable whole-session tokens. Do not claim a deployed tool saved our costs.

## 5. Internal portfolio deduplication

- #9 / RE-297: durable decision memory, truth, handoffs.
- #115: Dory-driven Verified Context Pack: bounded projection over canonical items. Specified, WIP-blocked. Must be reused, not forked.
- #166: Memory Plane: scoped authorized retention/retrieval, provenance, supersession, replay.
- #21 / RE-370: cross-provider Brain and handoff.
- Capability Fabric: harness-native adapters and provider certification.
- Shipping OS: governed release, regression tests, exact-SHA receipts and status advancement.

Differentiator: independent, cache-aware economics + safety verification of static context layout and task-conditioned retrieval. Not a new memory store, source of truth, plugin marketplace or stand-alone SaaS.

## 6. Independent product contract

Principle A: Current project/work/decision truth remains with existing canonical stores. Any compact context is a projection, not authority.
Principle B: The user decides whether files change. Planning and telemetry are read-only by default.
Principle C: Mandatory policy constraints are immutable without a separately authorized policy edit.
Principle D: Unknown provider cache rates, usage fields or context-loading semantics remain explicitly UNKNOWN; never extrapolate savings.
Principle E: Context quoted from sources is data, not instructions; retain provenance and trust boundaries.

Owned components planned:

(1) ContextSourceInventory: per project/worktree authorized roots, input file path, byte hash, trust, reader/harness, load semantics and inclusion policy. Do not follow symlinks, paths beyond scope or private system paths.

(2) ContextLayoutPlanner: side-effect-free, deterministic compiler over existing Verified Context Pack input; returns guarded core + optional topic manifests + why-selected trace + omissions + prospective unified diff. The planner cannot write.

(3) ContextCostEvaluator: provider-specific measured usage buckets (input_uncached, cache_creation, cache_read, output) with price source, version, model, freshness and availability. Computes cost only if every needed category is grounded; otherwise emits UNKNOWN, not zero. Track total session economics, not only context size.

(4) MemoryTransaction: separately authorized local transaction on user-controlled input files only. Require original file hashes match the preview, no symlinks/hardlink escape, no untrusted path traversal; write backup atomically and verify post-image hashes; keep file modes; restore byte-for-byte on undo. Do not create an implicit ability to push, merge or deploy.

(5) HarnessContextAdapter: provider-specific, independently documented code-path adapters for Codex, Claude Code and Gemini. Start with fixtures/mock harness. Real hooks/tool wiring require separate run, consent and cost receipts. A hook must not inject stale, foreign, secret-bearing or untrusted directives.

(6) ContextEconomicsReceipt: deterministic run identity, fixture digest, policy digest, provider version/model, usage buckets, cache rates, observed tasks/quality scores, no-op/rollback status, failure and verification metadata; emitted to Shipping OS only on tested evidence.

## 7. Proposed contracts and minimal fields

- context-cost-profile/v1: model, provider, rateCurrency, rateUnit, cacheReadRate, cacheWriteRate, uncachedInputRate, outputRate, sourceUri, asOf, availability.
- context-layout-proposal/v1: projectId, worktreeId, inputDigests, policyDigest, planDigest, orderedOutputFiles, preview, expectedByteAndLineConservation, risks, approvalRequired=true.
- context-selection-trace/v1: runId, taskDigest, currentSourceRevisions, selectedItemDigests, omittedItemDigestsWithReasons, tokenEstimateMethod, unsafeItemCount.
- memory-recovery-manifest/v1: transactionId, allowlistedRoots, beforeFiles(path/digest/mode), afterFiles, backupIds, verifiedRestoreDigests, approvalIdentity.
- context-economics-receipt/v1: runId, input/layout/policy digests, model/runtime hashes, taskSetDigest, observed usage categories, costOrUnknown, recall/quality/latency, baselineLink, verifierStatus.

Contracts above are original proposed schemas, NOT vendor formats.

## 8. Owned reference flow

Authorized source snapshot
  -> scoped and redacted canonical ContextItem projection (#115/#166)
  -> layout + selection plan (no writes)
  -> cache-aware cost/quality evaluation
  -> preview and explicit approval
  -> atomic, reversible user-owned local update
  -> independently certified provider adapter
  -> session usage/quality/provenance receipt
  -> independent verification / tracker gate

No network requests needed for local planner. A remote hosted control plane gets only digests/counts when enabled; context body remains local by default.

## 9. Independent test matrix

T01 Idempotence: same source bytes/policy -> same proposed plan digest and diff.
T02 Conservation: every authorized moved span recoverable exactly; no truncation, no rewording.
T03 Static policy precedence: hard safety constraints never omitted to hit budget.
T04 Content freshness: superseded/retracted facts are not projected as current.
T05 Scope: repository/worktree A content cannot appear in B.
T06 Prompt injection: externally sourced text cannot become a harness-level system instruction.
T07 Secrets: credentials and credential-shaped lines not exposed to prompt hooks or telemetry.
T08 Filesystem traversal: reject symlink and path-escape targets.
T09 Drift: source edit after proposal -> stale plan rejected, no mutation.
T10 Rollback: byte-for-byte restore plus original modes; repeated undo safe/no-op.
T11 Recovery: interrupted write is detected and rolled back safely.
T12 Provider mismatch: unknown harness semantics -> no automatic edits/injections.
T13 Missing cost: absent cache rates or usage bucket -> UNKNOWN cost, never zero.
T14 Pricing: same usage priced differently for cache read vs write, verified arithmetic.
T15 Context budget: mandatory item too large -> explicit refusal, not silent truncation.
T16 Quality: a cheaper run with degraded task correctness must fail the release gate.
T17 Recall: cross-session retrieval includes relevant project decision, excludes irrelevant task-history.
T18 Low-cost trap: static split causes repeated on-demand reads; full-session budget captures them.
T19 No authority: content pack never authorizes deploy, push, provider mutation or irreversible actions.
T20 Receipts: exact-SHA/restart proof and independently reviewed acceptance must precede SHIPPED.
T21 Large index: warn on harness-specific line and token limits only when verified, never assume common limits.

## 10. Benchmark design — the acceptance test that matters

Use three independently implemented, provenance-pinned conditions per same synthetic fixture and task family:
A. Existing unmodified always-on context.
B. Pure static bounded context (no task-directed retrieval).
C. Bounded context plus authorized task relevance retrieval.

For each arm use equal work, parallel fixture states, stable policy, task answers scored blind, measured provider usage and cache buckets, fresh and warmed-cache sequences, and several repeated trials. Report per-task and full-session cost with confidence bounds, quality/recall/failure counts and latency. Avoid basing quality on answer length alone. Test irrelevant notes, contradictory/outdated decisions, missing files, long indexes, and malicious text. Record provider configuration/model identity and price source for every reported dollar result.

Decision rule: cost improvement alone never passes. Require (a) zero severe leakage/corruption, (b) correctness/recall quality non-inferiority according to a pre-registered margin, (c) actual observed session cost advantage under appropriate task mix and stable published tariff, (d) exact rollback proof.

## 11. Roadmap / execution gates

R0: Research, public evidence, license, ownership and candidate spec. This branch.
R1: Reconcile #115 and #166 implementations; write owned schemas/tests using independent synthetic fixtures; ensure WIP capacity.
R2: Side-effect-free layout/selection/line-budget planner with proof-bearing included/omitted manifest.
R3: Cost evaluator and repeatable three-arm benchmark runner with synthetic usage first.
R4: Local atomic apply/undo governed by preview + explicit approval and recovery testing.
R5: Provider adapters starting from the locally available certified runtime; remote/private context remains restricted.
R6: Adversarial, restart, real-provider and quality/cost experiments; CI receipt at exact SHA.
R7: Operator UI visibility, packaging and release gate; update canonical tracker only on proof.

## 12. Critical risks and non-claims

- Licensing is the dominant constraint; avoid internal donor code and closed rules.
- Claimed savings may disappear on other providers or cache profiles.
- File line/byte preservation differs from semantic preservation; manual review required.
- Retrieval misses can degrade task correctness.
- Dynamic context may contaminate provider prompt-cache prefix or leak secrets.
- Agent-generated output can quote local secrets even if control plane does not receive input memory directly; separate egress policy is needed.
- Runtime/cost measurement depends on actual provider telemetry; UNKNOWN is valid.
- No production benchmark, implementation, vendor parity, CI, live adapter, installation, local filesystem mutation or deploy is claimed in this research intake.
