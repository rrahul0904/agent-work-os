# Wave 3 — customer model governance and data-egress controls

Stage: IMPLEMENTED IN DRAFT, NOT PRODUCTION CERTIFIED.

The core policy is deliberately **deny by default** for customer chat sessions in account mode. A model installed on a local daemon is not automatically approved for private customer content. Owner/Admin creates one grant per organization and specific model ID; member can only use models whose capability metadata matches the grant; viewer cannot execute chat. Revocation stops **new chat turns on already-open sessions**, not just new sessions.

## Provenance / enforcement boundary

- `GET/POST/DELETE /api/model-policies` requires an authenticated session and matching organization. POST/DELETE require owner/admin, CSRF, exact model ID, retention, region and a reviewed privacy declaration.
- Every tenant `model-chat` and `token-intelligence` create/follow-up request checks machine-advertised capability against the current SQL grant. A missing grant, revoked grant, changed model or unknown location returns 403 **before daemon dispatch**.
- `model-chat` requires operator-declared region and retention; `token-intelligence` requires explicit upstream location/region/retention/permission, **even when the gateway HTTP endpoint is loopback**.
- The browser model-policy screen shows declared settings and review identity, exposes grant/revoke only to Owner/Admin, and does not represent declarations as independently verified privacy compliance.
- The daemon's own exact endpoint/model restrictions, redirect denial, no tool-calls and process-local request bounds still apply; TI gateway must separately enforce its durable global budgets and provide real usage receipts.
- Other agents (Codex, Claude, OpenCode, Cursor) execute according to their own local tool permissions and do **not** inherit these chat-only grants. They need independent tool/workspace policy contracts before unrestricted public access.
- This slice does not claim rights to send any customer data to any external model provider. Real provider legal/retention/residency validation remains a separate required condition.

## Examples for disposable integration fixtures only

```sh
AGENT_WORK_OS_TI_UPSTREAM_DESTINATION=local_machine
AGENT_WORK_OS_TI_UPSTREAM_REGION=local
AGENT_WORK_OS_TI_UPSTREAM_RETENTION=zero
AGENT_WORK_OS_TI_PRIVATE_UPSTREAM_APPROVED=true
AGENT_WORK_OS_COMPAT_CHAT_UPSTREAM_REGION=local
AGENT_WORK_OS_COMPAT_CHAT_UPSTREAM_RETENTION=zero
```

Do not copy these as claims about a commercial endpoint. An operator is responsible for actual data location, retention, privacy permissions, model access and pricing.

## External verification contracts still blocked

- Real LLM provider with approved model ID, valid provider API grant, acceptable retention / privacy agreement and region, and live output evaluated against a rubric.
- Source/prompt data-leak red-team, runtime sandbox and tool permission policy audit; prompt injection controls.
- Budget concurrency and receipt reconciliation across two or more replicas and real provider responses.
- Model/provider changes, key rotations, audit trail and independent review of each allowed egress destination.

These are required for private beta/GA and are **not fulfilled by CI fixture HTTP servers**.
