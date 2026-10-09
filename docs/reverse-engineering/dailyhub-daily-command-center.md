# DailyHub donor → Daily Command Center

Status: **SPECIFIED / BLOCKED_WIP**  
Coordination issue: **#83**  
Tracker ID: **pending canonical reconciliation**  
Primary user source: https://www.reddit.com/r/coolgithubprojects/s/CuYiDp4IfZ

## 1. Why this donor matters

DailyHub is a self-hosted, single-user personal command center built around a deliberately narrow promise: show what is open, what belongs to each project, what needs attention today, and what has already been completed.

The useful donor pattern for Agent Work OS is **not** “build another todo app.” It is the idea of a quiet daily operator surface over a richer underlying work system.

Agent Work OS already owns more important facts than DailyHub does: governed work items, actor identity, decisions, approvals, evidence, sessions, handoffs and release truth. The opportunity is therefore to project those facts into a concise morning/focus surface instead of adding another source of truth.

## 2. Source manifest

### Primary source

- Reddit launch: https://www.reddit.com/r/coolgithubprojects/s/CuYiDp4IfZ
- Public repository: https://github.com/baselhusam/daily-hub
- First-party project page: https://baselhusam.com/projects/daily-hub
- Public website: https://baselhusam.github.io/daily-hub/
- npm package: https://www.npmjs.com/package/@baselhusam/daily-hub
- Docker package: `baselhusam/daily-hub`

### Snapshot inspected

At the 2026-10-09 review:

- repository is public and MIT licensed;
- package version inspected: `0.2.5`;
- runtime requires Node.js 22+;
- application stack is Next.js 15 + TypeScript + Prisma + SQLite;
- the app is distributed through npm and Docker;
- the public repo showed 144 commits;
- the Reddit launch described no built-in authentication, no multi-user mode, no sync service and no native mobile app.

This dossier uses public behavior/source evidence and independently authored Agent Work OS requirements. MIT permits reuse with license preservation, but our product direction still avoids copying DailyHub branding, visual identity, fixtures or source structure because the canonical target is structurally different.

## 3. Reconstructed product loop

The core DailyHub workflow is:

1. Open the Today surface.
2. See overdue work, stalled-project nudges, open tasks grouped by project and due habits.
3. Capture a new item quickly.
4. Narrow attention through temporary focus on one task or project.
5. Complete tasks/habits from the same local store.
6. Review project progress and lightweight completion analytics.
7. Optionally let a local AI client use the same data through MCP.

The transferable pattern is:

`canonical work facts -> daily projection -> attention narrowing -> operator mutation -> canonical write -> updated projection`

## 4. Verified public capability map

### Today / daily command surface

Public product material describes:

- greeting / current-day orientation;
- quick add;
- overdue work;
- stalled-project nudges;
- today's recurring habits;
- open work grouped by project;
- inbox capture.

### Projects

Observed/documented project fields include:

- active / paused / done status;
- due dates;
- milestones;
- progress;
- focus state.

### Focus mode

A project or task can be focused temporarily so Today narrows to that work. Public copy describes bounded focus windows such as a day, a few days or a week.

### Habits / recurring work

The product exposes weekday schedules, completion state, recent history and streak/consistency metrics.

### Analytics

Public materials describe:

- completions over time;
- per-project breakdown;
- weekday patterns.

### Command palette

The app exposes a keyboard command palette for navigation / retrieval across projects, tasks, habits and milestones.

### MCP / agent access

DailyHub documents a local token-protected MCP endpoint on the same app port. The useful principle is that humans and agents act on the same data rather than through a stale export.

### Packaging

- `npx @baselhusam/daily-hub`
- Docker image for amd64 / arm64
- local persistent data directory
- SQLite migrations at startup
- `--detach`, `status`, `logs`, `stop`, `--update` CLI behavior

## 5. Public data model evidence

The inspected Prisma schema exposes the following public models:

- `Project`
- `Milestone`
- `Settings`
- `Task`
- `DailyTask`
- `CompletionLog`

Important observed semantics include:

- task states `TODO | DOING | DONE`;
- project states `ACTIVE | PAUSED | DONE`;
- optional project/task focus timestamps with bounded expiry;
- recurring weekday schedules;
- unique daily completion records by entity/date;
- project milestones and due dates;
- completion timestamps and lightweight time/minute metadata.

Agent Work OS must **not** import these as a second canonical schema. They are evidence for user-facing behavior only.

## 6. Failure modes and limitations

### Explicitly documented by the source

- no built-in authentication;
- single-user only;
- no sync service;
- no native mobile app;
- remote exposure requires a reverse proxy / VPN / auth layer;
- file-sync folders can corrupt the SQLite database;
- SQLite backup guidance is essentially copying the data directory.

