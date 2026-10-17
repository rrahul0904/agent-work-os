# Dory donor — bounded verified context memory

Research snapshot: 2026-10-11

## Source

User-supplied Reddit launch:
- https://www.reddit.com/r/coolgithubprojects/s/cFoYKjShYL
- resolved post: https://www.reddit.com/r/coolgithubprojects/comments/1x2roq3/i_made_dory_to_stop_reexplaining_my_projects/

Canonical public upstream:
- https://github.com/tjqscott/dory
- inspected upstream `main`: `faadbda68915fa1d70c4c2512196d82180630956`
- upstream commit date: 2026-10-05
- license: MIT
- plugin manifest version at inspected head: `3.0.0`

## Evidence status

This dossier separates upstream claims, public source behavior, benchmark evidence, community feedback and owned product decisions.

The supplied Reddit post says Dory exists to stop users re-explaining project context after context limits or model switches. It points to two editions:

1. a browser edition using one local HTML file and copy/paste context exchange;
2. a coding edition using a repository wiki, Claude Code plugin hooks/skills and Codex `AGENTS.md` instructions.

The exact supplied Reddit post exposes no substantive independent comment corpus in the accessible snapshot. Related earlier Dory launch threads do contain useful criticism: append-only history can become stale, current/unresolved handoff state matters more as work becomes parallel, and a fresh-session reconstruction test is the right proof target. Treat that as related community feedback, not feedback on the exact supplied post.

## What Dory actually demonstrates

At the inspected upstream head, Dory is not merely a `CHANGELOG.md` trick. Its v3 architecture has evolved into a small local-first context system.

### Browser edition

Observable flow:

`select pages/files -> compile bounded context -> copy into fresh chat -> work -> model emits typed posts -> local page validates posts -> append/supersede -> save`

Key mechanics:
- posts are append-only;
- a later post can supersede an earlier one with `replaces` instead of editing history;
- the page assigns ids and rejects malformed posts;
- context size is measured rather than guessed;
- optional project tree/data previews can be included;
- the single-file page makes no network calls;
- a `DORY.md` store is also under experiment.

### Code edition

Observable flow:

`session start hook -> load directives + wiki index + Now work -> agent works -> findings/decisions/tasks updated -> wiki lint on stop -> handoff/loop when needed`

Key pieces:
- `wiki/index.md`: root of a strict one-parent tree;
- `wiki/decisions.md`: decisions and reasons;
- `wiki/tried.md`: findings ledger so failed experiments are not rerun;
- `wiki/tickets.md`: `Now`, `Next`, `CPU`, `Done` taskboard;
- session-start hook loads directives, wiki index and current `Now` work;
- stop hook/lint enforces tree shape rather than trusting free-form model behavior;
- skill surface: `init`, `learn`, `wrap-up`, `handoff`, `loop`;
- long-run behavior uses five-hour usage thresholds: below 90% work normally, at 90% stop starting model-heavy work, at 95% launch CPU-only work and leave a handoff.

Dory's v3 design explicitly removed the old flat `CHANGELOG.md`/`history/` approach because flat history degrades into noise. The current design separates decisions, findings, task state and derived facts.

## Upstream architecture principles worth keeping

1. **Memory is outside the chat.** A fresh chat is disposable; durable context is local and inspectable.
2. **Current context is compiled, not equal to all history.** The working set is bounded and selected.
3. **Supersession is explicit.** Old information remains available but no longer looks current.
4. **Weak-model writes are constrained.** Append + validation is easier than asking a small model to rewrite a large memory file correctly.
5. **Context structure is enforced.** Hooks/lints reject malformed topology/state.
6. **Findings are first-class.** Failed experiments and evidence should prevent repeated rediscovery.
7. **Task state is separate from knowledge.** `Now/Next/CPU/Done` is not mixed into architectural history.
8. **Fresh-session recall is the real acceptance test.** A memory system is useful only if a new agent can resume correctly without hidden prior-chat context.

