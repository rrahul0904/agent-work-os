# salt.md -> Agent Work OS Work Memory Surface

Status: research / clean-room capability donor
Date: 2026-10-06
Canonical issue: #41
Tracker ID: pending canonical tracker reconciliation

## 1. Source identification

Primary user-supplied source:
- Reddit launch: https://www.reddit.com/r/vibecoding/comments/1wyxpef/look_what_i_built/

First-party/public evidence reviewed:
- https://salt.md/
- https://salt.md/demo/
- https://salt.md/mcp/
- https://salt.md/wiki/getting-started/
- https://salt.md/wiki/import-export/
- https://github.com/saltmd/salt.md
- https://github.com/saltmd/salt.md/blob/main/wiki/mcp-tools.md

Evidence classes used in this dossier:
- first-party-public: salt.md website/wiki and creator statements in the supplied Reddit thread
- official-source: public saltmd/salt.md GitHub repository
- observed-feedback: comments visible in the supplied Reddit thread
- internal-source: Agent Work OS issues/repository state

## 2. Product / workflow reconstruction

The durable user job is not generic note taking. It is continuity of project work across humans and multiple AI clients.

Observed workflow:
1. A person creates a task/project page with durable context and rules.
2. An agent connects through a scoped MCP credential.
3. The agent reads workspace/task context, performs work and writes updates/notes.
4. Humans and agents operate on the same page/database objects and can see shared history.
5. The agent records not only what happened but why important choices were made.
6. A later agent/client reads the same durable task state and continues without replaying the entire prior conversation.
7. Audit/history attributes changes to the responsible human/agent identity.

Core public capabilities relevant to the donor:
- self-hosted one-binary workspace;
- SQLite-backed durable state + uploads;
- documents + databases/views;
- realtime collaboration and presence;
- passage-level search;
- scoped MCP read/write access;
- revision/history/comment surfaces;
- human-vs-agent attribution;
- Markdown/export portability;
- server-side bulk import;
- explicit administrative powers excluded from MCP.

## 3. Failure-mode decomposition

The useful behaviors imply several failure modes that our implementation must close explicitly:

- stale or contradictory task memory across agents;
- agent-authored prose silently becoming authoritative project state;
- prompt injection from ordinary workspace content;
- an agent modifying the rules that constrain itself;
- cross-workspace leakage through search, graph edges or detailed errors;
- duplicate mutations on retry/replay;
- human/agent concurrent overwrite;
- history that records what changed but omits rationale/evidence;
- context explosion from injecting whole workspaces;
- privileged instance/account actions exposed through normal content tools;
- continuity claims that cannot be tied to a concrete worktree/session/commit/result;
- completion claims that are accepted without independent verification.

## 4. Reddit feedback and pain signals

Visible comments in the supplied thread are directionally important:

- multiple people could not understand the product from the trailer/site;
- commenters repeatedly reduced the pitch to "markdown notes + MCP" or "Obsidian competitor";
- one commenter explicitly says CHANGELOG.md and DECISIONS.md do not scale for larger projects;
- the author says the intended answer is per-task pages with durable agent notes;
- requests include normal wiki search and better mobile/native access;
- excitement is strongest around cross-agent continuity and the marketing demo, not generic note-taking.

Product implication: a clone of salt.md would be weak positioning. The first-use workflow must visibly prove continuity between two different agents on one real task.

## 5. Competitive comparison

### Notion MCP
Notion now exposes official MCP read/write access to workspace pages for tools such as Claude, ChatGPT and Cursor. Therefore "workspace + MCP" is not a differentiated product category by itself.

### Obsidian ecosystem
Multiple community plugins already expose Obsidian vaults over MCP, launch Claude/Codex locally, stream active editor context, and provide note read/write/search. Some add diff review, local-only servers, long-term memory and hash/precondition based edits.

### AppFlowy
Community MCP tooling exposes a large surface across workspaces, pages, databases, search, publishing and members, including self-hosted deployments.

### Competitive conclusion
The durable moat for Agent Work OS should not be editor breadth. It should be governed, evidence-linked continuity:
- verified work memory;
- typed decisions/rationale;
- exact session/worktree/commit provenance;
- bounded handoff bundles;
- authority separation;
- independent verification before completion;
- replay/restart safety.

## 6. Internal donor audit

Canonical destination: `rrahul0904/agent-work-os`.

Do not create another standalone workspace product.

Relevant existing internal capabilities:

- base Agent Work OS: persistent machine/session state, Codex native session continuity, local daemon/control plane;
- RE-244: governed project/work/approval facts;
- RE-297 / issue #9: durable decision memory + cross-agent handoff;
- RE-360: bounded organization/scheduling + Attention projection;
- RE-370: shared-Brain multi-provider workbench;
- RE-372: durable Shared Rooms, agent bindings, routines and governed tool approvals;
- RE-386: versioned federated project documents/decisions with optimistic concurrency;
- autonomous-forge: scheduler/executive layer, not the human knowledge surface.

