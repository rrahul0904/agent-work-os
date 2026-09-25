# px0 donor analysis -> Agent Work OS review console

Status: research / architecture first slice  
Tracker target: RE-238  
Canonical destination: `rrahul0904/agent-work-os`  
Branch: `reverse/px0-review-console`  
Issue: #5  
Date: 2026-09-24

## 1. Scope and provenance

This document records an end-to-end reverse-engineering analysis of **px0** for use as a capability donor inside Agent Work OS.

Public references:
- Product: https://px0.ai/
- Upstream repository: https://github.com/px0-ai/px0
- README: https://github.com/px0-ai/px0/blob/master/README.md
- Architecture: https://github.com/px0-ai/px0/blob/master/docs/internals/architecture.md
- Git integration: https://github.com/px0-ai/px0/blob/master/docs/internals/git-integration.md
- GitHub PR review internals: https://github.com/px0-ai/px0/blob/master/docs/internals/github-pr-review.md
- Agent/harness guidance: https://github.com/px0-ai/px0/blob/master/docs/agents/README.md
- Virtualized editor: https://github.com/px0-ai/px0/blob/master/docs/features/editor-virtualization.md
- License: https://github.com/px0-ai/px0/blob/master/LICENSE

Observed public release: v0.1.9.  
Public repository license: MIT.  
Public source was inspected around upstream master head `9d82e10f6a2ef1307a0c76bcd8f34628e14b155b`.

This branch is intentionally a **native Agent Work OS architecture specification**. It does not rename Agent Work OS into px0, and it does not claim implementation or benchmark parity. If any upstream implementation is directly reused later, the exact file/commit and required MIT attribution must be recorded explicitly.

## 2. Product thesis

px0 is optimized around a different assumption from a traditional IDE:

> AI agents author more code; the human bottleneck becomes reading, navigating, diffing, verifying, commenting and dispatching targeted fixes.

The transferable capability is therefore a **human verification console for agent-produced code**, not a general-purpose text editor.

Core product loop:
1. open a repository or PR;
2. browse files, symbols and search results with near-zero waiting;
3. inspect working-tree or merge-base diffs;
4. select the exact code range that needs attention;
5. hand a bounded instruction to an already-installed coding harness;
6. watch changed files reload;
7. review again;
8. commit/push or submit PR review feedback.

That loop fits Agent Work OS directly because Agent Work OS already owns coding-agent sessions, a trusted local daemon and a browser control plane.

## 3. Launch-post and community feedback evidence

This analysis was re-grounded against the public launch discussion and repository issue feedback rather than relying only on the landing page/source code.

### 5.1 Public launch discussion

Primary launch post:
- https://www.linkedin.com/posts/arpitbhayani_i-hate-when-vs-code-eats-up-1gb-and-takes-activity-7504890643341627392-x_wy

The public page exposes only a subset of the launch thread without LinkedIn sign-in. The inaccessible remainder is **not** treated as reviewed evidence.

High-signal feedback visible publicly:
- several engineers asked why px0 is preferable to Vim/Neovim/Zed;
- multiple comments challenged the premise that a read-only tool can replace an IDE;
- one commenter specifically asked for Git diff;
- one user flagged sudo/root installation as a blocker in protected environments;
- users emphasized that the differentiator is speed/lightweightness and warned against feature creep that recreates a heavy IDE;
- a public fork added Git diff, keyboard-first navigation and explicit reload-on-demand, explicitly preserving lightweightness as the product moat.

Creator/product response:
- the creator stated that the feedback directly drove Git awareness and Markdown rendering;
- follow-on releases added changed-file indicators, split/unified Git diff, changed-file filtering and Markdown preview;
- subsequent updates added workspace-wide full-text search, auto reload, checksum-protected updates, file+line opening and repository-root detection;
- the current product goes further with Git/GitHub PR review and agent-assisted edits, confirming that the actual direction is **review-first with bounded mutation**, not a permanently read-only file viewer.

### 5.2 GitHub issue feedback

