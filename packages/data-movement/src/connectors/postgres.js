import { createChangeRecord, createSourcePosition } from "../protocol.js";
import { SourceConnector } from "./base.js";

export function lsnToBigInt(lsn) {
  if (typeof lsn !== "string" || !/^[0-9A-F]+\/[0-9A-F]+$/i.test(lsn)) throw new TypeError("postgres_lsn_invalid");
  const [high, low] = lsn.split("/");
  return (BigInt(`0x${high}`) << 32n) + BigInt(`0x${low}`);
}

export function compareLsn(a, b) {
  const aa = lsnToBigInt(a);
  const bb = lsnToBigInt(b);
  return aa === bb ? 0 : aa < bb ? -1 : 1;
}

function numericSequence(lsn) {
  const value = lsnToBigInt(lsn);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("postgres_lsn_exceeds_safe_sequence_range");
  return Number(value);
}

export class PostgresWalConnector extends SourceConnector {
  constructor(options = {}) {
    super({ id: options.id ?? "postgres-wal", system: "postgres" });
    this.schemaVersion = options.schemaVersion ?? "pg-schema/unknown";
  }

  decode(message) {
    const namespace = message?.schema ?? message?.namespace;
    const entity = message?.table ?? message?.entity;
    const lsn = message?.lsn;
    return createChangeRecord({
      source: { system: "postgres", namespace, entity },
      operation: String(message?.operation ?? "").toUpperCase(),
      key: message.key ?? null,
      before: message.before ?? null,
      after: message.after ?? null,
      ddl: message.ddl ?? null,
      position: createSourcePosition({ kind: "postgres-lsn", value: lsn, sequence: numericSequence(lsn) }),
      transaction: message.transactionId == null ? null : { id: String(message.transactionId), sequence: message.transactionSequence ?? 0 },
      schemaVersion: message.schemaVersion ?? this.schemaVersion,
      eventTime: message.eventTime,
      capturedAt: message.capturedAt
    });
  }
}
