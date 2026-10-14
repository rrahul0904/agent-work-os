# Phase 1 Canonical WorkItem Verification Evidence

## Scope

- Base: `main` at `9099065e38ce1a1ceb0f8dd734b91fa165249df7` after reconciliation.
- Focused implementation branch: `feat/canonical-workitem-phase1`.
- WorkItem implementation commit: `70eb836` (rebased from `0bf286d859d8ab424bce6a1f40bc06bc9d1ed325`).
- Exact tested tree: `5724e9f`.
- Migration: `002_canonical_work_items.sql`.
- Scope: canonical typed IDs, WorkItem state transitions, JSON compatibility adapter, PostgreSQL row/event adapter, HTTP routes, idempotency, optimistic concurrency and restart reads. Existing Session and Shipping Run persistence is unchanged.

## Verification

| Check | Result | Evidence |
|---|---|---|
| Domain unit tests | PASS | Typed UUID prefix, required references, valid/invalid transitions, version checks and terminal completion rules |
| JSON compatibility integration | PASS | Create/transition/replay, conflicting command reuse, organization filter, concurrent expected-version writers and file reload |
| PostgreSQL integration | PASS | Disposable PostgreSQL 17 container; migration applied twice; duplicate command replay; command-digest conflict; concurrent transitions through separate pools; stale writer rejected; new pool reads version/event history after repository restart |
| Repository test suite | PASS | `pnpm run test`: 23 passed, 0 failed, 0 skipped with `AGENT_WORK_OS_TEST_DATABASE_URL` set on the rebased branch |
| Product acceptance | PASS | `pnpm run acceptance`: WorkItem API create/replay/read/org isolation/transition/stale-write plus daemon session and exact-SHA Shipping OS receipt path |
| Patch validation | PASS | `git diff --check` |

The disposable PostgreSQL container was stopped after verification. The first rerun began before PostgreSQL finished startup and failed with a connection reset; after `pg_isready` passed, the full suite passed. The earlier test-harness organization argument issue was corrected before the original PR verification.

## Limits

- This verifies one WorkItem repository slice, not the full canonical domain.
- Organization-scoped queries are present, but current shared-token authentication does not establish user membership or a commercial tenant boundary. The API uses a service actor until identity/RBAC exists.
- The JSON adapter serializes writes in one process only. Multi-process concurrency is verified only in the PostgreSQL adapter.
- The PostgreSQL integration test verifies new-pool/repository restart recovery, not control-plane process crash during an active autonomous run.
- No deployment, CI run, independent review, or production UAT is claimed in this evidence record.
