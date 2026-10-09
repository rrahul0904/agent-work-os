# Agent Work OS

Agent Work OS is a clean-room, local-first control plane for coding agents. It combines local agent runtimes, governed work/approval state, shared rooms, durable verified handoffs, Work Memory projections, and a bounded MCP interface while keeping repository and provider credentials on the machine running the daemon.

## Current integrated slice

The `integrate/work-truth-memory` line now includes:

- Node 22 REST + native WebSocket control plane;
- persistent machine/session state and authenticated daemon connection;
- Codex, Claude, Gemini, Grok and deterministic echo capability adapters;
- shared multi-agent rooms, webhook routines and exact-intent tool approvals;
- RE-297 worktree-local decision memory with hash-chained verified handoffs and recall proofs;
- authoritative Project Desk work items, ownership, decision gates, completion reports and human finalization;
- deterministic, read-only Work Memory projections over Project Desk facts;
- verified Work Memory -> RE-297 handoff receipts bound to the exact projection digest;
- fresh-session `verified-context` continuation containing bounded goal/tasks/risks/checks plus explicitly shareable verified decisions;
- responsive Work Queue UI at `/work.html` and Shared Rooms UI at `/rooms.html`;
- MCP v2 stdio server exposing only work discovery, Work Memory reads and verified handoff creation;
- Docker packaging and GitHub Actions verification.

Project Desk is the source of truth for work status and approvals. Work Memory, RE-297 handoffs, the web UI and MCP tools cannot silently convert an agent claim into authoritative completion.

## Install and run

Node 22+ is required. Install the pinned runtime dependencies first:

```bash
npm install --ignore-scripts --no-audit --no-fund
```

Start the integrated control plane:

```bash
AGENT_WORK_OS_TOKEN=dev-token npm run start:api
```

In a second terminal on the machine that owns the repository:

```bash
AGENT_WORK_OS_TOKEN=dev-token \
AGENT_WORK_OS_SERVER_URL=ws://127.0.0.1:8787/ws \
npm run start:daemon
```

Open `http://127.0.0.1:8787`. The main page links to Work Queue and Shared Rooms. The deterministic `echo` adapter is available unless disabled; locally installed/authenticated provider CLIs are advertised when their adapters detect them.

## Work Queue / Work Memory

Open `http://127.0.0.1:8787/work.html` and provide the same control token. The operator surface can:

- create and inspect authoritative work items;
- claim work with the bounded UI agent identity;
- submit an agent completion report with commit/CI/test evidence;
- request and human-resolve decision gates;
- finalize work through the human completion path;
- inspect the read-only Work Memory timeline and projection digest;
- create a verified RE-297 handoff from a real source session.

Work Memory has no mutation endpoint for lane/status/approval changes.

## Verified cross-session continuation

RE-297 stores decision memory locally under the worktree. A verified Work Memory handoff:

1. projects current authoritative Project Desk facts;
2. binds the exact projection SHA-256 into an RE-297 handoff snapshot;
3. carries bounded goal, recent actions, open tasks, risks, next action and checks;
4. references current verified decisions by revision/content/source hashes;
5. records a durable recall proof before the fresh agent session starts;
6. injects only the bounded handoff summary plus decisions that are both `verified` and `shareable` when `brainMode=verified-context`.

All recalled content is explicitly delimited as untrusted reference data; the current user request remains authoritative.

Use the memory CLI for direct local inspection:

```bash
npm run memory -- help
```

See `docs/RE297_PHASE_A.md` for the underlying journal contract.

## MCP

The repository uses the official MCP TypeScript v2 server package and stdio serving path. Start it locally with the control-plane URL and control token:

```bash
AGENT_WORK_OS_API_URL=http://127.0.0.1:8787 \
AGENT_WORK_OS_TOKEN=dev-token \
npm run mcp
```

Exposed tools are intentionally bounded:

- `agent_work_list` — authoritative work discovery (read-only);
- `agent_work_memory` — read one Work Memory projection (read-only);
- `agent_work_create_handoff` — create a verified RE-297 handoff from an existing source session.

There is no MCP tool for approving decisions, marking work complete, merging code or deploying.

## Verification

```bash
npm test
npm run acceptance
npm run check
```

The acceptance chain exercises:

- direct session + daemon + provider-adapter event flow;
- verified RE-297 recall and bounded shared-brain context;
- shared rooms, webhook idempotency and exact-intent tool approvals;
- authorized Project Desk + Work Memory APIs and restart-stable projection digests;
- authoritative Work Memory projection -> RE-297 handoff -> fresh verified-context session;
- MCP v2 stdio startup with a clean protocol stdout channel.

CI also builds the Docker image.

## Docker

```bash
AGENT_WORK_OS_TOKEN=change-me docker compose up --build
```

The image runs the integrated control plane and persists control-plane state under the configured `/data` volume. Local provider execution still requires the separate daemon on the machine holding the repository and provider credentials.

## Repository map

```text
apps/web/public/                  operator, Work Queue and Shared Rooms UIs
packages/protocol/src/            envelopes + native WebSocket transport
packages/decision-memory/         RE-297 local verified decision/handoff journal
services/control-api/src/         control plane, Project Desk and Work Memory APIs
services/mcp/src/                 bounded MCP v2 stdio server
runtime/daemon/src/               local machine daemon + provider adapters
scripts/acceptance.mjs            core runtime acceptance
scripts/work-memory-acceptance.mjs Project Desk / Work Memory acceptance
scripts/work-handoff-acceptance.mjs cross-session verified handoff acceptance
scripts/mcp-smoke.mjs             MCP stdio startup acceptance
docs/                             architecture and reverse-engineering evidence
.github/workflows/                exact-head CI
```

## Remaining certification / protected gates

The integrated branch is not a production-readiness claim. The remaining evidence gates are deliberately external or protected:

- real-provider UAT for each locally installed/authenticated CLI beyond deterministic echo coverage;
- browser/device certification across target environments;
- production auth/RBAC, secret management, observability and horizontal-scale hardening;
- production deployment certification;
- merge/deploy authorization.

Merge and production deployment remain explicit human gates.
