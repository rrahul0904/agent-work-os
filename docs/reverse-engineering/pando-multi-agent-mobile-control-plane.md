# Pando donor → Multi-Agent Mobile Control Plane

**Snapshot:** 2026-10-12  
**Coordination issue:** #59 — Mobile Agent Workbench  
**Primary source:** https://www.reddit.com/r/SideProject/comments/1x3sc3p/i_vibe_code_from_my_phone_now/  
**Shared link:** https://www.reddit.com/r/SideProject/s/O7V0PxKeCW  
**First-party site:** https://www.pandoworkbench.com/  
**Status:** SOURCE → EVIDENCE → RECONSTRUCTION; specification delta started; no implementation/deployment claim

## Executive decision

Do **not** create a standalone Pando clone. Pando is a strong new donor for the existing **Mobile Agent Workbench** track in Agent Work OS because it combines several capabilities already present in our roadmap:

- multiple coding-agent CLIs in one workspace;
- project-scoped shared memory;
- agent-to-agent handoff/messaging;
- scheduled/background work;
- phone-native remote steering and approval;
- irreversible-action gates;
- local execution using the user's existing provider subscriptions;
- result/review cards and preview-oriented verification.

The opportunity is to build a broader, provider-neutral **Agent Work OS Control Plane** where desktop, web, iOS/iPadOS, Android and CLI are views over the same durable work/session/evidence model.

Pando's strongest product insight is not "four terminals in one window." It is **one project identity + one shared memory + many agent runtimes + remote human attention/approval**.

## 1. Source evidence

### OBSERVED / DOCUMENTED — Reddit launch

The launch post says Pando runs Claude Code, Codex, Grok and Gemini side-by-side and gives them a shared memory so decisions/notes from one agent can be reused by another. The author describes a phone flow where a user can send prompts to agents running on a Mac, answer agents waiting for input, and approve a deploy remotely.

The post positions Pando as Mac-only today (Apple Silicon) and explicitly contrasts its multi-agent surface with provider-specific mobile apps.

### OBSERVED / DOCUMENTED — first-party product site

The current site documents:

- Claude Code, Codex, Gemini, Grok and Ollama support through CLIs already installed on the Mac;
- existing provider subscriptions/sign-ins rather than Pando-held API keys;
- real terminal panes on the same project;
- one shared local "Brain" stored as plain project notes;
- scheduled helpers that report results;
- per-terminal agent inboxes for inter-agent messaging;
- a beginner-friendly terminal-as-chat mode;
- Pando Voice using on-device Apple Speech;
- approval gates for deletes outside the project, sending messages, deployments and payments;
- Apple Silicon + macOS 14+ as the documented host requirement;
- local memory ownership, while warning that connected cloud agents may send that context to their providers.

The site describes the Brain as a folder and says Pando itself launches already-installed agent CLIs rather than proxying model requests.

## 2. Reddit feedback / objections

The most useful launch-thread objection is differentiation: a commenter says many products already provide remote coding-agent access and that Claude + remote desktop already covers their needs.

The author's response identifies the intended differentiators:

1. several providers in one interface;
2. shared memory across those agents;
3. visibility into which agent is waiting on the human;
4. preview next to terminal/work;
5. a quick check before deploy approval;
6. mobile UX designed around agent interaction rather than remote-desktop pixels.

Translate that into a hard requirement for us: **do not ship a generic remote terminal or provider-specific wrapper**.

## 3. Competitive / donor audit

### Paseo — strongest open-source architecture donor

Source: https://github.com/getpaseo/paseo

Paseo currently provides a much broader open implementation surface:

- desktop, web, iOS, Android and CLI clients;
- local daemon managing coding-agent processes;
- parallel agents isolated in worktrees;
- provider-neutral orchestration;
- agent-created subagents and cross-agent messaging;
- files/editor/terminal/diffs/pull requests/browser;
- end-to-end encrypted relay option or direct/VPN connectivity;
- plugins that extend daemon lifecycle and every connected client;
- TypeScript SDK and CLI automation.

**Implication:** Pando's multi-agent/mobile premise alone is not defensible. Our differentiation must come from the Agent Work OS evidence model, policy gates, durable recovery, verification receipts and self-working supervisor — not from merely matching remote agent access.

### CC Pocket

Source: https://github.com/K9i-0/ccpocket

CC Pocket supports Codex + Claude through a self-hosted bridge with iOS/iPadOS, Android, macOS and experimental Linux/Windows clients. It covers mobile prompting, approvals, questions, voice/image input and continuation across devices.

**Implication:** mobile control/approval is already a category baseline.

### Happy

Source: https://github.com/slopus/happy-desktop

Happy exposes Claude/Codex/Grok through desktop plus encrypted iOS/Android control, reuses existing subscriptions, supports multi-model work and adds collaborative/multiplayer session steering.

**Implication:** collaboration and E2E-encrypted remote control should be first-class comparator requirements.

### Sesori

Source: https://github.com/sesori-ai

