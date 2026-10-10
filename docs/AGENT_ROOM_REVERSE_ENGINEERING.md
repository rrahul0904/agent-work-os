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
| Session replay and changed-file recap exist | OBSERVED | MATCH replay now; file recap after git/filesystem event enrichment |
| Local sessions only are supported by the reference | CORROBORATED in thread | IMPROVE toward many sessions/executors through Agent Work OS |
| Users want working/waiting/blocked/done to be immediately visible | CORROBORATED in thread | IMPROVE as a first-class state model |
| Users report that many parallel sessions across repos become the scaling problem | CORROBORATED in thread | IMPROVE by aggregating sessions across machines/repos |
| Parent/sub-agent topology can be reconstructed from Agent Work OS today | UNKNOWN / NOT IMPLEMENTED | Do not invent it; group by executor only in Phase A |

## Clean-room boundary

This implementation does not copy Agent Standup source, SVG characters, CSS, voices, or other assets. The reference is used as product evidence and an MIT-licensed donor for behavioral understanding only. Agent Room is implemented against Agent Work OS's existing normalized session/event protocol and local-first control plane.

## Product decision

Do **not** create another standalone repository. Agent Room belongs inside Agent Work OS because the control plane already owns:

- authenticated local daemon connections;
- normalized sessions and agent events;
- REST state snapshots and live WebSocket updates;
- local credential isolation;
- deterministic echo acceptance testing;
- Codex adapter execution.

## MATCH / IMPROVE / NEW / OMIT

### MATCH

- live presence tiles;
- current agent activity at a glance;
- selected-agent shared-screen view;
- event/session replay;
- demo experience without requiring an active session.

### IMPROVE

- explicit `working`, `waiting`, `blocked`, `done` operator states;
- blocked/attention work sorts before routine active work;
- approval-like stalls surface even while the native session still reports `running`;
- room spans normalized sessions across agents, repos, and machines;
- UI uses existing data only, so the visualization itself makes no model/API calls.

### NEW

- deterministic pure browser/Node state model with unit tests;
- machine grouping instead of pretending a parent/child graph exists;
- test/diff/error-specific shared-screen tones;
- pause-live + per-event replay cursor.

### OMIT / DEFER

- donor visual assets and character designs;
- synthetic parent/sub-agent topology;
- Claude transcript ingestion until the adapter is implemented;
- voices, translation, jokes, radio, and video export;
- hosted/cloud multi-user ingestion until auth/RBAC/deployment hardening exists.

## Phase A architecture

```text
Agent CLI / Echo adapter / future Claude adapter
                  |
          local daemon normalization
                  |
           WebSocket protocol
                  |
           Agent Work OS API
             /api/state + /ws
                  |
        agent-room-model.js
      deterministic classification
                  |
          agent-room.js UI
     floor -> shared screen -> replay
```

## Behavioral contracts

1. `running` is displayed as **Working** unless a recent event demonstrates an error or a clear approval/permission wait.
2. `queued`/`pending`/`waiting` are displayed as **Waiting**.
3. `completed`/`done`/`succeeded` are displayed as **Done**.
4. `failed`/`error`/`blocked`/`cancelled` are displayed as **Blocked**.
5. Explicit errors override a nominal running state.
6. Approval heuristics may elevate a running session to **Needs approval**, but may not claim who must approve.
7. Sessions are grouped only by known `machineId`; Phase A does not infer delegation edges.
8. Replay is read-only. Selecting an event never changes agent execution state.
9. Agent Room never sends prompts or model requests; it consumes existing state/events.
10. Authentication is the existing control-plane Bearer token and remains same-origin/local-first.

## Files in Phase A

- `apps/web/public/agent-room.html`
- `apps/web/public/agent-room.css`
- `apps/web/public/agent-room.js`
- `apps/web/public/agent-room-model.js`
- `services/control-api/test/agent-room-model.test.js`

## Verification gates

Required before any merge/shipping claim:

1. `npm test`
2. `npm run acceptance`
3. syntax/runtime loading of the static Agent Room assets
4. exact-head GitHub Actions CI
5. browser UAT against Demo mode and a live Agent Work OS session
6. production promotion only with an independent deployment receipt

## Next bounded slice: Claude transcript adapter

Phase B should add a **read-only** local adapter for Claude Code transcript/session files under the configured Claude projects directory. It should:

- respect `CLAUDE_CONFIG_DIR` and never scan arbitrary home-directory paths;
- reject symlinks/path escape outside the configured transcript root;
- tail JSONL incrementally with bounded memory;
- preserve original session/sub-agent IDs and timestamps;
- normalize prompts, tool calls/results, text, errors, file edits/diffs, and terminal states;
- derive parent/child delegation edges only from explicit transcript evidence;
- persist cursors so restart/reconciliation does not duplicate events;
- provide deterministic fixtures and negative tests for malformed/truncated JSONL, rotation, duplicate events, symlink escape, and restart replay;
- make no Anthropic request merely to visualize a session.

Only after those gates pass may Agent Room be described as directly supporting Claude Code session-file ingestion.
