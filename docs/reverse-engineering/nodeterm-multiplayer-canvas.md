# NodeTerm → governed multiplayer canvas donor

Research snapshot: 2026-10-03  
Canonical destination: Agent Work OS  
Tracking issue: #29  
Canonical RE ID: intentionally pending portfolio reconciliation

## 1. Source verification

Supplied source:
- https://www.reddit.com/r/vibecoding/s/27oVtVPXtz

Resolved public project:
- https://nodeterm.dev/
- https://github.com/eneskirca/nodeterm

The supplied Reddit launch presents NodeTerm as “Claude Code multiplayer”: people can use the same terminal surface and connect Claude sessions so agents can communicate. At the research snapshot Reddit reported zero comments. No community feedback is therefore attributed to the thread.

## 2. Evidence classes

The reverse-engineering record uses these states:

- **OBSERVED** — directly visible in the supplied launch/product surface;
- **DOCUMENTED** — stated in first-party documentation/source repository;
- **CORROBORATED** — supported by public issues or multiple independent surfaces;
- **INFERRED** — clean-room architectural conclusion from observed behavior;
- **UNKNOWN** — private implementation/behavior not established by public evidence;
- **CONFLICTED** — sources disagree or behavior is not stable enough to treat as fact.

No UNKNOWN item is promoted into a parity claim.

## 3. Product / UX teardown

### OBSERVED / DOCUMENTED behavior

NodeTerm's public surfaces expose a spatial terminal/agent workspace:

- infinite pan/zoom canvas;
- terminal and coding-agent nodes;
- Claude Code, Codex, Gemini/opencode-family workflows;
- draggable/resizable nodes plus groups/notes/editor/diff/web-style supporting nodes;
- agent state/status presentation;
- context links between agent sessions;
- tmux-backed session persistence;
- desktop application plus browser Server Edition;
- separate mobile companion;
- project/workspace organization and source-control-oriented tooling.

The public repository describes desktop/main/preload/renderer boundaries, a platform seam shared with Server Edition, transport abstractions, and browser/server remote transport. These facts are architecture research only; they are not a source-code donor for our product.

## 4. License / clean-room boundary

NodeTerm is licensed under BUSL-1.1. Its public license notice explicitly allows broad use but excludes offering the licensed work as a competing product/service before the change date. Agent Work OS is intended to become an independent product in the same broad category.

Therefore this project uses NodeTerm only for:

- observable product behavior;
- public documentation concepts;
- public issue/failure evidence;
- competitive-market understanding.

It does **not** copy or adapt NodeTerm source code, schemas, tests, prompts, UI implementation, assets, branding, copy, or private interfaces. The implementation in this branch is independently authored against existing Agent Work OS contracts.

## 5. Feedback / failure mining

The supplied Reddit thread has no visible comments at this snapshot, so the useful feedback corpus comes from public repository issues.

### Launch health must be evidence-backed

Public issue `eneskirca/nodeterm#811` reports a Codex launch path that can fail while an open-agent operation still reports success and the node appears superficially healthy. Requirement carried into Agent Work OS:

> `running` is an evidence-backed state, not a synonym for “spawn was requested.”

Phase A therefore requires positive health evidence tied to the exact session before a node can transition from `starting` to `running`.

### Error must not look like completion

Public issue discussion around first-turn failures shows why a downstream chain must not advance merely because an upstream process stopped producing work. Requirement:

- `error`, `completed`, `stopped`, `interrupted`, and `hibernated` are distinct states;
- context/dependency gates open only on the state they explicitly require;
- Phase A context links default to `source_completed` and have `execution: none`.

### Memory pressure needs hibernation

A public NodeTerm request describes multi-agent memory pressure and asks for a node state between “alive” and “destroyed.” Requirement:

- hibernation preserves spatial layout and session provenance;
- it must not preserve live execution authority;
- later runtime integration may stop/release the process and resume explicitly.

Phase A models the lifecycle contract; it does not yet claim process-level hibernation.

### Human collaboration needs authority semantics

“Same terminal” becomes unsafe if multiple humans can inject input concurrently without a clear owner. Requirement:

- membership role is separate from active input authority;
- only `driver` members may acquire the input lease;
- exactly one active lease per canvas;
- lease is time-bounded and token-bound;
- only a SHA-256 token digest is persisted;
- restart revokes the lease rather than silently restoring write authority;
- viewer access never implies input permission.

This is an intentional improvement over naïve shared-keystroke multiplayer.

## 6. Competitive landscape

Spatial multi-agent terminals are already a crowded category. Public projects/products include ccanvas, termcanvas, Open Grid, Artemis, mpai/multiplayer-ai, ClaudeLink, Agentrium, codeg, Cookrew, Maestri and similar local agent workspaces.

Repeated market patterns:

- infinite canvas or grid of terminals;
- parallel Claude/Codex/other CLI agents;
- worktrees and Git context;
- agent status indicators;
- local-first desktop/runtime;
- broadcast or message/handoff controls.

### Conclusion

A clone whose differentiator is merely “terminals on an infinite canvas” has weak product value. The sharper product is **governed multiplayer for humans and agents**: local execution, durable evidence, explicit authority, recoverable state, safe context exchange, and independently verifiable handoffs.

## 7. Canonical portfolio mapping

Do not create a standalone NodeTerm clone repository.

Agent Work OS already owns the relevant product line:

