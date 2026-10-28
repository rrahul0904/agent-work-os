# Wave 7 — One request, three components, two model calls, one approval gate

## What is implemented

**Real flow**: browser user creates a `repository-review` agent session → daemon validates the sealed CodeAtlas index and emits a digest-bound plan → user explicitly approves or rejects in the same session → CodeAtlas CLI performs an actual read-only symbol search → operator-approved model-chat lane analyzes sanitized symbol metadata → separately configured Token Intelligence model challenges that analysis → session records stage output, provider usage reports and SHA-256 evidence → **human review required**.

This is not an autonomous coding/deployment system and does not claim that two different model IDs guarantee independent vendors, weights or reviewers.

## Explicit setup (local test only)

1. Have an existing **clean Git checkout**, a real locally generated CodeAtlas index at `.codeatlas/index.sqlite3` and operator-created binding via `node scripts/seal-codeatlas-index.mjs /absolute/path/to/repo`. This hash binds bytes to the HEAD revision, but does not certify indexing semantics.
2. Configure the Wave 1 `model-chat` adapter and Wave 6 `token-intelligence` adapter **with different model IDs**, API endpoints and their separate privacy approvals as appropriate.
3. Only after reviewing the actual CodeAtlas metadata disclosure and the *downstream* gateway model destination, set:

```sh
AGENT_WORK_OS_CODEATLAS_READONLY_ENABLED=true
AGENT_WORK_OS_CODEATLAS_ROOT=/absolute/path/to/repo

AGENT_WORK_OS_COMPAT_CHAT_ENABLED=true
AGENT_WORK_OS_COMPAT_CHAT_MODEL=<operator-approved-analysis-model>
AGENT_WORK_OS_COMPAT_CHAT_BASE_URL=http://127.0.0.1:8000/v1

AGENT_WORK_OS_TI_ENABLED=true
AGENT_WORK_OS_TI_MODEL=<different-operator-approved-review-model>
AGENT_WORK_OS_TI_ENDPOINT=http://127.0.0.1:3000/api/v1/inference/chat-completions
AGENT_WORK_OS_TI_API_KEY=<enterprise-gateway-invoke-key>

# Three distinct opt-ins. Never set these globally by default.
AGENT_WORK_OS_MISSION_REVIEW_ENABLED=true
AGENT_WORK_OS_MISSION_CONTEXT_EXPORT_APPROVED=true
AGENT_WORK_OS_MISSION_GATEWAY_PRIVACY_REVIEWED=true
```

Model endpoints, accounts, rights, data-retention, quotas, region and network egress must be independently reviewed. A loopback Token Intelligence gateway **can still forward to a hosted upstream**, so local gateway URL alone proves nothing about final data residency.

4. Start the control API and daemon. In the **Local agents** page create a session with agent `repository-review`, cwd equal to the CodeAtlas root, model blank and prompt:

```text
investigate process_orders | How should we investigate unexpected duplicate processing?
```

5. The UI displays the agent's plan, its commit-bound approval SHA-256, model IDs and prohibited actions. Use **Approve context transfer** or **Reject**. The same path can be driven via an explicit follow-up `approve <approval-hash>` or `reject <approval-hash>`.

6. The result is a structured, staged transcript and evidence digest, not changed source. No test, PR, billable cost, independently verified correctness or production release is claimed.

## Test and fail-closed controls

- Workflow cannot be advertised without configured CodeAtlas, two model lanes with distinct model IDs, reviewed context export and downstream privacy attestations.
- Zero model calls before digest-specific user approval. Rejection, wrong digest, daemon restart, index mutation or checkout revision change deny without forwarding.
- CodeAtlas adapter itself refuses dirty trees, unsealed or stale index, symlinks, arbitrary CLI commands or workspace mismatches; metadata is sanitized before prompts.
- Model responses are treated as unverified analysis, not instructions; **no code/tool execution** in either chat adapter. Run is single-use, no fallback/replay after provider failure.
- Usage metadata is relayed only when reported by providers. No fictional cost, benchmark, evaluation score or reviewer approval.
- All provider/CodeAtlas stages are evidenced by their own outputs, stored in the session. That means **Agent Work OS retains the human question and responses in the session store**; do not treat `store:false` at the inference gateway as end-to-end zero retention.
- The integration test runs real daemon and API processes, a real Git checkout/sealed fixture, CodeAtlas CLI stub and two local HTTP servers (not a production LLM), including an unauthorized approval denial.

## Boundaries and NO-GO

This vertical slice does **not** yet: automatically plan arbitrary goals, schedule parallel agents, run editable code tasks, grant autonomous shell, implement proper multi-user task authorization in local mode, verify model accuracy, provide complete tenant-wide FinOps or ship to production. Existing PR #381–386 and Token Intelligence PR #81 are stacked/unmerged. Full CodeAtlas real index UAT, credentials review, security audit, independent model critique evaluation and explicit owner approval remain required. The real gateway repository remains P0 security NO-GO (Issue #80 dependency audit and #82 secret scan). Do not merge or deploy without exact-head independent evidence.
