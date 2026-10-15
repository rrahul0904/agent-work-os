import { digest, verifyChangeRecord } from "./protocol.js";

export function createReplicationReceipt({ streamId, records, checkpoint, applyResults = [], startedAt, completedAt }) {
  if (!streamId) throw new TypeError("receipt_stream_id_required");
  if (!Array.isArray(records) || !records.length) throw new TypeError("receipt_records_required");
  if (records.some((record) => !verifyChangeRecord(record))) throw new Error("receipt_contains_invalid_change_record");
  if (!checkpoint) throw new TypeError("receipt_checkpoint_required");
  const counts = { total: records.length, inserted: 0, updated: 0, deleted: 0, ddl: 0, snapshot: 0 };
  for (const record of records) {
    const key = { INSERT: "inserted", UPDATE: "updated", DELETE: "deleted", DDL: "ddl", SNAPSHOT: "snapshot" }[record.operation];
    if (key) counts[key] += 1;
  }
  const body = {
    version: "replication-receipt/v1",
    streamId,
    checkpoint: structuredClone(checkpoint),
    counts,
    changeDigest: digest(records.map((record) => record.integrity)),
    applyDigest: digest(applyResults),
    startedAt: startedAt ?? new Date().toISOString(),
    completedAt: completedAt ?? new Date().toISOString(),
    status: "VERIFIED"
  };
  return Object.freeze({ ...body, integrity: digest(body) });
}
