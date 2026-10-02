# Shared Agent Rooms

Shared Agent Rooms is an evidence-bounded collaboration slice for Agent Work OS. It adds one durable transcript where a person can address multiple named local agents while every generated agent reply remains linked to the exact Agent Work OS session that produced it.

## What is implemented

- durable rooms stored separately from direct-session state;
- named room agents bound to an online machine, advertised adapter capability, working directory, optional model, and room-specific instructions;
- `@handle` routing for human messages, with the first configured agent as an explicit fallback;
- bounded shared-transcript context (24 recent messages, capped at 12,000 transcript characters);
- agent-to-agent delegation when an agent response mentions another room agent, capped at two routed hops;
- exact session provenance on agent transcript messages;
- webhook routines with bearer-secret authentication;
- one-time plaintext webhook-secret return: only a SHA-256 digest is persisted;
- optional idempotency keys with durable replay receipts;
- one active run per routine;
- restart reconciliation that marks queued/running routine receipts interrupted;
- a responsive operator UI at `/rooms.html`.

## Run locally

Start the existing control plane and daemon:

```bash
AGENT_WORK_OS_TOKEN=dev-token npm run start:api
```

```bash
AGENT_WORK_OS_TOKEN=dev-token \
AGENT_WORK_OS_SERVER_URL=ws://127.0.0.1:8787/ws \
npm run start:daemon
```

Open `http://127.0.0.1:8787/rooms.html`.

The room state file defaults to `.data/rooms.json`. Override it with:

```bash
AGENT_WORK_OS_ROOMS_PATH=/path/to/rooms.json
```

## Room API

```text
GET  /api/rooms
POST /api/rooms
GET  /api/rooms/:roomId
POST /api/rooms/:roomId/agents
POST /api/rooms/:roomId/messages
POST /api/rooms/:roomId/routines
POST /api/hooks/routines/:routineId
```

A room agent is a binding to an existing daemon capability. The control plane does not receive the underlying provider credentials; those remain on the machine running the daemon.

## Webhook safety boundary

Creating a webhook routine returns the plaintext secret once. The persisted routine contains only its hash. Calls must send:

```http
Authorization: Bearer <secret>
Content-Type: application/json
Idempotency-Key: optional-stable-key
```

Webhook JSON is inserted beneath an explicit **EXTERNAL WEBHOOK DATA** boundary and described to the agent as untrusted data, not higher-priority instructions. The durable run receipt stores an input digest, not the full webhook body.

## Agent collaboration boundary

A room agent may request another room agent by starting a reply with that agent's `@handle`. Agent Work OS routes the request only when the target is a different configured room agent, and the collaboration depth is capped at two hops. This is deliberately smaller than a general autonomous swarm: there is no unbounded recursive delegation.

## Verification

The focused tests cover persistence, mention routing, bounded prompt construction, secret handling, webhook idempotency, untrusted-input labeling, restart reconciliation, and browser-surface contracts. The repository acceptance test additionally exercises room messaging and webhook routines through the live control-plane -> daemon -> adapter event path.

## Explicit non-claims

This slice does **not** claim:

- Sugabots parity;
- arbitrary remote MCP connection management;
- tool-call approval parity;
- multi-user roles/RBAC;
- cron/scheduled routine execution;
- long-conversation compaction or automatic summaries;
- PostgreSQL/Redis/NATS scaling;
- hosted deployment or production readiness.

Those capabilities should be implemented and independently verified before any such status is recorded.
