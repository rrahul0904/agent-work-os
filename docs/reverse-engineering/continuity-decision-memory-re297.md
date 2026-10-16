# RE-297 — Continuity: repo-local decision memory and cross-agent session handoff

Research date: 2026-09-26 America/New_York (the source Reddit post is dated 2026-09-27 UTC). **Research/specification only. No Continuity code or binary copied, no live VS Code/MCP integration run, no implementation or parity claim.**

## 1. Source identity and verification

- Source post: https://www.reddit.com/r/SideProject/comments/1wr6fs1/hit_1k_in_vs_code_extension_license_sales/
- Original shortlink: https://www.reddit.com/r/SideProject/s/oNq2d8RaV1
- Reddit OP: Alienfader, product Continuity, advertised VS Code publisher/item: https://marketplace.visualstudio.com/items?itemName=hackerware.continuity-ultimate
- Video supplied by author: https://youtu.be/-7uuHIKHCVM (URL verified via source-post JSON; video frames/audio not independently audited).
- Official docs: https://www.getcontinuity.io/docs ; official architecture/marketplace listing: https://marketplace.visualstudio.com/items?itemName=hackerware.continuity-ultimate ; pricing: https://www.getcontinuity.io/pricing
- Technical overview: https://app.hackerware.com/technical-specs ; primary whitepaper v7.5: https://www.getcontinuity.io/whitepaper ; software terms: https://www.getcontinuity.io/terms
- Author's public chronology/prior-art gist: https://gist.github.com/Alienfader/9140a7311164d37a90f16600a1e4b6f1
- **Actual upstream benchmark repo**: https://github.com/Alienfader/continuity-benchmarks (public, MIT benchmark runner/fixtures only); **separate defensive publication**: https://github.com/Thiagoscode/continuity-defensive-publication
- **Proprietary commercial implementation is NOT publicly verified as accessible**: GitHub lookup for `Alienfader/continuity-ultimate` returned 404. Do not confuse with `NovasPlace/continuity`, a different project with the same generic name. Official terms explicitly say product and modern CLI/MCP/core packages are proprietary; historical MIT npm metadata is not a reuse grant.

## 2. Original Reddit post and actual feedback (snapshot)

OP self-reports ~370 Marketplace installs, ~$1,000 cumulative license sales, and weak install-to-paid conversion. They say clearer trial/onboarding, visible session-handoff value and conversations with paying users helped; building more features did not. OP weighs small-dev-team outbound against fixing install -> activation -> paid conversion.

One publicly readable respondent advises activation research before scaling outbound: personally onboard 15–20 teams with screenshare, locate the moment at which setup/first-value fails, and experiment with starting the trial at first successful handoff rather than installation. OP replies that this is actionable, observes that its trial can start before a user has experienced handoff value, and describes the sequence as live onboarding -> find drop-off -> improve activation -> outbound.

Reddit source metadata reports `num_comments=3`; two unique comment bodies (respondent and OP reply) were exposed in the accessible Reddit page/JSON. **One metadata-counted comment body is not verified; no content is invented.** User/revenue counts and respondent performance predictions are claims, not independently audited. Do not report the feedback suggestion as a shipped change. The Marketplace release notes already describe trial start after first decision and a seven-day pre-trial cap; that is not equivalent to first successful handoff. Capture this distinction in trial-related research.

## 3. First-party product surface / observed behavior

- Local repo journal at `.continuity/` (decision record history; documented `decisions.json`), intended to be owned/versioned alongside the code.
- Capture manually/CLI, git commits/file-save/hooks/AI sessions/MCP (five-layer auto-capture described as Pro).
- Curated session handoff: architecture/recent rationale/session notes before first agent prompt on configured editor + MCP path.
- Instructions for Claude Code, Cursor, Copilot, Gemini, Codex and other instruction-capable clients; recommended Claude Code MCP over stdio/workspace-root resolution.
- Search and scoped recall, path/symbol linkage, governance conflicts/staleness/override concepts, export, team Git sharing. Provider-configurable optional AI; logging/search/instructions described as functional without a provider, while AI capture/quality can call provider or fall back.
- Distinguish **extension + configured MCP** from **npm/CLI only**: latter can initialize/log on day 0 but does not guarantee automatic cross-session handoff until MCP is mounted or extension used. This is a key activation failure mode explicitly disclosed by publisher.
- Commercial segmentation at research time: 14-day Pro trial, after-trial manual logging remains free; Pro $9/mo, $89/yr, $199 lifetime; Team $15/seat/mo with 3-seat minimum. These are snapshot prices, not our target requirements.
- Latest public release notes observed on Marketplace include v3.0.167 proof-of-recall onboarding, v3.0.166 trial report, Sep 2026 trial reminders/identity prompt, and Aug 2026 first-run noise reduction. Do not claim installed/version-tested.

## 4. Architecture evidence versus inference

**Published first-party:** decision record + path/glob/rationale; path/entity-keyed retrieval before file-touching agent actions; bounded results injected as tool-result metadata in production concept; source describes cache, configurable budget and scoped handoff. First-party technical overview identifies local JSON, MCP, RAG, memory tool profiles and capture layers.

**Critical methodological qualification:** the whitepaper says public benchmark runners do NOT replay the production tool-result middleware: they prepend matched context to prompts. It explicitly reports no extra single-prompt alignment benefit for re-injection over passive retrieval, but a multi-session recall benefit in its fixtures; retrieval specificity rather than injection timing was the dominant observed factor. Its own full production middleware comparison is scaffolded, not complete. Do not advertise author benchmark claims as our test results.

