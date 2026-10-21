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
