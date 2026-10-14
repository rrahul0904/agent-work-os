# ADR-002: Versioned Work Items and Optimistic Concurrency

- Status: Accepted for the Phase 1 vertical slice
- Date: 2026-10-13
- Context: `main` currently stores machine/session/shipping state as one global JSON payload. Multiple open donor branches model tasks, flows, work items, approvals and memory independently. A direct big-bang replacement would risk the working acceptance path.

## Decision

Introduce a canonical WorkItem domain contract with prefixed UUID identifiers, validated lifecycle transitions, a monotonic version, and append-only transition events. Store mutation APIs require an expected version and a unique command ID. The PostgreSQL adapter updates using `WHERE version = expectedVersion` in a transaction and writes the corresponding event atomically. Repeated command IDs return the stored prior outcome; version conflicts return explicit conflict evidence.

The existing `JsonStore` remains available as a compatibility adapter. Existing Session and Shipping Run records are not silently translated or removed in this slice. A later migration must prove equivalence and restart recovery before replacing their current path.

## Consequences

- Competing updates are detected rather than silently overwriting one another.
- Every accepted transition has an actor, command ID, previous/next state and version.
- The JSON compatibility path remains single-process and does not claim multi-node concurrency safety.
- The current shared-token API records a service actor; organization filtering is not yet user membership or RBAC and is not a commercial tenant boundary.
- Future Task and Run contracts must reference canonical WorkItem IDs rather than create independent task databases.
- PostgreSQL integration tests require a real database; SQL mocks alone do not certify locking or transaction semantics.

## Rejected alternatives

- Keep a single global JSONB snapshot as the sole write model: concurrent read-modify-write can lose updates.
- Merge the separate Work Memory store or Flow store as a competing task authority.
- Rewrite all current persistence before compatibility/restart tests exist.
