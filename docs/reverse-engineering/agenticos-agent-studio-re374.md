# RE-374 — AgenticOS-inspired governed Agent Studio

## Source and research boundary

The supplied source was the 2 October 2026 r/SideProject launch for **AgenticOS** by Vstorm:

- Reddit launch: https://www.reddit.com/r/SideProject/comments/1ww02l5/we_built_agenticos_an_opensource_selfhosted/
- Public upstream repository: https://github.com/vstorm-co/agenticos
- Capability reference: https://github.com/vstorm-co/agenticos/blob/main/docs/reference/capabilities.md
- Public issue/audit backlog: https://github.com/vstorm-co/agenticos/issues

The launch describes a self-hosted agent platform with browser-authored agents, document knowledge, reusable skills, MCP connections, code/chart execution, run/cost history, approvals, and routines. The upstream repository describes an agent as a published, versioned specification assembled only from capabilities registered by code.

The fetched Reddit thread exposed the launch post but no substantive independent commenter feedback. This dossier therefore **does not invent Reddit feedback**. Improvement requirements are grounded in the upstream project's public issue/audit backlog instead, which provides stronger evidence about where governed agent platforms fail in practice.

Although AgenticOS is Apache-2.0, RE-374 is intentionally a clean-room product study. No upstream source, schema, branding, screenshots, or UI is copied. The implementation is independently authored inside Agent Work OS and uses its existing local control-plane contract.

## Why this belongs inside Agent Work OS

Agent Work OS already has the execution substrate that a second runtime would duplicate: local control API and machine daemon, installed coding-agent capability discovery, durable sessions, verified Shared Brain handoffs, Operations Atlas evidence views, and RE-372 shared multi-agent rooms/webhook routines.

The useful donor concept is the **configuration/governance layer above execution**, not another runner.

RE-374 adds a local Agent Studio sidecar that uses the existing `/api/state`, `/api/sessions`, and `/api/sessions/:id` contracts. The existing daemon remains the only component that owns local repository credentials and agent execution.

## Evidence → design decisions

| Public evidence / failure mode | RE-374 response |
| --- | --- |
| Builder configuration must not reach unregistered capabilities | Studio has an explicit capability allowlist. Unknown capability ids are rejected before persistence. |
| Published behavior must be reviewable and stable | Drafts are mutable; Publish creates an immutable snapshot with a deterministic SHA-256 spec hash. Editing a later draft cannot mutate an old version. |
| Approval state can become unsafe across park/resume paths | Phase A does not claim a new approval broker. Studio supports only explicit **human launch** and delegates runtime tool policy to the existing adapter. Unsupported policy shapes are refused. |
| Provider/tool availability can drift from configuration | Preflight reads the **live** Agent Work OS machine/capability state and refuses an absent/offline machine or adapter before launch. |
| Secrets and vendor errors are common leakage paths | Studio rejects secret-shaped plaintext fields (`apiKey`, `password`, tokens, credentials, etc.). No vault is invented in Phase A. |
| Failed/refused work still needs evidence | Every Studio run refusal or accepted launch produces a durable receipt with agent id, version id, spec hash, preflight reasons/warnings, session id when present, and observed status. |
| Budgets are dangerous if accounting is incomplete | A declared USD ceiling is accepted only as metadata and preflight emits an explicit warning. RE-374 does **not** claim budget enforcement until measured cost telemetry is wired end to end. |
| MCP/tool execution must preserve identity and approval semantics | MCP server references may be stored for future design, but any non-empty MCP reference list causes preflight refusal: `mcp_execution_not_implemented`. |
| Context/tool output can become an instruction-injection path | Compiled prompts separate immutable instructions, reusable skills, reference context, and the current human request with explicit trust-boundary text. |

Relevant upstream examples include public issues around capability-registry invariants, approval/replay state, parallel gated tools, dynamic subagents, tenant/RAG boundaries, redaction, and provider-catalog drift. They are used as negative design requirements, not copied implementations.

## Phase A architecture

```text
Browser :8790
    │
    ▼
Agent Studio sidecar
  ├─ drafts / immutable versions
  ├─ skills / reference context
  ├─ capability allowlist
  ├─ preflight + refusal reasons
  └─ durable run receipts
    │ HTTP (localhost only by default)
    ▼
Agent Work OS control plane :8787
  ├─ /api/state
  ├─ /api/sessions
  └─ /api/sessions/:id
    │ WebSocket
    ▼
Local Agent Work OS daemon
    └─ installed adapters (Echo / Codex / future adapters)
```

## End-to-end flow delivered

1. Operator starts the existing Agent Work OS control plane + daemon.
2. Operator starts `npm run start:studio` and opens `http://127.0.0.1:8790`.
3. Studio reads live machines and installed adapters from `/api/state`.
4. Operator creates reusable skills/context and an agent draft.
5. Publish freezes a version and hashes the exact spec.
6. Preflight verifies current machine/adapter availability, capability/reference integrity, Shared Brain handoff requirements, and unsupported MCP boundaries.
7. Launch compiles a bounded prompt with explicit trust zones and calls the existing `/api/sessions` endpoint.
8. Studio persists a receipt. Dashboard refresh reconciles accepted receipts against `/api/sessions/:id` so terminal session status is reflected without pretending the Studio owns runtime execution.

## Security and truthfulness boundaries

- Binds to `127.0.0.1` by default.
- No multi-user authentication or RBAC is claimed.
- No plaintext secret store is implemented.
- No remote MCP execution is implemented.
- No RAG ingestion is implemented.
- No arbitrary Studio-side shell/Python/browser execution is implemented.
- No cron/event automation is implemented in Agent Studio; RE-372 webhook routines remain a separate existing capability.
- No measured USD budget enforcement is claimed.
- No AgenticOS parity or production-readiness claim is made.

## Verification

The Phase A tests cover immutable publishing, deterministic spec hashes, capability allowlisting, plaintext-secret refusal, runtime preflight, verified-handoff requirements, explicit MCP refusal, trust-separated prompt compilation, persistence, create → publish → preflight → run through the existing session API contract, durable refusals with zero downstream launch calls, runtime receipt reconciliation, and the Studio page workflow/security contract.

Focused local verification on 2 October 2026: **8 tests passed, 0 failed**. Hosted repository CI is the authority after the branch is pushed.
