# ADR-001: Agent Work OS Is the Only Authority

- Status: Accepted
- Date: 2026-10-13
- Context: Agent, orchestration, REA, memory, browser, fleet, and workflow donors overlap in task, approval, provider, and history concepts. Open PRs include independently developed state models and stacked integrations.

## Decision

Agent Work OS is the only owner of project/work/task/run truth, authorization, policy, scheduling, evidence, verification and release control. A donor may become a provider or projection behind an Agent Work OS contract. REA may investigate and produce evidence but cannot grant execution, mutate the tracker, verify its own work, or deploy. Shipping OS is the release gate owned by Agent Work OS, and only it may create a `SHIPPED` receipt after required evidence passes.

## Consequences

- Integrate bounded capabilities from open PRs instead of merging parallel authorities.
- Project Desk and Work Queue are read/write API surfaces over canonical records; Memory and dashboards are projections.
- Providers receive scoped, expiring grants. Discovery and planning do not authorize effects.
- Independent verification stays separate from the builder/provider.
- Donor-specific products remain in their own lanes; reusable contracts are extracted explicitly.

## Rejected alternatives

- One supervisor or task store per framework/donor: produces conflicting retries, approvals and completion claims.
- Let REA or an agent mark completion: provider output is not verification.
- Merge all open donor branches as a single integration: branches are stacked, include non-platform products, and have mixed CI/deployment status.
