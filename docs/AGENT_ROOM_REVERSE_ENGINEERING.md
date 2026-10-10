# Agent Room reverse-engineering dossier

Issue: #95

## Source evidence

Primary source: Reddit post `r/ClaudeAI` — “I made my Claude Code sub-agents a video call.”
Reference implementation: `Atoll92/agent-standup`, MIT licensed.

Evidence state:

| Observation | State | Use in our design |
| --- | --- | --- |
| Claude Code writes local session/transcript data and the reference viewer reads it externally | DOCUMENTED | Preserve zero-extra-model-call observability as a product principle |
| Reference UI represents agents as a live call with join/leave presence | OBSERVED | MATCH presence, independently implemented |
| Real commands/output/diffs/files are shown as a shared screen | OBSERVED | MATCH via normalized Agent Work OS events |
| Session replay and changed-file recap exist | OBSERVED | MATCH replay now; changed-file recap remains deferred |
| Local sessions only are supported by the reference | CORROBORATED in thread | IMPROVE toward many sessions/executors through Agent Work OS |
| Users want working/waiting/blocked/done to be immediately visible | CORROBORATED in thread | IMPROVE as a first-class state model |
| Users report that many parallel sessions across repos become the scaling problem | CORROBORATED in thread | IMPROVE by aggregating sessions across machines/repos |
| Claude parent/sub-agent relations can be recovered from explicit session/subagent evidence | DOCUMENTED + IMPLEMENTED | Preserve explicit parent IDs in observed snapshots; do not infer missing edges |

## Clean-room boundary

This implementation does not copy Agent Standup source, SVG characters, CSS, voices, or other assets. The reference is used as product evidence and an MIT-licensed donor for behavioral understanding only. Agent Room is independently implemented against Agent Work OS's existing session/event protocol and local-first control plane.

## Product decision

Do **not** create another standalone repository. Agent Room belongs inside Agent Work OS because the control plane already owns:

- authenticated local daemon connections;
- normalized sessions and agent events;
- REST state snapshots and live WebSocket updates;
- local credential isolation;
- deterministic echo acceptance testing;
- Codex adapter execution;
- receipt-gated shipping verification.

## MATCH / IMPROVE / NEW / OMIT

### MATCH

- live presence tiles;
- current agent activity at a glance;
- selected-agent shared-screen view;
- event/session replay;
- read-only observation of local Claude Code JSONL sessions;
- sub-agent discovery from explicit session files;
- demo experience without requiring an active session.

### IMPROVE

- explicit `working`, `waiting`, `blocked`, `done` operator states;
- blocked/attention work sorts before routine active work;
- approval-like stalls surface even while the native session still reports `running`;
- room spans normalized sessions across agents, repos, and machines rather than only one selected session;
- Claude sessions launched outside Agent Work OS are surfaced by the local daemon;
- visualization makes no model/API call;
- bounded transcript reads and fail-closed filesystem checks reduce exposure and memory growth.

### NEW

- deterministic browser/Node state model with unit tests;
- machine grouping for the global floor while preserving explicit Claude parent IDs in session metadata;
- test/diff/error-specific shared-screen tones;
- pause-live + per-event replay cursor with full snapshot reconciliation on resume;
- `daemon.observed.sessions` read-only snapshot channel;
- deduplicating observed-session persistence;
- configured-root symlink refusal and per-file symlink refusal;
- end-to-end fixture proving main Claude + sub-agent transcript propagation into `/api/state`.

### OMIT / DEFER

- donor visual assets and character designs;
- inferred delegation edges when transcript evidence is missing;
- changed-file aggregate recap;
- voices, translation, jokes, radio, and video export;
- direct control/messaging of observed Claude sessions;
- hosted/cloud multi-user transcript ingestion until auth/RBAC/deployment hardening exists.

## Architecture

