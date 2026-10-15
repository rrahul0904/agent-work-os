# ADR-008: PostgreSQL Daemon Command Routing

## Status

Accepted for the shared API-instance command-routing slice.

## Context

Machine WebSocket connections are held by one API process. With multiple API processes, an authenticated user request can reach a different process from the one holding the target machine connection. Process-local command delivery therefore cannot route commands reliably across replicas.

## Decision

Persist commands in `agent_work_os_daemon_commands_v1`. Each API process polls commands only for machines connected to that process, claims rows in a transaction using `FOR UPDATE SKIP LOCKED`, and records a 15-second dispatch lease before sending the command to its local WebSocket. A send failure returns the row to `pending`; an expired lease makes it eligible for redelivery. A daemon acknowledgement is accepted only by the API process that owns the matching active lease. Successful acknowledgements mark the command accepted. Negative acknowledgements mark it failed and create a durable resource-reconciliation job. API instances claim reconciliation jobs with leases and retry them after a crash or callback failure. Session failure events carry the command ID so retries do not duplicate them. Migration 008 runs under a PostgreSQL transaction advisory lock, queues earlier failed commands for reconciliation, and installs a database trigger that covers failed acknowledgements written by an older API instance during a rolling upgrade.

The daemon serializes incoming command-frame handling and keeps a bounded in-memory receipt cache. A duplicate in-flight command is ignored; a duplicate completed command receives its cached acknowledgement. Machine presence is reconciled from heartbeat-updated database timestamps, with a configurable 45-second default stale threshold. Starting another API process does not mark a recently active machine offline.

## Consequences and limits

- A command submitted through one API process can reach a machine connected to another process through the shared PostgreSQL queue.
- Delivery is at least once while a pending or leased row remains eligible. The daemon cache suppresses retries only while that daemon process retains the receipt. A daemon restart or cache eviction can repeat a side effect; this is not exactly-once execution.
- A positive acknowledgement means the daemon accepted the command. It does not mean the agent or Shipping Run completed successfully; completion remains reported through session events or persisted Shipping Run state.
- Negative acknowledgement reconciliation is durable and retried across API instances. Session failure status events are idempotent by command ID; Shipping Run failure updates replace the existing run state.
- A slow or partitioned daemon may receive a duplicate after the dispatch lease expires. Command handlers that perform side effects must become restart-safe before this mechanism can promise stronger guarantees.
- Session or Shipping Run state creation and command enqueue are separate database operations. A process crash between them can leave queued state without a command. A transactional outbox must close this gap.
- The command queue has no retention or archival policy yet. Terminal rows currently remain in PostgreSQL.
- Stale-machine recovery updates presence and broadcasts status, but does not recover or fail orphaned running sessions.
- This slice does not establish staging, UAT, deployment, or production readiness.

## Verification

The PostgreSQL integration test starts two API processes, connects a tenant-owned machine to one process, restarts the other process, and creates a session through that other process. It verifies command delivery through the shared queue, persists a daemon rejection, and checks that the session becomes failed. The full test suite also covers daemon receipt-cache behavior; the acceptance flow verifies local session and Shipping Supervisor execution through a final exact-SHA `SHIPPED` receipt.
