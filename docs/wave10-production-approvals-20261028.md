# Wave 10 — two-person, run-scoped production-intent approvals

**Status:** Draft implementation. CI and external independent QA required; production deployment remains **NO-GO**.

## New behavior

- Account Owner/Admin submits a production-intent Shipping Contract. The contract **must pin a full 40-character Git commit** and require preview UAT plus tested/deployed SHA checking. The API persists the request as `AWAITING_APPROVAL` with contract digest and creator ID. **No execution command is created.**
- A *different* Owner/Admin in the **same organization** must inspect the full submitted contract and source SHA, then click **Approve run** or **Reject run** (or use the authenticated API). The decision sends `expectedContractDigest` and is CSRF-checked; no caller-supplied permit is accepted.
- In one PostgreSQL transaction, the approval compares the current pending state and exact digest under a row lock, captures actor/time, removes the pending contract from client-facing run state, creates a **single** durable daemon-outbox command, and marks the run `QUEUED`. Concurrent/double approval or a stale digest is rejected.
- The API issues a short-lived HMAC-SHA256 permit bound to run ID, organization, machine, requester, distinct reviewer, pinned source SHA, digest, approved target (`aws` / `oci` / `onprem`) and expiry. Signed permit is **not** returned to browser.
- The daemon validates the permit independently before creating a worktree and again before production deployment. The actual checked-out base Git SHA and the tested SHA **must match the source SHA approved by the human**. The daemon also requires its own production opt-in and hosting target. A repeated local run ID is refused.
- Rejection yields terminal `BLOCKED` with actor/time and **zero** daemon command rows.
- This is an **approval to attempt a controlled production-intent run**, not an independent assessment that the deployed application is safe, correct, or ready for public users.

## Required configuration

Set a fresh **shared 32–64 byte random secret expressed as lowercase hex** in the API and on the trusted local daemon. Do not place it in the browser, Git source, logs or a public issue. Provision via an approved secret manager with access control and rotation.

```sh
AGENT_WORK_OS_PRODUCTION_APPROVAL_KEY=<secret_hex_64_to_128_chars>
AGENT_WORK_OS_PRODUCTION_HOSTING_TARGET=aws # or oci / onprem
AGENT_WORK_OS_ALLOW_PRODUCTION_DEPLOYMENT=true # on daemon only when operations approves
```

**Do not enable these production settings yet**. Set on real infrastructure only after external security approval, independent model/provider UAT, tenant QA and a final release decision. The secret must match across API and daemon; the API signing endpoint denies approvals when missing or malformed.

### User/API

`POST /api/shipping/runs` with `organizationId`, `machineId`, `contract` returns an `AWAITING_APPROVAL` run when `contract.production.required=true`.

`POST /api/shipping/runs/:runId/approve` or `/reject` with
`{ "organizationId":"...", "expectedContractDigest":"sha256:<64 hex>" }` requires a currently authenticated Owner/Admin, CSRF token, and a **different user from the creator**.

When the contract does not request production, normal verified-only workflow continues and never claims a production deployment.

## Test/evidence

- Pure signed-permit tests: tampering, wrong tenant/machine/run/digest, expiry, invalid target, bad keys and self-approval.
- Shipping supervisor tests: actual approval permit required even with coarse opt-in; checked-out and tested SHA must match human approval, expired/replayed permit blocked.
- Existing production PostgreSQL identity integration extends through actual cookie-authenticated API, two separate human accounts, admin invitation, no pre-approval daemon command, signed one-time dispatch, approval replay/cross-org/CSRF/digest denial and rejection without an outbox row.
- No real customer data, actual cloud deployment, commercial LLM inference, external penetration test or independent release certification was performed by these tests.

## Remaining P0

- **Still not a customer release.** A permit merely authenticates two identities and exact source; it does not replace independent security approval and acceptance of exact deployed artifacts. Signed approval does not attest that Git worktree is free of untracked/unstaged changes; separate clean-source and artifact-digest verification remain mandatory before public release.
- Account recovery and email verification, browser accessibility UAT, signed reviewer identity/time externally corroborated, approval expiry during long workflows, key rotation and distributed de-duplication require further implementation.
- Token Intelligence dependency Issue #80 and three-history-secret finding Issue #82 remain OPEN and release blocking.
- Draft PR stack #381–#390 must be reviewed and merged in order only with explicit owner authorization. No Railway/Render/Vercel production.
