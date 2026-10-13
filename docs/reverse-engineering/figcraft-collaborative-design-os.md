# FigCraft donor → Collaborative Design OS

Snapshot: 2026-10-13  
Canonical coordination lane: Agent Work OS issue #131  
Primary intake: https://www.reddit.com/r/vibecoding/s/Zdz3x1SGZO  
Donor repository: https://github.com/storytold/figcraft  
Inspected donor head: `e56856f4016c76fbc862ac2fb4fd3fb43a68f396`  
REA provider: https://github.com/morluto/rea

## Decision

Do not build a second isolated Figma clone. Consolidate FigCraft with the existing OpenPencil lane into one independently owned **Collaborative Design OS** program.

REA is an investigation/evidence provider. Agent Work OS remains authoritative for clean-room boundaries, policy, provenance, owned contracts, implementation scope, verification, exact-SHA receipts, deployment and tracker truth.

Target product thesis:

> One local-first canvas for interface design + whiteboarding, with deterministic commands, production-grade multiplayer semantics, agent/MCP automation that cannot bypass the command/policy layer, measurable rendering/file-format compatibility, and native tablet/touch workflows.

## Donor evidence

FigCraft publicly describes a Rust editor with a persistent document model, native/offline operation, frames and auto-layout, components/variants, vector networks, styles/variables, prototypes, Dev Mode, import/export, CLI/JSON control, MCP, comments/version history, and preview live sessions.

Its architecture separates pure document data + a command engine from UI surfaces. That is the strongest reusable pattern: UI, CLI, MCP and collaboration should converge on one command vocabulary instead of mutating documents through separate paths.

The donor's own roadmap also identifies the main maturity gap: collaboration is much less complete than the core editor. Accounts, teams, durable cloud and production-ready sharing are not complete. This lane therefore prioritizes collaboration correctness and evidence before raw feature breadth.

## Feedback converted into requirements

The supplied discussion raises three important requirements:

1. Rendering performance is product correctness; large documents need measurable input-to-pixel latency.
2. Shortcut/workflow refinement matters as much as feature count.
3. Multiplayer details must be explicit: self-hosting, convergence model, per-user undo, reconnect/replay, access control and `.fig` fidelity.

## Clean-room boundary

FigCraft is publicly MIT/Apache-2.0, and OpenPencil is already a source-assisted donor. Phase A nevertheless uses independently authored Agent Work OS code.

Do not copy donor branding, icons, product copy, screenshots, trade dress, private service behavior or undocumented proprietary Figma material. Any future direct source reuse must record file-level provenance and license obligations.

`.fig` support is treated as bounded interoperability. Full fidelity cannot be claimed without a corpus and per-feature results.

## MATCH / IMPROVE / NEW / OMIT

### MATCH
- infinite canvas;
- frames, shapes and text;
- auto-layout foundation;
- components/instances/variants later;
- variables/styles/tokens later;
- vector editing and prototypes later;
- local-first import/export;
- command-driven editor surface;
- CLI/MCP/agent access through the same command layer;
- multiplayer and self-hosting direction.

### IMPROVE
- actor-scoped undo preserving concurrent edits;
- deterministic operation IDs, replay and de-duplication;
- offline reconnect with explicit reconciliation;
- viewer/commenter/editor/admin authorization;
- comments/review/design branches;
- rendering and interaction performance budgets;
- `.fig` compatibility corpus;
- browser/native rendering goldens;
- tablet/touch/Pencil workflows;
- provenance for every agent mutation.

### NEW
- combined design + whiteboard canvas;
- `design-command/v1` as the only mutation seam for UI/CLI/MCP/agents;
- `collab-design-operation/v1` and collaboration receipts;
- agent operations for layout generation, spacing normalization, token migration, accessibility audit and board summarization;
- semantic design diff rather than byte-only diff;
- design-system policy engine;
- document branch/review/merge model;
- self-hosted collaboration server with explicit persistence/encryption/access contracts.

### OMIT / DEFER
- donor trade dress;
- arbitrary agent writes outside the command layer;
- Figma plugin compatibility claims before tests;
- full `.fig` parity claims without evidence;
- production accounts/billing before collaboration core;
- native/mobile parity claims without packaged-device UAT;
- proprietary fonts/assets without rights.