```text
Claude Code local JSONL              Managed Codex / Echo sessions
        |                                      |
ClaudeTranscriptObserver                      adapters
 bounded + read-only                            |
        |                                normalized events
        +--------------- local daemon ----------+
                              |
                        WebSocket protocol
                  daemon.observed.sessions
                              |
                       Agent Work OS API
                       /api/state + /ws
                              |
                    agent-room-model.js
                 deterministic classification
                              |
                       agent-room.js UI
                 floor -> screen -> replay
```

## Claude transcript observer contracts

1. Root is `AGENT_WORK_OS_CLAUDE_PROJECTS` when set, else `${CLAUDE_CONFIG_DIR}/projects`, else `~/.claude/projects`.
2. The configured root itself must be a real directory, not a symlink.
3. Project/session/sub-agent paths are discovered from directory entries; symlink files/directories are refused.
4. Real paths must remain under the configured root.
5. Reads are bounded to the recent tail of each JSONL file; the observer never loads an unbounded transcript.
6. A half-written final JSONL record is ignored until it becomes complete; malformed records are skipped without terminating the poll.
7. Tool inputs/results are clipped/bounded before entering control-plane state.
8. Stable observed IDs use the explicit project, native session ID, and sub-agent ID.
9. Sub-agent parent linkage is recorded only when the sub-agent belongs to an explicit native session directory.
10. Observed sessions are read-only: they are not advertised as command-capable daemon adapters.
11. Snapshot upsert is idempotent; unchanged observed sessions are not rewritten or rebroadcast.
12. No Anthropic/Claude API or CLI call is made merely to visualize transcripts.

## Agent Room behavioral contracts

1. `running` is displayed as **Working** unless a recent event demonstrates an error or a clear approval/permission wait.
2. `queued`/`pending`/`waiting` are displayed as **Waiting**.
3. `completed`/`done`/`succeeded` are displayed as **Done**.
4. `failed`/`error`/`blocked`/`cancelled` are displayed as **Blocked**.
5. Explicit errors override a nominal running state; a later terminal success clears stale historical attention.
6. Approval heuristics may elevate a running session to **Needs approval**, but may not claim who must approve.
7. The global floor groups by known `machineId`; it does not invent delegation topology.
8. Replay is read-only. Selecting an event never changes agent execution state.
9. Pausing drops live visual updates by design; resuming reconciles from `/api/state` before returning to live mode.
10. Authentication is the existing control-plane Bearer token and remains same-origin/local-first.

## Implementation files

- `apps/web/public/agent-room.html`
- `apps/web/public/agent-room.css`
- `apps/web/public/agent-room.js`
- `apps/web/public/agent-room-model.js`
- `runtime/daemon/src/claude-transcripts.js`
- `runtime/daemon/src/index.js`
- `services/control-api/src/index.js`
- `services/control-api/src/store.js`
- `services/control-api/test/agent-room-model.test.js`
- `runtime/daemon/test/claude-transcripts.test.js`
- `scripts/acceptance.mjs`

## Verification gates

Required before any merge/shipping claim:

1. `npm test` — includes Agent Room model tests and Claude observer parser/filesystem negative tests.
2. `npm run acceptance` — must prove Agent Room static delivery plus daemon → Claude fixture → control-plane observed sessions, as well as the pre-existing managed-agent and shipping flows.
3. exact-head GitHub Actions CI.
4. browser UAT against Demo mode and a live local Agent Work OS + Claude transcript feed.
5. production promotion only with an independent deployment receipt.

## Follow-on slices

The remaining high-value work is intentionally separate from the first build:

- render explicit parent/sub-agent relations as an optional topology view;
- aggregate changed files and git-diff receipts per agent/session;
- add drift/off-task signals based on deterministic task/evidence contracts rather than an extra observer LLM;
- add Claude/OpenCode/ACP command adapters separately from this read-only observer;
- add hosted organizations/RBAC only after the local security model and deployment path are hardened;
- add optional voice/video export as presentation features, never as a dependency for operational state.
