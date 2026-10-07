# ProtoWork donor -> Agent Work OS Work Board

Status: **Phase A implementation candidate; no parity or production claim**  
Captured: 2026-10-07

## 1. Source identification

Primary public source:
- Reddit: `https://www.reddit.com/r/sideprojects/comments/1x012zm/looking_for_testers_and_feedback_for_my_free_work/`
- Donor site: `https://protowork.app/`

Supporting public evidence:
- Earlier maker post: `https://www.reddit.com/r/SideProject/comments/1vmhaak/protowork_a_web_app_to_replace_other_work_tools/`
- Indie Hackers product page: `https://www.indiehackers.com/product/protowork`
- Huntscreens product page: `https://huntscreens.com/products/protowork`
- Product Hunt mirror: `https://www.hunted.space/dashboard/protowork`

## 2. Evidence ledger

| Claim | Evidence class | Confidence | Notes |
|---|---|---:|---|
| ProtoWork targets freelancers, solo developers and office/remote workers | first-party-public | high | Maker Reddit posts |
| Project manager + multi-project task manager is the core | first-party-public | high | Maker Reddit posts |
| Calendar, workday logger and notepad are integrated convenience surfaces | first-party-public | high | Maker Reddit posts |
| Product aims to avoid tool switching and feature bloat | first-party-public | high | Maker Reddit + Indie Hackers |
| Motivation uses manually written messages rather than generated AI text | first-party-public | high | Maker Reddit + Product Hunt mirror |
| Task filtering, priorities, categories, due dates, drag/drop and weekly work charts exist | third-party-public | medium | Huntscreens summary; not relied on for strict parity |
| Current 2026-10-07 Reddit thread contains substantive user feedback | public-source | low/none | No substantive comments visible at capture time |

We do not infer donor internals, database schema, source code, algorithms, or private metrics.

## 3. Product / user workflow reconstruction

Observed high-level workflow:

1. User creates or switches among projects.
2. User captures tasks and organizes them by project/category/priority/date.
3. User uses an integrated calendar to keep planned work close to tasks.
4. User logs workdays/time to understand actual effort.
5. User captures free-form notes without leaving the workspace.
6. Product injects lightweight motivational copy around daily/task interactions.

The donor value proposition is consolidation plus low cognitive overhead, not heavyweight team coordination.

## 4. Capability and failure-mode decomposition

### Capability groups

- Project context
- Task capture and state transitions
- Date/calendar context
- Workday/time record
- Notes/context capture
- Motivation/behavior nudges
- Personal settings/customization

### Failure modes to design against

- Orphan tasks after project deletion or invalid project references
- Task completion losing historical timestamp
- Calendar end before start
- Workday end before start
- Break duration producing negative net time
- Notes saved empty or silently truncated
- Corrupt/partial persisted state breaking startup
- UI implying cloud/team synchronization that does not exist
- Motivation becoming intrusive, repetitive, or dependent on an external AI provider
- Work-management UI interfering with coding-agent session control

## 5. Feedback / pain points

The new source post is a feedback request and had no substantive visible comments when captured. Therefore this phase does **not** pretend to have comment-derived validation.

Pain points supported directly by maker statements:
- tool switching across task/calendar/time/note products;
- perceived bloat in existing work-management products;
- difficulty sustaining momentum and motivation;
- need to handle multiple projects without losing context.

Comment-driven prioritization remains open evidence work.

## 6. Competitive boundary

- **Todoist**: mature project/task organization, filters, upcoming planning and broad cross-platform reach. We should not chase general-purpose task-manager breadth.
- **TickTick**: tasks + calendar + habits + Pomodoro/focus. We should avoid expanding into a lifestyle/habit suite in this donor slice.
- **Sunsama**: guided daily planning, timeboxing and calendar integration. This is a useful benchmark for planning quality, but external calendar integration is intentionally outside Phase A.
- **Linear**: strong issue/project workflows for software teams. Agent Work OS already has a software-execution identity; Work Board should stay solo-operator-first instead of cloning team issue tracking.

