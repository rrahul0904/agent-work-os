# P0 private agent-session containment (2026-10-28)

## Finding

Account-mode authorization previously used only organization membership for `GET /api/state`, `GET /api/sessions/:id`, `POST /api/sessions/:id/messages`, and `POST /api/sessions/:id/interrupt`. The PostgreSQL-backed WebSocket snapshots, live broadcasts and event replay also emitted full agent session objects (including private prompts and model/tool text) to every member of the same organization, including Viewer. A user could therefore read or append messages to another employee's agent run without an explicit permission grant.

## Remediation

- Agent session content is **creator-owned and private by default**. Only that user can read the full transcript, append messages, interrupt, or receive live/replayed session events in account mode.
- A current organization membership is still required in addition to creator identity. Unowned historical session records are hidden from account users instead of being implicitly shared.
- WebSocket snapshots, live events, and cursor replay call the same fail-closed visibility policy.
- Organization-owned machine/portfolio/project/approval metadata is still visible through its separately scoped team APIs; private agent session contents are not.
- Legacy developer-local token behavior stays unchanged for non-production tests. Daemon machine authentication still has narrowly bound machine/org authorization.
- The server returns 404 for private-session access by another team member to avoid confirming the session ID's existence.

## Verification

The change has pure policy negative tests and an extension of the actual PostgreSQL identity integration test, including another Owner-approved Admin in the same organization, direct GET/POST/interrupt denials, positive owner read, and live WebSocket snapshot isolation.

## Follow-on

Formal, explicit collaboration grants and an admin-only **redacted audit metadata** view should be designed separately. Admin cannot assume full private transcript access from organization role alone. Independent browser privacy UAT, event history retention/encryption and audit are required before public GA.

**Release**: NO-GO. This is a feature branch stacked on Wave4 PR #395; no merge or production deployment.
