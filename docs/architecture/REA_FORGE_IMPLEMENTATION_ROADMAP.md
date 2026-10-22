# REA Forge — implementation roadmap and Codex handoff

Owner: rrahul0904/agent-work-os. Draft PR: https://github.com/rrahul0904/agent-work-os/pull/358.

## Implemented on the draft branch (not yet shipped)

- Local Codex hooks produce minimal source-backed, redacted observations of native sessions, tools and subagents, without raw prompts or tool outputs.
- AWOS-launched Codex CLI JSONL events display command/file/plan/delegation lifecycle when the installed CLI actually emits them.
- Real Forge DAG plan intake, cycle and role validation, bounded scheduler with durable plan claims and session reconciliation, explicit start/retry gates, no uncertain auto-replay.
- Local authenticated API routes for plans, approval, stop, task attestation and evidence report export.
- Existing AWOS sessions and daemon command transport perform execution. No new execution authority or external credentials.
- Visual graph contains plan->task, task dependency, task->session and native observed agent links. Clicking nodes inspects actual evidence and recorded status.
- CLI command creates a deterministic REA intake plan from a source URL. It does not itself research or verify the target.
- Human review and evidence digests gate downstream tasks. Report never marks SHIPPED or DEPLOYED without Shipping OS proof.

## Codex local startup

Use the project branch feature/rea-forge-control-room-v0-1-20261021. Run npm install, npm test, and npm run acceptance.

Terminal A, from repository root:

    AGENT_WORK_OS_ENABLE_FORGE_HOOKS=true AGENT_WORK_OS_ENABLE_FORGE_SUPERVISOR=true AGENT_WORK_OS_TOKEN=dev-token AGENT_WORK_OS_FORGE_WORKSPACE_ROOT="$(pwd)" npm run start:api

Terminal B, from repository root:

    AGENT_WORK_OS_TOKEN=dev-token AGENT_WORK_OS_SERVER_URL=ws://127.0.0.1:8787/ws npm run start:daemon

Open the repository in Codex, inspect and trust the project's .codex/hooks.json. Open Codex in-app browser, authenticate to http://127.0.0.1:8787/ and open http://127.0.0.1:8787/forge.html. This is the Codex browser panel, NOT a custom native Codex conversation widget.

Create a draft from a Codex terminal (change the example URL):

    AGENT_WORK_OS_TOKEN=dev-token npm run forge:intake -- --url https://example.org/product --cwd "$(pwd)" --title "Research and build product" --agent echo

Echo is for safe smoke tests only. Use --agent codex when its locally available capability is confirmed. Codex writing tasks are currently SERIALIZED (maxParallel=1) until per-worker git worktree isolation exists. The command creates a draft; inspect it visually and explicitly approve dispatch. Human review with an actual evidence digest is needed before each downstream dependency can unlock.

## Independent acceptance gates

1. Exact HEAD GitHub CI npm test and npm run acceptance.
2. Local API+daemon echo DAG proof: create draft, verify nothing runs before approval, run first task, ensure dependent waits, independently attest, run dependent, inspect persistence after restart.
3. Real Codex CLI and real Codex app lifecycle hook instrumentation on user Mac; test failure, offline daemon, cancelled tasks, reconnect and hidden or malformed events.
4. Verify local/production auth separation, prompt redaction, denied external mutations, malicious target URL handling and no fabricated DAG edges.
5. Independently review git diff and screenshots; retain exact SHA, session receipts, source provenance and release blockers.

## Remaining features — do not claim complete

- Git worktree-per-worker isolation, conflict-safe patch reconciliation and genuinely parallel Codex code-writing agents.
- Direct REA provider integration and public-source provenance/licensing evidence capture, beyond deterministic task templates.
- Dynamic skill/role selection using Capability Registry with policy authorization and model budget limits.
- Independent deterministic verification worker, exact-SHA code review and bounded repair loop, not only human attestation.
- Leases, robust multi-replica scheduling, transactional PostgreSQL authority, tenant identity and event retention.
- Real Shipping OS integration, authorized preview/UAT, exact-SHA deployment, rollback, release receipts.
- Versioned write-back to canonical master RE project tracker with conflict detection and evidence.
- Real code/PR diff visualization inside graph with source access controls.
- Full UX browser/desktop QA, security hardening and production rollout.

Current product status: DEVELOPMENT / DRAFT PR / NOT PRODUCTION SHIPPED. Never automatically push, merge, deploy, purchase or grant irreversible provider effects.
