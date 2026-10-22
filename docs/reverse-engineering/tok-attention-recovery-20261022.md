# TOK agent sitter: clean-room REA dossier (2026-10-22)

## Source and evidence level
- Original: https://www.reddit.com/r/SideProject/comments/1xcti8u/
- Creator: u/KR4K3N1S; product: https://tok.team/
- Date inspected: 2026-10-22.
- Creator statement: a Mac-local task workspace that groups Claude Code/Codex terminals, marks them live/quiet/awaiting human, alerts when an agent needs help, resumes a terminal's exact conversation after restart, stores task-specific artifacts, plans time availability, and suggests tasks from mail/tickets for human confirmation.
- Independent validation: **not obtained**. The product is waitlist-only in the announcement; the website was not inspectable through the research tool. No API, CLI, schema, source tree, license, uptime, reliability or security properties are verified.
- Alternative public implementation research: session preservation often consists of durable native agent conversation IDs coupled to working directories; terminal-pane recreation and conversational continuity are distinct recovery claims. No external source code or visuals are incorporated.

## Placement and dedupe decision
**EXTENSION/MODULE** in `agent-work-os`. Do not create a TOK-branded app/repo or competing local daemon.

| Requirement | Existing canonical system | P0 contribution |
| --- | --- | --- |
| Task identity and authority | WorkItems / Project Desk, RE-244 | Reference workItemId only |
| Multi-agent status | Agent Room and runtime events | Read-only explainable attention projection |
| Durable lifecycle | Localix supervisor REA #251/#252 | Refuse to infer healthy/completed from silence |
| Native session continuity | Codex/Claude adapters + RE-297 | Non-executable resume intent |
| Workspace graph/PTY | NodeTerm #29 and workbench roadmap | No PTY or parallel store |
| Task notes/files | salt.md #41 / Work Memory | Defer UI, no artifact duplication |
| Notifications | Governed wake delivery | Contract later, no desktop side effects |
| Human approvals | Existing WorkItems/policy/Shipping OS | Intent cannot execute |

## Architectural reconstruction (hypothesis, not vendor internals)

```text
[Project Desk WorkItem + trusted machine/session events]
                          |
                          v
              [read-only attention projection]
                 | evidence | confidence gaps
                 v
           [operator attention queue]
                 | explicit human selection
                 v
             [resume-intent plan]
                 | requires approval
                 v
        [future policy-bound resume controller]
                 |
           [local daemon provider]
                 |
         [native conversation ID, cwd]
                 |
        [new receipt + verification]
```

The projection is deliberately nonauthoritative: restarting or rebuilding it must not change the WorkItem status, native conversation, process state, or approval state.

## Implemented P0 domain contract
Files:
- `runtime/daemon/src/agent-attention.js`
- `runtime/daemon/test/agent-attention.test.js`

Public API:
- `projectAgentAttention(sessions, { now, staleAfterMs?, quietAfterMs? })`
- `createResumeIntents(sessions, machines, { now, sessionIds, staleAfterMs? })`

Input normalized session example:

```json
{
  "id": "session-123",
  "workItemId": "work-456",
  "machineId": "mac-1",
  "provider": "codex",
  "state": "running",
  "lastEventAt": "2026-10-22T20:00:00.000Z",
  "machineHeartbeatAt": "2026-10-22T20:00:00.000Z",
  "pendingQuestion": {"eventId": "evt-789"}
}
```

Resume requires an explicit `sessionIds` list and separate known `machines` with fresh `lastHeartbeatAt` plus provider capabilities. It considers only verified lost/interrupted/failed sessions with an exact `nativeSessionId` and absolute `cwd`. Intent is structured data and **cannot be executed**. Provider-level policy, ownership, realpath/worktree and executable authorization must be **rechecked independently** before a privileged daemon ever resumes anything. Only `codex` and `claude-code` are in the initial plan allowlist.

Attention `needs_input` is emitted only from explicit pending-question event evidence; mere inactivity is never treated as human-required input. Fresh heartbeat without activity evidence is `unknown`, not `working`. Silent active work with verified fresh heartbeat and older activity can be `quiet`, **not** `blocked`. Missing/stale machine heartbeat is `unknown` or `disconnected`.

### P0 tests
`node --test runtime/daemon/test/agent-attention.test.js` (also covered by existing `npm test` glob).

Negative cases: duplicate records, invalid time/thresholds, question-content privacy, stale heartbeat, missing native thread, missing provider, unsafe/relative cwd, adapter unavailable, actively running session, duplicate selection, missing session, deterministic results.

## Remaining phases and exact proof required

1. **P1 canonical wiring:** session snapshots + machine heartbeats + wake receipts from existing owned sources; authenticated read-only API; concurrency/order and tenant scoping tests.
2. **P2 recovery control:** schema-bound authorization; exact native provider thread; machine/worktree realpath/symlink refusal; daemon-owned fs and CLI checks; signed command IDs, receipts and idempotent restart; no replay into an already-running process.
3. **P3 operator UI:** WorkItem grouping, filter/sort agent fleet, per-item notes and evidence links, machine availability, actionable native Mac alerts behind opt-in; unsupported raw PTY visible as unavailable.
4. **P4 supervisor:** task dependency DAG, bounded auto-advance only on verified completion, error budget, isolated parallel worktrees, external connector/task suggestions only with confirmed consent.
5. **P5 verification:** fixture and provider real-device tests for Codex/Claude resume across controlled crash and actual reboot; Mac permissions, notification delivery/dedupe, repo/worktree safety, leaked-secret scans.
6. **P6 shipping:** independent review, exact-SHA CI, branch/PR gates, OS-specific UAT, release/recovery receipt. Human approval required to merge and deploy.

## Current verification truth
P0 is an independently authored domain slice, **not an integrated runtime, browser interface, terminal manager or production product**. No real Claude/Codex resume, native notifications, real reboot tests, merge, or deployment is claimed. Every check requires observable results on the final exact commit SHA; earlier intermediate commits do not count as final verification.

## Clean-room and security
- Public observed behavior is usable for specification. Product UI/assets, unreleased source, and private APIs are not copied.
- Never expose raw questions, terminal logs, prompts, credentials, SSH keys or absolute local workspace paths in attention cards/notifications.
- Resume plans are inert suggestions. Prompt instructions or filesystem-sourced content cannot confer authorization.
- Unknown status is a first-class state, not a completion signal.
- The workstation owns provider credentials and repository files.
- No unapproved network, live-provider write, push, merge or deployment.