## Benchmark evidence

Upstream includes a synthetic notes benchmark comparing three model-write strategies: full rewrite, SEARCH/REPLACE patch, and append-with-supersession.

Run reported 2026-10-04 on an Apple M5 Max using Ollama 0.34.1, 20 trials per cell, note sets of 20/60/150 facts.

Reported aggregate outcome:
- Gemma 4 12B: 173/180 passing trials; all 60 trials at 150 facts passed.
- Qwen3 8B: 93/180 overall; append 49/60, rewrite 32/60, patch 12/60.

The useful signal is directional: append-with-validation appears materially easier for the weaker model than whole-document rewriting or textual patching. Do not treat this as a general benchmark result. Upstream itself notes small cell sizes, synthetic notes and generation-budget failures.

## Important upstream non-claims / open items

Dory's own v3 page still marks several items unverified or open:
- single-file browser store vs `DORY.md` experiment is unresolved;
- in-place `file://` save in Chrome is untested;
- Claude Code plugin is validated/unit-tested but was not yet installed from the marketplace in a live session at this inspected head;
- Codex skill install location is unverified;
- some wait/continue behavior depends on a newer Claude Code version.

Do not promote these to parity claims without our own runtime evidence.

## Internal dedupe / canonical placement

Canonical destination: **`rrahul0904/agent-work-os`**.

Do **not** create a standalone Dory clone.

Dory overlaps strongly with existing Agent Work OS lines:
- issue #9 / RE-297 — continuity decision-memory and verified cross-agent handoff;
- issue #21 / RE-370 — shared verified-context Brain across providers;
- Project/Work/Work Memory and current-task truth;
- Shipping OS proof/receipt discipline;
- autonomous supervisor/long-run execution direction.

Dory should therefore be treated as a **capability donor** for a bounded context compiler + portable project-memory projection, not as another authoritative memory store or task system.

## Owned product thesis — Verified Context Pack

Add a deterministic context-assembly layer over existing authoritative Agent Work OS facts:

`project/work identity`
`  -> authoritative memory sources`
`  -> freshness/supersession/trust classification`
`  -> bounded selection policy`
`  -> context pack + manifest + digest`
`  -> adapter (chat copy, AGENTS/skill, agent handoff)`
`  -> fresh-session resume`
`  -> evidence-backed update proposal`
`  -> canonical source update through existing authority rules`

Core rule:

> **The context pack is a projection of truth, never a second source of truth.**

A model may propose memory changes. It does not get to silently redefine canonical project/work status, approvals, deployment truth or evidence.

## MATCH / IMPROVE / NEW / OMIT

### MATCH

- local-first project context;
- fresh-session resume;
- bounded context instead of replaying full chat history;
- explicit supersession;
- decision memory separated from findings and task state;
- findings ledger to stop repeated failed experiments;
- small topical pages rather than one ever-growing blob;
- validation/lint before accepting memory structure;
- browser-copy and repo-agent adapter surfaces;
- token/size observability;
- handoff before context/quota exhaustion.

### IMPROVE

- compile from Agent Work OS canonical Project/Work/Decision/Evidence facts rather than making a wiki another authority;
- preserve provenance, verification level, freshness and source digest on every context item;
- separate `current`, `superseded`, `retracted`, `unknown` and `historical` states;
- keep current constraints/open work explicitly separate from long-term history;
- include parallel-thread/worktree ownership so one agent does not touch intentionally paused work;
- deterministic budget policy: what was included, omitted and why is part of the manifest;
- no raw secret/credential inclusion in context packs;
- project/workspace isolation is explicit and testable;
- human-authored facts cannot be silently rewritten by an agent;
- context generation never grants execution authority;
- provider/model switching changes presentation/token budget, not canonical truth;
- usage/quota thresholds are based on observed provider/runtime facts where available; unknown usage remains unknown rather than guessed;
- lint covers references, provenance, cycles, duplicate authority and stale derived facts, not merely page topology.