Sesori advertises many coding-agent providers, local-first execution and encrypted phone control.

**Implication:** provider count is a weak moat; provider-neutral adapter quality and behavioral consistency matter more.

### ShareMemory

Source: https://github.com/ycl-2004/ShareMemory

ShareMemory demonstrates a simple project-local `AI_MEMORY/` folder with a shared protocol for Claude Code and Codex, including write locking and lint/check tooling.

**Implication:** shared memory can be implemented as inspectable project state, but Agent Work OS must add provenance, freshness, conflict resolution, retention and secret-safety rather than treating every note as equal truth.

### Provider-native remote control

Claude Code now has remote-control flows where local sessions keep running on the user's machine while the phone/browser provides interaction. Comparable provider-native features reduce the value of a thin remote-control layer.

**Implication:** our control plane must orchestrate providers and work, not compete with each provider on a single-agent remote-control feature.

## 4. Product boundary

### Canonical destination

`rrahul0904/agent-work-os` → existing **Mobile Agent Workbench / Agent Work OS Control Plane**.

No duplicate repo and no Pando-branded clone.

### Product thesis

> Any approved coding agent can work against the same project/work identity. Humans can steer from any device. Every action, handoff, approval, verification and state transition remains attributable, recoverable and evidence-backed.

The control plane should work even when one or more provider UIs disappear, change, or become unavailable.

## 5. MATCH / IMPROVE / NEW / OMIT

### MATCH

- multi-agent workspace;
- existing-provider CLI/subscription reuse;
- project-scoped shared memory;
- scheduled/background agent work;
- remote phone control;
- agent waiting/attention state;
- agent-to-agent messaging;
- preview/review surface;
- irreversible-action approval gates;
- voice input as an optional client affordance.

### IMPROVE

- replace free-form shared notes as the only memory primitive with typed, provenance-bearing memory records;
- distinguish observed facts, user decisions, inferred summaries, plans and stale handoffs;
- version memory and bind it to project/worktree/source state;
- handle concurrent writes/conflicts explicitly;
- encrypt remote transport end to end;
- move from Mac-only to host-neutral daemon support;
- use worktree/session isolation for parallel agents;
- provide deterministic restart reconciliation after daemon/client/agent crashes;
- make scheduled jobs idempotent and receipt-backed;
- make approvals capability-scoped and signed to exact proposed effects;
- require independent verification for completion/deploy-ready claims;
- preserve exact source SHA/diff/test/build/deploy evidence;
- expose cost/token/runtime budgets per agent/work item;
- add team/collaboration/RBAC without weakening individual approval authority.

### NEW

- `agent-adapter/v1`: provider-neutral lifecycle contract;
- `project-memory/v1`: typed memory item with source, scope, freshness, confidence, visibility and secret policy;
- `agent-message/v1`: durable addressed message with causal/work identity;
- `attention-item/v1`: waiting/blocked/approval/failure/review projection across clients;
- `effect-proposal/v1`: exact irreversible external effect proposed before execution;
- `approval-receipt/v1`: actor/device/authn/effect-digest binding;
- `work-verification/v1`: tests/checks/reviewer evidence independent of agent self-assertion;
- `remote-session/v1`: E2E-encrypted device pairing, replay protection and revocation;
- `scheduled-work/v1`: idempotency key, recurrence, missed-run semantics and terminal receipts;
- `handoff/v1`: agent A → agent B transfer with exact project/worktree/source/memory snapshot identity;
- replay/comparison mode that can rerun a task with a second provider and compare evidence/results;
- supervisor that routes work by capability, availability, budget, confidence and verification needs.

### OMIT / DEFER

- Pando branding, UI trade dress, assets or copied implementation;
- provider credential extraction or central storage of provider secrets;
- unrestricted network/shell/deploy authority;
- "shared memory" that silently becomes execution authority;
- automatic payments/messages/deploys without explicit effect-specific approval;
- claiming cross-provider semantic equivalence without tests;
- claiming native mobile parity before device UAT exists;
- claiming deployment/production readiness from a screenshot or local demo.

## 6. Reconstructed architecture

```text
                ┌──────────────────────────────────────┐
                │            Client Surfaces           │
                │ desktop | web | iOS/iPad | Android  │
                │ CLI | voice | notifications         │
                └────────────────┬─────────────────────┘
                                 │ E2E paired session
                                 v
┌────────────────────────────────────────────────────────────────┐
│                  Agent Work OS Host Daemon                     │
│                                                                │
│  Project/Work Identity ──┬── Attention + Approval Gateway      │
│                          ├── Durable Event / Receipt Ledger     │
│                          ├── Memory Service                     │
│                          ├── Scheduler                          │
│                          ├── Supervisor / Router                │
│                          └── Verification / Shipping Gateway    │
│                                                                │
│  Agent Adapter Registry                                        │
│   ├─ Claude Code adapter                                       │
│   ├─ Codex adapter                                             │
│   ├─ Gemini adapter                                            │
│   ├─ Grok adapter                                              │
│   ├─ Ollama/local adapter                                      │
│   └─ future adapters                                           │
│                                                                │
│  Runtime isolation                                              │
│   ├─ project/worktree/session A                                │
│   ├─ project/worktree/session B                                │
│   └─ shell/tool/MCP capability boundary                        │
└───────────────────────────────┬────────────────────────────────┘
                                │
                                v
                  Git / tests / browser / deploy targets
                                │
                                v
                    immutable verification receipts
```

