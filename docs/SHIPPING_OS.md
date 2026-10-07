# Shipping OS v0.0.1

Shipping OS is the release-control layer for Agent Work OS. It turns a machine-readable Shipping Contract into a durable, evidence-backed release run. The supervisor, not the builder model, owns completion.

## Executable loop

`node scripts/ship.mjs run <contract.json>`:

1. validates and digests the Shipping Contract;
2. creates an isolated detached Git worktree at the requested base ref;
3. executes the configured builder command;
4. executes deterministic verification commands;
5. on build/verification failure, writes exact failure evidence, invokes the configured repair worker, and re-verifies within a bounded repair budget;
6. deploys preview and runs preview UAT;
7. if preview/deployment/UAT fails, returns to repair -> verification -> redeploy rather than stopping;
8. deploys production and runs production UAT;
9. compares tested and deployed SHAs when exact-SHA verification is required;
10. writes a hash-chained run history plus a tamper-evident `shipping-release-receipt/v1`;
11. emits `SHIPPED` only after every required gate passes.

The CLI exits non-zero for `FAILED` or `BLOCKED` runs.

## Worker model

The builder/repair command is provider-neutral. A local Codex installation can be the repair worker, but Codex does not decide completion. Commands receive:

- `SHIPPING_RUN_ID`
- `SHIPPING_STAGE`
- `SHIPPING_ATTEMPT`
- `SHIPPING_CONTEXT_FILE`
- `SHIPPING_FAILURE_FILE`

This gives the coding worker a bounded context pack and exact failure evidence instead of an entire chat transcript.

## Durable truth

`ShippingStore` persists state atomically. Non-terminal state can be reconciled to `INTERRUPTED` on restart; restart never fabricates success. Every event is hash chained. A final release receipt can only be generated from a valid `SHIPPED` run and records contract digest, tested/deployed SHAs, golden-path pass set and final event digest.

Allowed external blocker codes are deliberately narrow:

- `BLOCKED_CREDENTIAL`
- `BLOCKED_PERMISSION`
- `BLOCKED_EXTERNAL_SERVICE`
- `BLOCKED_PAYMENT`
- `BLOCKED_IRREVERSIBLE_ACTION`
- `BLOCKED_PRODUCT_DECISION`
- `BLOCKED_SOURCE_UNKNOWN`

`needs more work`, `deployment pending`, architecture polish and similar phrases are not blockers.

## Commands

```bash
npm run ship:validate -- contracts/shipping-os-selftest.example.json
```

```bash
AGENT_WORK_OS_SHIPPING_STATE=.agent-work-os/shipping-state \
  npm run ship -- /path/to/project.shipping.json
```

The example contract intentionally requires explicit real deployment/UAT/SHA-probe commands. Shipping OS does not silently mutate a network or production environment.

## v0.0.1 proof gate

Tests cover fail-closed contract validation, stable digests, tamper detection, restart truth, real Git worktree isolation, happy-path shipment, verification repair, bounded failure, preview-UAT repair and redeploy, deployed/tested SHA mismatch repair/exhaustion, and explicit source blocking.

## Deliberately deferred

Dashboard UI, ChatGPT plugin/MCP facade, hosted runners and portfolio ranking are follow-on surfaces. They are not prerequisites for the factory loop.
