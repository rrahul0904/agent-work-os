import { digest } from "./protocol.js";

export const STREAM_STATES = Object.freeze({ NEW: "NEW", SNAPSHOTTING: "SNAPSHOTTING", CATCHING_UP: "CATCHING_UP", RUNNING: "RUNNING", PAUSED: "PAUSED", FAILED: "FAILED", STOPPED: "STOPPED" });

const transitions = {
  NEW: new Set(["SNAPSHOTTING", "RUNNING", "FAILED", "STOPPED"]),
  SNAPSHOTTING: new Set(["CATCHING_UP", "FAILED", "PAUSED", "STOPPED"]),
  CATCHING_UP: new Set(["RUNNING", "FAILED", "PAUSED", "STOPPED"]),
  RUNNING: new Set(["PAUSED", "FAILED", "STOPPED"]),
  PAUSED: new Set(["RUNNING", "SNAPSHOTTING", "FAILED", "STOPPED"]),
  FAILED: new Set(["PAUSED", "SNAPSHOTTING", "RUNNING", "STOPPED"]),
  STOPPED: new Set()
};

export class ReplicationStream {
  constructor(config, clock = () => new Date()) {
    if (!config?.id || !config?.source || !config?.destination) throw new TypeError("stream_config_invalid");
    this.config = structuredClone(config);
    this.clock = clock;
    this.state = STREAM_STATES.NEW;
    this.checkpoint = null;
    this.schemaVersion = null;
    this.metrics = { batches: 0, records: 0, inserts: 0, updates: 0, deletes: 0, ddl: 0 };
    this.history = [{ from: null, to: this.state, at: this.clock().toISOString(), reason: "created" }];
  }

  transition(next, reason = "") {
    if (!transitions[this.state]?.has(next)) throw new Error(`invalid_stream_transition:${this.state}->${next}`);
    const previous = this.state;
    this.state = next;
    this.history.push({ from: previous, to: next, at: this.clock().toISOString(), reason });
    return this.snapshot();
  }

  commitBatch(records, checkpoint, { schemaVersion = null } = {}) {
    if (![STREAM_STATES.RUNNING, STREAM_STATES.CATCHING_UP, STREAM_STATES.SNAPSHOTTING].includes(this.state)) throw new Error(`stream_not_writable:${this.state}`);
    if (!Array.isArray(records) || records.length === 0) throw new TypeError("records_required");
    if (!checkpoint || !Number.isSafeInteger(checkpoint.sequence) || checkpoint.sequence < 0) throw new TypeError("checkpoint_invalid");
    if (this.checkpoint && checkpoint.sequence < this.checkpoint.sequence) throw new Error("checkpoint_regression");
    this.checkpoint = structuredClone(checkpoint);
    if (schemaVersion) this.schemaVersion = schemaVersion;
    this.metrics.batches += 1;
    this.metrics.records += records.length;
    for (const record of records) {
      const key = { INSERT: "inserts", UPDATE: "updates", DELETE: "deletes", DDL: "ddl" }[record.operation];
      if (key) this.metrics[key] += 1;
    }
    return this.snapshot();
  }

  snapshot() {
    const state = { version: "replication-stream-state/v1", streamId: this.config.id, state: this.state, checkpoint: this.checkpoint, schemaVersion: this.schemaVersion, metrics: { ...this.metrics }, updatedAt: this.clock().toISOString() };
    return Object.freeze({ ...state, integrity: digest(state) });
  }
}
