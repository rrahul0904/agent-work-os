# REA Intake — Open Machine → Agent Work OS local-machine provider

Status: **implementation active** on `rea/open-machine-local-mcp`  
Tracker: https://github.com/rrahul0904/agent-work-os/issues/265  
Implementation PR: https://github.com/rrahul0904/agent-work-os/pull/268

## 0. Repository classification

**DONOR / PROVIDER → `rrahul0904/agent-work-os`**.

Do not create a standalone Open Machine clone. Agent Work OS already owns machine identity, sessions, durable command routing, coding-agent adapters, receipts, capability verification, replay/shipping and policy. The missing owned capability is a governed local-machine provider that can be exposed through MCP without turning MCP into the authority.

## 1. Source provenance

- Intake: https://www.reddit.com/r/ChatGPT/s/fVIaj6sUiw
- Upstream: https://github.com/OpenMachineLabs/openmachine
- Upstream inspected `main`: `9c65109767b29db3ec434ab35a765835ab2af98e`
- Upstream license observed during intake: MIT
- Implementation method: clean-room; source used as observable product/capability/architecture evidence, not copied implementation code.

## 2. User / problem / JTBD

**User:** developer or technical operator using ChatGPT or another MCP-capable agent.

**Problem:** the agent can reason about code but cannot safely operate the user's actual development machine for file edits, tests and long-running work without either manual copy/paste or overly broad host access.

**JTBD:** “Let my approved agent inspect and change only the projects I grant, execute only the programs I allow, continue durable work across reconnects, and give me evidence of what happened.”

## 3. Product workflow

1. Start Agent Work OS locally.
2. Configure one or more workspace roots.
3. Grant an explicit subset of `read`, `write`, `execute`.
4. Allow specific executables; no wildcard shell authority.
5. Start the loopback MCP provider.
6. Connect a supported AI workspace through the supported MCP path / Secure MCP Tunnel.
7. The client discovers only the tools allowed by the configured grants.
8. Read files, hash them, perform guarded writes, or run a short command.
9. For longer work, start a durable task and retain its task ID.
10. Poll status/output by offset, reconnect without losing the task record, or cancel it.
11. Later phases route all MCP-originated actions through the canonical evidence/approval ledger and add Git/GitHub/SSH/browser providers.

## 4. Capability extraction and ownership

| Capability | Donor evidence | Owned decision |
| --- | --- | --- |
| Persistent local service | local service/server modules | Extend Agent Work OS runtime |
| Machine identity | environment/local-machine surface | Existing Agent Work OS machine identity |
| Workspace inspect/read/write | workspace modules | Owned machine policy + tools |
| Process execution | execution modules | Owned argv executor, never implicit shell |
| Durable tasks | task store/transitions | Owned detached task runner + persisted records |
| Git/worktrees | Git/worktree modules | Next provider behind existing gates |
| GitHub | GitHub integration | Reuse canonical GitHub governance |
| SSH | SSH integration | Future host-allowlisted provider |
| Browser/computer use | optional integration | Future high-risk provider with explicit grant |
| Skills | skills surface | Capability Fabric / Harness Fabric |
| MCP | MCP modules/contracts | Transport/provider only, not authority |
| Resilience/contracts | contract/resilience tests | Adopt as acceptance discipline |

## 5. Owned architecture

```text
ChatGPT / MCP-capable client
          |
          | supported MCP transport / Secure MCP Tunnel
          v
Loopback MCP provider
  tool discovery follows grants
          |
          v
Agent Work OS machine policy
  roots • read/write/execute • executable allowlist
          |
          +----------------------+----------------------+
          |                      |                      |
          v                      v                      v
 workspace tools          short execution       durable task manager
 list/read/write          argv + bounds         persisted task handle
 hash/precondition        shell:false            start/status/output/cancel
          |                      |                      |
          +----------------------+----------------------+
                                 |
                                 v
                     receipts / evidence / replay
                         (canonicalization next)
```

Agent Work OS remains the authority for identity, grants, approvals, work/session state, evidence and shipping. MCP is a client-facing adapter.

## 6. Security / permissions

The machine provider is **disabled by default** until roots and grants are configured.

Configuration:

- `AGENT_WORK_OS_WORKSPACE_ROOTS` — OS-delimited canonical workspace roots.
- `AGENT_WORK_OS_MACHINE_PERMISSIONS` — comma-separated subset of `read,write,execute`.
- `AGENT_WORK_OS_EXEC_ALLOW` — explicit executable names or absolute executable paths; no wildcard.
- `AGENT_WORK_OS_MACHINE_TASKS_STATE` — local durable task state directory.
- `AGENT_WORK_OS_MACHINE_TASK_MAX_MS` — maximum durable-task runtime.
- `AGENT_WORK_OS_MACHINE_TASK_LOG_BYTES` — per-stream durable log cap.
- `AGENT_WORK_OS_MCP_HOST` — enforced loopback host only.
- `AGENT_WORK_OS_MCP_PORT` — local MCP port.
- `AGENT_WORK_OS_MCP_TOKEN` — optional additional direct/local bearer check.

Security invariants:

