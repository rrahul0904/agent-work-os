# REA Forge Control Room — first read-only slice

Status: **implementation branch / awaiting Codex verification**. This is not an autonomous reverse-engineering supervisor, an independently certified UI, or a deployed product.

## What is implemented

- /forge.html is a live, read-only graph and node inspector over the existing Agent Work OS /api/state snapshot and /ws update stream.
- Shows actual machine records, agent sessions, shipping runs, and WorkItems present in the authenticated snapshot.
- Draws machine -> session and machine -> shipping-run edges only when the backend reports matching machine IDs.
- Clicking a node inspects status, machine/project identifiers, event counts, and recent event **types**. No raw prompts, credentials, or untrusted messages are rendered.
- Handles empty states, disconnected event streams, independent refresh, snapshot resynchronization, basic keyboard access, and a bounded graph size.
- Adds REA Forge link to the existing Shipping OS sidebar.
- Adds deterministic graph projection tests with no dependency on a model account.

## What is intentionally NOT implemented

- No REA MCP/provider integration, new WorkItem/task authoring, task DAG, delegated agent execution, dynamic supervisor hierarchy, auto-repair, or deployment automation.
- No inferred task dependencies: WorkItem records currently lack versioned dependency metadata in the published snapshot.
- No "verified" claim from agent narrative, process exit, or green UI status. Shipping verification is determined separately by Shipping OS evidence.
- No separate controller database, execution grants, new network side effects, or migrations.
- Production identity is cookie-based; local development can reuse the existing legacy control-plane token. Never put a production secret in a URL.

## Codex test handoff

Use repo: rrahul0904/agent-work-os
Branch: feature/rea-forge-control-room-v0-1-20261021

Run this in Codex with a fresh local checkout/worktree on the branch:

1. Inspect the diff versus origin/main. Confirm no writes, database migrations, deployment actions, external scripts, or additional dependencies have been introduced.
2. Execute npm test, then npm run acceptance on the **branch HEAD**, retaining exact SHA, exit codes, logs and generated evidence.
3. Review services/control-api/test/forge-graph.test.js and independently add negative tests for malformed/untrusted events, status changes, disappearing machines and large datasets. Check no fake "completed", "running" or graph dependencies are projected.
4. Start the control API and daemon in an isolated local test environment (use echo only; no paid model required):
   AGENT_WORK_OS_TOKEN=dev-token npm run start:api
   AGENT_WORK_OS_TOKEN=dev-token AGENT_WORK_OS_SERVER_URL=ws://127.0.0.1:8787/ws npm run start:daemon
5. Open http://127.0.0.1:8787/ to sign in with the local development token; follow sidebar link "REA Forge · Live Graph" or open http://127.0.0.1:8787/forge.html.
6. Confirm graph is empty or shows only real records before creating any sessions. Create a non-destructive echo session in Shipping OS's existing Local agents page. Check the new session appears on /forge.html, linked to the correct machine; click the node and confirm observed event count and status.
7. Disconnect/restart the daemon; ensure stale sessions/machines do not silently show success. Restore the daemon; confirm reconnection and explicit state behavior.
8. Test keyboard node focus/Enter/Space, smartphone-width viewport, SVG overflow, escaped malicious-looking labels, WebSocket disconnect, and reload/refresh state. No status should depend on mock hard-coded values.
9. Review production-cookie scoped snapshot behavior in an isolated test tenant; ensure another organization's data never appears. Do not enable public customer traffic or production deployment for this testing.
10. Return a strict PASS/FAIL/BLOCKED table with the exact branch SHA and test/CI run IDs, screenshots if actually taken, and a prioritized repair list. Fix findings on this branch, independently reverify, and keep the PR draft until explicit authorization.

## Architecture truth

Codex skill / future plugin -> Agent Work OS control-plane authority -> existing authenticated snapshots/WebSocket -> REA Forge read-only graph. The graph never invokes a tool or starts an agent. Next build phase: versioned Flow/DAG facts and durable supervisor execution under existing canonical WorkItem/Run ownership, tested with fake/echo executor and receipt-backed restart reconciliation before real parallel Codex workers.

Related existing work: #39 (Flow), #88 (REA provider), #251 / PR #252 (durable supervisor, unmerged), #259 (Capability Fabric), #267 (execution fabric), #328 (Myrmidon), #345 (visual graph), #352 (code explorer), #51 (Shipping OS).

## v0.2 — native Codex activity projection

Source: AWOS-authorized sessions started by its existing daemon with Codex CLI JSONL (codex exec --json). This does NOT automatically observe unrelated threads started in the Codex desktop app. The supported in-Codex viewing surface is the built-in browser panel displaying the localhost Forge graph; a native integrated Codex conversation panel has not been installed.

Data path: Codex exec JSONL -> bounded, redacted codex.activity events -> existing daemon.session.event -> canonical AWOS session store -> existing /ws -> Forge graph.

Observed links:
- Machine to session: recorded machineId.
- Session to item: actual Codex item ID and per-turn traceId.
- Collaboration item to subagent: ONLY source-emitted receiver_thread_ids, including observed child status if supplied.
- Task DAG edges: not available in current snapshot and never fabricated.

Commands, prompts, diffs, file paths and stdout are intentionally omitted from the new activity projection. The existing AWOS session already stores final answer/error messages separately. Unrecognized JSONL does not become raw persisted payload. Historical Codex CLI releases have omitted delegation spawn events in JSON output. Missing child IDs must display as not observed; never invent them.

### Test inside Codex

1. Check out the feature branch in the Codex desktop app, run npm test and npm run acceptance.
2. Run local AWOS API with AGENT_WORK_OS_TOKEN=dev-token npm run start:api.
3. Run daemon with AGENT_WORK_OS_TOKEN=dev-token AGENT_WORK_OS_SERVER_URL=ws://127.0.0.1:8787/ws npm run start:daemon.
4. Open Codex built-in browser (Cmd+Shift+B), visit http://127.0.0.1:8787/ and sign into the **local development** control plane; navigate to http://127.0.0.1:8787/forge.html.
5. In the existing AWOS Local Agents interface, start a codex session with an authorized safe task in a temporary worktree. It MUST be started via AWOS for this integration to observe it. If the codex capability is missing, check whether Codex CLI is installed and authenticated.
6. Inspect live command started/completed nodes, actual file-change and plan nodes when emitted, and actual delegation only when child IDs are observed. Simulate failed command, daemon disconnect and reload. Capture verifiable local evidence.
7. Record exact SHA, CLI version, CI run, screenshots where actually taken, and any failures. Leave PR #358 in draft pending independent approval.

In-app browser does not equal a native embedded extension surface. Full app-server observer support for Codex-desktop-owned threads requires a separate authorization and lifecycle design.

### Acceptance

Only source-backed nodes; no fabricated delegation; no task dependencies without canonical facts; no assumed shipped status from completion of a tool; terminal failure preserved; updated graph within running websocket session; tenant separation; actual in-app local browser verification.
