# Agent Work OS

Agent Work OS is a clean-room, local-first control plane for coding agents. It lets a browser control an agent CLI running on your own machine while your repository and agent credentials stay local.

## Current status

The first end-to-end vertical slice is implemented and acceptance-tested:

- zero-dependency Node 22 control plane with REST + native WebSocket server
- persistent machine/session state
- authenticated local daemon connection
- machine registration, capability discovery, presence and heartbeat
- session start, follow-up message and interrupt commands
- Codex CLI adapter using `codex exec --json`, native thread IDs and `resume`
- normalized agent text/tool/status/usage/log/error events
- deterministic built-in echo adapter for CI and local acceptance testing
- responsive operator web UI served by the control plane
- Docker packaging
- unit tests and end-to-end acceptance test
- GitHub Actions CI

## Run it

No dependency installation is required beyond Node 22+.

```bash
AGENT_WORK_OS_TOKEN=dev-token npm run start:api
```

In a second terminal on the machine that owns your repository:

```bash
AGENT_WORK_OS_TOKEN=dev-token \
AGENT_WORK_OS_SERVER_URL=ws://127.0.0.1:8787/ws \
npm run start:daemon
```

Open `http://127.0.0.1:8787`. The built-in `echo` adapter is always available unless disabled. If `codex` is installed and authenticated, the daemon automatically advertises a `codex` capability.

## Verification

```bash
npm test
npm run acceptance
```

The acceptance test launches an isolated control plane + daemon, creates a real session through HTTP, verifies the daemon/adapter event round trip, sends a follow-up, verifies native-session continuity, and shuts everything down.

## Codex integration

The adapter invokes Codex non-interactively with JSONL output and workspace automation. A first turn uses the CLI's generated thread ID; later messages resume that thread. Optional environment variables:

```bash
AGENT_WORK_OS_CODEX_MODEL=gpt-5.6-sol
AGENT_WORK_OS_CODEX_ARGS='["--ephemeral"]'
```

Use CLI permission/sandbox settings appropriate for your environment. The control plane never receives your Codex credentials.

## Identity and organizations (initial production-hardening slice)

When `DATABASE_URL` is configured, the API supports first-party account registration and login. Registration creates an organization with an Owner membership. Owner/Admin members can issue email-bound, expiring invitations for Admin/Member/Viewer roles and issue revocable, machine-bound daemon credentials. The session token is stored as a hash in PostgreSQL and sent in an `HttpOnly`, `SameSite=Strict` cookie by default. PostgreSQL-backed registration and login limits apply across API instances. Mutating cookie-authenticated requests require the matching `X-CSRF-Token` header. Production requires PostgreSQL; machine credentials authenticate daemons and the shared bearer credential is rejected for production daemon and customer REST access.

Set `AGENT_WORK_OS_ALLOWED_ORIGINS` to a comma-separated exact origin list when the browser UI is served from another origin. If the UI and API are on separate sites, also set `AGENT_WORK_OS_COOKIE_SAME_SITE=None` (production HTTPS is required); otherwise keep the default `Strict`. Set `AGENT_WORK_OS_TRUST_PROXY=true` only behind a trusted proxy that overwrites `X-Forwarded-For` and `X-Forwarded-Proto`.

Authentication endpoints:

- `POST /api/auth/register` — `{ email, password, organizationName }`; password must be at least 12 characters.
- `POST /api/auth/login` — `{ email, password }`.
- `GET /api/auth/me` and `GET /api/organizations` — current account and memberships.
- `POST /api/organizations/:id/invitations` — `{ email, role }`; returns a one-time invitation token for out-of-band delivery.
- `POST /api/organizations/:id/machine-credentials` — `{ machineId, name }`; returns a one-time machine token. Store it as `AGENT_WORK_OS_MACHINE_TOKEN` on that daemon.
- `POST /api/organizations/:id/machine-credentials/:credentialId` — revoke a machine credential and disconnect its active daemon.
- The daemon prints its stable machine ID at startup. Use that ID when issuing its credential; production daemon WebSockets authenticate in the first protocol message, not in the URL.
- `POST /api/auth/accept-invitation` — `{ token }`; email must match the invitation.
- `POST /api/auth/logout` — revokes the active server-side session.

This is an incremental identity foundation, not a production SaaS launch claim. Email verification, password recovery, external IdP integration, invitation delivery, tenant-scoped Shipping Run APIs, and multi-instance event routing remain open. PostgreSQL stores tenant-owned Machines and Sessions in separate rows; session updates lock only the affected session row. Shipping Runs and compatibility data remain in the global state snapshot, which still lacks safe multi-instance write coordination. Run one API instance. Public registration still needs email verification and deployment-level bot/abuse controls before opening signups broadly.

## Canonical work items

The control API exposes a versioned WorkItem lifecycle backed by append-only transition events. IDs use a type prefix plus UUID. Every transition requires an expected version and a unique command ID; stale writes return `409`, and exact retries return the original result.

Authenticated routes:

- `POST /api/work-items` — create using `id`, `commandId`, `organizationId`, `title`, and optional `projectId` / `description`.
- `GET /api/work-items?organizationId=...` — list within one organization.
- `GET /api/work-items/:id?organizationId=...` — read within one organization.
- `POST /api/work-items/:id/transitions` — body includes `organizationId`, `commandId`, `expectedVersion`, and `to`.
- `GET /api/work-items/:id/events?organizationId=...` — read ordered transition evidence.

Local development uses the existing JSON state file as a compatibility adapter and retains the legacy bearer mode. Production requires PostgreSQL and first-party account sessions; the shared `AGENT_WORK_OS_TOKEN` is reserved for local daemon connections and does not authenticate customer REST requests. PostgreSQL stores normalized WorkItem rows/events, identity, organizations, memberships, invitations, auth sessions, tenant-owned Machines, and tenant-owned Agent Sessions. Shipping Runs and compatibility data remain in the global state snapshot.

## Repository map

```text
apps/web/public/              operator UI
packages/protocol/src/        envelopes + native WebSocket transport
services/control-api/src/     REST, realtime gateway, persistence
runtime/daemon/src/           local machine daemon + agent adapters
scripts/acceptance.mjs        end-to-end acceptance gate
docs/                         architecture and provenance
.github/workflows/            CI
```

## Next engineering wave

1. Postgres-backed durable state and migrations.
2. Redis/NATS connection routing for horizontally scaled gateways.
3. Git status/diff/filesystem APIs and terminal/PTY streaming.
4. Worktree lifecycle and parallel-agent isolation.
5. Claude Code/OpenCode/ACP adapters with structured event normalization.
6. Task -> worktree -> agent -> review workflow.
7. PR/CI monitoring, human approvals, budgets and policy controls.
8. Electron desktop shell and mobile/PWA remote controls.
9. Agent routing, evaluation, cost and quality telemetry.
10. Email verification/recovery, external identity integration, invitation delivery, daemon machine identities, and full resource-level RBAC.

See `docs/ARCHITECTURE.md` and `docs/PRODUCT_REVERSE_ENGINEERING.md`.