- RE-244 Comuna: governed project desk, human-only approvals and ownership;
- RE-297 Continuity: restart-safe decision/handoff memory;
- RE-358 Velora: shared human/agent room direction and cross-subscription local-agent context;
- RE-370 Pando: multi-provider shared-Brain workbench;
- RE-371 Operations Atlas: operational visualization;
- RE-372 Sugabots: durable rooms, named agent bindings, shared transcript, bounded agent delegation, routines and governed tool approvals.

NodeTerm contributes a missing **spatial/live-session projection and human multiplayer authority model**. Phase A stacks on the verified RE-372 branch head rather than forking another product architecture.

## 8. MATCH / IMPROVE / NEW / OMIT / INVESTIGATE

### MATCH

Useful behavior worth independently recreating:

- spatial representation of concurrent sessions;
- durable layout;
- terminal/agent/note nodes;
- explicit agent/session status;
- context links;
- long-lived local sessions.

### IMPROVE

- health-confirmed `running` state;
- first-class `error` and `interrupted` states;
- hibernation lifecycle;
- exclusive driver lease instead of uncontrolled multi-writer terminal input;
- restart revocation of write authority;
- exact session provenance and durable mutation receipts;
- context links that are reference-only by default and cannot silently trigger execution.

### NEW

- hashed driver-lease capability token;
- viewer vs driver membership contract;
- fault-aware dependency gate (`source_completed`);
- later independent-review receipts and worktree ownership using existing Agent Work OS primitives;
- later redacted ContextBrief handoff rather than default raw-transcript sharing.

### OMIT

Phase A intentionally omits:

- NodeTerm branding or visual reproduction;
- copied NodeTerm source or schema;
- Electron/mobile packaging;
- real PTY browser streaming;
- internet-exposed remote terminal access;
- same-keystroke multi-writer mode;
- product telemetry/analytics;
- production deployment.

### INVESTIGATE

Later evidence-gated work:

- safe PTY attach/detach semantics across macOS/Linux/Windows;
- worktree-per-agent conflict avoidance;
- redacted context-link payloads and explicit review gates;
- mobile read/approve workflows;
- latency/backpressure for multiple terminal streams;
- remote auth, TLS and session takeover protection;
- accessibility and keyboard-only spatial navigation.

## 9. Target architecture

```text
Browser / desktop projection
        |
        | canvas layout + presence + lease requests
        v
Agent Work OS control API
        |
        +---- MultiplayerCanvasStore (Phase A)
        |       - layout projection
        |       - member roles
        |       - driver lease
        |       - lifecycle receipts
        |       - reference-only context links
        |
        +---- existing RoomStore (RE-372)
        |       - shared rooms/messages
        |       - room agents
        |       - governed tool approvals
        |
        +---- existing JsonStore / session truth
                - machine/session status
                - command/event history
                |
                v
        existing local daemon + adapters
```

The canvas is a **projection and authority layer**, not a second execution database. The authoritative machine/session state stays in the existing runtime/control-plane path.

## 10. Phase plan

### Phase A — deterministic governed canvas core

Acceptance target in this branch:

- versioned `multiplayer-canvas/v1` contract;
- durable canvas, nodes, layout and context links;
- explicit lifecycle validator;
- exact-session health evidence required for `running`;
- hibernated and interrupted states;
- viewer/driver membership;
- one expiring token-bound driver lease;
- restart revokes live driver authority and marks live nodes interrupted;
- context links are bounded, review-aware and non-executing;
- focused negative tests.

### Phase B — control-plane integration

After Phase A is green:

- authenticated canvas API routes;
- bind canvas nodes to existing session IDs and RoomStore agents;
- consume actual session events to drive `starting/running/needs_input/error/completed` receipts;
- input endpoint must call `authorizeInput` before forwarding any PTY write;
- integration tests prove unauthorized input never reaches the daemon.

### Phase C — spatial product surface

- responsive pan/zoom canvas;
- terminal/session cards and status badges;
- accessible non-canvas list view;
- keyboard navigation and reduced-motion behavior;
- presence, viewer/driver indication and takeover/release controls;
- context-link editor with explicit review state.

### Phase D — real PTY / worktree runtime

- local PTY transport with bounded buffers/backpressure;
- worktree-aware session placement and conflict receipts;
- hibernate/resume runtime adapter;
- terminal resize/input semantics;
- provider-specific health probes without provider truth leakage.

### Phase E — remote/mobile collaboration

- authenticated remote transport;
- TLS/origin/replay protection;
- short-lived pairing and explicit device revocation;
- mobile view/review/approve first; remote typing only after threat-model review.

### Phase F — certification

Separate gates:

1. repository tests;
2. exact-head hosted CI;
3. real provider/runtime UAT;
4. desktop/browser/device UAT;
5. security review;
6. deployment evidence;
7. only then production-readiness discussion.

## 11. Phase A security invariants

- no plaintext driver capability token persisted;
- restart never preserves input authority;
- `running` requires exact-session positive health evidence;
- failed launch cannot satisfy a completed-source dependency;
- viewer cannot acquire driver authority;
- concurrent driver acquisition fails closed;
- revoked/expired lease cannot authorize input;
- context link has `execution: none` in Phase A;
- live states are recovered to `interrupted` after restart;
- layout/session references survive hibernation;
- all state-changing actions create durable digest-bearing receipts.

## 12. Truthfulness boundary

This dossier plus Phase A code proves only the independent domain contract once tests pass. It does not prove NodeTerm parity, real terminal multiplayer, live-provider correctness, remote collaboration, hibernation of actual OS processes, browser UX, deployment, scale, or production readiness.
