# Shipping Console v1

Shipping Console is the product surface for Shipping OS. It combines the evidence-first release supervisor with the existing local-agent control plane so a portfolio can be prioritized, executed, verified and receipted from one interface.

## Quick start — one command

From the repository root:

```bash
npm run product
```

The launcher starts both the control plane and a local executor, creates an ephemeral control token when one is not supplied, and prints a local console URL. Open that URL to use the complete local product. Set `AGENT_WORK_OS_TOKEN` yourself when you want a stable token across restarts.

## Product surfaces

### Overview

Shows the factory state at a glance:

- registered products and shipped count;
- active Shipping Runs;
- explicit blockers;
- online local executors;
- the highest-priority non-shipped project;
- recent supervisor runs and release receipts.

### Portfolio

`config/portfolio.json` is the product queue. Projects are ranked deterministically from value, readiness, effort, risk, release status and explicit blockers. `SHIPPED` products are deliberately moved out of the active queue rather than being represented as percentage-complete work.

### Shipping Runs

A Shipping Contract can be validated and dispatched to an online local daemon from the console. The control plane records `QUEUED`, then receives authoritative snapshots from the local Shipping Supervisor as gates advance.

The hosted server does **not** expose an arbitrary shell endpoint. Source checkout, builder commands, tests, Codex repair, deployment commands and SHA probes execute on the selected local machine using the already-tested Shipping Supervisor.

### Evidence

The Evidence screen reads committed receipts under `receipts/` plus release receipts from runtime Shipping Runs. A release is shown as shipped only when its underlying receipt/run says `SHIPPED`.

### Local Agents

Existing Codex/local-agent sessions remain available alongside shipping. Source and local credentials stay on the daemon machine while the control plane stores session/run metadata and streams realtime state.

## Security model

`/health` and static product assets are public so the hosted service can be health-checked and render the login screen. Every `/api/*` endpoint requires the shared control-plane token. WebSocket clients and daemons also require the token.

The browser stores the token in localStorage for the current origin and sends it as a Bearer token to API calls. Do not put a production token in repository files or screenshots. Rotate it if a browser profile or chat containing the token is shared.

The product deliberately has no HTTP API that accepts an arbitrary shell command. Shipping execution accepts a validated `shipping-contract/v1`; agent execution accepts only the registered adapter/session protocol.

## Hosted control plane + local executor

Recommended topology:

```text
Browser
   |
   | HTTPS / WSS + control-plane token
   v
Shipping Console / Control API (long-lived host)
   |
   | WSS + same token
   v
Local daemon on your workstation
   |
   +-- Codex adapter
   +-- Shipping Supervisor
          |
          +-- isolated Git worktree
          +-- deterministic verification
          +-- bounded repair loop
          +-- preview / production commands declared by the contract
          +-- exact-SHA proof
          +-- release receipt
```

A hosted control plane should use durable storage for `AGENT_WORK_OS_STATE_PATH`. On Railway, mount a volume at `/data` and set:

```bash
AGENT_WORK_OS_STATE_PATH=/data/state.json
```

Railway supplies `PORT`; the control API honors it automatically.

## Run components separately

Start the control plane:

```bash
AGENT_WORK_OS_TOKEN='replace-me' npm run start:api
```

Start the daemon in another terminal:

```bash
AGENT_WORK_OS_TOKEN='replace-me' \
AGENT_WORK_OS_SERVER_URL='ws://127.0.0.1:8787/ws' \
npm run start:daemon
```

Then open `http://127.0.0.1:8787` and enter the token.

## Connect a workstation to a hosted console

Run from a checkout of Agent Work OS on the workstation that contains the product repositories and deployment credentials:

```bash
AGENT_WORK_OS_TOKEN='<same-token-as-hosted-control-plane>' \
AGENT_WORK_OS_SERVER_URL='wss://<shipping-console-domain>/ws' \
AGENT_WORK_OS_MACHINE_NAME='my-workstation' \
npm run start:daemon
```

The machine appears under **Local agents** and becomes eligible in **Launch Shipping Contract**.

## Shipping Contract path semantics

`project.repoPath` is evaluated on the selected daemon machine, not on the hosted control plane. Deployment/UAT commands are also local commands. This is intentional: it keeps source trees, provider CLIs and deployment credentials on the executor rather than copying them into the hosted service.

## Product proof

Repository acceptance covers both control paths:

1. authenticated control API -> local daemon -> Echo adapter -> persisted follow-up session;
2. authenticated control API -> local daemon -> Shipping Supervisor -> isolated Git worktree -> verification -> exact tested SHA -> `SHIPPED` release receipt.

The acceptance Shipping Contract has Preview/Production mutation disabled so CI can prove orchestration without writing to external providers.
