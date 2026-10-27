# Unified Agent Workspace — existing-portfolio consolidation (REA + Roadmap)

Investigated: 2026-10-27. Shipping owner: **Agent Work OS**. Public comparator: https://bharatcode.ai/. Baseline: canonical reverse-engineering master workbook RE394 (2026-10-10) plus owned repositories and Agent Work OS Issue #86. Current cross-repo implementation: Token Intelligence PR #79. Current lifecycle: **BUILDING** / no production certification.

## Product objective

One developer and knowledge-work agent workspace, rather than separate replicas of Codex, Claude Code, Cowork and BharatCode. Existing native coding-agent adapters remain authoritative for tool execution. Add original permissioned model access, task coordination, repository intelligence, web/file workflows and evidence-based release gate through defined system boundaries. This is an independently designed product; no proprietary UI, branding, hidden backend or source reuse.

## Canonical ownership / deduplication

| Canonical product | Relevant RE records | Owned contract | Status evidence |
|---|---|---|---|
| Agent Work OS (this repo) | RE-244, RE-358/359/360, RE-370/371/372, GitHub #86 | Agent sessions, multi-agent work, human approvals, supervisory delegation, durable task flows, inference lane policy | Codex/Claude/OpenCode/Cursor daemon adapters present on main; existing #86 is a specification, not a provider runtime |
| AgentDock | RE-070/071, RE-205, RE-210, RE-284, RE-354, RE-361 | Local machines, ports, worktrees, desktop/client process control, MCP | Populated owned repo; later donor slices have own issues/PRs |
| Token Intelligence | RE-030/031/032/033/034/035, RE-182, RE-209/231 | Model gateway, tenant billing/quotas, model and token economics, telemetry | PR #79 has scoped PostgreSQL simulation acceptance; **not live model serving**, full CI security fail / Issue #80 |
| CodeAtlas AI | RE-051 / RE-240 | AST/repository indexing, source citation, safe-edit context and diff | Built owned repo; production-certification work remains |
| AxiomBuild / ForgeLab Brain | RE-357 | Code/test/repair evidence execution and sandbox validation | Existing owned repo and research issue, not a completed donor slice |
| DesignAgent OS | RE-215 | Design artifacts and original UI skills; optional module | Owned capability work, not core inference |
| Browser/file acquisition donors | RE-230 Svipall, RE-279 Browsentic, RE-210 Deiko | Governed external evidence/context ingestion | Research / staged capabilities, not all shipping |

Reserve `RE-PENDING-UNIFIED-AI-WORKSPACE-20261027` for tracker reconciliation; do not issue a competing new canonical RE number.

## Separation of responsibilities

- **Agent Work OS is the product orchestration/control plane** (browser UI, sessions, authority, tasks, receipts, approvals). It does not store customer provider API secrets on the control-plane host.
- **AgentDock is the local client/workspace plane** (machines, worktrees, local process control, independent local security).
- **Token Intelligence is the model traffic/economics plane** (tenant-scoped quotas, provider metadata, receipts and billing when actually configured).
- **CodeAtlas is an optional repository-context read service** with revision-bound provenance.
- **AxiomBuild is a controlled evaluator**, not an automatic merge or shipping authority.

## Wave 1 — real configured chat inference, not a fake model

Feature branch `feature/unified-cowork-open-model-lane-20261027` introduces **`model-chat`** next to native Codex, Claude Code, OpenCode and Cursor. It is *text-only, tool-less*, and accessible as an agent in the existing browser workspace when an authorized local daemon advertises it.

Operator setup (example with a user-operated, OpenAI-compatible local inference server):

```sh
export AGENT_WORK_OS_COMPAT_CHAT_ENABLED=true
export AGENT_WORK_OS_COMPAT_CHAT_BASE_URL=http://127.0.0.1:8000/v1
export AGENT_WORK_OS_COMPAT_CHAT_MODEL=your-locally-served-model-id
# Optional for authenticated local servers (kept only in the daemon's environment):
export AGENT_WORK_OS_COMPAT_CHAT_API_KEY=your-locally-managed-secret
npm run start:daemon
```

Open the existing Agent Work OS browser, choose an online machine and **model-chat**, enter a text prompt, and continue in the same live session. The daemon sends POST `{baseUrl}/chat/completions` and normalizes the provider's final text and reported token counts to existing session events.

For an explicitly approved remote endpoint, configure a **HTTPS** base URL plus exact `AGENT_WORK_OS_COMPAT_CHAT_ALLOWED_ORIGINS=https://your-approved-host`. Host allowlisting is a policy precondition; environment and network egress/secret controls still require an operator review. The selected model is fixed by daemon policy and cannot be overwritten by a session request. All redirects are rejected.

No tool calls, shell execution, code editing or browser automation can be performed by `model-chat`. Use native coding-agent adapters for tools. The model-chat session transcript is temporarily held in the local daemon for turn continuity; it cannot be silently resumed after daemon restart. Control-plane session data may be persisted by Agent Work OS, so there is **no zero-retention claim**.

## Test contract for Wave 1

- Disabled unless explicitly configured, no model capability advertised in default CI.
- Strict base URL scheme/port/path and exact remote allowlist; prevent credentials in URL and redirect following.
- Explicit model allowlist; no user-supplied arbitrary remote provider or model routing.
- Local HTTP provider real request/response on a disposable loopback server; provider usage sourced and mapped; no token appears in events.
- Multi-turn history consistent with the same daemon session; state missing after restart fails closed.
- Chat-only lane rejects tool calls, partial output and malformed replies.
- Timeouts/interruption prevent false completed state; errors omit credentials/prompt/provider body.
- Existing Agent Work OS unit tests plus end-to-end acceptance and CI; separate independent release verification before production.

## Following implementation waves (not implemented by this branch)

1. Token Intelligence real inference API and worker with tenant-bound authorization, concurrency budget, route admission and provider-backed usage ledger; resolve critical npm audit vulnerabilities first.
2. Agent Work OS issue #86 policy-routing grants for chat/Responses/Messages protocol compatibility with exact model revision and region/privacy rules; link machine capacity to #81 and measured session telemetry to #66.
3. Unified Cowork workspace: safe file attachments, tool capability registry, browser/document workflows, approval inbox, durable multi-agent work, independent test/recovery receipts.
4. CodeAtlas revision-aware repository context and search, with explicit source citations and stale invalidation; optional design/repair specialist integrations.
5. Cross-platform local desktop app, installer/signing, native browser/device UAT and provider safety evaluation.
6. Auth/billing, privacy, operator governance, security load and exact-SHA integration tests; owner-authorized production on AWS, OCI or in-house infrastructure (**not Railway/Render/Vercel**).

## Unresolved shipping gates

REA_PROVIDER_UNAVAILABLE (manual read-only evidence), no authorized paid BharatCode API call, no real CUDA/GPU throughput benchmark, no independent endpoint-safety review, no complete Cowork web/file capability, no authenticated deployed runtime UAT, no cross-project billing reconciliation. No market-equivalence, product release, hosted availability or completion percentage claimed.

**Shipping Contract: DRAFT / NO-GO for production.** A green focused test is not a production grant.