## 7. Core invariants

1. **Context is not authority.** A memory item or agent message cannot authorize an effect.
2. **Live state beats stale memory.** Current repository/runtime truth overrides old handoff summaries.
3. **Every irreversible effect has an exact proposal digest.** Approval applies only to that proposal.
4. **Completion requires evidence.** Agent text saying "done" is not completion.
5. **Provider adapters are replaceable.** Project/work truth is owned by Agent Work OS, not a provider session.
6. **Remote control is revocable and replay-safe.** Lost/stolen devices must not retain durable authority.
7. **Scheduled work is idempotent.** Restart/retry cannot silently repeat side effects.
8. **Memory is bounded and provenance-bearing.** No secrets by default; stale/conflicting items remain visible as such.
9. **Parallel agents isolate writes.** Prefer worktrees or equivalent bounded change sets before reconciliation.
10. **Shipping truth is exact-SHA truth.** Tests, preview, UAT and production receipts must bind to the artifact/version actually shipped.

## 8. Acceptance contracts to add

### Multi-agent handoff

Given Claude finishes a research task and hands implementation to Codex:

- destination receives exact project/worktree/source identity;
- relevant memory snapshot is explicit and provenance-bearing;
- unresolved questions remain unresolved;
- previous agent's success claim is not inherited as verification;
- destination result can be compared back to the handoff snapshot.

### Mobile approval

Given an agent proposes a deploy while the user is on a phone:

- phone displays exact target/environment/source SHA/change summary and expected effect;
- biometric/device auth can strengthen local confirmation but does not replace server-side authorization checks;
- approval receipt is bound to one effect digest;
- any mutation of the proposal invalidates the approval;
- rejection/expiry leaves the work blocked, not implicitly approved.

### Shared memory

- simultaneous writers cannot silently overwrite each other;
- stale memory is marked stale when source/worktree truth changes;
- a user correction supersedes older inference but preserves history;
- secret-like values are redacted/refused from ordinary memory records;
- memory corruption/loss cannot fabricate completion or authority.

### Scheduler

- duplicate run delivery is idempotent;
- missed runs have explicit catch-up/skip semantics;
- daemon restart reconciles in-flight jobs;
- scheduled work that reaches an irreversible effect becomes `needs_approval`;
- every terminal run has an evidence receipt.

### Remote session security

- paired device identity is explicit;
- transport is encrypted end to end where relay is used;
- revoked device cannot resume a privileged session;
- expired/replayed approval messages are rejected;
- session reconnect preserves work state without reusing stale authority.

## 9. Phased roadmap delta

### Phase A — research/specification (now)

- capture Pando source + comments + competitors;
- map donor capabilities into existing Mobile Agent Workbench;
- formalize memory, message, attention, approval and remote-session contracts;
- add negative/recovery tests before implementation.

### Phase B — provider-neutral daemon slice

- adapter lifecycle for two providers first;
- durable work/session state;
- project-scoped typed memory;
- attention queue;
- local desktop/web operator view.

### Phase C — mobile remote control

- iOS/iPadOS + Android client or shared native-capable client;
- device pairing and encrypted transport;
- prompt/input/review/approval flows;
- notifications and offline/reconnect behavior.

### Phase D — multi-agent orchestration

- worktree isolation;
- handoff and agent messaging;
- supervisor routing;
- scheduled work;
- replay/compare.

### Phase E — verification + deploy gate

- source/diff/test/build receipts;
- preview verification;
- environment-specific deploy proposals;
- mobile approval bound to exact effect;
- post-deploy health verification.

### Phase F — production certification

- crash/restart/reconnect recovery;
- lost-device revocation;
- concurrent agent conflicts;
- provider CLI upgrade compatibility;
- real iOS/iPadOS/Android/macOS/Windows/Linux host/client matrix where supported;
- exact-head CI + packaged-artifact + preview/UAT/production receipts.

## 10. Current status / non-claims

**Started and evidence-backed:** source resolution, first-party feature capture, Reddit feedback, competitor/donor audit, product boundary, initial architecture, MATCH/IMPROVE/NEW/OMIT and acceptance-contract reconstruction.

**Not yet complete:** implementation, automated tests for the Pando-derived deltas, native mobile client, encrypted relay, multi-provider runtime integration, device UAT, hosted preview, production deployment or exact-SHA shipping certification.

Do not advance this donor to `SHIPPED` or claim parity until the normal Agent Work OS Shipping OS gates are satisfied.