### Product risks inferred from the architecture

These are our engineering deductions, not claims about hidden DailyHub internals:

- a second task database inside Agent Work OS would create divergence;
- a localhost bearer token is not a substitute for Agent Work OS actor/project authorization;
- task completion must not be conflated with independently verified engineering completion or release shipping;
- stale focus state can hide urgent work if it is not bounded and version-aware;
- “stalled” nudges need explicit deterministic rules, not opaque heuristics;
- analytics must derive from durable canonical events rather than mutable UI state;
- local persistence needs restart/tamper/backup recovery proof before claiming operational safety.

## 7. Feedback audit

The supplied Reddit snapshot contained one hostile accusation about open-source reuse and no substantive product feedback. That comment is not used as product validation.

No open GitHub issues were found in the source repository during this pass.

Product Hunt / launch pages provide maker positioning and launch attention, but not enough independent user evidence to justify feature expansion on their own.

Therefore the donor is treated as **high-confidence public behavior / low-confidence market-validation evidence**.

## 8. Competitive / dedupe decision

### External category boundary

DailyHub intentionally does not compete with deep team/project systems such as Linear, Jira or Notion. Its differentiation is the daily personal “morning surface.”

### Internal Agent Work OS overlap

Agent Work OS already has stronger overlapping foundations:

- **RE-244 / Project Desk** — authoritative work items, actor ownership, decisions, completion reports and human finalization;
- **PR #49 / Work Board** — projects, tasks, calendar events, workday logs, notes and a responsive operator surface;
- **PR #50 / Work Queue + Work Memory** — canonical work projection, verified handoffs and MCP-facing work discovery;
- **RE-372 lineage** — routines and governed approval/tool surfaces;
- existing exact-SHA / receipt-based shipping semantics.

Creating a standalone DailyHub clone would violate the portfolio dedupe goal and create conflicting work truth.

## 9. Canonical product decision

DailyHub becomes a **capability donor** to Agent Work OS.

Working name: **Daily Command Center**.

The canonical flow is:

`Project Desk / Work Queue events`
`        +`
`session / decision / evidence facts`
`        -> daily-command-center/v1 projection`
`        -> focus + nudges + analytics`
`        -> canonical mutations`
`        -> mutation / verification receipts`

The Daily Command Center is a projection and action surface, not a new authoritative database.

## 10. Product thesis

A good engineering control plane can still be cognitively expensive if the human has to inspect ten views before knowing what matters today.

The Daily Command Center should answer five questions immediately:

1. What requires my attention today?
2. Which projects are stalled, overdue or blocked?
3. What is the one bounded focus I intentionally chose?
4. Which agent/session/decision/release facts changed since the last review?
5. What actually completed, and what is merely claimed or still awaiting verification?

That last distinction is the important enhancement over a generic productivity dashboard.

## 11. MATCH / IMPROVE / NEW / OMIT

### MATCH

- Today / morning surface;
- quick capture;
- project grouping;
- overdue / stalled nudges;
- temporary focus mode;
- completion history;
- lightweight analytics;
- command palette;
- local-first usability;
- one shared human/agent work source.

### IMPROVE

- derive everything from canonical Project Desk / Work Queue facts;
- represent `claimed_done`, `verified_done` and `shipped` as distinct states;
- bind focus mutations to exact work-item/project revisions;
- make focus automatically expire and fail closed on deleted/superseded targets;
- deterministic nudge rules with explainable reason codes;
- idempotent mutations with replay-safe receipts;
- actor attribution on every write;
- explicit human-only and approval-gated actions retained;
- recovery evidence for local persisted state;
- responsive/mobile browser certification;
- accessibility / keyboard-first behavior;
- MCP authorization inherited from Agent Work OS rather than a new bearer-only task API.

### NEW

- `daily-command-center/v1` projection contract;
- daily attention priority derived from urgency + blocker + decision + verification facts;
- agent attention lane: needs input, approval, replay or failed verification;
- release attention lane: production/verification gaps surfaced separately from task completion;
- focus receipt with exact target/revision/expiry;
- nudge reason codes;
- deterministic analytics over append-only activity / completion facts;
- daily brief suitable for both human UI and read-only MCP retrieval.

### OMIT / DEFER

- independent personal habit-tracking domain;
- duplicate Project/Task tables;
- new SQLite authority inside Agent Work OS;
- unauthenticated LAN exposure;
- cloud sync or multi-user collaboration in this donor slice;
- DailyHub branding, visual layout, copy or source structure;
- any claim of DailyHub parity.

## 12. Behavioral contracts

### 12.1 Projection purity

A Daily Command Center view is derived from canonical records. Creating the projection must not mutate source work facts.

