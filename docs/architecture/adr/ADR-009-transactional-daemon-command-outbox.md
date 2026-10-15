# ADR-009: Transactional Daemon Command Outbox

Status: Accepted

## Context

PostgreSQL daemon commands are durable and can be routed by any API instance holding the target machine socket. Before this decision, API handlers committed a Session or ShippingRun mutation and then separately inserted its daemon command. A process crash between those operations could leave visible queued work that no daemon would execute. Session user messages had the same split-write failure mode.

## Decision

When PostgreSQL is enabled, write each supported resource change and its daemon command through one PostgreSQL transaction:

- Session creation and `session.start` enqueue.
- User message append and `session.message` enqueue.
- ShippingRun creation and `shipping.start` enqueue.
- Both tenant-owned rows and compatibility records in the legacy JSONB snapshot use the same transaction boundary.

The outbox insertion helper accepts either a pool or an existing transaction client. The daemon router uses it for commands that have no paired resource mutation. The router's polling and lease behavior remains unchanged.

Without PostgreSQL, the local JSON compatibility mode retains its existing write-then-send behavior; it does not claim transactional outbox guarantees.

## Consequences

- A failed command insert rolls back the paired Session, message, or ShippingRun write.
- A committed resource operation always has its command row available for polling after API restart.
- HTTP success means the command was durably queued, not that the daemon completed it.
- Delivery remains at least once; bounded daemon receipt deduplication is still not durable exactly-once execution.
- Session status/event mutations from the daemon are not all emitted through a transactional event outbox. Durable event-state coupling and orphan execution recovery remain separate work.
