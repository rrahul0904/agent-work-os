import { createHash } from "node:crypto";

const WORK_KINDS = new Set(["process", "monitor", "subagent", "verification", "external"]);
const WORK_STATES = new Set(["queued", "running", "blocked", "waiting", "review", "complete", "failed", "interrupted", "lost", "unknown"]);
const TERMINAL_STATES = new Set(["complete", "failed", "interrupted"]);
const WAKE_SOURCES = new Set(["user", "work", "monitor", "subagent", "hook", "resume", "external"]);
const SELF_CAUSED_WAKE_SOURCES = new Set(["work", "monitor", "subagent", "hook", "resume"]);
const DELIVERY_STATES = new Set(["queued", "delivered", "coalesced", "missed", "failed"]);

const TRANSITIONS = new Map([
  ["queued", new Set(["running", "blocked", "waiting", "interrupted", "failed", "lost", "unknown"])],
  ["running", new Set(["blocked", "waiting", "review", "complete", "failed", "interrupted", "lost", "unknown"])],
  ["blocked", new Set(["queued", "running", "waiting", "interrupted", "failed", "unknown"])],
  ["waiting", new Set(["queued", "running", "blocked", "review", "complete", "failed", "interrupted", "lost", "unknown"])],
  ["review", new Set(["running", "blocked", "complete", "failed", "interrupted", "unknown"])],
  ["lost", new Set(["queued", "running", "failed", "interrupted", "unknown"])],
  ["unknown", new Set(["queued", "running", "blocked", "waiting", "review", "complete", "failed", "interrupted", "lost"])],
  ["complete", new Set()],
  ["failed", new Set()],
  ["interrupted", new Set()]
]);

export function createWorkLedger({ now = () => Date.now() } = {}) {
  const items = new Map();

  return {
    create(input) {
      const work = normalizeNewWork(input, now());
      if (items.has(work.id)) throw new Error("work_id_exists");
      items.set(work.id, work);
      return clone(work);
    },

    get(workId) {
      const work = items.get(workId);
      return work ? clone(work) : null;
    },

    list() {
      return [...items.values()].map(clone);
    },

    transition(workId, { expectedSequence, to, reason = null, evidenceRefs = [], resultRef = null, error = null } = {}) {
      const current = items.get(workId);
      if (!current) throw new Error("work_not_found");
      if (!Number.isInteger(expectedSequence) || expectedSequence !== current.sequence) throw new Error("work_transition_stale");
      assertWorkState(to);
      if (current.state === to) throw new Error("work_transition_noop");
      if (!TRANSITIONS.get(current.state)?.has(to)) throw new Error("work_transition_invalid");

      const at = now();
      const sequence = current.sequence + 1;
      const receiptBase = {
        workId: current.id,
        sessionId: current.sessionId,
        sequence,
        from: current.state,
        to,
        at,
        reason: normalizeNullableString(reason),
        evidenceRefs: normalizeStringArray(evidenceRefs),
        resultRef: normalizeNullableString(resultRef),
        error: normalizeNullableString(error)
      };
      const receipt = { ...receiptBase, digest: digest(receiptBase) };
      const next = {
        ...current,
        state: to,
        sequence,
        updatedAt: at,
        startedAt: current.startedAt ?? (to === "running" ? at : null),
        finishedAt: TERMINAL_STATES.has(to) ? at : current.finishedAt,
        resultRef: receipt.resultRef ?? current.resultRef,
        error: receipt.error ?? current.error,
        transitionReceipts: [...current.transitionReceipts, receipt]
      };
      items.set(workId, next);
      return { work: clone(next), receipt: clone(receipt) };
    },

    hydrate(records) {
      if (!Array.isArray(records)) throw new Error("work_records_invalid");
      const hydrated = [];
      for (const record of records) {
        const normalized = normalizeStoredWork(record);
        if (items.has(normalized.id)) throw new Error("work_id_exists");
        items.set(normalized.id, normalized);
        if (normalized.state === "running") {
          const transitioned = this.transition(normalized.id, {
            expectedSequence: normalized.sequence,
            to: "lost",
            reason: "runtime_restart"
          });
          hydrated.push({ work: transitioned.work, recovered: true, receipt: transitioned.receipt });
        } else {
          hydrated.push({ work: clone(normalized), recovered: false, receipt: null });
        }
      }
      return hydrated;
    }
  };
}