Representative issue evidence:
- https://github.com/px0-ai/px0/issues/41 — users described worktree/Git diff as essential when reviewing AI-generated changes; the issue was resolved through a contributed PR.
- https://github.com/px0-ai/px0/issues/43 — multiple users asked for a small direct edit mode for remote quick fixes, while another explicitly argued that direct editing undermines the read-only thesis. This is an unresolved product tension.
- https://github.com/px0-ai/px0/issues/27 — remote-session users asked for discoverable network URLs; the creator replied that remote usage is precisely what px0 is optimizing for and updated product messaging accordingly.
- https://github.com/px0-ai/px0/issues/49 — a real global-search regression was reported and fixed quickly by the creator, showing that search reliability is core workflow, not optional polish.
- https://github.com/px0-ai/px0/issues/103 — users requested keyboard-only directory navigation.
- https://github.com/px0-ai/px0/issues/147 — deterministic ordering of agent-changed files was requested because unstable result ordering hurts review/reproducibility.
- https://github.com/px0-ai/px0/issues/150 — users requested a first-class uninstall/cleanup path.

### 5.3 Feedback-derived product conclusions

The donor should **not** be interpreted as "clone a tiny read-only IDE."

The stronger product definition is:
1. review/verification is the primary workflow;
2. Git diff is a first-class primitive, especially for agent-generated worktrees;
3. mutation should be bounded and explicit — agent edit or exact patch — rather than a full traditional editor surface;
4. remote usage is a core persona, not an edge case;
5. keyboard navigation is part of the speed proposition;
6. install/update/uninstall must work in restricted environments without assuming root;
7. deterministic ordering and revision-bound state are important for trustworthy agent review;
8. feature additions must be rejected or redesigned when they compromise the lightweight/performance moat.

### 5.4 Native Agent Work OS changes caused by this feedback

The native plan is adjusted accordingly:
- keep **review workspace** as the primary product surface;
- move keyboard-first file/tree/diff navigation into Phase A acceptance criteria;
- require changed-file ordering and result serialization to be deterministic;
- add remote endpoint discoverability and authenticated remote mode to the explicit roadmap;
- require user-local install/update/uninstall with no root dependency;
- retain selection-to-agent edits in Phase A;
- add an optional **revision-bound quick patch** later for tiny manual fixes instead of exposing a generic browser file-write API;
- preserve performance budgets as architectural acceptance gates so feature growth does not silently recreate a heavy IDE.

## 4. Observed capability map

### 5.1 Workspace launch

Observed:
- open current directory, a specific directory, file, or file+line;
- detect enclosing Git repository for file targets;
- run a local HTTP server and open the existing browser;
- support configurable host/port and base-path mounting;
- support headless/remote use;
- defer expensive indexing and language-server work off the startup critical path.

Transferable principle:
- **fast shell, lazy depth**: make the review surface usable before deep repository enrichment completes.

### 5.2 Repository navigation

Observed:
- dense file tree;
- fuzzy file finder;
- repository regex/full-text search;
- symbol outline;
- definition/reference/call navigation via LSP when available;
- regex/fallback behavior when language servers are absent;
- Markdown preview and image inspection;
- path/history navigation and keyboard-first operation.

Native Agent Work OS requirement:
- keep repository intelligence as a local daemon capability;
- emit stable source anchors so every selection, agent task, comment and audit record points to `path + revision + line range`.

### 5.3 Git awareness and diffing

Observed:
- machine-readable Git status;
- dirty-folder propagation;
- working tree vs `HEAD` diffs;
- merge-base scoped PR diffs;
- stage/unstage;
- commit;
- pull with fast-forward-only behavior;
- push;
- live status synchronization;
- AI-assisted commit-message generation while Git mutation itself remains an explicit product action.

Native direction:
- split reads from writes;
- reads can stream continuously;
- writes must be explicit commands with actor/session identity, policy check, approval semantics and an audit receipt.

### 5.4 GitHub PR review

