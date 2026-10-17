# REA Intake — Open Machine local-machine MCP provider

Status: implementation active on `rea/open-machine-local-mcp`  
Canonical tracker: https://github.com/rrahul0904/agent-work-os/issues/265

## Source provenance

- Intake: https://www.reddit.com/r/ChatGPT/s/fVIaj6sUiw
- Upstream repository: https://github.com/OpenMachineLabs/openmachine
- Upstream inspected commit: `9c65109767b29db3ec434ab35a765835ab2af98e`
- Upstream license observed during intake: MIT
- Classification: **donor/provider**, not a standalone owned clone

This implementation is clean-room. Upstream is used as observable evidence for product behavior, capability boundaries, and architectural patterns. Agent Work OS code and contracts are independently implemented.

## Problem / JTBD

Coding assistants can reason about a project but ordinary chat interfaces often cannot safely act on the developer's machine. The owned capability should let an approved AI client inspect a deliberately granted project, make bounded changes, execute allowed tools, continue durable jobs, and return evidence without turning the entire host into an unrestricted remote shell.

## Observed product workflow

1. A persistent service runs on the user's computer.
2. The user chooses what the service may access.
3. An MCP-capable client connects through a supported remote/private transport.
4. The client discovers only locally granted tools.
5. Each request is checked locally against permissions.
6. Filesystem, process, task, Git/GitHub/SSH, or optional browser work executes locally.
7. Results are returned to the agent and activity remains observable.
8. Long-running work can be revisited rather than being tied to one short request.

## Capability map

| Capability | Open Machine evidence | Agent Work OS ownership decision |
| --- | --- | --- |
| Persistent local service | local service / server modules | Extend existing daemon |
| Machine identity | environment/local-machine surfaces | Existing machine identity remains canonical |
| Workspace read/write/patch | workspace modules | Owned machine-tool contract + policy |
| Terminal/process execution | execution modules | Owned bounded executor, no implicit shell |
| Durable tasks | task store/transitions | Integrate with durable work/session model |
| Git/worktrees | workspace Git/worktree modules | Provider under Agent Work OS policy |
| GitHub | GitHub integration modules | Provider; existing governance applies |
| SSH | SSH integration modules | Provider with host allowlist + secret isolation |
| Browser tasks | optional integration | High-risk optional provider |
| Skills | skills feature | Capability Fabric / Harness Fabric integration |
| MCP | MCP modules/contracts | Transport surface only; not authority |
| Resilience/contracts | extensive contract/resilience tests | Adopt as acceptance discipline |

## Owned architecture

```text
ChatGPT / MCP client
        |
        | supported MCP transport / Secure MCP Tunnel
        v
MCP provider adapter
        |
        v
Agent Work OS authority
  identity • grants • approvals • work/session • audit
        |
        v
Durable command routing / receipts / replay
        |
        v
Local daemon
        |
        +-- workspace tools
        +-- bounded execution
        +-- durable tasks
        +-- Git / GitHub / SSH providers
        `-- optional browser/computer-use provider
```

MCP is deliberately a transport adapter. The local daemon and Agent Work OS policy are the trust boundary.

## Security model

The implementation starts **disabled** unless explicit machine grants are configured.

Environment contract:

- `AGENT_WORK_OS_WORKSPACE_ROOTS`: OS path-delimiter-separated workspace roots.
- `AGENT_WORK_OS_MACHINE_PERMISSIONS`: comma-separated `read`, `write`, `execute` grants.
- `AGENT_WORK_OS_EXEC_ALLOW`: comma-separated executable names or absolute executable paths.
- `AGENT_WORK_OS_MCP_HOST`: loopback host by default (`127.0.0.1`).
- `AGENT_WORK_OS_MCP_PORT`: local MCP port (`8790` by default).
- `AGENT_WORK_OS_MCP_TOKEN`: optional local bearer check when direct/local transport requires it.

Rules:

1. Workspace roots are canonicalized with `realpath`.
2. Requested paths are canonicalized through their nearest existing ancestor, preventing traversal through symlinked directories.
3. Read/write/execute grants are independent and ungranted MCP tools are not registered.
4. No wildcard command execution exists in the initial contract.
5. Process spawning uses argv and `shell: false`.
6. Agent Work OS machine/auth tokens are removed from child process environments.
7. File reads/writes, directory listings, execution time, and captured output are bounded.
8. Writes are atomic and can require an expected SHA-256 to prevent stale overwrites.
9. The MCP listener binds to loopback by default and applies Host/Origin validation before dispatch.
10. Deployment, publishing, destructive Git operations, browser control, and broad network/SSH authority stay behind later explicit policy/approval gates.

## Implemented slice

### Machine policy/runtime

- `runtime/daemon/src/machine-policy.js`
  - default-deny grants
  - canonical workspace roots
  - symlink-escape protection
  - executable allowlist
- `runtime/daemon/src/machine-tools.js`
  - `info`
  - bounded `list`
  - bounded UTF-8 `read` with SHA-256
  - atomic `write` with optional expected-SHA optimistic concurrency
  - bounded argv `run`
- daemon command routing
  - `machine.info`
  - `machine.workspace.list`
  - `machine.workspace.read`
  - `machine.execution.run`
  - structured command results are included in daemon command receipts/acks

### MCP provider

- `runtime/mcp/src/index.js`
  - official MCP v2 server/runtime packages
  - current Streamable HTTP server shape
  - `system_info`
  - conditional `workspace_list` / `workspace_read`
  - conditional `workspace_write`
  - conditional `execution_run`
  - tool discovery follows configured grants
  - loopback bind + Host/Origin validation
  - optional bearer check
- `npm run start:mcp`

### Verification

`runtime/daemon/test/machine-policy.test.js` covers:

- deny-by-default
- root confinement
- symlink escape rejection
- command allowlisting
- read/list/exec happy paths
- expected-SHA optimistic write concurrency

Local clean-room validation at implementation time: **6 tests, 6 passed**. Repository CI also syntax-checks the MCP entry point before the existing test suite.

## Current run path

Example least-privilege local setup on macOS/Linux:

```bash
export AGENT_WORK_OS_WORKSPACE_ROOTS="$PWD"
export AGENT_WORK_OS_MACHINE_PERMISSIONS="read,write,execute"
export AGENT_WORK_OS_EXEC_ALLOW="node,npm,git"
npm install
npm run start:mcp
```

The local MCP endpoint is `http://127.0.0.1:8790/mcp`. Keep it loopback-bound. For supported ChatGPT workspaces, connect the local endpoint through OpenAI Secure MCP Tunnel rather than publishing the port to the internet.

## Remaining slices

1. Persist MCP-originated calls into the same Agent Work OS receipt/event ledger as routed daemon commands.
2. Add durable execution handles: `start/status/output/cancel/list` across daemon restart.
3. Add patch/diff tools and Git worktree receipts.
4. Add per-client access profiles, approval levels, token rotation, and activity UI.
5. Add governed GitHub and SSH providers.
6. Add optional browser/computer-use provider behind explicit high-risk grants.
7. Package/install/update/doctor and verify on macOS, Windows, and Linux.
8. Add MCP protocol/compatibility and tunnel acceptance tests against supported ChatGPT environments.

## Non-goal: quota circumvention

The Reddit headline discusses usage limits, but the post itself states that Open Machine does not bypass rate limits, extend quotas, or unlock subscription features. Agent Work OS preserves that boundary: this capability is a governed local-machine tool provider, not a mechanism for avoiding provider limits or protective measures.