### NEW owned contracts

- `context-item/v1`
- `context-pack-policy/v1`
- `context-pack/v1`
- `context-pack-manifest/v1`
- `context-update-proposal/v1`
- `context-validation-receipt/v1`
- optional portable `project-memory-bundle/v1`

### OMIT / DEFER

- Dory branding, visual identity, prose and copied UI;
- a second authoritative taskboard beside Agent Work OS Work/Flow;
- a second authoritative decision store beside RE-297/Work Memory;
- copying upstream directives verbatim as our agent policy;
- blind injection of all memory into every prompt;
- claiming memory correctness merely because the file parses;
- marketplace/plugin parity before real installation/runtime tests;
- Obsidian-specific graph integration in the first slice;
- provider-specific quota automation until actual quota telemetry is available.

## Phase A — deterministic context-pack compiler

Phase A is side-effect-free and fixture-first. It does not edit canonical memory and does not execute tools.

### `ContextItem`

Required fields:
- stable item id;
- project/work/worktree scope;
- kind: `constraint | decision | finding | current_work | next_action | evidence | reference`;
- content or canonical structured payload;
- source identity + source revision/digest;
- author/actor when known;
- trust: `verified | user_asserted | agent_inferred | external_untrusted`;
- state: `current | superseded | retracted | historical | unknown`;
- optional supersedes/replaces references;
- observed/updated timestamp where relevant;
- freshness class/policy;
- sensitivity/redaction classification;
- deterministic item digest.

### `ContextPackPolicy`

Required fields:
- target adapter/model/context limit;
- hard output size/token budget;
- required item classes;
- priority order;
- freshness rules;
- trust inclusion rules;
- project/work/worktree scope;
- maximum per-section/page budget;
- explicit secret/sensitive-content exclusions;
- deterministic policy digest.

### `ContextPack`

Sections should remain semantically separate:
- identity/scope;
- current constraints;
- current work + intentionally paused work;
- decisions that still govern;
- recent/high-value findings and failed experiments;
- exact next actions;
- evidence/verification pointers;
- optional reference pages selected for this task.

The pack must not flatten superseded history into current truth.

### `ContextPackManifest`

Records:
- exact source revisions/digests considered;
- policy digest;
- included item ids/digests;
- omitted item ids/classes + deterministic reasons (`superseded`, `out_of_scope`, `budget`, `sensitive`, `stale`, `trust_policy`);
- measured bytes/chars/tokens when the tokenizer is known;
- unknown measurement state when it is not;
- final pack digest.

### `ContextUpdateProposal`

A model/session may propose:
- new finding;
- decision candidate;
- supersession/retraction candidate;
- current-work/next-action update.

A proposal is not canonical memory. Existing Agent Work OS authority/verification rules accept, reject or route it for review.

## Required tests

- same source facts + same policy -> identical pack/manifest digest;
- changed canonical source revision changes pack provenance even if rendered text is similar;
- superseded fact is excluded from current section but remains discoverable historically;
- retracted fact never appears as current truth;
- user/human-authored fact cannot be silently rewritten by an agent proposal;
- intentionally paused work is visible as paused and cannot be mistaken for current next action;
- parallel worktree A context does not leak unrelated worktree B state;
- project A facts never appear in project B pack;
- budget overflow produces deterministic omission/splitting with a manifest, not silent truncation;
- required current constraints cannot be displaced by low-priority historical material;
- secret/credential-shaped values are excluded/redacted according to policy;
- unverified external text is clearly marked and cannot become instruction/authority;
- stale volatile facts are marked/omitted according to freshness policy;
- missing token measurement is `unknown`, never a fabricated estimate;
- pack generation has zero external side effects;
- pack contents cannot grant tool/deploy/write authority.

## Fresh-session acceptance flow

