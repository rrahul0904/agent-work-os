# Shape donor → Evidence-backed unified Agent Workbench

Status: `SOURCE -> EVIDENCE -> RECONSTRUCTION -> SPECIFIED -> SHIPPING-CONTRACT-READY / BLOCKED_WIP`

Tracker ID: pending reconciliation  
Coordination issue: #99  
Canonical destination: `rrahul0904/agent-work-os`  
Research snapshot: 2026-10-10

## 1. Source manifest

Primary user-supplied source:
- https://www.reddit.com/r/coolgithubprojects/s/0SIYBWRmpJ
- resolved launch: https://www.reddit.com/r/coolgithubprojects/comments/1x2iy0l/i_built_shape_an_ai_agent_for_software_development/

Public upstream:
- https://github.com/useshape/Shape
- exact inspected upstream head: `b29a5d5e3badfaf6e7f2144ecb2dba251dc13c2b`
- observed upstream release commit: `chore: release v1.0.1`

Primary upstream artifacts inspected at that exact head:
- `LICENSE`
- `docs/agent/overview.mdx`
- `docs/agent/plan.mdx`
- `docs/agent/review.mdx`
- `docs/agent/browser.mdx`
- `docs/developing/architecture.mdx`
- `docs/developing/agent-tools.mdx`
- agent tool-dispatch / schema / subagent source paths surfaced by repository search

## 2. Evidence classification

### Verified from public upstream source/docs

Shape is a desktop software-building workbench built as:

```text
React / Next.js static frontend
  -> Tauri 2 desktop shell
  -> Rust privileged backend
       -> agent loop
       -> filesystem / edits / search
       -> PTY / terminal
       -> Git
       -> browser / preview support
       -> model/tool dispatch
```

Public docs describe five user-facing agent modes:
- `Code`: edits files and may run commands;
- `Ask`: read-only question/analysis intent;
- `Plan`: writes an editable plan before implementation;
- `Visual`: UI-oriented work;
- `Review`: investigate a fault/risk and propose a focused repair.

Plans are written under `.shape/plans/`. File edits are shown as diffs that the human may keep or skip. The in-app browser supports a visual workflow where a selected rendered element can drive a corresponding source edit. Public source also contains bounded subagent support and a central tool-dispatch seam.

Public architecture docs state that browser UI code does not directly perform privileged operations: typed frontend wrappers invoke Tauri commands and the Rust backend owns filesystem, PTY, Git and agent work. Model traffic is also mediated by the backend/server path rather than being treated as arbitrary browser JavaScript authority.

### First-party launch claims

The supplied launch describes Shape as having evolved from an agentic IDE into an agent for building software and advertises provider choice, file edits, terminal use, repository search, planning, review with another model, connected tools such as GitHub/Figma/Linear, an in-app browser, and media-generation capabilities.

These are treated as first-party product claims until independently exercised in our own acceptance environment.

### Feedback / failure signals

The supplied launch is very fresh and exposes little independent feedback at intake time. Older public discussions provide more useful product requirements:

1. **Differentiation cannot be “editor + chat + browser in one window.”** Existing developer workflows already combine those pieces.
2. **Source round-trip integrity is the hardest valuable proof.** A visual selection/change should resolve to exact source anchors, an exact diff, a rebuilt rendered result, restart persistence and reversible code/UI state.
3. **The central mutation seam is strategically important.** Public source converges structured model tool calls through a central dispatcher, suggesting a single policy/evidence gate can sit before effects.
4. **Mode intent alone is insufficient safety.** Shape's own docs warn that a Code-mode question may still trigger editing; therefore our modes must be enforceable capability profiles, not only prompt instructions.
5. **Visual edits can have broader blast radius.** Public browser docs note that shared components and design tokens may affect multiple screens. Our implementation must surface that blast radius before a change is accepted.
6. **Review needs a concrete signal.** Review quality improves with a failing test, stack trace, file anchor or recent change; vague fault reports should not silently authorize broad refactors.

## 3. License / clean-room boundary