## Architecture

```text
Browser UI | Native shell | Tablet | CLI | MCP | Agent
                         |
                         v
                Design Command Router
                  policy + schema
                         |
                         v
                  Document Engine
         nodes | frames | text | tokens | prototypes
                         |
                  transaction/history
                 /                    \
                v                      v
       rendering/hit-test       collaboration log
                |                      |
                v                      v
          pixels/goldens      sync/replay/reconnect
                 \                    /
                  v                  v
                    evidence receipts
```

Production collaboration will use a proven convergence model selected only after a correctness/performance evaluation. Phase A does **not** claim its local operation ledger is a production CRDT.

## Phase A — implemented slice

Route: `/design/` on the existing Agent Work OS static web surface.

Implemented:
- design + whiteboard objects on one canvas;
- frame, rectangle, text, sticky and connector node types;
- selection, move, resize, duplicate and delete;
- layers panel and property inspector;
- horizontal/vertical auto-layout for frame children;
- pan/zoom/fit;
- localStorage persistence;
- canonical JSON import/export;
- deterministic document/operation digests;
- actor/sequence operation ledger;
- duplicate remote-operation de-duplication;
- inverse-command actor-scoped undo/redo;
- simulated second actor to exercise merge behavior.

This is a domain/runtime proof, not Figma parity.

## Owned contracts

`collab-design-document/v1`
- stable document identity/name;
- ordered typed nodes;
- selection/viewport projections;
- collaboration actor/sequence/operations;
- local history is not serialized as authoritative cloud truth.

`collab-design-operation/v1`
- stable operation ID;
- actor ID + sequence;
- typed command;
- before/after state digests;
- duplicate operation ID is idempotent.

`collab-design-receipt/v1`
- document identity/digest;
- node and operation counts;
- selected node identities;
- later: renderer digest, client version, causal frontier and persistence refs.

## Phase-A verification

Focused tests cover:
- deterministic receipt state;
- actor-scoped own-undo preserving another actor's later edit;
- remote operation de-duplication;
- auto-layout child placement;
- canonical export/import preservation.

Additional negative tests to add before collaboration promotion:
- malformed imports;
- locked node mutation;
- connector cleanup on delete;
- stale/replayed actor sequence;
- conflicting concurrent edits;
- reconnect after offline divergence;
- corrupted snapshot/log recovery.

## Roadmap

P0 evidence/donor audit — first pass complete.  
P1 owned command/document core — Phase-A slice implemented.  
P2 browser editing hardening — multi-select, snapping/guides, groups, nested frames, constraints, rich text, keyboard map.  
P3 rendering correctness — scene graph, culling, hit-test index, text shaping, goldens, 10k/100k node benchmarks.  
P4 collaboration core — convergence model, causal/state vectors, per-actor undo, offline queue, reconnect/rebase, presence, log compaction, multi-client simulation.  
P5 collaboration product — accounts/workspaces/files, RBAC, share links, comments/review/version history/design branches/self-hosting.  
P6 design systems — components, variants, properties, variables/modes, tokens, libraries, safe updates.  
P7 vector/text/prototype depth — vector networks, effects/masks, advanced typography, flows/interactions and inspect mode.  
P8 interoperability — SVG/PDF/images, `.fig` corpus, REST/JSON and plugin boundary with explicit UNKNOWN states.  
P9 agent-native design — MCP/CLI via the same commands, plan/preview/apply, semantic diff, exact grants and reviewers.  
P10 tablet/native — iPadOS Pencil/touch editor, macOS/Windows shell, mobile review/whiteboard companion, Android tablet after shared contracts stabilize.  
P11 release certification — exact-head CI, browser/device goldens, collaboration chaos/recovery tests, performance gates, security/privacy, preview, rollback and production gate.

## Status truth

`SOURCE=done / REA-EVIDENCE=first-pass / RECONSTRUCTION=first-pass / DEDUPE=done / SPECIFICATION=first-pass / PHASE-A=implemented-on-branch / LOCAL-FOCUSED-TESTS=green / REMOTE-CI=pending / BROWSER-UAT=pending / PREVIEW=pending / PRODUCTION=no / SHIPPED=no`
