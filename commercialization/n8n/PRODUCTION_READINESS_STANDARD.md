# n8n Commercial Product Production-Readiness Standard

A workflow is not sellable merely because it imports or succeeds on a happy-path demo. Every paid SKU must satisfy the controls below before Shipping OS may approve publication.

## 1. Contracts

- Explicit input schema and required/optional fields.
- Explicit output/side-effect contract.
- Invalid/missing input path is deterministic and documented.
- Provider response assumptions are validated before downstream writes.

## 2. Idempotency and duplicate safety

- Stable idempotency key for externally visible writes.
- Retries cannot duplicate customer email, payment, CRM record, order, booking or other side effect.
- Replaying a historical execution has an explicit safe mode.

## 3. Retry taxonomy

Failures must not share one generic retry policy.

- malformed input: no blind retry;
- missing/expired auth: fail closed and alert;
- rate limit: bounded exponential backoff with jitter;
- transient provider/network failure: bounded retry;
- permanent provider rejection: route to actionable failure state;
- unknown failure: dead-letter/error workflow with evidence.

## 4. Kill switch and blast-radius control

- One documented mechanism can pause externally visible actions without deleting the workflow.
- High-risk actions can be disabled independently where applicable.
- Human approval is required for irreversible/high-impact actions unless explicitly certified otherwise.

## 5. Shadow and phased rollout

- New production integrations support dry-run/shadow mode where technically possible.
- Compare automated decisions/output against expected or human-reviewed results before unrestricted rollout.
- Expansion criteria are measurable rather than based on 'no more edge cases'.

## 6. Error visibility

- Failures surface outside the individual execution log.
- Alert contains workflow/release identity, execution identifier, failed stage and actionable error class.
- Dead-letter/recovery path exists for recoverable asynchronous workloads.

## 7. Semantic/AI quality failures

- A successful HTTP response is not proof of a correct AI decision.
- AI classification/extraction products maintain regression fixtures with expected human-approved outputs.
- Prompt/model changes rerun regression fixtures before release.

## 8. Versioning and rollback

- Workflow JSON is version-controlled.
- Release receipt records exact source SHA and supported n8n version.
- Rollback target is known before production promotion.
- Migration/config changes that cannot be rolled back require an explicit approval gate.

## 9. Replay

- Representative pinned inputs/test fixtures exist.
- A single execution can be reproduced without uncontrolled external side effects.
- Replay comparison records expected vs actual outputs.

## 10. Provider and credential safety

- No real secrets in source/product archives.
- `.env.example` or credential map documents every required credential.
- Provider dependencies, pricing assumptions, quotas and sandbox/live differences are documented.
- Production claims that depend on a provider require sandbox or live-safe evidence.

## 11. Required test matrix

At minimum, where applicable:

1. happy path;
2. malformed input;
3. missing required input;
4. duplicate trigger/idempotency;
5. provider timeout;
6. rate limit;
7. expired/missing auth;
8. partial side-effect failure;
9. retry recovery;
10. dead-letter/manual recovery;
11. AI regression fixture;
12. kill-switch behavior;
13. replay behavior;
14. rollback rehearsal or documented rollback verification.

## 12. Release states

A paid workflow progresses only through evidence-backed states:

`SOURCE_IDENTITY` → `PROVENANCE_CLEAR/CLEAN_ROOM` → `IMPLEMENTED` → `IMPORT_VALIDATED` → `DETERMINISTIC_TESTED` → `PROVIDER_VERIFIED` → `PACKAGED` → `SELLABLE_CANDIDATE` → Shipping OS decision → `PUBLISHED`.

`SELLABLE_CANDIDATE` is not permission to publish or deploy.
