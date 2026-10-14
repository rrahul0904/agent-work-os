# Capability Dependency Graph

All arrows mean “depends on.” Agent Work OS is the only authority. Providers, clients and research systems do not own task, approval, policy, evidence or release truth.

```mermaid
flowchart TD
  Domain[Canonical Domain IDs and state machines]
  Persist[Persistence ports + Postgres + event history]
  Identity[Users, orgs, projects, membership]
  Policy[Policy + exact execution grants]
  Evidence[Evidence + append-only receipts]
  Kernel[Execution kernel: worktree, process, sandbox]
  Agents[Agent provider registry/adapters]
  Fleet[Fleet: machines, leases, health, reconnect]
  Tools[Tool registry + effects]
  MCP[MCP transport and inspection]
  REA[REA reverse-engineering provider]
  Browser[Governed browser runtime]
  Memory[Scoped Memory Plane]
  Context[Context-pack compiler]
  Supervisor[One Agent Work OS Supervisor]
  Verifier[Independent verifier + Change Airlock]
  Shipping[Shipping OS release authority]
  UX[Web/operator projections]
  Mesh[Agent Mesh]
  Compute[Compute/model routing]

  Domain --> Persist
  Identity --> Domain
  Persist --> Policy
  Persist --> Evidence
  Policy --> Kernel
  Policy --> Tools
  Kernel --> Agents
  Kernel --> Fleet
  Agents --> Supervisor
  Fleet --> Supervisor
  Tools --> MCP
  MCP --> REA
  Tools --> Browser
  Evidence --> REA
  Evidence --> Browser
  Memory --> Context
  Domain --> Context
  Evidence --> Context
  Domain --> Supervisor
  Persist --> Supervisor
  Policy --> Supervisor
  Supervisor --> Verifier
  Evidence --> Verifier
  Verifier --> Shipping
  Shipping --> Evidence
  Domain --> UX
  Persist --> UX
  Evidence --> UX
  Supervisor --> Mesh
  Policy --> Mesh
  Policy --> Compute
  Agents --> Compute
```

## Build order

1. Domain + versioned persistence + restart/concurrency semantics.
2. Execution kernel (worktree ownership, process, cancellation, receipts).
3. Agent provider contract + durable session events.
4. One Supervisor, leases, retry/recovery and bounded repair.
5. Tool registry and exact grants; REA and MCP adapters.
6. Memory/context projections with tenant/project isolation.
7. Independent verifier, Change Airlock and Shipping OS binding.
8. Browser, Fleet UI, Mesh and Compute after their dependencies.

## Authority constraints

- Supervisor owns orchestration, not shipment certification.
- REA owns no canonical state or execution permission.
- Fleet reports worker/machine truth; disconnect does not imply task failure.
- Memory/context stores or projects knowledge, never approvals or task status.
- Provider registry availability is not authorization.
- UI is a projection; updates go through canonical APIs.
- Shipping OS emits `SHIPPED` only from exact-SHA deployment and verification evidence.
