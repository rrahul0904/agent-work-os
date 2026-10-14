import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const STATE_KEY = "global";
const MIGRATION_URL = new URL("../../../migrations/001_durable_state.sql", import.meta.url);

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = { machines: {}, sessions: {}, shippingRuns: {} };
    this.writeChain = Promise.resolve();
    this.pool = process.env.DATABASE_URL
      ? new Pool({
          connectionString: process.env.DATABASE_URL,
          max: Number(process.env.AGENT_WORK_OS_DB_POOL_MAX ?? 5),
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 10_000
        })
      : null;
  }

  async load() {
    if (this.pool) return this.#loadPostgres();
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      this.state = normalizeState(parsed);
      for (const machine of Object.values(this.state.machines)) machine.status = "offline";
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  async #loadPostgres() {
    const migration = await readFile(MIGRATION_URL, "utf8");
    await this.pool.query(migration);
    const result = await this.pool.query(
      "SELECT payload FROM agent_work_os_state_v1 WHERE state_key = $1",
      [STATE_KEY]
    );

    if (result.rows[0]?.payload) {
      this.state = normalizeState(result.rows[0].payload);
      for (const machine of Object.values(this.state.machines)) machine.status = "offline";
      await this.#persist();
      return;
    }

    await this.#persist();
  }

  listMachines() { return Object.values(this.state.machines).sort((a, b) => a.name.localeCompare(b.name)); }
  listSessions() { return Object.values(this.state.sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  listShippingRuns() { return Object.values(this.state.shippingRuns).sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? ""))); }
  getMachine(id) { return this.state.machines[id]; }
  getSession(id) { return this.state.sessions[id]; }
  getShippingRun(id) { return this.state.shippingRuns[id]; }

  async upsertMachine(machine) { this.state.machines[machine.id] = machine; await this.#persist(); return machine; }
  async touchMachine(id) {
    const machine = this.getMachine(id); if (!machine) return;
    machine.status = "online"; machine.lastSeenAt = new Date().toISOString(); await this.#persist(); return machine;
  }
  async markMachineOffline(id) {
    const machine = this.getMachine(id); if (!machine) return;
    machine.status = "offline"; machine.lastSeenAt = new Date().toISOString(); await this.#persist(); return machine;
  }
  async createSession(session) { this.state.sessions[session.id] = session; await this.#persist(); return session; }
  async upsertObservedSessions(sessions) {
    const changed = [];
    for (const candidate of sessions) {
      if (!candidate?.id || !String(candidate.id).startsWith("observed:")) throw new Error("observed_session_id_required");
      const next = structuredClone(candidate);
      const previous = this.state.sessions[next.id];
      if (previous && JSON.stringify(previous) === JSON.stringify(next)) continue;
      this.state.sessions[next.id] = next;
      changed.push(next);
    }
    if (changed.length) await this.#persist();
    return changed;
  }
  async addMessage(id, message) { const s = this.#session(id); s.messages.push(message); s.updatedAt = new Date().toISOString(); await this.#persist(); return s; }
  async addEvent(id, event) {
    const s = this.#session(id); s.events.push(event); s.updatedAt = new Date().toISOString();
    if (event.kind === "status") s.status = event.status;
    if (event.kind === "thread") s.nativeSessionId = event.nativeSessionId;
    if (event.kind === "text" && event.text?.trim()) s.messages.push({ id: crypto.randomUUID(), role: "assistant", text: event.text, createdAt: event.at });
    await this.#persist(); return s;
  }
  async setSessionStatus(id, status) { const s = this.#session(id); s.status = status; s.updatedAt = new Date().toISOString(); await this.#persist(); return s; }
  async upsertShippingRun(run) {
    if (!run?.runId) throw new Error("shipping_run_id_required");
    this.state.shippingRuns[run.runId] = structuredClone(run);
    await this.#persist();
    return this.state.shippingRuns[run.runId];
  }

  #session(id) { const s = this.getSession(id); if (!s) throw new Error(`Unknown session: ${id}`); return s; }
  #persist() {
    const snapshot = JSON.stringify(this.state);
    this.writeChain = this.writeChain.catch(() => {}).then(async () => {
      if (this.pool) {
        await this.pool.query(
          `INSERT INTO agent_work_os_state_v1 (state_key, payload, updated_at)
           VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
           ON CONFLICT (state_key) DO UPDATE
           SET payload = EXCLUDED.payload, updated_at = CURRENT_TIMESTAMP`,
          [STATE_KEY, snapshot]
        );
        return;
      }

      await mkdir(path.dirname(this.filePath), { recursive: true });
      const temp = `${this.filePath}.tmp`;
      await writeFile(temp, JSON.stringify(this.state, null, 2), "utf8");
      await rename(temp, this.filePath);
    });
    return this.writeChain;
  }
}

function normalizeState(parsed = {}) {
  return {
    machines: parsed.machines ?? {},
    sessions: parsed.sessions ?? {},
    shippingRuns: parsed.shippingRuns ?? {}
  };
}