export function createWakeQueue({ now = () => Date.now(), maxSelfWakeDepth = 4 } = {}) {
  if (!Number.isInteger(maxSelfWakeDepth) || maxSelfWakeDepth < 0) throw new Error("wake_depth_limit_invalid");
  let sequence = 0;
  const deliveries = new Map();
  const byKey = new Map();

  return {
    enqueue(input) {
      const normalized = normalizeWake(input, now(), ++sequence);
      const existingId = byKey.get(normalized.deliveryKey);
      if (existingId) return { kind: "duplicate", delivery: clone(deliveries.get(existingId)) };
      if (SELF_CAUSED_WAKE_SOURCES.has(normalized.source) && normalized.selfWakeDepth > maxSelfWakeDepth) {
        throw new Error("wake_chain_limit_exceeded");
      }
      if (deliveries.has(normalized.id)) throw new Error("wake_id_exists");
      deliveries.set(normalized.id, normalized);
      byKey.set(normalized.deliveryKey, normalized.id);
      return { kind: "queued", delivery: clone(normalized) };
    },

    next() {
      const queued = [...deliveries.values()].filter((delivery) => delivery.status === "queued");
      queued.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
      return queued.length ? clone(queued[0]) : null;
    },

    settle(deliveryId, status, { reason = null, coalescedInto = null } = {}) {
      const current = deliveries.get(deliveryId);
      if (!current) throw new Error("wake_delivery_not_found");
      if (!DELIVERY_STATES.has(status) || status === "queued") throw new Error("wake_delivery_status_invalid");
      if (current.status !== "queued") throw new Error("wake_delivery_already_settled");
      const at = now();
      const receiptBase = {
        deliveryId: current.id,
        deliveryKey: current.deliveryKey,
        sessionId: current.sessionId,
        workId: current.workId,
        source: current.source,
        status,
        at,
        reason: normalizeNullableString(reason),
        causalDeliveryId: current.causalDeliveryId,
        coalescedInto: normalizeNullableString(coalescedInto)
      };
      const receipt = { ...receiptBase, digest: digest(receiptBase) };
      const next = { ...current, status, settledAt: at, settlementReceipt: receipt };
      deliveries.set(deliveryId, next);
      return { delivery: clone(next), receipt: clone(receipt) };
    },

    get(deliveryId) {
      const delivery = deliveries.get(deliveryId);
      return delivery ? clone(delivery) : null;
    },

    list() {
      return [...deliveries.values()].sort((a, b) => a.sequence - b.sequence).map(clone);
    },

    hydrate(records) {
      if (!Array.isArray(records)) throw new Error("wake_records_invalid");
      for (const record of records) {
        const normalized = normalizeStoredWake(record);
        if (deliveries.has(normalized.id)) throw new Error("wake_id_exists");
        if (byKey.has(normalized.deliveryKey)) throw new Error("wake_delivery_key_exists");
        if (SELF_CAUSED_WAKE_SOURCES.has(normalized.source) && normalized.selfWakeDepth > maxSelfWakeDepth) {
          throw new Error("wake_chain_limit_exceeded");
        }
        deliveries.set(normalized.id, normalized);
        byKey.set(normalized.deliveryKey, normalized.id);
        sequence = Math.max(sequence, normalized.sequence);
      }
      return this.list();
    }
  };
}

function normalizeNewWork(input, at) {
  if (!input || typeof input !== "object") throw new Error("work_input_invalid");
  const id = requiredString(input.id, "work_id_invalid");
  const sessionId = requiredString(input.sessionId, "work_session_invalid");
  if (!WORK_KINDS.has(input.kind)) throw new Error("work_kind_invalid");
  return {
    id,
    sessionId,
    parentWorkId: normalizeNullableString(input.parentWorkId),
    kind: input.kind,
    state: "queued",
    sequence: 0,
    adapterId: requiredString(input.adapterId, "work_adapter_invalid"),
    backendId: requiredString(input.backendId, "work_backend_invalid"),
    detached: input.detached === true,
    createdAt: at,
    updatedAt: at,
    startedAt: null,
    finishedAt: null,
    resultRef: null,
    error: null,
    transitionReceipts: []
  };
}

