import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = { machines: {}, sessions: {}, shippingRuns: {} };
    this.writeChain = Promise.resolve();
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      this.state = { machines: parsed.machines ?? {}, sessions: parsed.sessions ?? {}, shippingRuns: parsed.shippingRuns ?? {} };
      for (const machine of Object.values(this.state.machines)) machine.status = "offline";
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
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
    const snapshot = JSON.stringify(this.state, null, 2);
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const temp = `${this.filePath}.tmp`;
      await writeFile(temp, snapshot, "utf8"); await rename(temp, this.filePath);
    });
    return this.writeChain;
  }
}
