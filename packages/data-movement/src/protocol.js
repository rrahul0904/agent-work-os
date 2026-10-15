import crypto from "node:crypto";

const OPERATIONS = new Set(["SNAPSHOT", "INSERT", "UPDATE", "DELETE", "DDL"]);

function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name}_required`);
  return value.trim();
}

function normalizeObject(value, name) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name}_must_be_object`);
  return structuredClone(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function digest(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

export function createSourcePosition({ kind, value, sequence }) {
  kind = requiredString(kind, "position.kind");
  value = requiredString(String(value ?? ""), "position.value");
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new TypeError("position.sequence_must_be_non_negative_safe_integer");
  return Object.freeze({ kind, value, sequence });
}

export function createChangeRecord(input) {
  if (!input || typeof input !== "object") throw new TypeError("change_record_required");
  const operation = requiredString(input.operation, "operation").toUpperCase();
  if (!OPERATIONS.has(operation)) throw new TypeError("operation_invalid");

  const source = input.source ?? {};
  const before = normalizeObject(input.before, "before");
  const after = normalizeObject(input.after, "after");
  if (operation === "DELETE" && !before) throw new TypeError("delete_requires_before");
  if (["INSERT", "UPDATE", "SNAPSHOT"].includes(operation) && !after) throw new TypeError(`${operation.toLowerCase()}_requires_after`);

  const record = {
    version: "change-record/v1",
    id: input.id ?? crypto.randomUUID(),
    source: {
      system: requiredString(source.system, "source.system"),
      namespace: requiredString(source.namespace, "source.namespace"),
      entity: requiredString(source.entity, "source.entity")
    },
    operation,
    key: normalizeObject(input.key, "key"),
    before,
    after,
    ddl: input.ddl == null ? null : requiredString(input.ddl, "ddl"),
    position: createSourcePosition(input.position ?? {}),
    transaction: input.transaction ? {
      id: requiredString(input.transaction.id, "transaction.id"),
      sequence: Number.isSafeInteger(input.transaction.sequence) && input.transaction.sequence >= 0
        ? input.transaction.sequence
        : (() => { throw new TypeError("transaction.sequence_must_be_non_negative_safe_integer"); })()
    } : null,
    schemaVersion: requiredString(input.schemaVersion ?? "unknown", "schemaVersion"),
    eventTime: requiredString(input.eventTime ?? new Date().toISOString(), "eventTime"),
    capturedAt: requiredString(input.capturedAt ?? new Date().toISOString(), "capturedAt")
  };

  return Object.freeze({ ...record, integrity: digest(record) });
}

export function verifyChangeRecord(record) {
  if (!record || record.version !== "change-record/v1" || typeof record.integrity !== "string") return false;
  const { integrity, ...unsigned } = record;
  return digest(unsigned) === integrity;
}
