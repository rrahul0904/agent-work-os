import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { DomainValidationError, assertCanonicalId, assertNewWorkItem, canonicalDigest, createCanonicalId, transitionWorkItem, workItemCreateDigest } from "../../../packages/domain/src/index.js";
import { IdempotencyConflictError, OptimisticConcurrencyError } from "./work-item-store.js";
import { insertDaemonCommand } from "./daemon-command-outbox.js";

const { Pool } = pg;
const STATE_KEY = "global";
const MIGRATION_URL = new URL("../../../migrations/001_durable_state.sql", import.meta.url);
const MACHINE_SESSION_MIGRATION_URL = new URL("../../../migrations/005_tenant_machines_sessions.sql", import.meta.url);
const SHIPPING_RUN_MIGRATION_URL = new URL("../../../migrations/006_tenant_shipping_runs.sql", import.meta.url);
const REALTIME_EVENT_MIGRATION_URL = new URL("../../../migrations/007_realtime_events.sql", import.meta.url);

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = { machines: {}, sessions: {}, shippingRuns: {}, workItems: {}, workItemEvents: [], forgeObservations: [] };
    this.writeChain = Promise.resolve();
    this.workItemWriteChain = Promise.resolve();
    this.shippingRunWriteChains = new Map();
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
      return;
    }

    await this.#persist();
  }

  async initializeMachineSessionStore(staleAfterMs = 45_000) {
    if (!this.pool) return [];
    await this.pool.query(await readFile(MACHINE_SESSION_MIGRATION_URL, "utf8"));
    return this.markStaleMachines(staleAfterMs);
  }

  async markStaleMachines(staleAfterMs = 45_000) {
    if (!Number.isFinite(staleAfterMs) || staleAfterMs < 1) throw new Error("machine_stale_timeout_invalid");
    if (this.pool) {
      const result = await this.pool.query(
        `UPDATE agent_work_os_machines_v1
         SET status = 'offline',
             record = jsonb_set(record, '{status}', '"offline"'::jsonb),
             updated_at = CURRENT_TIMESTAMP
         WHERE status = 'online' AND updated_at < CURRENT_TIMESTAMP - ($1 * INTERVAL '1 millisecond')
         RETURNING record`,
        [staleAfterMs]
      );
      return result.rows.map((row) => row.record);
    }
    const stale = [];
    for (const machine of Object.values(this.state.machines)) {
      const lastSeen = Date.parse(machine.lastSeenAt ?? "");
      if (machine.status === "online" && Number.isFinite(lastSeen) && Date.now() - lastSeen > staleAfterMs) {
        machine.status = "offline";
        stale.push(machine);
      }
    }
    if (stale.length) await this.#persist();
    return stale;
  }

  async initializeShippingRunStore() {
    if (this.pool) await this.pool.query(await readFile(SHIPPING_RUN_MIGRATION_URL, "utf8"));
  }

  async initializeRealtimeEventStore() {
    if (this.pool) await this.pool.query(await readFile(REALTIME_EVENT_MIGRATION_URL, "utf8"));
  }

  listForgeObservations() { return structuredClone(this.state.forgeObservations ?? []); }
  async addForgeObservation(observation) {
    // The hook stream is an advisory local observer, never a Run/WorkItem receipt.
    const next = { ...observation, id: crypto.randomUUID(), receivedAt: new Date().toISOString() };
    this.state.forgeObservations ??= [];
    this.state.forgeObservations.push(next);
    if (this.state.forgeObservations.length > 1000) this.state.forgeObservations.splice(0, this.state.forgeObservations.length - 1000);
    await this.#persist();
    return structuredClone(next);
  }
  listMachines() {
    if (this.pool) return this.pool.query("SELECT record FROM agent_work_os_machines_v1 ORDER BY record->>'name', machine_id").then((result) => {
      const machines = result.rows.map((row) => row.record);
      const normalizedIds = new Set(machines.map((machine) => machine.id));
      const legacyMachines = Object.values(this.state.machines).filter((machine) => !machine.organizationId && !normalizedIds.has(machine.id));
      return [...machines, ...legacyMachines].sort((a, b) => a.name.localeCompare(b.name));
    });
    return Object.values(this.state.machines).sort((a, b) => a.name.localeCompare(b.name));
  }
  listMachinesByOrganization(organizationId) {
    if (this.pool) return this.pool.query(
      "SELECT record FROM agent_work_os_machines_v1 WHERE organization_id = $1 ORDER BY record->>'name', machine_id",
      [organizationId]
    ).then((result) => result.rows.map((row) => row.record));
    return Object.values(this.state.machines).filter((machine) => machine.organizationId === organizationId).sort((a, b) => a.name.localeCompare(b.name));
  }
  listSessions() {
    if (this.pool) return this.pool.query("SELECT record FROM agent_work_os_sessions_v1 ORDER BY updated_at DESC, session_id").then((result) => {
      const sessions = result.rows.map((row) => row.record);
      const normalizedIds = new Set(sessions.map((session) => session.id));
      const legacySessions = Object.values(this.state.sessions).filter((session) => !session.organizationId && !normalizedIds.has(session.id));
      return [...sessions, ...legacySessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
    return Object.values(this.state.sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  listSessionsByOrganization(organizationId) {
    if (this.pool) return this.pool.query(
      "SELECT record FROM agent_work_os_sessions_v1 WHERE organization_id = $1 ORDER BY updated_at DESC, session_id",
      [organizationId]
    ).then((result) => result.rows.map((row) => row.record));
    return Object.values(this.state.sessions).filter((session) => session.organizationId === organizationId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  listShippingRuns() {
    if (this.pool) return this.pool.query("SELECT record FROM agent_work_os_shipping_runs_v1 ORDER BY updated_at DESC, run_id")
      .then((result) => {
        const runs = result.rows.map((row) => row.record);
        const normalizedIds = new Set(runs.map((run) => run.runId));
        const legacyRuns = Object.values(this.state.shippingRuns).filter((run) => !normalizedIds.has(run.runId));
        return [...runs, ...legacyRuns].sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? "")));
      });
    return Object.values(this.state.shippingRuns).sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? "")));
  }
  listShippingRunsByOrganization(organizationId) {
    if (this.pool) return this.pool.query(
      "SELECT record FROM agent_work_os_shipping_runs_v1 WHERE organization_id = $1 ORDER BY updated_at DESC, run_id",
      [organizationId]
    ).then((result) => result.rows.map((row) => row.record));
    return Object.values(this.state.shippingRuns).filter((run) => run.organizationId === organizationId)
      .sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? "")));
  }
  getMachine(id) {
    if (this.pool) return this.pool.query("SELECT record FROM agent_work_os_machines_v1 WHERE machine_id = $1", [id]).then((result) => {
      const normalized = result.rows[0]?.record;
      const legacy = this.state.machines[id];
      return normalized ?? (!legacy?.organizationId ? legacy ?? null : null);
    });
    return this.state.machines[id];
  }
  getSession(id) {
    if (this.pool) return this.pool.query("SELECT record FROM agent_work_os_sessions_v1 WHERE session_id = $1", [id]).then((result) => {
      const normalized = result.rows[0]?.record;
      const legacy = this.state.sessions[id];
      return normalized ?? (!legacy?.organizationId ? legacy ?? null : null);
    });
    return this.state.sessions[id];
  }
  getShippingRun(id, organizationId = null) {
    if (this.pool) return this.pool.query(
      `SELECT record FROM agent_work_os_shipping_runs_v1 WHERE run_id = $1${organizationId ? " AND organization_id = $2" : ""}`,
      organizationId ? [id, organizationId] : [id]
    ).then((result) => result.rows[0]?.record ?? (organizationId ? null : this.state.shippingRuns[id] ?? null));
    const run = this.state.shippingRuns[id];
    return run && (!organizationId || run.organizationId === organizationId) ? run : null;
  }
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

  async upsertMachine(machine) {
    if (this.pool && machine.organizationId) {
      const result = await this.pool.query(
        `INSERT INTO agent_work_os_machines_v1 (machine_id, organization_id, status, record)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (machine_id) DO UPDATE
           SET status = EXCLUDED.status, record = EXCLUDED.record, updated_at = CURRENT_TIMESTAMP
           WHERE agent_work_os_machines_v1.organization_id = EXCLUDED.organization_id
         RETURNING record`,
        [machine.id, machine.organizationId, machine.status ?? "offline", JSON.stringify(machine)]
      );
      if (!result.rowCount) throw Object.assign(new Error("machine_organization_mismatch"), { code: "machine_organization_mismatch" });
      return result.rows[0].record;
    }
    this.state.machines[machine.id] = machine;
    if (this.pool) await this.#persistLegacyRecord(null, "machines", machine.id, machine);
    else await this.#persist();
    return machine;
  }
  async touchMachine(id) {
    if (this.pool) {
      const normalized = await this.#updateMachine(id, (machine) => ({ ...machine, status: "online", lastSeenAt: new Date().toISOString() }));
      if (normalized) return normalized;
      if (!this.state.machines[id] || this.state.machines[id].organizationId) return null;
    }
    const machine = this.state.machines[id]; if (!machine) return;
    machine.status = "online"; machine.lastSeenAt = new Date().toISOString(); await this.#persist(); return machine;
  }
  async markMachineOffline(id) {
    if (this.pool) {
      const normalized = await this.#updateMachine(id, (machine) => ({ ...machine, status: "offline", lastSeenAt: new Date().toISOString() }));
      if (normalized) return normalized;
      if (!this.state.machines[id] || this.state.machines[id].organizationId) return null;
    }
    const machine = this.state.machines[id]; if (!machine) return;
    machine.status = "offline"; machine.lastSeenAt = new Date().toISOString(); await this.#persist(); return machine;
  }
  async createSession(session) {
    if (this.pool && session.organizationId) {
      const result = await this.pool.query(
        `INSERT INTO agent_work_os_sessions_v1
           (session_id, organization_id, machine_id, created_by, status, record, created_at, updated_at)
         SELECT $1, $2, $3, $4, $5, $6::jsonb, $7, $8
         FROM agent_work_os_machines_v1 AS machine
         WHERE machine.machine_id = $3 AND machine.organization_id = $2 AND machine.status = 'online'
         RETURNING record`,
        [session.id, session.organizationId, session.machineId, session.createdBy ?? null, session.status,
          JSON.stringify(session), session.createdAt, session.updatedAt]
      );
      if (!result.rowCount) throw Object.assign(new Error("machine_not_available_in_organization"), { code: "machine_not_available_in_organization" });
      return result.rows[0].record;
    }
    this.state.sessions[session.id] = session;
    if (this.pool) await this.#persistLegacyRecord(null, "sessions", session.id, session);
    else await this.#persist();
    return session;
  }
  async createSessionWithCommand(session, command) {
    if (!this.pool) throw new Error("transactional_daemon_outbox_requires_postgres");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (session.organizationId) {
        const result = await client.query(
          `INSERT INTO agent_work_os_sessions_v1
             (session_id, organization_id, machine_id, created_by, status, record, created_at, updated_at)
           SELECT $1, $2, $3, $4, $5, $6::jsonb, $7, $8
           FROM agent_work_os_machines_v1 AS machine
           WHERE machine.machine_id = $3 AND machine.organization_id = $2 AND machine.status = 'online'
           RETURNING record`,
          [session.id, session.organizationId, session.machineId, session.createdBy ?? null, session.status,
            JSON.stringify(session), session.createdAt, session.updatedAt]
        );
        if (!result.rowCount) throw Object.assign(new Error("machine_not_available_in_organization"), { code: "machine_not_available_in_organization" });
      } else {
        await client.query(
          "SELECT 1 FROM agent_work_os_state_v1 WHERE state_key = $1 FOR UPDATE",
          [STATE_KEY]
        );
        await this.#persistLegacyRecord(client, "sessions", session.id, session);
      }
      await insertDaemonCommand(client, session.machineId, command);
      await client.query("COMMIT");
      if (!session.organizationId) this.state.sessions[session.id] = structuredClone(session);
      return session;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally { client.release(); }
  }
  async addMessage(id, message) {
    if (this.pool) {
      const normalized = await this.#updateSession(id, (session) => {
      session.messages ??= [];
      session.messages.push(message);
      session.updatedAt = new Date().toISOString();
      return session;
      });
      if (normalized) return normalized;
      if (!this.state.sessions[id] || this.state.sessions[id].organizationId) return null;
    }
    const s = this.#session(id); s.messages.push(message); s.updatedAt = new Date().toISOString(); await this.#persist(); return s;
  }
  async addMessageWithCommand(id, message, command) {
    if (!this.pool) throw new Error("transactional_daemon_outbox_requires_postgres");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query("SELECT record FROM agent_work_os_sessions_v1 WHERE session_id = $1 FOR UPDATE", [id]);
      let saved;
      if (selected.rows[0]) {
        const session = structuredClone(selected.rows[0].record);
        session.messages ??= [];
        session.messages.push(message);
        session.updatedAt = new Date().toISOString();
        const result = await client.query(
          "UPDATE agent_work_os_sessions_v1 SET record = $1::jsonb, updated_at = $2 WHERE session_id = $3 RETURNING record",
          [JSON.stringify(session), session.updatedAt, id]
        );
        saved = result.rows[0].record;
      } else {
        const legacyRow = await client.query(
          "SELECT payload #> ARRAY['sessions', $1] AS record FROM agent_work_os_state_v1 WHERE state_key = $2 FOR UPDATE",
          [id, STATE_KEY]
        );
        const legacy = legacyRow.rows[0]?.record ?? this.state.sessions[id];
        if (!legacy || legacy.organizationId) {
          await client.query("COMMIT");
          return null;
        }
        saved = structuredClone(legacy);
        saved.messages ??= [];
        saved.messages.push(message);
        saved.updatedAt = new Date().toISOString();
        await this.#persistLegacyRecord(client, "sessions", id, saved);
      }
      await insertDaemonCommand(client, saved.machineId, command);
      await client.query("COMMIT");
      if (!selected.rows[0]) this.state.sessions[id] = structuredClone(saved);
      return saved;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally { client.release(); }
  }
  async addEvent(id, event) {
    if (this.pool) {
      const normalized = await this.#updateSession(id, (session) => {
        session.events ??= [];
        const existingCommandEvent = event.commandId && session.events.find((existing) => existing.commandId === event.commandId);
        if (existingCommandEvent) {
          if (existingCommandEvent.kind === "status" && session.status !== existingCommandEvent.status) {
            session.status = existingCommandEvent.status;
            session.updatedAt = new Date().toISOString();
          }
          return session;
        }
        session.events.push(event);
        session.updatedAt = new Date().toISOString();
        if (event.kind === "status") session.status = event.status;
        if (event.kind === "thread") session.nativeSessionId = event.nativeSessionId;
        if (event.kind === "text" && event.text?.trim()) {
          session.messages ??= [];
          session.messages.push({ id: crypto.randomUUID(), role: "assistant", text: event.text, createdAt: event.at });
        }
        return session;
      });
      if (normalized) return normalized;
      if (!this.state.sessions[id] || this.state.sessions[id].organizationId) return null;
    }
    const s = this.#session(id);
    const existingCommandEvent = event.commandId && s.events.find((existing) => existing.commandId === event.commandId);
    if (existingCommandEvent) {
      if (existingCommandEvent.kind === "status" && s.status !== existingCommandEvent.status) {
        s.status = existingCommandEvent.status;
        s.updatedAt = new Date().toISOString();
        await this.#persist();
      }
      return s;
    }
    s.events.push(event); s.updatedAt = new Date().toISOString();
    if (event.kind === "status") s.status = event.status;
    if (event.kind === "thread") s.nativeSessionId = event.nativeSessionId;
    if (event.kind === "text" && event.text?.trim()) s.messages.push({ id: crypto.randomUUID(), role: "assistant", text: event.text, createdAt: event.at });
    await this.#persist(); return s;
  }
  async setSessionStatus(id, status) {
    if (this.pool) {
      const normalized = await this.#updateSession(id, (session) => ({ ...session, status, updatedAt: new Date().toISOString() }));
      if (normalized) return normalized;
      if (!this.state.sessions[id] || this.state.sessions[id].organizationId) return null;
    }
    const s = this.#session(id); s.status = status; s.updatedAt = new Date().toISOString(); await this.#persist(); return s;
  }
  async upsertShippingRun(run) {
    if (!run?.runId) throw new Error("shipping_run_id_required");
    if (this.pool && run.organizationId) return this.#upsertTenantShippingRun(run);
    if (!this.pool) {
      this.state.shippingRuns[run.runId] = structuredClone(run);
      await this.#persist();
      return this.state.shippingRuns[run.runId];
    }
    const priorWrite = this.shippingRunWriteChains.get(run.runId) ?? Promise.resolve();
    const pending = priorWrite.catch(() => {}).then(() => this.#writeShippingRun(run));
    this.shippingRunWriteChains.set(run.runId, pending);
    try {
      return await pending;
    } finally {
      if (this.shippingRunWriteChains.get(run.runId) === pending) this.shippingRunWriteChains.delete(run.runId);
    }
  }

  async upsertShippingRunWithCommand(run, command) {
    if (!run?.runId) throw new Error("shipping_run_id_required");
    if (!this.pool) throw new Error("transactional_daemon_outbox_requires_postgres");
    if (run.organizationId) return this.#upsertTenantShippingRun(run, { command });
    const priorWrite = this.shippingRunWriteChains.get(run.runId) ?? Promise.resolve();
    const pending = priorWrite.catch(() => {}).then(() => this.#writeShippingRun(run, command));
    this.shippingRunWriteChains.set(run.runId, pending);
    try { return await pending; }
    finally { if (this.shippingRunWriteChains.get(run.runId) === pending) this.shippingRunWriteChains.delete(run.runId); }
  }

  async updateShippingRunFromMachine(run) {
    if (!run?.runId || !run.organizationId || !run.machineId) return null;
    if (!this.pool) {
      const current = this.state.shippingRuns[run.runId];
      if (!current || current.organizationId !== run.organizationId || current.machineId !== run.machineId) return null;
      return this.upsertShippingRun(run);
    }
    return this.#upsertTenantShippingRun(run, { allowInsert: false });
  }

  async #upsertTenantShippingRun(run, { allowInsert = true, command = null } = {}) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query(
        "SELECT organization_id, machine_id, record FROM agent_work_os_shipping_runs_v1 WHERE run_id = $1 FOR UPDATE",
        [run.runId]
      );
      if (selected.rows[0] && selected.rows[0].organization_id !== run.organizationId) {
        throw Object.assign(new Error("shipping_run_organization_mismatch"), { code: "shipping_run_organization_mismatch", statusCode: 409 });
      }
      if (selected.rows[0] && selected.rows[0].machine_id !== run.machineId) {
        throw Object.assign(new Error("shipping_run_machine_mismatch"), { code: "shipping_run_machine_mismatch", statusCode: 409 });
      }
      if (!selected.rows[0] && !allowInsert) {
        await client.query("COMMIT");
        return null;
      }
      const clock = await client.query("SELECT clock_timestamp() AS now");
      const now = Date.parse(clock.rows[0].now);
      const updatedAt = new Date(now).toISOString();
      const currentRun = selected.rows[0]?.record;
      const persistedRun = currentRun
        ? {
            ...currentRun,
            ...run,
            runId: currentRun.runId,
            organizationId: currentRun.organizationId,
            machineId: currentRun.machineId,
            createdBy: currentRun.createdBy,
            createdAt: currentRun.createdAt,
            projectId: currentRun.projectId,
            releaseVersion: currentRun.releaseVersion,
            contractDigest: currentRun.contractDigest,
            updatedAt
          }
        : { ...run, updatedAt };
      const saved = selected.rows[0]
        ? await client.query(
            `WITH timestamped AS (
               SELECT GREATEST(clock_timestamp(), existing.updated_at + INTERVAL '1 millisecond') AS next_updated_at
               FROM agent_work_os_shipping_runs_v1 AS existing
               WHERE existing.run_id = $3
               FOR UPDATE
             )
             UPDATE agent_work_os_shipping_runs_v1 AS shipping
             SET status = $1,
                 updated_at = timestamped.next_updated_at,
                 record = jsonb_set(
                   $2::jsonb,
                   '{updatedAt}',
                   to_jsonb(to_char(timestamped.next_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
                   true
                 )
             FROM timestamped
             WHERE shipping.run_id = $3 AND shipping.organization_id = $4
             RETURNING shipping.record`,
            [persistedRun.state ?? "unknown", JSON.stringify(persistedRun), run.runId, run.organizationId]
          )
        : await client.query(
            `INSERT INTO agent_work_os_shipping_runs_v1
               (run_id, organization_id, machine_id, status, record, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7) RETURNING record`,
            [run.runId, run.organizationId, run.machineId, persistedRun.state ?? "unknown", JSON.stringify(persistedRun), run.createdAt ?? updatedAt, updatedAt]
          );
      if (command) await insertDaemonCommand(client, run.machineId, command);
      await client.query("COMMIT");
      return saved.rows[0].record;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      if (error.code === "23505") throw Object.assign(new Error("shipping_run_exists"), { code: "shipping_run_exists", statusCode: 409 });
      throw error;
    } finally { client.release(); }
  }

  async #writeShippingRun(run, command = null) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const lockedState = await client.query(
        "SELECT payload FROM agent_work_os_state_v1 WHERE state_key = $1 FOR UPDATE",
        [STATE_KEY]
      );
      if (!lockedState.rows[0]) throw new Error("global_state_row_missing");
      const previousServerTimestamp = Date.parse(lockedState.rows[0].payload?._shippingRunUpdatedAt?.[run.runId] ?? "");
      const databaseClock = await client.query("SELECT clock_timestamp() AS now");
      const now = Date.parse(databaseClock.rows[0].now);
      // Legacy snapshots can contain client supplied future timestamps. Reset those to
      // database time. Track server ordering separately so that timestamp increments
      // cannot later be mistaken for untrusted client values.
      const updatedAtMs = Number.isFinite(previousServerTimestamp)
        ? Math.max(now, previousServerTimestamp + 1)
        : now;
      const updatedAt = new Date(updatedAtMs).toISOString();
      const persistedRun = { ...run, updatedAt };
      await this.#persistLegacyRecord(client, "shippingRuns", run.runId, persistedRun);
      await this.#persistLegacyRecord(client, "_shippingRunUpdatedAt", run.runId, updatedAt);
      if (command) await insertDaemonCommand(client, run.machineId, command);
      await client.query("COMMIT");
      this.state.shippingRuns[run.runId] = structuredClone(persistedRun);
      return this.state.shippingRuns[run.runId];
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally { client.release(); }
  }

  #session(id) { const s = this.state.sessions[id]; if (!s) throw new Error(`Unknown session: ${id}`); return s; }
  async #updateMachine(id, update) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query("SELECT record FROM agent_work_os_machines_v1 WHERE machine_id = $1 FOR UPDATE", [id]);
      if (!selected.rows[0]) {
        const legacyRow = await client.query(
          "SELECT payload #> ARRAY['machines', $1] AS record FROM agent_work_os_state_v1 WHERE state_key = $2 FOR UPDATE",
          [id, STATE_KEY]
        );
        const legacy = legacyRow.rows[0]?.record ?? this.state.machines[id];
        if (!legacy || legacy.organizationId) { await client.query("COMMIT"); return null; }
        const updated = update(legacy);
        this.state.machines[id] = updated;
        await this.#persistLegacyRecord(client, "machines", id, updated);
        await client.query("COMMIT");
        return updated;
      }
      const machine = update(selected.rows[0].record);
      const saved = await client.query(
        "UPDATE agent_work_os_machines_v1 SET status = $1, record = $2::jsonb, updated_at = CURRENT_TIMESTAMP WHERE machine_id = $3 RETURNING record",
        [machine.status, JSON.stringify(machine), id]
      );
      await client.query("COMMIT");
      return saved.rows[0].record;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally { client.release(); }
  }
  async #updateSession(id, update) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query("SELECT record FROM agent_work_os_sessions_v1 WHERE session_id = $1 FOR UPDATE", [id]);
      if (!selected.rows[0]) {
        const legacyRow = await client.query(
          "SELECT payload #> ARRAY['sessions', $1] AS record FROM agent_work_os_state_v1 WHERE state_key = $2 FOR UPDATE",
          [id, STATE_KEY]
        );
        const legacy = legacyRow.rows[0]?.record ?? this.state.sessions[id];
        if (!legacy || legacy.organizationId) { await client.query("COMMIT"); return null; }
        const updated = update(structuredClone(legacy));
        this.state.sessions[id] = updated;
        await this.#persistLegacyRecord(client, "sessions", id, updated);
        await client.query("COMMIT");
        return updated;
      }
      const session = update(structuredClone(selected.rows[0].record));
      const saved = await client.query(
        `UPDATE agent_work_os_sessions_v1
         SET status = $1, record = $2::jsonb, updated_at = $3
         WHERE session_id = $4 RETURNING record`,
        [session.status, JSON.stringify(session), session.updatedAt, id]
      );
      await client.query("COMMIT");
      return saved.rows[0].record;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally { client.release(); }
  }
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

  async #persistLegacyRecord(client, collection, id, record) {
    await (client ?? this.pool).query(
      `UPDATE agent_work_os_state_v1
       SET payload = jsonb_set(
         jsonb_set(payload, ARRAY[$1]::text[], COALESCE(payload -> $1, '{}'::jsonb), true),
         ARRAY[$1, $2]::text[], $3::jsonb, true
       ), updated_at = CURRENT_TIMESTAMP
       WHERE state_key = $4`,
      [collection, id, JSON.stringify(record), STATE_KEY]
    );
  }
}

function normalizeState(parsed = {}) {
  return {
    machines: parsed.machines ?? {},
    sessions: parsed.sessions ?? {},
    shippingRuns: parsed.shippingRuns ?? {},
    workItems: parsed.workItems ?? {},
    workItemEvents: parsed.workItemEvents ?? [],
    forgeObservations: Array.isArray(parsed.forgeObservations) ? parsed.forgeObservations.slice(-1000) : []
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
