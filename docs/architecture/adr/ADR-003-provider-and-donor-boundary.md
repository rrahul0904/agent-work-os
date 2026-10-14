# ADR-003: Donors Stay Behind Governed Provider Contracts

- Status: Accepted
- Date: 2026-10-13
- Context: The project has open research and implementation branches for REA, MCP, memory, browser automation, workflow frameworks, fleets and compute routing. Donor code and licensing vary, and some work is unrelated product reconstruction.

## Decision

Use public behavior and independently authored specifications as the default. Direct code reuse requires pinned source revision, file-level provenance, license review and explicit compatibility approval. Providers declare version, capability schemas, effects, freshness, target scope and output evidence. A provider's presence or plan never gives it permission to perform effects.

REA is a first-class reverse-engineering provider only after contract validation, target digest binding, exact grants, evidence retention and drift tests exist. Framework integrations remain bounded adapters; they never replace the Agent Work OS Supervisor.

## Consequences

- Third-party binaries/libraries are not automatically installed because they appear in a donor catalog.
- REA may not mutate code, tracker state, Git remotes, deployment or memory without a separate Agent Work OS grant.
- Donor-specific product branches can be referenced without being merged into the control plane.
- License and provenance uncertainty is visible in evidence and cannot be silently treated as clearance.