## 7. Existing internal donor audit

Canonical integration target is `rrahul0904/agent-work-os`.

Existing strengths to reuse:
- local-first HTTP/WebSocket control plane;
- durable JSON state;
- responsive browser operator UI;
- coding-agent sessions and deterministic acceptance harness;
- CI and Docker packaging.

No standalone ProtoWork clone repository is required. This donor belongs as a capability slice inside Agent Work OS.

## 8. Product thesis and target boundary

### Thesis

Add a **Work Board** beside agent sessions so a solo operator can plan human work and later connect that plan to agent execution evidence.

The future differentiator is:

`project -> task -> agent session/worktree -> verification -> PR/deployment evidence`

Phase A stops before those links; it establishes trustworthy planning primitives first.

### Phase A in scope

- projects;
- tasks;
- calendar events;
- workday logs;
- notes;
- original deterministic motivational copy;
- local durable persistence;
- REST API;
- browser surface;
- unit + API acceptance tests.

### Explicitly out of scope

- donor visual/brand cloning;
- external calendar synchronization;
- collaboration/teams;
- billing;
- cloud accounts/auth;
- push/mobile notifications;
- AI scheduling or generated motivation;
- native iOS/iPadOS/macOS/Android shells;
- production hosting certification;
- parity claims.

## 9. Behavior contracts

1. A task may be unassigned or reference an existing project only.
2. Completing a task sets `completedAt`; reopening clears it.
3. Event end time cannot precede start time.
4. Workday end time cannot precede start time.
5. `netMinutes = max(0, elapsedMinutes - breakMinutes)`.
6. A note must contain a title or body.
7. State writes remain atomic through temp-file + rename persistence.
8. Existing machine/session state remains backward-compatible when old state files have no `workspace` key.
9. Workspace mutations emit a `workspace.updated` realtime snapshot.
10. Invalid domain input returns explicit 4xx responses rather than generic 500s.
11. Motivation text is original, local and deterministic from workspace metrics.

## 10. Implementation slices

### Slice A — domain + persistence
- workspace schema normalization;
- project/task/event/workday/note records;
- validation and derived metrics;
- deterministic motivation.

### Slice B — API
- `GET /api/workspace`
- `POST /api/workspace/projects`
- `POST /api/workspace/tasks`
- `PATCH /api/workspace/tasks/:id`
- `POST /api/workspace/events`
- `POST /api/workspace/workdays`
- `POST /api/workspace/notes`
- `PATCH /api/workspace/notes/:id`

### Slice C — browser UI
- Agents / Work Board top-level modes;
- project creation;
- task creation/toggle;
- calendar entry;
- workday entry;
- notes create/edit;
- responsive layout.

### Slice D — verification
- persistence/unit tests;
- invalid-reference and reopen tests;
- workday non-negative test;
- real HTTP API acceptance round-trip;
- existing agent acceptance must remain green in CI.

## 11. Independent verification requirements

A readiness claim requires all of:
- exact branch head SHA;
- `npm test` green;
- existing `npm run acceptance` green;
- `npm run acceptance:work-board` green;
- GitHub Actions run tied to the same SHA.

Browser/UAT, hosted preview and production are separate evidence classes and must not be inferred from CI.

## 12. Hosted/browser/recovery certification plan

After code-level verification:
1. run browser UAT at desktop and narrow-mobile widths;
2. verify reload persistence against a non-empty state file;
3. test invalid/corrupt workspace fragments normalize safely;
4. deploy preview only after repository deployment gate is configured;
5. capture preview URL + exact SHA;
6. do not mark production until production URL is independently checked.

## 13. Tracker truth

Do not invent a new `RE-*` identifier. Update the canonical reverse-engineering tracker only when its current artifact is available and the exact issue/branch/PR/SHA/CI evidence can be recorded.