Observed:
- opening a full GitHub PR URL prepares an isolated review workspace;
- process-scoped temporary worktree/clone;
- diff boundary is the PR merge-base, not simply local `HEAD`;
- PR metadata and comments are loaded;
- inline review comments can remain local drafts;
- all drafts can be batch-applied as edit instructions to a coding harness;
- formal review submission can send Approve / Request Changes / Comment;
- fixes can be committed and pushed back to the PR branch;
- transient review state is discarded on process shutdown.

Native direction:
- introduce a provider-neutral `ReviewSession`;
- GitHub is the first provider adapter;
- review draft state should be durable enough for Agent Work OS pause/resume but must remain revision-bound so stale comments cannot silently migrate to a changed diff.

### 5.5 Agent/harness editing

Observed:
- px0 itself is not a character-by-character editor;
- browser clients do not submit arbitrary replacement file contents;
- a selection plus instruction is delegated to an installed coding harness;
- multiple disjoint edit ranges may execute concurrently;
- overlapping active ranges are refused;
- changed files are detected/reloaded after harness execution;
- harness/model selection is part of the UI.

This is one of the strongest donor patterns.

Agent Work OS should model:
- `SourceAnchor`
- `ReviewFinding`
- `AgentEditRequest`
- `AgentEditRun`
- `ChangedFileReceipt`

The local daemon executes the agent. The control plane records intent, identity, approval/policy state, bounded context and results.

### 5.6 Rendering and performance

Observed:
- native Go server;
- browser ES-module frontend;
- embedded static assets;
- custom virtualized code view with roughly viewport-sized DOM rows;
- windowed source/highlight endpoints;
- async indexing;
- memory scavenging after idle time;
- no Electron runtime;
- no external database required for the single-session product.

Transferable principle:
- **window the data, not only the DOM**. The browser should request bounded source windows and bounded diff hunks rather than downloading massive files by default.

Agent Work OS must benchmark its own implementation. Upstream performance numbers are useful targets, not evidence for our product.

### 5.7 Remote workspace mode

Observed:
- bind to a non-loopback interface;
- serve one HTTP endpoint from a remote devbox/container/CI machine;
- browse from a local browser over an existing network/tunnel/VPN;
- base-path support for reverse proxies.

Native direction:
- Agent Work OS should preserve its authenticated daemon/control-plane boundary instead of copying unauthenticated local assumptions;
- remote mode must require explicit auth, workspace scoping and transport policy.

### 5.8 Configuration and distribution

Observed:
- single native binary distribution;
- self-update path with checksum verification;
- local settings for harness and server behavior;
- optional telemetry with an opt-out flag;
- no runtime Node/Electron dependency for the shipped application.

Native direction:
- capability should fit the existing Agent Work OS distribution model;
- review UI may remain web-delivered;
- local daemon owns privileged filesystem/Git/harness access.

## 5. Security boundary

### 5.1 Workspace path sandbox

Required native rules:
- normalize every requested repository path;
- reject `..` traversal;
- never expose paths outside the workspace by default;
- external definition targets require an exact allowlist admission;
- external paths cannot become searchable/enumerable roots.

### 5.2 Browser-to-daemon mutation boundary

The browser must not receive a generic "write this file" primitive.

Allowed mutation families are typed commands:
- dispatch a bounded agent edit;
- stage/unstage;
- commit;
- fast-forward pull;
- push;
- submit review comment/review.

Each mutation should include:
- actor/session;
- workspace;
- revision/base SHA;
- policy decision;
- optional approval;
- command-specific payload;
- result/receipt.

### 5.3 Cross-origin and host protections

Because the local daemon can trigger privileged tools:
- enforce authenticated WebSocket/HTTP calls using existing Agent Work OS tokens;
- validate origin/host for browser-originated privileged commands;
- do not accept arbitrary caller-supplied shell commands;
- use fixed adapters and argument arrays;
- redact tokens from logs;
- keep GitHub/agent credentials local.

### 5.4 Revision safety

Every review/edit action must be revision aware.

If the working tree/base changes after a finding was created:
- revalidate the anchor;
- mark the finding stale when exact lines no longer match;
- require explicit rebase/re-anchor rather than silently applying to a new diff.

## 6. Proposed native architecture