1. Workspace roots are resolved with `realpath`.
2. Requested paths resolve through their nearest existing ancestor, blocking traversal and symlink escape even for a new file.
3. Read, write and execute are independent grants.
4. MCP does not register tools for ungranted capabilities.
5. Writes are size-bounded, atomic and can require the expected SHA-256 of the current file.
6. Commands are explicit argv with `shell: false` and an executable allowlist.
7. Agent Work OS machine/control/MCP credentials are stripped from spawned process environments.
8. Short-command runtime and captured output are bounded.
9. Durable tasks have bounded runtime and bounded stdout/stderr journals.
10. The MCP server refuses non-loopback bind configuration and applies Host/Origin validation.
11. Public inbound exposure is not required; use the supported secure tunnel/private transport.
12. Deploy/publish/merge, broad SSH/network access and browser/computer use remain separately gated.

For production, prefer absolute executable paths rather than relying on `PATH` lookup.

## 7. Implemented now

### Workspace / execution policy

`runtime/daemon/src/machine-policy.js`

- default deny
- canonical workspace roots
- `read` / `write` / `execute` grants
- symlink escape protection
- explicit executable allowlist

### Local machine tools

`runtime/daemon/src/machine-tools.js`

- `info`
- bounded `list`
- bounded UTF-8 `read` + SHA-256
- atomic `write` + optional `expectedSha256`
- bounded `run` with `shell:false`

### Durable execution

`runtime/daemon/src/machine-tasks.js`  
`runtime/daemon/src/machine-task-runner.js`

- `start`
- `status`
- `output` with resumable byte offset
- `cancel`
- `list`
- detached runner process independent of the main daemon/client connection
- local JSON lifecycle record + bounded stdout/stderr journals
- timeout + SIGTERM then forced termination fallback
- runner revalidates workspace and executable policy before spawning the actual process

### Existing daemon integration

`runtime/daemon/src/index.js`

- advertises `machine-tools` only when configured
- `machine.info`
- `machine.workspace.list`
- `machine.workspace.read`
- `machine.execution.run`
- structured command result in command receipt/ack

The MCP path additionally exposes write and durable-task lifecycle. Canonical daemon/control-plane routing for those newer actions is a follow-up so both surfaces share one persisted evidence path.

### MCP provider

`runtime/mcp/src/index.js`

- official current MCP v2 packages
- Streamable HTTP `/mcp`
- loopback-only bind
- Host/Origin validation
- optional bearer check
- `system_info`
- conditional `workspace_list`
- conditional `workspace_read`
- conditional `workspace_write`
- conditional `execution_run`
- conditional `execution_start`
- conditional `execution_status`
- conditional `execution_output`
- conditional `execution_cancel`
- conditional `execution_list`

## 8. Verification

Unit coverage already implemented:

- deny-by-default
- root confinement
- symlink escape rejection
- executable allowlisting
- read/list/foreground-exec
- expected-SHA stale-write rejection
- durable task completion/output recovery through a fresh task-manager instance
- durable task cancellation through the persisted runner handle

The repository PR triggers the existing GitHub Actions gate: dependency install → full `npm test` → full acceptance suite. Earlier local clean-room policy/tool validation passed 6/6 before the durable-task additions; the PR CI is the authoritative integration gate for the expanded slice.

## 9. Current local run path

Example least-privilege development setup on macOS/Linux:

```bash
export AGENT_WORK_OS_WORKSPACE_ROOTS="$PWD"
export AGENT_WORK_OS_MACHINE_PERMISSIONS="read,write,execute"
export AGENT_WORK_OS_EXEC_ALLOW="$(command -v node),$(command -v npm),$(command -v git)"
npm install
npm run start:mcp
```

Local endpoint: `http://127.0.0.1:8790/mcp`.

Do not publish that port to the Internet. Connect supported ChatGPT workspaces through OpenAI Secure MCP Tunnel or the supported private connection mechanism.

## 10. Remaining roadmap

### P1 — unify evidence and authority

- route MCP calls into the same persisted Agent Work OS command/evidence ledger
- add immutable action receipts with input/output digests and exact workspace state
- add approval tiers for write/execute/high-risk actions
- add replay/idempotency tests across control-plane and daemon restart

### P2 — coding workflow

- patch/diff tool with expected-base hash
- Git status/diff/commit/worktree provider
- branch/commit receipts and exact-SHA verification
- governed GitHub PR/issue provider through existing GitHub integration

### P3 — extended machine integrations

- SSH provider with host allowlist, credential isolation and no secret echo
- optional browser/computer-use provider behind explicit high-risk grant
- capability/skill compilation through Agent Work OS Capability Fabric

### P4 — productization

- install/update/doctor
- management UI for roots, grants, executable allowlist, running tasks, approvals and activity
- macOS/Windows/Linux packaging and acceptance matrix
- Secure MCP Tunnel acceptance test against a supported ChatGPT workspace
- fault-injection/resilience suite for disconnect, daemon restart, runner crash, stale write and partial output

## 11. Acceptance target

A supported ChatGPT workspace can connect through the secure MCP path, discover only granted tools, inspect an explicitly granted project, read/hash a file, perform an expected-hash guarded write, run an allowlisted test, start and recover a durable task, receive bounded output and evidence, and be unable to read outside the root or execute an unapproved program.

## 12. Non-goal: quota circumvention

The Reddit headline discusses usage limits, but the source post itself says Open Machine does not bypass rate limits, extend provider quotas or unlock subscription features. Agent Work OS preserves that boundary. This feature is a governed local-machine provider, not a mechanism for avoiding provider usage limits or other protective measures.
