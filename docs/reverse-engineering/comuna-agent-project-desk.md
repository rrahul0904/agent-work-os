# RE-244 — Comuna agent project desk

Audit date: 2026-09-25

## Public sources

- Reddit founder post: https://www.reddit.com/r/buildinpublic/comments/1wq22cg/my_first_startup_ran_on_free_tools_so_i_made_my/
- Product: https://comuna.work/
- Features: https://comuna.work/features/
- Integrations: https://comuna.work/integrations/
- AI coworker: https://comuna.work/ai-coworker/
- MCP article: https://comuna.work/blog/mcp-project-management-ai-agent/

This is a clean-room capability study. No Comuna source repository was identified in the public-source audit, and no private implementation is inferred or copied.

## What the source actually does

Comuna is a shared project-management workspace for humans and AI coworkers. The founder describes using Claude Code and Codex alongside human work in one project system. The key workflow is not autonomous background execution: work is left in the shared workspace and the AI acts when prompted manually or by a scheduled prompt through MCP.

Verified public product capabilities include:

- one underlying set of work cards rendered as Kanban, table, calendar and Gantt views
- explicit assignees that may be humans, contacts or AI coworkers
- comments, mentions and attributed activity history
- notes/wiki/goals/milestones kept beside execution work
- project chat and direct messages
- recurring dates, dependencies, checklists, labels, attachments and priorities
- realtime collaboration
- offline-first user edits with a local mutation queue and replay
- MCP-over-HTTP with OAuth2 plus a REST mirror
- board-scoped permissions and further AI coworker restrictions
- AI action attribution
- human review/escalation for judgment calls

## Founder workflow requirements

The Reddit post supplies four especially important requirements for Agent Work OS:

1. Every task has one explicit owner: human, Claude, ChatGPT/Codex, or another named actor.
2. Agent-completed work carries a structured handoff report: what changed, PR/commit, CI state and how a human can test it.
3. Sensitive or consequential work stays human-only, including credentials/secrets, legal review and merge/final decisions.
4. Research and decisions remain adjacent to the work so context survives across AI sessions.

The visible public comment reinforces the first requirement: without explicit ownership, multiple agents can touch the same work and undo each other.

## Mapping into Agent Work OS

Comuna is a capability donor, not a standalone clone. Agent Work OS already owns the coding-agent execution plane: machines, sessions, daemon adapters, normalized events and an operator UI. RE-244 adds the durable work/coordination plane above those sessions.

### Phase A implemented on this branch

- work-item facts with lanes: backlog, ready, in_progress, review, human_only, done
- human/agent actor identity
- single-owner invariant to reject cross-agent collisions
- hard rejection when an agent claims human-only work
- structured completion-report contract
  - summary
  - commit SHA
  - CI status
  - test instructions
  - optional PR URL
- agent work moves to review after reporting; only a human can mark it done
- decision requests with pending/approved/changes_requested/discarded states
- only humans may resolve decision requests
- pending or non-approved decisions block final completion
- attributed append-only activity receipts
- JSON persistence for work items, decisions and activity
- REST endpoints surfaced through the existing control plane
- unit tests for collision, human-only, evidence and approval invariants

## Phase A REST surface

- `GET /api/work-items`
- `POST /api/work-items`
- `POST /api/work-items/:id/claim`
- `POST /api/work-items/:id/move`
- `POST /api/work-items/:id/completion-report`
- `POST /api/work-items/:id/decision-requests`
- `POST /api/work-items/:id/complete`
- `GET /api/decisions`
- `POST /api/decisions/:id/resolve`
- `GET /api/activity`

The existing `GET /api/state` snapshot now also includes the project-desk facts.

## Next implementation waves

### Phase B — session/work binding and isolation
- bind a work item to the Agent Work OS session that executes it
- include workItemId in daemon/session commands and events
- create per-task worktrees and make the ownership lease enforce filesystem isolation
- record Git diff, files touched, test output, PR and CI evidence automatically
- prevent a second agent session from acquiring the same work scope

### Phase C — operator workspace
- shared board over the work-item facts
- filters by human/agent owner
- explicit review queue and human-only queue
- completion report panel and decision inbox
- notes/research/decision records linked to cards
- activity-derived daily brief

### Phase D — governed MCP
- provider-neutral MCP tools over the same work facts
- OAuth/RBAC identity mapping and board/project scope
- read-only versus write permissions for each AI coworker
- queue/standing-instruction semantics
- preserve the observed pull/manual-or-scheduled trigger boundary; do not pretend the model is continuously autonomous

### Phase E — realtime/offline hardening
- Postgres durable store and migrations
- Redis/NATS fan-out as already planned by Agent Work OS
- optimistic local mutations and ordered replay
- conflict detection against ownership/version facts
- browser stale-state resync

## Acceptance gates

RE-244 must not be called complete until:

- two agents cannot claim or execute the same work item concurrently
- agents cannot enter or complete human-only work
- agent work cannot become done without a completion report and human finalization
- unresolved approvals block completion
- every work mutation records an actor and timestamp
- work/session linkage and test/PR/CI evidence are captured automatically
- API and UI tests cover the review path
- MCP permissions cannot exceed the associated human/workspace permissions
- runtime evidence proves the workflow end to end