Upstream is **Business Source License 1.1** with a Shape-specific Additional Use Grant.

The grant permits broad personal, educational, internal and commercial use, including self-hosting and client-service use, but expressly prohibits offering the Licensed Work or a substantially similar derivative as a standalone paid, white-label or competing IDE/editor before the Change Date.

Observed parameters:
- Change Date: `2030-06-22`
- Change License: Apache License 2.0

Accordingly, Shape is a **behavior/capability donor only** for this project.

Rules:
- do not copy Shape source, prompts, schemas, tests, assets, branding, trade dress or UI implementation into an Agent Work OS commercial product;
- do not fork/modify Shape into a substantially similar competing IDE for distribution;
- independently author Agent Work OS contracts and implementation against public behavior/evidence;
- if direct upstream reuse is ever proposed later, re-check licensing and record exact reused material/provenance separately.

## 4. Reconstructed product loop

```text
open project
  -> choose intent mode
  -> attach explicit files/folders/context
  -> agent reads/searches workspace
  -> optional editable plan
  -> structured tool proposal
  -> workspace/terminal/browser action
  -> streamed progress
  -> exact file diff
  -> human keep/skip or revision
  -> optional review pass
  -> Git action only when explicitly requested
```

Visual path:

```text
running local app
  -> open in embedded browser
  -> select rendered element
  -> describe/perform visual change
  -> map element to source
  -> mutate source
  -> render changes
  -> inspect diff
  -> keep/skip
```

Subagent path:

```text
parent turn
  -> spawn bounded subtask worker
  -> worker returns a scoped result
  -> parent incorporates result
  -> parent remains conversation owner
```

## 5. Architecture reconstruction

### UI plane

A multi-window React/Next.js static UI provides chat, editor/files, settings, browser/preview, Git and supporting surfaces.

### Privileged local plane

Tauri bridges the UI to Rust. Rust owns privileged commands and emits streamed events for agent/chat chunks, PTY output, Git refresh and related runtime state.

### Agent plane

The agent has a central tool registry/schema. Structured model tool calls are dispatched by the backend to concrete tools such as read/edit/search/terminal/plan. Modes restrict which tools are available.

### Provider plane

Model selection is abstracted from the desktop UI. Public source includes model routing/family handling and a server-mediated provider path. Subagents have their own model policy and a bounded concurrency limit in current public source.

### Trust implication

This architecture provides a good *seam* but not by itself a sufficient governance contract. A central dispatcher becomes valuable only when execution is bound to exact intent, capability, state revision, approval and post-effect evidence.

## 6. Internal dedupe / canonical placement

Do **not** create another IDE repository or another authoritative work/task database.

Agent Work OS already has donor/implementation lines covering most of Shape's primitives:
- RE-238 / px0 — review workspace, source/diff/Git reading;
- RE-359 — governed harness, repository intelligence, execution safety, durable subagent coordination and integration contracts;
- RE-387 — plan/Flow definition and receipt-backed run state;
- Fleet control plane — transport/runtime truth and reconnect/replay;
- RE-372 — shared rooms and exact-intent tool approvals;
- Browser Learning Memory + Governed Browser Autopilot — browser execution truth, route reuse and recovery;
- Agent Studio / Shared Brain / Agent Room — agent definitions, provider-neutral context and multi-agent operator UX;
- Shipping OS — exact-SHA testing, acceptance and release evidence.

The Shape-specific useful delta is the **coherent workbench experience** plus a rigorous **source ↔ rendered-preview round trip**.

Canonical destination: `rrahul0904/agent-work-os`.

## 7. Product thesis — Agent Workbench

Build an original **Agent Workbench** as a projection/control surface over existing Agent Work OS truth:

```text
intent
  -> enforceable capability profile
  -> optional plan
  -> exact authorization
  -> workspace action
  -> exact source diff
  -> deterministic checks
  -> preview/browser observation
  -> independent review/verification
  -> evidence trail
  -> keep or revert
  -> verified handoff
```

The differentiator is **proof-bearing coherence**. The product should make it easier to build in one place while increasing, not reducing, certainty about what the agent changed and why.

