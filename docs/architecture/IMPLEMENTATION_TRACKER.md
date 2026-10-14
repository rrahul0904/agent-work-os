# Agent Work OS Implementation Tracker

This tracker records source-backed capability work. `VERIFIED` means the required tests/evidence for the row passed at the recorded implementation SHA; it does not mean deployed or shipped.

| ID | Capability | Phase | Status | Implementation SHA | Evidence / tests | Blocker | Next action |
|---|---|---|---|---|---|---|---|
| AWOS-P0-01 | Main, PR, issue, branch and donor ownership reconciliation | Phase 0 | VERIFIED | `ec3dcab` | `CAPABILITY_OWNERSHIP.md`; `CAPABILITY_DEPENDENCY_GRAPH.md`; ADR-001..003; GitHub metadata snapshot 2026-10-13 | None for initial map | Keep decisions current as PRs change; do not merge donor stacks blindly |
| AWOS-P1-01 | Canonical typed IDs and WorkItem lifecycle | Phase 1 | VERIFIED | `0bf286d` | `packages/domain/test/work-item.test.js`; `work-item-json-store.test.js`; `work-item-postgres.test.js`; `docs/architecture/evidence/phase1-canonical-work-item.md` | API still uses shared control token and service actor | Add authenticated user/org membership before multi-customer use |
| AWOS-P1-02 | Versioned JSON/Postgres repository, append-only events, idempotency, optimistic concurrency | Phase 1 | VERIFIED | `0bf286d` | Real PostgreSQL 17 test; JSON restart test; 20 tests; acceptance | Existing Session and Shipping Run paths remain global-snapshot based | Define canonical Task/Run and event sequencing; migrate only after equivalence/restart tests |
| AWOS-P2-01 | Execution kernel and task-to-worktree lifecycle | Phase 2 | UNKNOWN | — | Current Shipping Supervisor has isolated worktrees; general WorkItem runs do not | Requires Task/Run lease model and effect grants | Specify worktree ownership, process receipt, cancel and crash recovery |
| AWOS-P3-01 | Provider-neutral Codex/Claude/OpenCode contract | Phase 3 | PARTIAL | `a83ae52` | Codex + Echo adapter in main; PR #96 is observer work, not a Claude execution adapter | No second real provider conformance test | Define lifecycle contract and prove with a second local provider |
| AWOS-P4-01 | One Supervisor with bounded autonomous repair/recovery | Phase 4 | PARTIAL | `a83ae52` | Shipping Supervisor is release-specific; candidate Flow/Fleet work in PR #40/#44 | No canonical Task/Run execution loop yet | Implement after Phase 1 domain and Phase 2 kernel |
| AWOS-P6-01 | Governed REA provider | Phase 6 | PARTIAL | `a83ae52` | Issue #88 and open PR #146; not on main | Latest PR contract package is unmerged | Integrate after canonical IDs and effect schema stabilize |
| AWOS-P11-01 | Independent verifier and Shipping OS binding | Phase 11 | PARTIAL | `a83ae52` | Shipping receipts are implemented; Change Airlock PR #154 is open | Exact SHA binding from Airlock into release pipeline remains outstanding | Extract Airlock and bind receipt/tested SHA before release promotion |

## Status boundaries

- `IMPLEMENTED` means code and deterministic tests exist.
- `VERIFIED` means the relevant test/integration/acceptance evidence passed for the recorded SHA.
- `SHIPPABLE` requires exact SHA, CI, security checks, required UAT, and release approval.
- `SHIPPED` requires deployment plus production verification and immutable receipt.

No row in this tracker currently claims `SHIPPABLE` or `SHIPPED`.