Deduplication rule:
- the Work Memory Surface is a projection over authoritative Agent Work OS work/evidence facts;
- it must not introduce a second authoritative task database;
- it must reuse RE-297 memory/handoff and RE-386 concurrency/version semantics where compatible.

## 7. Product thesis and target boundary

Working name: **Work Memory Surface**.

Purpose: every Agent Work OS work item has a human-readable page/board that is also a machine-addressable projection of verified work truth.

A fresh human or agent should be able to answer:
- What are we trying to do?
- What constraints/policies apply?
- What was attempted?
- Why were important choices made?
- What evidence supports the current state?
- What is blocked or waiting for approval?
- Which runtime/session/worktree/commit produced the current result?
- What is the next action?
- Which context is safe and relevant to hand to another agent?

Differentiation from salt.md:
- notes are not execution truth merely because an agent wrote them;
- decisions and handoffs bind to evidence/receipts;
- completion claims remain separate from verification;
- context delivery itself receives a receipt;
- stale/superseded context is explicit.

## 8. Clean-room / rights boundary

salt.md is AGPL-3.0.

Default rule for Agent Work OS:
- public behavior/docs/source may be used as evidence;
- do not copy salt.md source, schemas, prompts, UI, assets or implementation structure into the MIT Agent Work OS codebase;
- independently author contracts and implementation from behavior requirements;
- any future decision to reuse source must be a separate licensing decision.

## 9. Proposed behavior contracts

### `work-memory-page/v1`

Fields / invariants:
- immutable `work_id` references an existing authoritative work item;
- mutable page metadata carries a monotonically increasing revision;
- timeline is append-only;
- every entry has actor type/id, timestamp and receipt/source references where applicable;
- entry kinds: `observation`, `decision`, `attempt`, `question`, `approval`, `verification`, `handoff`;
- decisions require rationale and may reference alternatives/evidence;
- decisions may explicitly supersede prior decisions;
- agent prose cannot directly mutate authoritative work status;
- human/system policy is stored on a separate authority path from normal content;
- stale revision writes fail closed;
- replay/idempotency keys prevent duplicate append;
- serialization/restart preserves entry IDs and digests.

### `decision-record/v1`
- id
- work_id
- actor
- statement
- rationale (required)
- alternatives[]
- evidence_refs[]
- supersedes[]
- created_at
- digest

### `agent-note/v1`
- id
- work_id
- actor_agent_id
- session_id
- worktree_id / attempt_id when available
- note_kind
- body
- evidence_refs[]
- created_at
- digest

### `handoff-bundle/v1`
- work_id
- destination/provider intent
- current goal/constraints
- current valid decisions
- verified evidence summary
- unresolved questions
- pending approvals
- stale/superseded markers
- selected entry IDs
- deterministic size/token budget
- bundle digest

### `context-receipt/v1`
Records exactly what context was handed to an agent:
- work_id
- agent/session id
- selected entry IDs
- source digests
- policy version
- generated handoff bundle digest
- size/token estimate
- timestamp

## 10. Acceptance and negative tests

Phase A is not complete unless all are deterministic and green:

1. A fresh second provider/session can reconstruct goal, current decision and next action without hidden prior-session state.
2. A decision without rationale is rejected.
3. A stale revision edit conflicts instead of overwriting newer human content.
4. Agent content mutation cannot edit policy/rules.
5. Cross-project/workspace access fails closed without revealing hidden object existence.
6. Duplicate append with the same idempotency/receipt key does not write twice.
7. A completion claim without independent verification cannot mark work complete.
8. A superseded decision is excluded from the current handoff projection.
9. Prompt-injection text in ordinary workspace content is delivered as delimited untrusted data.
10. Handoff generation obeys a deterministic maximum context budget.
11. Restart/reload preserves timeline digests and authoritative projections.
12. If evidence referenced by a selected decision becomes invalid/stale, the handoff explicitly marks that decision as needing review rather than silently presenting it as current truth.

## 11. Implementation sequence

No UI/MCP-first build.

A. Pure domain contracts + validation + deterministic tests.
B. Persistence adapter + replay/restart tests.
C. Projection from existing Agent Work OS work/approval/evidence facts.
D. Context/handoff builder and receipt generation.
E. API routes with authority-separated mutation paths.
F. Responsive web task page/timeline/decision view.
G. MCP/agent adapter surface.
H. Real Codex -> second-provider handoff UAT.
I. Independent verification and exact-head CI evidence.
J. Tracker update only after proof.

## 12. Explicit non-claims

- no salt.md parity;
- no salt.md code reuse;
- no new RE number assigned yet;
- no standalone Notion/Obsidian competitor created;
- no realtime-collaboration parity claim;
- no full MCP parity claim;
- no mobile/native app claim;
- no production deployment/readiness claim;
- no tracker completion status until exact implementation/verification evidence exists.