### 12.2 Focus is attention, not authority

A focus state changes what is emphasized. It must never change task/project priority, approval state, verification state or authorization.

### 12.3 Focus is exact and bounded

A focus receipt binds:

- actor;
- target type/id;
- target revision/digest;
- created time;
- expiry time or explicit manual-clear mode;
- idempotency key.

A changed/deleted target cannot silently inherit stale focus authority.

### 12.4 Nudges are explainable

Each nudge emits one or more explicit reason codes, for example:

- `OVERDUE`
- `STALL_THRESHOLD_EXCEEDED`
- `HUMAN_DECISION_REQUIRED`
- `AGENT_INPUT_REQUIRED`
- `FAILED_VERIFICATION`
- `PRODUCTION_GAP`
- `FOCUS_EXPIRING`

No opaque “AI priority score” is required in Phase A.

### 12.5 Completion truth remains separated

The UI must not collapse these into one green check:

- work item marked done by an actor;
- completion report submitted;
- verifier evidence accepted;
- release deployed;
- production verified;
- portfolio `SHIPPED`.

### 12.6 Read/write symmetry

Human UI and MCP/agent surfaces must read and mutate the same canonical work facts through the same authorization / validation contracts.

## 13. Phase roadmap

### Phase A — pure daily projection contract

Implement a dependency-light `daily-command-center/v1` domain slice:

- canonical input facts fixture;
- pure daily projection;
- explainable nudge rules;
- focus receipt / expiry semantics;
- status separation for task / verification / release truth;
- deterministic analytics summary;
- positive / negative Node tests.

No UI mutation, MCP expansion, persistence migration or deployment in Phase A.

### Phase B — canonical API integration

- bind projection to Project Desk / Work Queue APIs;
- add idempotent focus mutations;
- quick capture through canonical work-item creation;
- durable focus persistence with restart reconciliation;
- activity/decision/session attention lanes.

### Phase C — operator UI

- responsive Today surface;
- focus view;
- project grouping;
- decision/verification attention cards;
- analytics cards;
- command palette;
- accessibility / keyboard behavior.

### Phase D — MCP / daily brief

- read-only `daily_brief` / `daily_attention` surface;
- governed work/focus mutation tools only if existing authorization semantics support them;
- no duplicate MCP task database.

### Phase E — certification

- exact-head CI;
- local runtime startup;
- browser UAT desktop + mobile viewport;
- restart / focus recovery;
- stale-target focus failure test;
- idempotent replay test;
- backup/recovery proof for any new persistence;
- evidence-backed tracker reconciliation;
- production/release certification where applicable.

## 14. Phase A golden path

Input:

- active projects and work items;
- one overdue item;
- one blocked item;
- one item needing human decision;
- one agent session waiting for input;
- one completion claim awaiting verification;
- one production release gap;
- a bounded focus target.

Expected output:

1. projection selects the correct local day window;
2. focus target is emphasized without suppressing required human/verification attention;
3. overdue / blocked / decision / verification / production reasons are deterministic;
4. grouped project work remains stable regardless of input ordering;
5. task completion claim is not represented as shipped;
6. expired focus disappears deterministically;
7. changed target revision invalidates stale focus;
8. repeated identical projection input yields identical digest/output.

## 15. WIP gate

The Agent Work OS repository already contains more active BUILDING branches than the project roadmap's intended maximum. Opening another feature lane would repeat the exact portfolio problem the roadmap is designed to prevent.

Therefore this donor advances now to:

**RESEARCHED -> SPECIFIED / BLOCKED_WIP**

Implementation begins only after:

- an existing BUILDING lane ships, is killed, or is reclassified; and
- the committed Phase A Shipping Contract is selected by the Shipping Supervisor.

## 16. Definition of done

This donor is not complete merely because a Today page renders.

Minimum evidence for a later `SHIPPED` claim:

- authoritative work-source mapping verified;
- no duplicate task/project authority introduced;
- Phase A deterministic tests green;
- exact-head repository CI green;
- canonical API integration tests green;
- browser UAT for Today / focus / capture / attention / analytics;
- mobile viewport certification;
- restart/recovery proof;
- idempotent mutation replay proof;
- stale focus target failure proof;
- authorization / human-only / approval gates preserved;
- production/deployment and recovery evidence where applicable;
- tracker advanced only from attached evidence.

## 17. Explicit non-claims

This pass does **not** claim:

- DailyHub parity;
- a new standalone productivity product;
- implementation of `daily-command-center/v1`;
- hosted preview;
- production deployment;
- mobile/native application;
- multi-user sync;
- production-grade auth;
- backup/recovery certification;
- shipped status.

The current truthful state is **SPECIFIED / BLOCKED_WIP**.