## 8. MATCH / IMPROVE / NEW / OMIT

### MATCH

- unified desktop workbench;
- files/editor/Git/terminal/browser/agent in one surface;
- separate read-only and mutating intents;
- editable plan before broad work;
- post-change review;
- live-preview/source connection;
- bounded subagents;
- provider-neutral model selection;
- external plugins/MCP/tool lane;
- visible per-change diffs.

### IMPROVE

- mode is a hard capability contract rather than prompt guidance;
- Plan never implies execution authority;
- every mutating operation binds exact workspace/worktree/revision/action/payload;
- dirty working-tree state is preserved and surfaced;
- visual work emits a deterministic source-preview evidence chain;
- shared-component/token blast radius is shown before keep;
- rebuild **and restart** verification are required for visual success;
- checkpoint/revert verifies both source and rendered output;
- builder/subagent cannot self-certify decisive completion;
- subagents are role-scoped, budgeted and receipt-backed;
- reconnect/restart never converts unknown/interrupted work into success;
- external-tool calls reuse exact-intent approval/policy contracts;
- actual provider/model/tool usage can be audited without storing secrets.

### NEW owned contracts

- `workbench-intent/v1`
- `workbench-capability-profile/v1`
- `source-preview-roundtrip/v1`
- `workbench-evidence-trail/v1`
- later `desktop-workbench-layout/v1` as a projection only, never authority.

### OMIT / DEFER

- Shape name/branding/trade dress/assets/source layout;
- a Shape-derived commercial competing IDE;
- donor billing/account mechanics;
- proprietary Shape cloud proxy behavior;
- arbitrary model-to-shell/CDP/MCP passthrough;
- automatic push/merge/deploy;
- media-generation surface until existing governed integration contracts can be reused;
- macOS/Windows/Linux/mobile parity claims without real packaged-device evidence.

## 9. Phase A — side-effect-free workbench contracts

Current status: `SPECIFIED / BLOCKED_WIP`.

Phase A must be an independently authored, dependency-light domain slice. It must perform **no filesystem mutation, shell execution, browser automation, Git mutation, network access, provider call or deployment**.

### `WorkbenchIntent`

Required facts:
- schema version;
- project/worktree/task/run identities;
- mode: `ask | plan | build | visual | review`;
- target anchors;
- requested outcome;
- protected constraints;
- requested capabilities;
- observed source/worktree revision;
- deterministic canonical digest.

### `WorkbenchCapabilityProfile`

Required semantics:
- `ask`: read/search/inspect only;
- `plan`: read/search plus plan-artifact creation only;
- `build`: only explicitly granted mutation/terminal/tool classes;
- `visual`: source/preview operations only through an explicit source-preview contract;
- `review`: read/diagnostics plus a bounded proposed repair; no broad refactor authority by default.

Unknown capability classes fail closed. A mode cannot silently escalate itself.

### `SourcePreviewRoundtrip`

Must bind:
- exact project/worktree/revision;
- selected rendered screen/element anchor;
- mapping method, confidence and candidate source anchors;
- requested visual outcome;
- proposed components/files/tokens affected;
- pre-change source digest;
- pre-change rendered-observation digest;
- exact diff digest;
- rebuild/test evidence references;
- post-change rendered-observation digest;
- restart rendered-observation digest;
- checkpoint/revert evidence;
- ambiguity/unmapped/blast-radius facts.

A source edit alone cannot verify visual success. A visually plausible render alone cannot prove source integrity.

### `WorkbenchEvidenceTrail`

Must be append-only in semantics and bind:
- exact intent digest;
- capability-profile digest;
- plan digest where present;
- grants/approvals used;
- source revisions/diffs;
- deterministic test/build evidence;
- browser/preview observations;
- reviewer/verifier identity;
- keep/revert decision;
- terminal outcome and unresolved unknowns.

## 10. Required negative / recovery tests

