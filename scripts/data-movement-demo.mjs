import { PostgresWalConnector, ReplicationStream, SnowflakeDestination, createReplicationReceipt, planReplication } from "../packages/data-movement/src/index.js";

const plan = planReplication({ source: { kind: "postgres" }, destination: { kind: "snowflake" }, requestedMode: "mirror" });
const capture = new PostgresWalConnector({ schemaVersion: "pg-schema/demo" });
const stream = new ReplicationStream({
  id: "demo-postgres-orders-to-snowflake",
  source: { kind: "postgres", namespace: "public", entity: "orders" },
  destination: { kind: "snowflake", database: "RAW", schema: "PUBLIC", table: "orders" }
});
stream.transition("RUNNING", "demo capture initialized");

const record = capture.decode({
  schema: "public",
  table: "orders",
  operation: "insert",
  lsn: "0/16B6C50",
  key: { id: 101 },
  after: { id: 101, amount: 79.50, status: "NEW" },
  transactionId: 44,
  transactionSequence: 0
});

const executed = [];
const destination = new SnowflakeDestination({
  database: "RAW",
  schema: "PUBLIC",
  execute: async (mutation) => {
    executed.push(mutation);
    return { rowCount: 1, mutationDigestInput: mutation.sql };
  }
});

const startedAt = new Date().toISOString();
const applyResults = await destination.apply([record]);
stream.commitBatch([record], record.position, { schemaVersion: record.schemaVersion });
const receipt = createReplicationReceipt({ streamId: stream.config.id, records: [record], checkpoint: record.position, applyResults, startedAt, completedAt: new Date().toISOString() });
console.log(JSON.stringify({ plan, stream: stream.snapshot(), executed, receipt }, null, 2));
