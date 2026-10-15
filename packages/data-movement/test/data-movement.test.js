import test from "node:test";
import assert from "node:assert/strict";
import { PostgresWalConnector, OracleRedoConnector, ReplicationStream, SnowflakeDestination, compareLsn, createReplicationReceipt, planReplication, verifyChangeRecord } from "../src/index.js";

test("postgres LSN ordering is exact", () => {
  assert.equal(compareLsn("0/16B6C50", "0/16B6C50"), 0);
  assert.equal(compareLsn("0/16B6C50", "0/16B6C51"), -1);
  assert.equal(compareLsn("1/0", "0/FFFFFFFF"), 1);
});

test("postgres decoder emits signed ChangeRecord", () => {
  const connector = new PostgresWalConnector({ schemaVersion: "pg-schema/1" });
  const record = connector.decode({ schema: "public", table: "orders", operation: "insert", lsn: "0/16B6C50", key: { id: 10 }, after: { id: 10, amount: 42 }, transactionId: 99, transactionSequence: 0, eventTime: "2026-10-15T22:00:00.000Z", capturedAt: "2026-10-15T22:00:01.000Z" });
  assert.equal(record.version, "change-record/v1");
  assert.equal(record.operation, "INSERT");
  assert.equal(record.source.system, "postgres");
  assert.equal(verifyChangeRecord(record), true);
});

test("oracle connector releases changes only at commit", () => {
  const connector = new OracleRedoConnector({ schemaVersion: "oracle-schema/1" });
  assert.deepEqual(connector.ingest({ type: "BEGIN", transactionId: "7.1.42" }), []);
  assert.deepEqual(connector.ingest({ type: "UPDATE", transactionId: "7.1.42", schema: "APP", table: "CUSTOMER", key: { ID: 1 }, before: { ID: 1, STATUS: "NEW" }, after: { ID: 1, STATUS: "ACTIVE" } }), []);
  const committed = connector.ingest({ type: "COMMIT", transactionId: "7.1.42", scn: "123456", eventTime: "2026-10-15T22:00:00.000Z", capturedAt: "2026-10-15T22:00:01.000Z" });
  assert.equal(committed.length, 1);
  assert.equal(committed[0].transaction.id, "7.1.42");
  assert.equal(committed[0].position.value, "123456");
  assert.equal(verifyChangeRecord(committed[0]), true);
});

test("snowflake destination compiles bound MERGE and receipt", async () => {
  const connector = new PostgresWalConnector({ schemaVersion: "pg-schema/1" });
  const record = connector.decode({ schema: "public", table: "orders", operation: "insert", lsn: "0/100", key: { id: 1 }, after: { amount: 9, id: 1 } });
  const calls = [];
  const destination = new SnowflakeDestination({ database: "RAW", schema: "PUBLIC", execute: async (mutation) => { calls.push(mutation); return { rowCount: 1 }; } });
  const results = await destination.apply([record]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /^MERGE INTO "RAW"\."PUBLIC"\."orders"/);
  assert.deepEqual(calls[0].binds, [9, 1]);
  const stream = new ReplicationStream({ id: "pg-orders-to-snowflake", source: { kind: "postgres" }, destination: { kind: "snowflake" } });
  stream.transition("RUNNING", "capture initialized");
  stream.commitBatch([record], record.position, { schemaVersion: record.schemaVersion });
  const receipt = createReplicationReceipt({ streamId: stream.config.id, records: [record], checkpoint: record.position, applyResults: results, startedAt: "2026-10-15T22:00:00.000Z", completedAt: "2026-10-15T22:00:02.000Z" });
  assert.equal(receipt.status, "VERIFIED");
  assert.equal(receipt.counts.inserted, 1);
  assert.equal(receipt.checkpoint.kind, "postgres-lsn");
});

test("planner selects owned capture engines", () => {
  assert.equal(planReplication({ source: { kind: "postgres" }, destination: { kind: "snowflake" } }).capture, "owned-postgres-wal");
  assert.equal(planReplication({ source: { kind: "oracle" }, destination: { kind: "snowflake" } }).capture, "owned-oracle-redo");
});

test("checkpoint regression is rejected", () => {
  const connector = new PostgresWalConnector();
  const first = connector.decode({ schema: "public", table: "x", operation: "insert", lsn: "0/200", key: { id: 1 }, after: { id: 1 } });
  const older = connector.decode({ schema: "public", table: "x", operation: "insert", lsn: "0/100", key: { id: 2 }, after: { id: 2 } });
  const stream = new ReplicationStream({ id: "s", source: { kind: "postgres" }, destination: { kind: "snowflake" } });
  stream.transition("RUNNING");
  stream.commitBatch([first], first.position);
  assert.throws(() => stream.commitBatch([older], older.position), /checkpoint_regression/);
});