Phase A acceptance must cover at least:
- Ask cannot mutate files, terminal, Git or external tools;
- Plan cannot mutate the workspace;
- Build cannot act outside declared capability classes;
- changing mode or exact source/worktree revision invalidates an authorization derived from the old intent;
- unknown capability classes fail closed;
- malformed/unknown schema fields fail closed where they could affect authority;
- ambiguous UI-to-source mapping refuses verified mutation;
- multiple candidate source anchors stay ambiguous until resolved;
- shared-component/design-token blast radius is represented explicitly;
- source mutation without rebuilt rendered evidence cannot be marked visually verified;
- rendered success without an exact source diff cannot be marked round-trip verified;
- restart-render drift makes the prior visual verification stale/failed;
- revert must restore the expected source digest and corresponding rendered observation;
- dirty/unrelated changes remain visible and are never silently overwritten;
- subagent output remains advisory until incorporated and independently evidenced;
- external tool invocation requires an existing exact-intent grant/approval path;
- canonical equivalent inputs produce stable digests;
- materially changed inputs change their digest.

## 11. Later implementation phases

### B — Workbench projection

Compose existing Agent Work OS session, file/diff, Git, terminal, browser, work/approval and evidence facts into one operator surface. Do not create competing stores of authority.

### C — governed mutation lane

Bind workbench edit/terminal/tool actions to existing RE-359 execution-safety and RE-372 exact-intent approval semantics. Add checkpoint/restore evidence before destructive classes.

### D — source ↔ preview adapter

Use owned local fixtures first:
- Next.js;
- Vite;
- component props;
- utility classes;
- responsive breakpoints;
- shared components;
- design tokens;
- dirty working trees.

Prove exact source mapping, diff, rebuild, restart persistence, blast radius and revert.

### E — subagents + review council

Reuse the durable subagent coordinator and separate builder/verifier roles. A parent agent may synthesize worker findings but does not inherit their work as verified truth.

### F — desktop shell

Package the already-proven projection/runtime into a desktop shell only after web/operator contracts are stable. Tauri is an implementation option, not an inherited requirement.

### G — provider/browser/device certification

Exercise real configured providers, process failures, browser reload/redirect, working-tree drift, reconnect/replay and packaging on each platform actually claimed.

## 12. Eventual vertical-slice acceptance chain

Core:

```text
intent
  -> capability profile
  -> plan
  -> exact grant
  -> mutation
  -> diff
  -> deterministic checks
  -> live preview observation
  -> restart verification
  -> independent review
  -> keep/revert
  -> evidence receipt
```

Visual proof:

```text
selected element
  -> source anchors
  -> exact diff
  -> rebuilt render
  -> restart render
  -> revert
  -> source + render restoration proof
```

## 13. Shipping definition

Research/specification is not completion.

`SHIPPED` eventually requires:
- implementation in the canonical repo;
- exact-head CI;
- focused positive/negative contract tests;
- real workbench/runtime integration;
- browser/preview fixture UAT;
- dirty-tree and blast-radius UAT;
- restart/recovery proof;
- provider/subagent verification where claimed;
- packaged desktop evidence for each claimed OS;
- release/deployment evidence for the chosen distribution surface;
- tracker synchronization from receipts only.

## 14. WIP / truth boundary

The current Agent Work OS portfolio already contains many active draft implementation branches. This donor therefore advances through:

`SOURCE -> EVIDENCE -> RECONSTRUCTION -> SPECIFIED -> SHIPPING-CONTRACT-READY`

but feature implementation remains `BLOCKED_WIP` until a bounded BUILDING slot is available or the Agent Workbench is explicitly promoted as a dependency of an active shipping campaign.

No tracker/RE number is guessed during concurrent intake; canonical ID is pending reconciliation.

## 15. Explicit non-claims

- no Shape parity;
- no copied Shape implementation;
- no Phase A feature implementation yet;
- no source-preview round-trip certification yet;
- no real provider certification from this dossier;
- no desktop packaging claim;
- no macOS/iOS/mobile claim;
- no hosted/production deployment;
- no production readiness;
- no tracker ID assigned;
- no `SHIPPED` status.
