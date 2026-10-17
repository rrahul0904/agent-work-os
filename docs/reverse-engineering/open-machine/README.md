# REA Intake — Open Machine local-machine MCP provider

Status: implementation started on `rea/open-machine-local-mcp`  
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
4. The client discovers machine tools.
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

Environment contract for the P0 runtime:

- `AGENT_WORK_OS_WORKSPACE_ROOTS`: OS path-delimiter-separated workspace roots.
- `AGENT_WORK_OS_MACHINE_PERMISSIONS`: comma-separated `read`, `write`, `execute` grants.
- `AGENT_WORK_OS_EXEC_ALLOW`: comma-separated executable names or absolute executable paths.

Rules:

1. Workspace roots are canonicalized with `realpath`.
2. Requested paths are canonicalized through their nearest existing ancestor, preventing traversal through symlinked directories.
3. Read/write/execute grants are independent.
4. No wildcard command execution exists in the P0 contract.
5. Process spawning uses argv and `shell: false`.
6. Agent Work OS machine/auth tokens are removed from child process environments.
7. File reads, directory listings, execution time, and captured output are bounded.
8. Deployment, publishing, destructive Git operations, browser control, and broad network/SSH authority stay behind later explicit policy/approval gates.

## P0 implementation

- `runtime/daemon/src/machine-policy.js`
  - default-deny grants
  - canonical workspace roots
  - symlink-escape protection
  - executable allowlist
- `runtime/daemon/src/machine-tools.js`
  - `info`
  - bounded `list`
  - bounded UTF-8 `read`
  - bounded argv `run`
- `runtime/daemon/test/machine-policy.test.js`
  - deny-by-default
  - root confinement
  - symlink escape rejection
  - command allowlisting
  - read/list/exec happy paths

Local clean-room validation at implementation time: 5 tests, 5 passed.

## Next slices

1. Wire the tools into authenticated daemon command actions and preserve structured results in command receipts.
2. Add an MCP Streamable HTTP provider adapter that maps MCP tools to the same owned machine-tool contract.
3. Support Secure MCP Tunnel so no public inbound listener is required.
4. Persist long-running execution handles and output journals across daemon restart.
5. Add expected-hash writes/patches and Git worktree receipts.
6. Add per-client profiles, approval levels, token rotation, and activity UI.
7. Package and verify on macOS, Windows, and Linux.

## Non-goal: quota circumvention

The Reddit headline discusses usage limits, but the post itself states that Open Machine does not bypass rate limits, extend quotas, or unlock subscription features. Agent Work OS will preserve that boundary: this capability is a governed local-machine tool provider, not a mechanism for avoiding provider limits or protective measures.
