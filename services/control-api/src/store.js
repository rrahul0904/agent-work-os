import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { DomainValidationError, assertCanonicalId, assertNewWorkItem, canonicalDigest, createCanonicalId, transitionWorkItem, workItemCreateDigest } from "../../../packages/domain/src/index.js";
import { IdempotencyConflictError, OptimisticConcurrencyError } from "./work-item-store.js";

const { Pool } = pg;
const STATE_KEY = "global";
const MIGRATION_URL = new URL("../../../migrations/001_durable_state.sql", import.meta.url);

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = { machines: {}, sessions: {}, shippingRuns: {}, workItems: {}, workItemEvents: [] };
    this.writeChain = Promise.resolve();
    this.workItemWriteChain = Promise.resolve();
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
  getWorkItem(id, organizationId) {
    const item = this.state.workItems[id];
    return item?.organizationId === organizationId ? structuredClone(item) : null;
  }
  listWorkItemsByOrganization(organizationId) {
    return Object.values(this.state.workItems)
      .filter((item) => item.organizationId === organizationId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((item) => structuredClone(item));
  }
  listWorkItemEvents(id, organizationId) {
    if (this.state.workItems[id]?.organizationId !== organizationId) return [];
    return this.state.workItemEvents.filter((event) => event.workItemId === id).sort((a, b) => a.version - b.version).map((event) => structuredClone(event));
  }
  persistWorkItemState() { return this.#persist(); }

  createWorkItem(itemInput, { commandId, actorId, at = new Date().toISOString() } = {}) {
    const item = assertNewWorkItem(itemInput);
    const command = validateWorkItemCommand(commandId, actorId, at);
    const requestDigest = workItemCreateDigest(item, command.actorId);
    return this.#mutateWorkItems(() => {
      const replay = findWorkItemCommand(this.state, command.commandId, requestDigest);
      if (replay) return replay;
      if (this.state.workItems[item.id]) {
        const error = new Error(`work_item_already_exists:${item.id}`);
        error.code = "work_item_already_exists";
        throw error;
      }
      this.state.workItems[item.id] = structuredClone(item);
      this.state.workItemEvents.push({
        eventId: createCanonicalId("event"), workItemId: item.id, commandId: command.commandId,
        actorId: command.actorId, version: 1, fromStatus: null, toStatus: "backlog", requestDigest,
        reason: null, result: structuredClone(item), occurredAt: command.at
      });
      return { workItem: item, replayed: false };
    });
  }

  transitionWorkItem(id, { organizationId, commandId, actorId, expectedVersion, to, reason = null, at = new Date().toISOString() } = {}) {
    assertCanonicalId("work", id, "id");
    assertCanonicalId("org", organizationId, "organizationId");
    validateWorkItemReason(reason);
    const command = validateWorkItemCommand(commandId, actorId, at);
    const requestDigest = canonicalDigest({ operation: "transition", id, organizationId, actorId: command.actorId, expectedVersion, to, reason });
    return this.#mutateWorkItems(() => {
      const replay = findWorkItemCommand(this.state, command.commandId, requestDigest);
      if (replay) return replay;
      const current = this.state.workItems[id]?.organizationId === organizationId ? this.state.workItems[id] : null;
      if (!current) return null;
      let updated;
      try {
        updated = transitionWorkItem(current, { to, expectedVersion, at: command.at });
      } catch (error) {
        if (error.code === "work_item_version_conflict") {
          throw new OptimisticConcurrencyError({ workItemId: id, expectedVersion, actualVersion: current.version });
        }
        throw error;
      }
      this.state.workItems[id] = updated;
      this.state.workItemEvents.push({
        eventId: createCanonicalId("event"), workItemId: id, commandId: command.commandId,
        actorId: command.actorId, version: updated.version, fromStatus: current.status, toStatus: updated.status,
        requestDigest, reason, result: structuredClone(updated), occurredAt: command.at
      });
      return { workItem: updated, replayed: false };
    });
  }

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
  #mutateWorkItems(operation) {
    const pending = this.workItemWriteChain.catch(() => {}).then(async () => {
      const result = operation();
      await this.#persist();
      return structuredClone(result);
    });
    this.workItemWriteChain = pending.then(() => undefined, () => undefined);
    return pending;
  }
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
    shippingRuns: parsed.shippingRuns ?? {},
    workItems: parsed.workItems ?? {},
    workItemEvents: parsed.workItemEvents ?? []
  };
}

function validateWorkItemCommand(commandId, actorId, at) {
  assertCanonicalId("command", commandId, "commandId");
  const actorKind = ["user", "agent", "service"].find((kind) => actorId?.startsWith(`${kind}_`));
  if (!actorKind) throw new Error("work_item_actor_id_invalid");
  assertCanonicalId(actorKind, actorId, "actorId");
  if (!Number.isFinite(Date.parse(at))) throw new Error("work_item_timestamp_invalid");
  return { commandId, actorId, at };
}

function validateWorkItemReason(reason) {
  if (reason !== null && (typeof reason !== "string" || reason.length > 2_000)) {
    throw new DomainValidationError("work_item_reason_invalid");
  }
}

function findWorkItemCommand(state, commandId, requestDigest) {
  const event = state.workItemEvents.find((candidate) => candidate.commandId === commandId);
  if (!event) return null;
  if (event.requestDigest !== requestDigest) throw new IdempotencyConflictError(commandId);
  return { workItem: structuredClone(event.result), replayed: true };
}
