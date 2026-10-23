# REA evidence ledger: Claude subagent orchestration showcase

Intake: 2026-10-22 UTC. Routing: **DONOR_REFERENCE / Agent Work OS REA Forge extension**, not a fork or new repo. Canonical owner: `rrahul0904/agent-work-os`. Existing supervisor/visualization: draft PR #358, issue #359. Donor intake issue #367.

## Public-source provenance and confidence

- Source: https://www.reddit.com/r/claudeskills/comments/1xbfv7t/my_experimental_claude_subagent_orchestration/
- Author: u/nturner03, “My experimental Claude subagent orchestration framework”.
- Author says code is experimental, not fully reviewed and not ready for a public repository. **Upstream source and license are unavailable. Nothing has been copied from it.**
- **Author-described, not independently verified:** `/orchestrate`, small specialist briefs, ten subagents (some named), Haiku/Sonnet/Opus tier routing, checks in separate subagents, read-only reviewer, guardrail hooks, batched questions, context-exhaustion handoffs, `.claude/scratch/`, dashboard and phone-accessible activity pane.
- **Unknown:** actual ten-role taxonomy, API/protocol, licensed code, token/cost numbers, remote authentication, guardrail bypass resistance, runtime security, data retention and deployment state.
- The showcased screenshot and execution/cost claims are not acceptance evidence.

## Reuse decision

Our existing Forge graph, supervised DAG, Codex observations, independent read-only Git verifier and isolated worktrees already cover several described patterns. Do not create another scheduler, task store or dashboard. REA collects evidence; Agent Work OS controls tasks, permissions, model providers, verification and Shipping OS gates.

## Clean-room increment in this branch

1. `services/control-api/src/forge-specialist-routing.js` declares **our own** ten specialist categories and deterministic model-tier **proposals**. Requires operator-supplied model IDs. Validates role/effect, task/token caps and hard rejection of unapproved external writes. No provider connection, token metering or real enforcement yet.
2. `buildForgeQuestionBatch` produces a priority-ordered bounded operator inbox that **does not authorize dispatch**. Caller must redact user-facing question text before supply.
3. `buildForgeContextHandoff` emits an SHA-256-digested state capsule with task IDs, dependencies, statuses and verification digests only. It carries no prompts, raw tool output or permission grants. Canonical state and grants must be rechecked after resume.
4. `scripts/forge-specialists.mjs` is a read-only stdin JSON CLI accessible from the Codex terminal; no LLM/network calls.
5. `services/control-api/test/forge-specialist-routing.test.js` covers ten roles, deterministic output, missing model tiers, budget exhaustion, forbidden effects, batched decisions, safe handoff and missing receipt fail-closed.

## How to run locally

From the repository root on this branch:

```bash
node --test services/control-api/test/forge-specialist-routing.test.js
node scripts/forge-specialists.mjs propose < operator-routing.json
node scripts/forge-specialists.mjs questions < sanitized-questions.json
node scripts/forge-specialists.mjs handoff < canonical-plan-projection.json
```

Example read-only routing input:

```json
{
  "briefs": [
    {"id":"research","role":"scout","tokenLimit":1000,"risk":"low"},
    {"id":"build","role":"implementer","tokenLimit":4000,"risk":"normal"}
  ],
  "modelCatalog": {
    "economy":"approved/economy",
    "balanced":"approved/balanced",
    "reasoning":"approved/reasoning"
  },
  "limits":{"planTokenLimit":8000,"perBriefTokenLimit":5000,"maxConcurrent":1}
}
```

The illustrative `approved/*` model IDs are **not** deployable endpoints. The routing budget is a *reservation proposal*, not metered spend or an enforced provider usage limit.

## Acceptance gates and non-claims

- **Locally tested:** focused 4/4 Node tests and a read-only CLI smoke output. This only validates the independent isolated module.
- **Not yet verified:** entire repository test suite/acceptance and exact branch CI; Mac Codex app/browser; real provider routing/spend; integrated operator UI, persist/resume, tenant isolation; upstream source audit.
- **Integration steps:** connect role registry to approved Capability Fabric and actual provider model/quotas; design auth-scoped persistent question inbox; perform model/permission checks on the daemon before any execution; use canonical persisted plan during handoff; independent verifier and negative security tests; real browser UAT.
- **Shipping:** exact SHA test and security receipts, explicitly authorized preview/UAT and rollback proof in Shipping OS, conflict-aware canonical tracker update only on accepted evidence.
- **Status:** research implementation only. NO provider run, NO production deployment, NO upstream parity, NO merge or release authorization.
