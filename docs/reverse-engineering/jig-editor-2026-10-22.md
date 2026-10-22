# Jig editor → Source-Anchored AI Editing + Code Map

**Intake:** 2026-10-22 | **Tracker:** [#369](https://github.com/rrahul0904/agent-work-os/issues/369)
**Routing:** DONOR_REFERENCE → EXTENSION/MODULE | **Owner:** Agent Work OS Agent Workbench + Technical Visual Studio/Traceframe
**User source:** https://www.reddit.com/r/SideProject/s/gTwgHuKvCw
**Canonical thread:** https://www.reddit.com/r/SideProject/comments/1xcs84e/
**Upstream:** https://github.com/lucasdias111/jig
**Inspected revision:** `92b50bf386fbd132fe378d3a7b8926ecb437b5b3`
**Root license:** Apache-2.0; vendored/dependency inventory not yet audited
**Evidence class:** public repository + author documentation, **not** verified desktop execution

## Source inventory

| Capability | Upstream evidence path | Required native ownership |
| --- | --- | --- |
| Cursor-scoped conversation | `crates/jig-commands/src/chat.rs`; `AGENTS.md` | Agent Workbench (existing #99) |
| Provider-neutral agents | `crates/jig-ai/src/agent/acp.rs`, `harness.rs` and `opencode.rs` | Existing daemon adapters + Capability Fabric |
| Task planner | `crates/jig-ai/src/tasks.rs`, project `.jig/tasks` | Canonical WorkItems; **do not import second task store** |
| Map, Code → Plan → Site → Domain | `crates/jig-commands/src/map/` and `AGENTS.md` | Code Explorer #352 + Visual Intelligence #206 |
| Code indexing, call edges | `map/index.rs`, `map/outline.rs` / Tree-sitter + LSP hierarchy | Source-anchored graph with evidence status |
| Debug/live path highlighting | `map/debug.rs` | Read-only trace projector; observed vs inferred |
| Per-edit review/approval | `crates/jig-ai/src/agent/`; `AGENTS.md` | Privileged daemon-bound authorization; code preview is never security boundary |

*Paths are documented in upstream AGENTS.md, not independently compiled or executed here.*

## Risk and security delta

Upstream explicitly documents an ACP "edit without asking" caveat. A preview UI must **never** be the enforcement boundary. Start model subprocesses in read-only/isolated worktrees; route every mutable file/terminal action through daemon authorization bound to project, worktree, pinned head, file preimage hash, proposal digest, session and one-use approval. Exact-range previews should not modify disk; only a privileged atomic compare-and-swap backend may write, with traversal and symlink hardening, TOCTOU resistance, and verification receipt. No network, external filesystem writes, merge, push or deploy without separate grants.

The initial `source-anchored-edits.js` module is a **pure contract/preflight**, not a privileged writer or a signed authorization implementation. The caller-supplied `consumeApprovedGrant` callback must be installed **only in trusted daemon code**; a renderer-provided callback would be insecure. No provider subprocess isolation is implemented in this slice.

## Flow

```text
Cursor selection / Map source anchor
    → agent session with declared read-only capabilities
    → proposed edit (exact repo, worktree, head SHA, preimage, offsets, replacement)
    → source-anchored preview (no write)
    → explicit approval grant (payload-digest-bound; short-lived; one-use)
    → privileged daemon authorization and CAS file write
    → independent tests/review + commit-aware receipt
    → updated Code Map and WorkItem projection
```

## Incremental milestones

- **P0** evidence/provenance, gap routing (#99, #352, #345, #206), threat model, vendored license review.
- **P1a** original source-anchored edit contract + tests, path/preimage/head/payload-integrity checks; ready as reviewable prototype.
- **P1b** wire editor selection and provider-neutral agent protocol into Workbench; daemon grant authority and one-time consumption; filesystem descriptor-based path confinement, CAS, and tests.
- **P2** Tree-sitter/LSP index, Code→Plan→Site→Domain projections, source-linked clickthrough, verified/inferred call-edge badges, perf budgets and incremental reindex.
- **P3** multi-agent worktrees, persisted sessions, provenance/replay, independent verification, accessible desktop/mobile projection and release matrix.

## Non-negotiable acceptance

1. Deny/reject leaves bytes unchanged. Accepted exact edit replaces only the authorized range of the expected file.
2. Stale preimage or Git head; dirty buffer; mismatched worktree, path, session, digest; expired/replayed grant → fail closed.
3. A provider with auto-write privileges cannot bypass daemon or escape an isolated worktree. Prove with adversarial tests.
4. Map links point to committed source ranges, with AST/LSP/inferred/LLM edges differentiated and artifact invalidation on head changes.
5. Do not self-certify. Signed receipts must record revision, edits, tests, verification and deployment gate results.
6. No duplicated task database, no new standalone IDE, no false macOS/Windows/Linux compatibility claims without running the app.

## Current verification state

The implementation code and local Node 22 tests were executed independently of GitHub CI before opening this research branch; authoritative exact-head CI and integration with daemon/editor remain pending. Work is not merged or deployed.
