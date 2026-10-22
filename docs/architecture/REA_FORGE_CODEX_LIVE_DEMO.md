# REA Forge — real Codex desktop demo protocol

**Code:** feature/rea-forge-control-room-v0-1-20261021; PR #358 (draft).
**Master acceptance gate:** https://github.com/rrahul0904/agent-work-os/issues/359 (open).

This is a **live-source-backed demonstration**, not a screenshot mock or production release. Run it inside your local Codex checkout on macOS and report real results. **No automatic merges, pushes, deployments or reviewer attestations.**

## Preparation

From a separate test checkout (never your main worktree):

~~~bash
mkdir -p ~/Projects
git clone https://github.com/rrahul0904/agent-work-os.git ~/Projects/rea-forge-test
cd ~/Projects/rea-forge-test
git fetch origin
git switch --track origin/feature/rea-forge-control-room-v0-1-20261021
git status --short
node --version
npm install --no-audit --no-fund
npm test
npm run acceptance
~~~

If the clone/branch already exists, instead enter it, git fetch, and git pull --ff-only. Node >=22 is required. **Require a clean Git checkout before real Codex workers.** Review any local changes rather than removing them.

## Start dev services

Open two terminals inside this checkout.

Terminal A — API:
~~~bash
AGENT_WORK_OS_ENABLE_FORGE_HOOKS=true \
AGENT_WORK_OS_ENABLE_FORGE_SUPERVISOR=true \
AGENT_WORK_OS_TOKEN=dev-token \
AGENT_WORK_OS_FORGE_WORKSPACE_ROOT="$(pwd)" \
npm run start:api
~~~

Terminal B — daemon:
~~~bash
mkdir -p "$HOME/.local/share/rea-forge-worktrees"
AGENT_WORK_OS_TOKEN=dev-token \
AGENT_WORK_OS_SERVER_URL=ws://127.0.0.1:8787/ws \
AGENT_WORK_OS_FORGE_ISOLATE_WORKTREES=true \
AGENT_WORK_OS_FORGE_WORKTREE_ROOT="$HOME/.local/share/rea-forge-worktrees" \
npm run start:daemon
~~~

These are local, loopback development credentials ONLY. Do not expose the API port or bypass login; if port 8787 is in use, diagnose the conflict before starting another API instance.

Open this repository in Codex desktop. Review and explicitly trust .codex/hooks.json (Codex CLI command /hooks). Open a browser tab from Codex's app toolbar or the supported keyboard shortcut. Navigate first to http://127.0.0.1:8787/, supply the local token if prompted, then http://127.0.0.1:8787/forge.html.

The in-app browser may not handle the app's local token login in every Codex version. **Test this:** if blocked, record IN_APP_BROWSER_AUTH_BLOCKED and use an external browser side-by-side as a debugging workaround. An external browser does not satisfy the original in-Codex UX criterion.

## Phase A — real echo scheduling, no Codex provider cost

~~~bash
AGENT_WORK_OS_TOKEN=dev-token \
npm run forge:demo -- --mode echo --cwd "$(pwd)" --approve-echo
~~~

The script must create a real plan, explicitly approve only echo fixture execution, and report PASS_ECHO_APPROVAL_AND_DEPENDENCY_GATE only if both independent echo sessions finish AND the dependent third task remains pending until evidence attestation. It does not auto-attest, so the graph should show the paused dependency gate.

Read actual persisted execution:
~~~bash
AGENT_WORK_OS_TOKEN=dev-token npm run forge:demo -- --inspect ACTUAL_PLAN_ID
~~~

Echo validates execution and dependencies. It is not a real LLM or evidence reviewer.

## Phase B — real Codex agent, read-only

Confirm your installed Codex CLI is signed in and advertised by the daemon. The source checkout must be clean; isolated worktree root must already exist.

~~~bash
AGENT_WORK_OS_TOKEN=dev-token \
npm run forge:demo -- --mode codex --cwd "$(pwd)"
~~~

This creates a read-only Codex task in **DRAFT**. Open Forge Control Room and deliberately click Approve and dispatch. The daemon stages a real detached worktree, invokes a real Codex session to inspect code (no file edits authorized), and records actual tool events. If supported and authorized, the task requests two read-only subagent reviews; only upstream-observed child IDs may render.

Observe real session queued/running/completed, tool activity, actual subagent IDs if present, a workspace baseline receipt, diff receipt, independent STATIC Git review, and awaiting_verification rather than a false SHIPPED claim.

Inspect the actual plan using --inspect ACTUAL_PLAN_ID. On failure, preserve logs and report the issue; do not fake subagent or test outcomes.

## Phase C — native Codex desktop conversation observation

Start an ordinary Codex conversation in the SAME trusted repository, independent of Agent Work OS worker dispatch. Ask Codex to read two files using tools and optionally spawn read-only subagents if supported. Verify that lifecycle hooks create a native Codex session in the Forge graph. This is the original user-required direct-in-Codex observation path, distinct from daemon Codex events. If a child ID is absent, report NOT_OBSERVED, not success.

## Exact acceptance report

Capture the following in Codex, with local screenshot evidence if supported:
1. Branch, exact HEAD SHA, git status before/after, installed Codex version.
2. npm test and npm run acceptance exit status and current GitHub CI URL.
3. Phase A plan ID, real echo session IDs and actual dependency hold.
4. Phase B plan ID, real Codex session ID, tool/child counts, SHA/diff/review receipt status.
5. Phase C native Codex hook observations (or explicit NOT_OBSERVED).
6. In-app browser authentication and realtime graph PASS/FAIL/BLOCKED; record actual screenshots where taken.
7. Bugs with reproduction steps and exact files; no invented results.
8. Explicit release verdict DEVELOPMENT / NOT SHIPPED.

Even a passing demo does not certify full production: research providers, artifact promotion, independent application testing, deployment, tracker writes and production authorization remain open in issue #359.
