import { createChangeRecord, createSourcePosition } from "../protocol.js";
import { SourceConnector } from "./base.js";

function parseScn(value) {
  try {
    const scn = BigInt(value);
    if (scn < 0n) throw new Error();
    return scn;
  } catch {
    throw new TypeError("oracle_scn_invalid");
  }
}

function safeSequence(value) {
  const scn = parseScn(value);
  if (scn > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("oracle_scn_exceeds_safe_sequence_range");
  return Number(scn);
}

export class OracleRedoConnector extends SourceConnector {
  constructor(options = {}) {
    super({ id: options.id ?? "oracle-redo", system: "oracle" });
    this.transactions = new Map();
    this.schemaVersion = options.schemaVersion ?? "oracle-schema/unknown";
  }

  ingest(event) {
    const type = String(event?.type ?? "").toUpperCase();
    const xid = event?.transactionId == null ? null : String(event.transactionId);
    if (type === "BEGIN") {
      if (!xid) throw new TypeError("oracle_transaction_id_required");
      if (this.transactions.has(xid)) throw new Error("oracle_transaction_already_open");
      this.transactions.set(xid, []);
      return [];
    }
    if (["INSERT", "UPDATE", "DELETE", "DDL"].includes(type)) {
      if (!xid || !this.transactions.has(xid)) throw new Error("oracle_change_without_open_transaction");
      this.transactions.get(xid).push(structuredClone(event));
      return [];
    }
    if (type === "ROLLBACK") {
      if (!xid || !this.transactions.has(xid)) throw new Error("oracle_rollback_without_open_transaction");
      this.transactions.delete(xid);
      return [];
    }
    if (type === "COMMIT") {
      if (!xid || !this.transactions.has(xid)) throw new Error("oracle_commit_without_open_transaction");
      const changes = this.transactions.get(xid);
      this.transactions.delete(xid);
      const commitScn = String(event.scn);
      return changes.map((change, index) => createChangeRecord({
        source: { system: "oracle", namespace: change.schema ?? change.namespace, entity: change.table ?? change.entity },
        operation: String(change.type).toUpperCase(),
        key: change.key ?? null,
        before: change.before ?? null,
        after: change.after ?? null,
        ddl: change.ddl ?? null,
        position: createSourcePosition({ kind: "oracle-scn", value: commitScn, sequence: safeSequence(commitScn) }),
        transaction: { id: xid, sequence: index },
        schemaVersion: change.schemaVersion ?? this.schemaVersion,
        eventTime: change.eventTime ?? event.eventTime,
        capturedAt: change.capturedAt ?? event.capturedAt
      }));
    }
    throw new TypeError("oracle_redo_event_type_invalid");
  }
}