function normalizeStoredWork(record) {
  if (!record || typeof record !== "object") throw new Error("work_record_invalid");
  assertWorkState(record.state);
  if (!Number.isInteger(record.sequence) || record.sequence < 0) throw new Error("work_sequence_invalid");
  if (!Array.isArray(record.transitionReceipts)) throw new Error("work_receipts_invalid");
  const normalized = {
    ...record,
    id: requiredString(record.id, "work_id_invalid"),
    sessionId: requiredString(record.sessionId, "work_session_invalid"),
    parentWorkId: normalizeNullableString(record.parentWorkId),
    adapterId: requiredString(record.adapterId, "work_adapter_invalid"),
    backendId: requiredString(record.backendId, "work_backend_invalid"),
    detached: record.detached === true,
    resultRef: normalizeNullableString(record.resultRef),
    error: normalizeNullableString(record.error),
    transitionReceipts: record.transitionReceipts.map(clone)
  };
  if (!WORK_KINDS.has(normalized.kind)) throw new Error("work_kind_invalid");
  return clone(normalized);
}

function normalizeWake(input, at, sequence) {
  if (!input || typeof input !== "object") throw new Error("wake_input_invalid");
  if (!WAKE_SOURCES.has(input.source)) throw new Error("wake_source_invalid");
  const priority = input.priority ?? (input.source === "user" ? 0 : 10);
  if (!Number.isInteger(priority) || priority < 0) throw new Error("wake_priority_invalid");
  const selfWakeDepth = input.selfWakeDepth ?? 0;
  if (!Number.isInteger(selfWakeDepth) || selfWakeDepth < 0) throw new Error("wake_depth_invalid");
  return {
    id: requiredString(input.id, "wake_id_invalid"),
    deliveryKey: requiredString(input.deliveryKey, "wake_delivery_key_invalid"),
    sessionId: requiredString(input.sessionId, "wake_session_invalid"),
    workId: normalizeNullableString(input.workId),
    source: input.source,
    priority,
    sequence,
    selfWakeDepth,
    causalDeliveryId: normalizeNullableString(input.causalDeliveryId),
    status: "queued",
    queuedAt: at,
    settledAt: null,
    settlementReceipt: null
  };
}

function normalizeStoredWake(record) {
  if (!record || typeof record !== "object") throw new Error("wake_record_invalid");
  if (!WAKE_SOURCES.has(record.source)) throw new Error("wake_source_invalid");
  if (!DELIVERY_STATES.has(record.status)) throw new Error("wake_delivery_status_invalid");
  if (!Number.isInteger(record.priority) || record.priority < 0) throw new Error("wake_priority_invalid");
  if (!Number.isInteger(record.sequence) || record.sequence < 1) throw new Error("wake_sequence_invalid");
  if (!Number.isInteger(record.selfWakeDepth) || record.selfWakeDepth < 0) throw new Error("wake_depth_invalid");
  if (record.status === "queued" && record.settlementReceipt) throw new Error("wake_queued_receipt_invalid");
  if (record.status !== "queued" && !record.settlementReceipt) throw new Error("wake_settlement_receipt_required");
  return {
    ...record,
    id: requiredString(record.id, "wake_id_invalid"),
    deliveryKey: requiredString(record.deliveryKey, "wake_delivery_key_invalid"),
    sessionId: requiredString(record.sessionId, "wake_session_invalid"),
    workId: normalizeNullableString(record.workId),
    causalDeliveryId: normalizeNullableString(record.causalDeliveryId),
    settledAt: record.settledAt ?? null,
    settlementReceipt: record.settlementReceipt ? clone(record.settlementReceipt) : null
  };
}

function assertWorkState(state) {
  if (!WORK_STATES.has(state)) throw new Error("work_state_invalid");
}

function requiredString(value, code) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(code);
  return value;
}

function normalizeNullableString(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("string_value_invalid");
  return value;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error("string_array_invalid");
  }
  return [...value];
}

function clone(value) {
  return structuredClone(value);
}

function digest(value) {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}