**Unverified private internals:** exact commercial source, algorithms, schemas, production hooks, license implementation, extension binary runtime, security controls, server-side analytics, revenue, user-level conversion, and exact app performance.

## 5. Portfolio placement

**Canonical destination:** `rrahul0904/agent-work-os` as a **capability donor**: local session/agent orchestration, task/event lifecycle and native Codex thread continuation already exist on main at `55084ec8a62d53425cc508e48552cc633dd0c959` (verified README and recursive tree). Continuity-inspired project decision memory belongs in its daemon/control-plane integration without spinning up an unrelated standalone repo. `rrahul0904/contextos-ai` is an adjacent generalized memory concept; the verified main tree contains README only as of this research, so do not claim a running memory service or an integration dependency.

## 6. Independent clean-room build contract

### Phase A: reliable, auditable local memory (first executable slice)

1. Define a versioned neutral `ProjectDecision` schema with ID, project/repository/worktree scope, claim/choice/rationale, source reference, actor, UTC time, active/superseded/retracted status, affected paths, tags, confidence/verification state, sensitivity, supersedes ID, and content hash. Do not store provider chain-of-thought.
2. Build append-only transaction-safe local journal + materialized current view, atomic writes/file locks, schema migrations, deterministic idempotency, explicit tombstone/supersession, safe merge/conflict workflow, per-project isolation; Git-check-in policy only for reviewed shareable decisions.
3. Expose CLI/service contracts: init, log, list, search, inspect, amend/supersede, retract, handoff, export, doctor. Import/export JSON and human-readable Markdown with provenance.
4. Rehydrate a bounded session handoff comprising current goal, last successful actions, verified decisions, changed files, open tasks/risks, next suggested action, last checks/test evidence; never silently promote tentative notes into confirmed decisions.
5. Integrate agent-work-os local daemon/session events: thread ID links, project/worktree binding, first-session handoff and resume; echo adapter deterministic test first; Codex adapter opt-in test next.
6. Show a visible proof-of-recall UX: create/log one seeded decision, end one session, start a fresh one, and see cited decision and source hash before an agent acts. Preserve user inspection/edit/deletion controls.

### Phase B: context-aware retrieval and hooks

7. Retrieval from the **pending operation's path/entity targets**, plus prompt search fallback, bounded top-K/token/latency, stable ranking and source citations; compare to blanket/prepended-context baseline.
8. Configurable MCP adapter/host hooks and safe read/edit/write command detection; do not intercept arbitrary shell parameters without parsing/scope/permissions. Fail open for retrieval unavailability only where policy permits; fail closed on hard governance blockers.
9. Git diff/file-save observations become **drafts requiring review**; captured changes are not necessarily architecture decisions. Secrets/PII detection, denylisted paths, default no outbound repository content, and untrusted retrieved content treated as data.

### Phase C: governed cross-agent/team operation

10. Supersession, contradiction & staleness inspection with evidence/explainability; operator approve/override with immutable audit.
11. Scope separate private user preferences, project-wide architectural decisions and team-approved records. Durable team Git sync, three-way reconcile and conflict UI; never leak project records across customers or arbitrary MCP roots.
12. Client adapters for supported instruction files, Codex/Claude/Cursor/Copilot/Gemini where documented. Distinguish tested adapters from planned names; credential ownership stays on local daemon.
13. UX instrumentation opt-in: install -> setup success -> first decision -> first verified handoff -> day-2 return -> paid (paid only if ever monetized); never report private decision bodies.

## 7. Tests and acceptance gates

- A1 deterministic seeded repo decision retained across daemon restart, new native thread and new synthetic agent client; handoff cites original ID/hash.
- A2 conflicting decision is not silently overwritten; active view returns replacement only after explicit supersession, with old revision audit visible.
- A3 confirmed retract/delete prevents current recall; journal retention/erasure policy is explicit and testable.
- A4 path-scoped decision appears when touching file; unrelated decisions omitted; cross-repo/worktree/tenant isolation.
- A5 concurrency/corrupted journal/replay/partial-write safety; deterministic migration and export/import round trip.
- A6 token budget/latency and retrieval correctness compared under equal seeded fixture to no memory, blanket context, passive scoped retrieval and operation-targeted retrieval.
- A7 malicious text in decision body cannot become executable agent instruction; secrets scrubbed from shared export, injection payloads tested.
- A8 first-value onboarding proven by actual new-session handoff, not merely extension install or first logged decision.
- A9 run normal unit/integration/acceptance/CI, and explicit real editor/MCP integration with logs before claiming parity/hosted readiness.

**Research state:** public source + product docs + accessible comments + public benchmarks & license + our target repo audit complete; native implementation 0% specifically for RE-297. **Open gaps:** one source comment unexposed; demo not independently played; product private source/VSIX/runtime inaccessible; no live E2E nor benchmark reproduction. Revisit comments and run original product through its documented install only if lawfully licensed/accessible; no binary decompilation or proprietary code copying.

## 8. Additional evidence links

- Official release notes and install-path caveat: https://marketplace.visualstudio.com/items?itemName=hackerware.continuity-ultimate
- Whitepaper §3, §3.1 and §4.7: https://www.getcontinuity.io/whitepaper
- Public benchmark runner/README: https://github.com/Alienfader/continuity-benchmarks
- Author defensive technical publication: https://github.com/Thiagoscode/continuity-defensive-publication
- Software license: https://www.getcontinuity.io/terms
- Our current target repo: https://github.com/rrahul0904/agent-work-os


Tracker reconciliation: a newer canonical master concurrently assigned RE-296 to sitereal; this Continuity research was assigned RE-297 before persistent tracker merge. GitHub issue #9 / draft PR #10 remain stable.