```text
Browser Review UI
       |
       | existing authenticated REST + WebSocket
       v
services/control-api
       |
       | normalized review/session commands
       v
runtime/daemon
       |
       +--> WorkspaceReader
       |      +--> tree
       |      +--> windowed file reads
       |      +--> search
       |
       +--> GitReviewService
       |      +--> status
       |      +--> working-tree diff
       |      +--> merge-base diff
       |      +--> stage/unstage
       |      +--> commit/pull/push
       |
       +--> ReviewSessionService
       |      +--> local workspace
       |      +--> GitHub PR adapter
       |      +--> findings/drafts
       |
       +--> AgentEditService
              +--> existing agent adapters
              +--> source-anchor validation
              +--> overlap/lease checks
              +--> changed-file receipts
```

No second privileged localhost server should be introduced if the existing daemon can host these capabilities.

## 7. Proposed domain contracts

### WorkspaceRef
- workspaceId
- machineId
- rootDisplayName
- rootFingerprint
- repositoryRemote?
- currentBranch?
- headSha?
- createdAt

### SourceAnchor
- workspaceId
- path
- revisionSha
- lineStart
- lineEnd
- contentFingerprint
- contextBeforeHash?
- contextAfterHash?

### ReviewSession
- reviewSessionId
- workspaceId
- kind: working_tree | pull_request
- provider?
- repository?
- prNumber?
- baseRef?
- baseSha?
- headRef?
- headSha?
- mergeBaseSha?
- state
- createdBy
- createdAt
- updatedAt

### ReviewFinding
- findingId
- reviewSessionId
- sourceAnchor
- body
- status: draft | queued_for_fix | fixed | submitted | stale | dismissed
- createdBy
- createdAt
- providerCommentId?

### AgentEditRequest
- requestId
- findingIds[]
- anchors[]
- instruction
- agentCapability
- model?
- approvalId?
- expectedRevision
- createdBy
- createdAt

### AgentEditReceipt
- requestId
- nativeAgentSessionId
- startedAt
- endedAt
- exitStatus
- changedFiles[]
- beforeRevision
- afterRevision
- stdoutSummary?
- error?
- provenance[]

## 8. API/command surface

Phase A read commands:
- `workspace.tree`
- `workspace.fileWindow`
- `workspace.search`
- `git.status`
- `git.diffWorkingTree`
- `git.diffMergeBase`

Phase A agent command:
- `review.dispatchEdit`

Phase B Git commands:
- `git.stage`
- `git.unstage`
- `git.commit`
- `git.pullFastForward`
- `git.push`

Phase C PR commands:
- `review.openPullRequest`
- `review.createDraftFinding`
- `review.updateDraftFinding`
- `review.submit`
- `review.refreshRemote`

## 9. Browser UX

Primary layout:
- left activity rail;
- file/search/outline panel;
- Git changes panel;
- tab/breadcrumb row;
- central read-only code/diff viewport;
- right/inline review finding composer;
- bottom status bar with workspace/revision/agent status.

Key interactions:
- fuzzy open;
- search;
- working-tree diff;
- merge-base diff;
- copy source reference;
- send selection to agent;
- draft review finding;
- apply one or a batch of findings;
- inspect changed-file receipt;
- explicit Git/review submission.

The design goal is high-density review, not feature parity with a traditional editor.

## 10. Phase A implementation slice

Build the smallest truthful vertical slice inside Agent Work OS.

### 10.1 Daemon capability

Advertise:
```json
{
  "name": "review_workspace",
  "kind": "review_workspace",
  "operations": [
    "tree",
    "file_window",
    "git_status",
    "working_tree_diff",
    "dispatch_edit"
  ],
  "version": 1
}
```

### 10.2 Read-only workspace

Implement:
- workspace-root registration;
- path normalization;
- tree enumeration;
- bounded file windows;
- max file/window budgets;
- binary detection;
- basic language hint;
- immutable response revision.

### 10.3 Git snapshot

Implement:
- branch + HEAD;
- porcelain status;
- changed files;
- working-tree diff;
- diff size limits;
- no Git writes in the first slice.

### 10.4 Review UI

