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
10. Production auth, organizations/RBAC, audit and deployment hardening.

See `docs/ARCHITECTURE.md` and `docs/PRODUCT_REVERSE_ENGINEERING.md`.
