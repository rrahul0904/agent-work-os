# Agent Work OS

Agent Work OS is a clean-room, local-first control plane for coding agents. It lets a browser control an agent CLI running on your own machine while your repository and agent credentials stay local.

## Current status

The current end-to-end slice is implemented and acceptance-tested:

- zero-dependency Node 22 control plane with REST + native WebSocket server
- persistent machine/session state
- authenticated local daemon connection
- machine registration, capability discovery, presence and heartbeat
- session start, follow-up message and interrupt commands
- Codex CLI adapter using `codex exec --json`, native thread IDs and `resume`
- normalized agent text/tool/status/usage/log/error events
- deterministic built-in echo adapter for CI and local acceptance testing
- **Agent Room** multi-agent observability UI with Working / Waiting / Blocked / Done state, shared-screen event rendering and replay
- read-only local Claude Code JSONL observation, including explicit sub-agent session discovery
- bounded transcript reads and fail-closed symlink/path checks; visualization makes no Claude/model call
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

Open `http://127.0.0.1:8787` for Shipping OS or `http://127.0.0.1:8787/agent-room.html` for Agent Room. The built-in `echo` adapter is always available unless disabled. If `codex` is installed and authenticated, the daemon automatically advertises a `codex` capability.

### Claude transcript observation

The local daemon observes Claude Code transcript files read-only when the configured projects directory exists. Resolution order:

1. `AGENT_WORK_OS_CLAUDE_PROJECTS`
2. `${CLAUDE_CONFIG_DIR}/projects`
3. `~/.claude/projects`

Useful settings:

```bash
# Disable read-only Claude session observation entirely.
AGENT_WORK_OS_OBSERVE_CLAUDE=false

# Override the transcript projects root.
AGENT_WORK_OS_CLAUDE_PROJECTS=/absolute/path/to/.claude/projects

# Poll interval; minimum 1000 ms.
AGENT_WORK_OS_CLAUDE_POLL_MS=2500
```

Observed Claude sessions are intentionally **not** command-capable adapters. Agent Room can visualize them, but Agent Work OS will not send prompts, approvals, or interrupts back into those externally launched sessions through this observer path.

## Verification

```bash
npm test
npm run acceptance
```

The acceptance gate launches an isolated control plane + daemon, verifies Agent Room static delivery, injects a synthetic Claude main-session + sub-agent JSONL fixture and verifies daemon-to-control-plane observation, creates and resumes a managed echo session, and finishes a receipt-gated Shipping Supervisor run.

## Codex integration

The adapter invokes Codex non-interactively with JSONL output and workspace automation. A first turn uses the CLI's generated thread ID; later messages resume that thread. Optional environment variables:

```bash
AGENT_WORK_OS_CODEX_MODEL=gpt-5.6-sol
AGENT_WORK_OS_CODEX_ARGS='["--ephemeral"]'
```

Use CLI permission/sandbox settings appropriate for your environment. The control plane never receives your Codex credentials.

## Repository map

```text
apps/web/public/              Shipping OS + Agent Room operator UI
packages/protocol/src/        envelopes + native WebSocket transport
services/control-api/src/     REST, realtime gateway, persistence
runtime/daemon/src/           local daemon, managed adapters, Claude transcript observer
scripts/acceptance.mjs        end-to-end acceptance gate
docs/                         architecture, provenance, reverse-engineering dossiers
.github/workflows/            CI
```

## Next engineering wave

1. Postgres-backed durable state and migrations.
2. Redis/NATS connection routing for horizontally scaled gateways.
3. Git status/diff/filesystem APIs and terminal/PTY streaming, including per-agent changed-file recap.
4. Worktree lifecycle and parallel-agent isolation.
5. Claude Code/OpenCode/ACP **command adapters** with structured event normalization, separate from read-only transcript observation.
6. Task -> worktree -> agent -> review workflow.
7. PR/CI monitoring, human approvals, budgets, drift signals and policy controls.
8. Electron desktop shell and mobile/PWA remote controls.
9. Agent routing, evaluation, cost and quality telemetry.
10. Production auth, organizations/RBAC, audit and deployment hardening.

See `docs/ARCHITECTURE.md`, `docs/PRODUCT_REVERSE_ENGINEERING.md`, and `docs/AGENT_ROOM_REVERSE_ENGINEERING.md`.
