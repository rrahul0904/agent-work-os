# ADR-006: Tenant-owned ShippingRun persistence

- Status: accepted
- Date: 2026-10-14

## Context

Authenticated organizations could read Machines, Sessions, and WorkItems, but could not inspect or start Shipping Runs. Shipping Runs lived in a global JSONB snapshot and were delivered to every legacy operator client. Their machine and organization owner were not database-enforced.

## Decision

- Store new organization-owned Shipping Runs in PostgreSQL rows keyed by globally unique run ID and organization ID.
- Require the Shipping Run's machine to belong to the same organization through a composite foreign key.
- Backfill only records with explicit organization and machine IDs that match existing organization and machine rows. Preserve all other records in the compatibility snapshot.
- Expose authenticated list, detail, and create routes scoped by verified organization membership. Require a non-Viewer membership to launch a run, and require its machine to be online and owned by that organization.
- Keep run ownership, machine, creator, project, release, and contract digest immutable after creation. Assign update timestamps on the server while locking the run row.
- Include only organization-owned runs in authenticated WebSocket snapshots and updates.

## Consequences

- Tenant Shipping Runs survive API restart and are absent from global snapshot writes.
- Runs without provable ownership remain available to the legacy operator view and are not visible through organization routes.
- This does not provide cross-instance WebSocket routing, event replay, delivery receipts, or a rollback bridge from old code. The control plane remains single-instance and this slice does not establish production readiness.
