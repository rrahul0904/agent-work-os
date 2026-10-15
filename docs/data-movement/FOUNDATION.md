# Data Movement OS — Foundation Slice

This module is an owned, clean-room implementation of the data-movement primitives needed by Agent Work OS. It does **not** proxy Fivetran, Stitch, Snowflake Openflow, or Snowflake Data Mirroring.

## Scope of this slice

- `change-record/v1`: canonical signed event envelope for snapshots, DML, and DDL.
- `ReplicationStream`: state machine, checkpoint monotonicity, counters, and signed state snapshots.
- `PostgresWalConnector`: PostgreSQL LSN parsing/ordering plus conversion of decoded WAL messages into ChangeRecords.
- `OracleRedoConnector`: transaction buffering and commit-boundary reconstruction keyed by Oracle SCN.
- `SnowflakeDestination`: destination-owned keyed `MERGE`/`DELETE` compilation using bind values.
- `replication-receipt/v1`: cryptographic receipt covering source changes, apply results, and checkpoint.
- `planReplication()`: capability planner that selects only owned capture paths for PostgreSQL and Oracle.

## Architecture

```text
PostgreSQL WAL ─┐
                ├─> source decoder ─> ChangeRecord ─> ReplicationStream ─> SnowflakeDestination
Oracle redo  ───┘                            │                    │
                                            └──── receipt <──────┘
```

The internal protocol is intentionally source-neutral. SaaS/API/file connectors will implement the same `SourceConnector` contract and emit `ChangeRecord` objects rather than creating destination-specific pipelines.

## What is real vs. next

This slice implements source-position semantics, transaction reconstruction, event integrity, deterministic Snowflake mutation compilation, stream state, planner selection, and verification receipts with tests.

The next implementation slice must add network capture:
1. PostgreSQL replication-protocol client (`START_REPLICATION`, keepalive/status, relation cache, pgoutput decoding).
2. Oracle redo capture reader with explicit supported-version matrix and fixture corpus.
3. Durable checkpoint/stream state in Postgres.
4. Batched Snowflake staging + transactional apply and source/target reconciliation.
5. Control-plane API + operator UI.
6. Chaos/restart tests proving resume with no skipped committed source positions.

## Invariants

- A checkpoint may never regress.
- Oracle row changes are not emitted until their transaction commits.
- Every ChangeRecord carries a deterministic SHA-256 integrity digest.
- Destination SQL uses bind values; identifiers are quoted.
- A replication receipt is created only from integrity-valid records.
- Native/provider mirroring may later be exposed as an optional adapter, but it is not the implementation of the owned engine.