Implement:
- review workspace selector;
- file tree;
- code window virtualization;
- changed-files filter;
- keyboard-only tree/palette navigation;
- deterministic changed-file ordering;
- unified diff first;
- selection anchors;
- send-selection-to-agent action.

### 10.5 Agent handoff

Reuse existing Agent Work OS adapters.

Before dispatch:
- verify source anchor still matches;
- refuse stale revision;
- reject overlapping edit leases for the same path/range;
- record immutable request receipt.

After dispatch:
- refresh Git snapshot;
- produce changed-file receipt;
- reload affected browser tabs;
- retain finding/task history.

## 11. Follow-on phases

### Phase B — Git mutation with approvals
- optional revision-bound quick patch for tiny manual fixes (exact anchor + expected revision; no generic whole-file browser write);
- stage/unstage;
- generated commit-message draft;
- commit;
- fast-forward-only pull;
- push;
- policy and approval receipts.

### Phase C — GitHub PR sessions
- URL parser/provider adapter;
- process- or session-scoped checkout/worktree;
- merge-base resolution;
- PR metadata/comments;
- inline draft findings;
- batch apply;
- formal review submission;
- push fixes to PR branch.

### Phase D — code intelligence
- symbol outline;
- LSP definition/references/hover;
- external-definition allowlist;
- lazy language-server lifecycle.

### Phase E — performance hardening
- incremental/lazy indexing;
- fuzzy index;
- repository regex search;
- source/highlight windows;
- virtualized rendering;
- idle memory cleanup;
- large repo/file benchmarks.

### Phase F — remote review workspace
- authenticated remote daemon mode;
- reverse-proxy/base-path support;
- workspace tenancy;
- reconnect/resume;
- audit and telemetry policy.

## 12. Test matrix

Unit:
- path traversal rejection;
- symlink escape rejection;
- file window limits;
- binary/oversize response handling;
- Git status parsing;
- diff boundary selection;
- source-anchor fingerprints;
- stale anchor detection;
- edit-range overlap rejection;
- revision receipts.

Integration:
- temporary Git repository with clean/modified/staged/untracked files;
- branch and detached-head scenarios;
- merge-base fixture;
- large file windowing;
- nested file tree;
- agent echo adapter modifies a fixture file;
- status/diff refresh after edit.

Acceptance:
1. start control plane + daemon;
2. register a fixture repository;
3. open review workspace in browser;
4. navigate tree;
5. open a source window;
6. inspect working-tree diff;
7. select a line range;
8. dispatch edit through echo/test adapter;
9. receive changed-file receipt;
10. refresh diff and verify exact modified lines;
11. attempt stale re-dispatch and confirm fail-closed behavior.

Browser verification:
- mobile/tablet/desktop responsive boundaries;
- keyboard navigation;
- large-file scrolling;
- diff readability;
- selection persistence;
- stale-state warning;
- reconnect behavior.

## 13. Certification boundaries

Do not claim:
- px0 performance parity;
- full IDE parity;
- GitHub PR review parity;
- LSP parity;
- remote production hardening;
- rootless install/update/uninstall parity;
- live multi-harness coverage;
- benchmark superiority.

until each is separately implemented and evidenced at exact head.

For Phase A, acceptable certification is:
- exact commit SHA;
- unit + integration tests;
- acceptance test;
- browser evidence for fixture repository;
- no Git mutation;
- no hosted-production claim.

## 14. Why this belongs in Agent Work OS

Agent Work OS already provides:
- local trusted daemon;
- coding-agent capability discovery;
- normalized session/events;
- browser control plane;
- persistent session state;
- Codex/echo adapters;
- acceptance testing;
- explicit roadmap for Git/filesystem, worktrees, task→agent→review and PR/CI monitoring.

px0 therefore fills a missing **human verification and review surface** around the runtime that already exists. A separate canonical px0 clone would duplicate authentication, daemon, agent-adapter, session and audit concerns.

Canonical decision:
- px0 = **RE-238 capability donor**
- destination = **Agent Work OS**
- first native milestone = **review workspace Phase A**
