import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const EVENT_JOURNAL_VERSION = "session-event-journal/v1";

export class DurableSessionEventJournal {
  constructor(filePath) {
    if (typeof filePath !== "string" || !filePath) throw new Error("event_journal_path_required");
    this.filePath = filePath;
    this.state = { version: EVENT_JOURNAL_VERSION, sessions: {} };
    this.writeChain = Promise.resolve();
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      if (parsed.version !== EVENT_JOURNAL_VERSION || !isPlainObject(parsed.sessions)) {
        throw new Error("event_journal_snapshot_invalid");
      }
      for (const [sessionId, record] of Object.entries(parsed.sessions)) validateRecord(sessionId, record);
      this.state = parsed;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return this;
  }

  async append(sessionId, event, { at = new Date().toISOString() } = {}) {
    assertSessionId(sessionId);
    if (!isPlainObject(event)) throw new Error("event_journal_event_invalid");
    assertTimestamp(at);
    const record = this.#record(sessionId);
    const sequence = record.lastSequence + 1;
    const envelope = { sessionId, sequence, event: structuredClone(event), journaledAt: at };
    record.lastSequence = sequence;
    record.events.push(envelope);
    await this.#persist();
    return structuredClone(envelope);
  }

  async ack(sessionId, throughSequence) {
    assertSessionId(sessionId);
    if (!Number.isInteger(throughSequence) || throughSequence < 0) throw new Error("event_journal_ack_invalid");
    const record = this.#record(sessionId);
    if (throughSequence > record.lastSequence) throw new Error("event_journal_ack_ahead_of_log");
    if (throughSequence <= record.ackedThrough) return this.snapshot(sessionId);
    record.ackedThrough = throughSequence;
    record.events = record.events.filter((entry) => entry.sequence > throughSequence);
    await this.#persist();
    return this.snapshot(sessionId);
  }

  async flush() {
    await this.writeChain;
  }

  listUnacked(sessionId, { fromSequence = 1 } = {}) {
    if (!Number.isInteger(fromSequence) || fromSequence < 1) throw new Error("event_journal_replay_sequence_invalid");
    if (sessionId !== undefined) {
      assertSessionId(sessionId);
      const record = this.state.sessions[sessionId];
      if (!record) return [];
      return record.events.filter((entry) => entry.sequence >= fromSequence).map((entry) => structuredClone(entry));
    }
    return Object.values(this.state.sessions)
      .flatMap((record) => record.events.filter((entry) => entry.sequence >= fromSequence))
      .sort((a, b) => a.journaledAt.localeCompare(b.journaledAt) || a.sessionId.localeCompare(b.sessionId) || a.sequence - b.sequence)
      .map((entry) => structuredClone(entry));
  }

  snapshot(sessionId) {
    assertSessionId(sessionId);
    const record = this.state.sessions[sessionId] ?? { lastSequence: 0, ackedThrough: 0, events: [] };
    return structuredClone({ sessionId, ...record });
  }

  #record(sessionId) {
    return this.state.sessions[sessionId] ??= { lastSequence: 0, ackedThrough: 0, events: [] };
  }

  #persist() {
    const snapshot = JSON.stringify(this.state, null, 2);
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const temp = `${this.filePath}.tmp`;
      await writeFile(temp, snapshot, "utf8");
      await rename(temp, this.filePath);
    });
    return this.writeChain;
  }
}

function validateRecord(sessionId, record) {
  assertSessionId(sessionId);
  if (!isPlainObject(record) || !Number.isInteger(record.lastSequence) || record.lastSequence < 0 ||
      !Number.isInteger(record.ackedThrough) || record.ackedThrough < 0 || record.ackedThrough > record.lastSequence ||
      !Array.isArray(record.events)) {
    throw new Error("event_journal_record_invalid");
  }
  let previous = record.ackedThrough;
  for (const entry of record.events) {
    if (!isPlainObject(entry) || entry.sessionId !== sessionId || !Number.isInteger(entry.sequence) || entry.sequence <= previous ||
        entry.sequence > record.lastSequence || !isPlainObject(entry.event) || typeof entry.journaledAt !== "string" || Number.isNaN(Date.parse(entry.journaledAt))) {
      throw new Error("event_journal_entry_invalid");
    }
    previous = entry.sequence;
  }
}

function assertSessionId(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("event_journal_session_id_required");
}

function assertTimestamp(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error("event_journal_timestamp_invalid");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