1. Seed a fixture project with current constraints, two governing decisions, one superseded decision, one failed experiment, one paused branch, one active work item and one exact next action.
2. Compile a bounded pack using only canonical fixture facts.
3. Start a stateless deterministic test agent/session with only the pack + new request.
4. Ask it to explain current project state, governing decisions, what has already failed, what is intentionally paused and the next safe action.
5. Verify exact expected facts and absence of superseded/foreign/secret material.
6. Have the session produce a typed update proposal.
7. Validate proposal separately; prove it cannot mutate canonical memory without the owning authority path.
8. Recompile and prove deterministic changed digest only after accepted canonical update.

## Benchmark lane

Independently reproduce the useful donor hypothesis rather than copying its score:
- 20/60/150-fact fixtures;
- compare `rewrite`, text patch, append+supersede, and structured update proposal;
- weak local model + stronger model;
- first try and one validator-guided retry;
- correctness, output tokens/bytes, validator failures, dropped reasons, stale-fact errors;
- retain raw response evidence and exact model/runtime digests.

Our release decision should be based on our own results, not Dory's benchmark numbers.

## Later phases

### B — canonical Work Memory adapter

Read real Agent Work OS project/work/decision/handoff facts; no writes yet. Prove project/worktree isolation and freshness.

### C — portable project-memory bundle

Optional repo-owned markdown/JSON projection for offline portability and third-party agents. Projection contains provenance/digests and can be regenerated; it is not the canonical database.

### D — agent adapters

- Codex/AGENTS-style context bootstrap;
- Claude Code/plugin/skill adapter where supported;
- generic copy/paste browser surface;
- provider-neutral handoff API.

Each adapter gets separate real-runtime certification.

### E — governed update proposals

Model-generated findings/decisions/handoffs enter existing review/authority flows. Add conflict/supersession/retraction and concurrent-edit semantics.

### F — long-run context checkpointing

Supervisor creates a handoff/context checkpoint before real observed context/quota exhaustion. CPU-only continuation is allowed only for explicitly side-effect-safe jobs already authorized by the run plan.

### G — product UI

Project Desk/Work Memory exposes:
- what the next session will receive;
- why each item is included;
- stale/superseded/history views;
- omitted-by-budget/sensitivity explanations;
- refresh/recompile;
- fresh-session recall test result.

### H — Shipping OS certification

Exact implementation SHA -> unit/contract tests -> adapter runtime tests -> restart/recovery -> fresh-session UAT -> receipt -> tracker promotion.

## WIP / tracker truth

The current Agent Work OS portfolio already has multiple active BUILDING lanes. This donor should progress now through research, reconstruction and specification without opening another uncontrolled implementation lane.

Current truthful state:

`SOURCE -> EVIDENCE -> RECONSTRUCTION -> INTERNAL DEDUPE -> SPECIFIED -> SHIPPING-CONTRACT-READY / BLOCKED_WIP`

Tracker ID is **pending collision-free canonical reconciliation**. Do not guess a new `RE-*` identifier while same-day intake is concurrent.

## Clean-room / license boundary

Upstream Dory is MIT licensed. Direct reuse is legally possible if the MIT notice is preserved, but the default Agent Work OS approach is independent implementation because the useful mechanics are being absorbed into an existing memory/work/authority architecture rather than forked.

If upstream source is intentionally reused later:
- pin exact files/revision;
- preserve the MIT license/notice;
- record provenance explicitly;
- verify behavior/security independently.

Do not copy Dory branding, artwork, prose or UI trade dress.

## Explicit non-claims

No Dory parity. No upstream code copied. No context-pack implementation yet. No Agent Work OS canonical-memory adapter yet. No Claude/Codex plugin runtime certification yet. No fresh-session UAT yet. No production deployment. No tracker ID assigned. No `SHIPPED` claim until exact implementation, CI, restart/recovery and real adapter/session evidence exist.
