# ADR-010: Canonical Tasks and Run Attempts

Status: Accepted

## Context

WorkItem records the requested outcome. Agent Sessions store interaction transcripts, and ShippingRuns store release-specific contract, SHA, and receipt evidence. Neither is a general-purpose Task or an execution attempt. Reusing ShippingRun as a generic Run would conflate release certification with one attempt to execute a Task.

## Decision

- A Task is an organization-owned actionable unit with exactly one parent WorkItem.
- A Run is one attempt to execute exactly one Task. Retries create new canonical Run IDs with incrementing attempt numbers; a terminal Run is never reset.
- Task and Run state changes are versioned and append-only event records are written in the same PostgreSQL transaction as the entity update.
- Composite organization/parent foreign keys prevent cross-tenant Task→WorkItem and Run→Task relationships. A partial unique index permits at most one active Run per Task.
- Run creation records a `QUEUED` attempt. A queued Run does not mean a machine has claimed or begun execution. User APIs may cancel a queued Run, but cannot assert worker-managed states such as `SUCCEEDED`.
- Existing Session, daemon-command, and ShippingRun APIs remain distinct. Linking a Session and dispatching a Run will require the execution kernel to atomically bind the Run, Session, machine lease, command outbox, and worker events.
- The additive PostgreSQL migration has no historical Task/Run backfill because no reliable parent relationships exist in legacy state. Production writes require PostgreSQL; this slice does not add a JSON compatibility adapter.

## Consequences

- Tasks and Run attempts have durable tenant-scoped identity and auditable lifecycle events, including across API restarts.
- The current API can create and cancel queued attempts but does not dispatch them. It does not implement worker leases, heartbeats, timeout enforcement, crash recovery, reconnect reconciliation, durable daemon receipts, or result/evidence verification.
- A code rollback after Task/Run writes must retain forward-compatible reads or export the new rows before removing the migration; dropping the tables would lose authoritative records.
- ShippingRun remains a separate release-specific lifecycle until a later migration establishes a verified relation to canonical Run attempts.
