# ADR-007: PostgreSQL WebSocket Event Fan-out

## Status

Accepted for the current multi-instance event-delivery slice.

## Context

User WebSocket connections are held by one API process, while customer-owned state is persisted in PostgreSQL. With multiple API processes, a mutation handled by one process must reach authorized clients connected to another process. Deploying a separate broker before measuring PostgreSQL's capabilities would add an operational dependency without evidence that it is needed.

## Decision

Persist each broadcast in `agent_work_os_realtime_events_v1`, assign a PostgreSQL sequence ID, and publish its ID with `LISTEN`/`NOTIFY`. Every API instance, including the origin, delivers events from persisted rows in ID order and filters each event against the connected user's current organization memberships. Retained events older than seven days are pruned. If a listener detects a retention gap, it refreshes each connected client's tenant-scoped snapshot and buffers live events until that snapshot has been sent.

This table is a transport buffer. PostgreSQL resource rows remain authoritative. An API process starts new WebSocket clients from a fresh snapshot rather than replaying a client-provided cursor.

## Consequences

- A client connected to API instance A receives persisted events produced through instance B.
- Listener reconnects catch up from persisted event IDs; when retention has erased needed history, clients receive a fresh snapshot.
- Failed event writes stay queued in process memory and are retried, with a 10,000-event and 64 MiB queue cap. If a cap is exceeded, new events are dropped until queued writes drain, then a persisted resync marker tells listeners to refresh snapshots. Graceful shutdown stops ingress, waits for daemon message/disconnect work, and drains queued writes for up to 20 seconds; if PostgreSQL stays unavailable, it logs the number of events dropped.
- A failed snapshot refresh closes that WebSocket so the client must reconnect and obtain a fresh snapshot.
- If shutdown reaches its drain deadline during a database outage, the process cannot persist a marker for dropped events. Its own WebSocket clients reconnect and receive a fresh snapshot; clients connected to surviving API instances can remain stale until they reconnect or receive a later recovery resync. This remains an operational failure mode until event publication is transactionally coupled to state changes or backed by a durable outbox.
- Event persistence is not in the same transaction as every domain mutation. A process crash between a state commit and its broadcast can still omit that event; reconnecting clients recover from a fresh database snapshot.
- Daemon WebSocket connections and commands remain process-local. This ADR does not make machine command delivery safe across multiple API instances.
- There is no client cursor replay contract, durable outbox, heartbeat, or independently verified API termination/restart path yet. These remain production-completion work.

## Verification

The integration test runs two API processes against one PostgreSQL database, verifies tenant-filtered cross-instance delivery, removes all retained rows to exercise sequence-based gap recovery, and checks the refreshed tenant snapshot. A focused unit test verifies graceful fan-out shutdown waits for an in-flight publish and declines broadcasts after shutdown begins.
