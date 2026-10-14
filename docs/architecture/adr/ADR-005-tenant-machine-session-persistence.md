# ADR-005: Tenant-owned Machine and Agent Session persistence

- Status: accepted
- Date: 2026-10-14

## Context

Machines and Agent Sessions were stored inside one process-cached JSONB document. Each mutation replaced the whole document, so separate API processes could overwrite each other's changes. The document also made organization scope an application convention rather than a database boundary.

## Decision

- Store Machines in PostgreSQL rows keyed by globally unique machine ID and organization ID.
- Store Agent Sessions in PostgreSQL rows with an organization and composite organization/machine foreign key.
- Keep the existing application record shape in a per-row JSONB value while storing tenant, status, creator, and timestamps in queryable columns.
- Lock the affected Session row while appending messages and daemon events.
- Import legacy records only when their organization exists and, for Sessions, the referenced Machine has the same organization. Preserve the legacy snapshot and do not infer ownership.
- Keep Shipping Runs in the existing global snapshot for this slice, serialize each run's writes, and assign `updatedAt` from the database clock. Store its server-owned ordering timestamp separately from client-visible run data so client-supplied or legacy future timestamps cannot suppress updates.

## Consequences

- Machine and Session writes no longer replace the global snapshot, and their tenant list APIs query by organization.
- A process restart marks persisted Machines offline; the daemon must reconnect to become online.
- Rollback to code that reads only the global snapshot would not include post-migration Machine or Session writes. Rollback therefore requires a maintenance window and an explicit forward or reverse data migration.
- The control plane remains single-instance because daemon sockets and live event fan-out are process-local, and Shipping Runs still use the shared snapshot.
