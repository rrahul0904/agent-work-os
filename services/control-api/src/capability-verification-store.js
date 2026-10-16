import { readFile } from "node:fs/promises";
import { insertDaemonCommand } from "./daemon-command-outbox.js";

const MIGRATION_URL = new URL("../../../migrations/009_capability_verification_runs.sql", import.meta.url);
const RUN_STATES = new Set(["queued", "running", "verifying", "complete", "failed", "interrupted"]);

export class CapabilityVerificationStoreError extends Error {
  constructor(code, message = code, statusCode = 400) {
    super(message);
    this.name = "CapabilityVerificationStoreError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class CapabilityVerificationRepository {
  constructor(store) {
    this.store = store;
  }

  async initialize() {
    if (this.store.pool) await this.store.pool.query(await readFile(MIGRATION_URL, "utf8"));
    else this.store.state.capabilityVerificationRuns ??= {};
  }

  async createWithSession(runInput, session, command) {
    const run = validateRun(runInput);
    if (!session?.id || session.organizationId !== run.organizationId || session.machineId !== run.machineId) {
      throw new CapabilityVerificationStoreError("capability_verification_session_scope_invalid");
    }
    if (run.sessionId !== session.id) throw new CapabilityVerificationStoreError("capability_verification_session_id_invalid");
    if (!command?.commandId || command.sessionId !== session.id || command.action !== "session.start") {
      throw new CapabilityVerificationStoreError("capability_verification_command_invalid");
    }

    if (!this.store.pool) {
      if (this.store.state.capabilityVerificationRuns[run.id]) {
        throw new CapabilityVerificationStoreError("capability_verification_run_exists", undefined, 409);
      }
      await this.store.createSession(session);
      this.store.state.capabilityVerificationRuns[run.id] = structuredClone(run);
      await this.store.persistCompatibilityState();
      return structuredClone(run);
    }

    const client = await this.store.pool.connect();
    try {
      await client.query("BEGIN");
      const savedSession = await client.query(
        `INSERT INTO agent_work_os_sessions_v1
           (session_id, organization_id, machine_id, created_by, status, record, created_at, updated_at)
         SELECT $1, $2, $3, $4, $5, $6::jsonb, $7, $8
         FROM agent_work_os_machines_v1 AS machine
         WHERE machine.machine_id = $3 AND machine.organization_id = $2 AND machine.status = 'online'
         RETURNING session_id`,
        [session.id, session.organizationId, session.machineId, session.createdBy ?? null, session.status,
          JSON.stringify(session), session.createdAt, session.updatedAt]
      );
      if (!savedSession.rowCount) {
        throw new CapabilityVerificationStoreError("machine_not_available_in_organization", undefined, 409);
      }
      await client.query(
        `INSERT INTO agent_work_os_capability_verification_runs_v1
           (run_id, organization_id, machine_id, session_id, created_by, status, record, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
        [run.id, run.organizationId, run.machineId, run.sessionId, run.createdBy ?? null, run.status,
          JSON.stringify(run), run.createdAt, run.updatedAt]
      );
      await insertDaemonCommand(client, run.machineId, command);
      await client.query("COMMIT");
      return structuredClone(run);
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      if (error?.code === "23505") {
        throw new CapabilityVerificationStoreError("capability_verification_run_exists", undefined, 409);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async get(id, organizationId) {
    if (!id || !organizationId) return null;
    if (this.store.pool) {
      const result = await this.store.pool.query(
        "SELECT record FROM agent_work_os_capability_verification_runs_v1 WHERE run_id = $1 AND organization_id = $2",
        [id, organizationId]
      );
      return result.rows[0]?.record ?? null;
    }
    const run = this.store.state.capabilityVerificationRuns?.[id];
    return run?.organizationId === organizationId ? structuredClone(run) : null;
  }

  async listByOrganization(organizationId) {
    if (this.store.pool) {
      const result = await this.store.pool.query(
        "SELECT record FROM agent_work_os_capability_verification_runs_v1 WHERE organization_id = $1 ORDER BY updated_at DESC, run_id",
        [organizationId]
      );
      return result.rows.map((row) => row.record);
    }
    return Object.values(this.store.state.capabilityVerificationRuns ?? {})
      .filter((run) => run.organizationId === organizationId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((run) => structuredClone(run));
  }

  async updateFromSessionEvent(sessionId, event) {
    if (!sessionId || !event) return null;
    if (this.store.pool) {
      const client = await this.store.pool.connect();
      try {
        await client.query("BEGIN");
        const selected = await client.query(
          "SELECT record FROM agent_work_os_capability_verification_runs_v1 WHERE session_id = $1 FOR UPDATE",
          [sessionId]
        );
        if (!selected.rows[0]) {
          await client.query("COMMIT");
          return null;
        }
        const updated = applySessionEvent(selected.rows[0].record, event);
        if (!updated) {
          await client.query("COMMIT");
          return selected.rows[0].record;
        }
        const result = await client.query(
          `UPDATE agent_work_os_capability_verification_runs_v1
           SET status = $1, record = $2::jsonb, updated_at = $3
           WHERE session_id = $4 RETURNING record`,
          [updated.status, JSON.stringify(updated), updated.updatedAt, sessionId]
        );
        await client.query("COMMIT");
        return result.rows[0].record;
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        client.release();
      }
    }

    const entry = Object.values(this.store.state.capabilityVerificationRuns ?? {}).find((run) => run.sessionId === sessionId);
    if (!entry) return null;
    const updated = applySessionEvent(entry, event);
    if (!updated) return structuredClone(entry);
    this.store.state.capabilityVerificationRuns[entry.id] = updated;
    await this.store.persistCompatibilityState();
    return structuredClone(updated);
  }
}

function validateRun(run) {
  if (!run || typeof run !== "object" || Array.isArray(run)) throw new CapabilityVerificationStoreError("capability_verification_run_invalid");
  for (const field of ["id", "organizationId", "machineId", "sessionId", "capabilityId", "capabilityVersion", "capabilitySlug", "harnessId", "mode", "cwd", "createdAt", "updatedAt"]) {
    if (typeof run[field] !== "string" || !run[field]) throw new CapabilityVerificationStoreError(`capability_verification_${field}_invalid`);
  }
  if (!RUN_STATES.has(run.status)) throw new CapabilityVerificationStoreError("capability_verification_status_invalid");
  if (!Number.isFinite(Date.parse(run.createdAt)) || !Number.isFinite(Date.parse(run.updatedAt))) {
    throw new CapabilityVerificationStoreError("capability_verification_timestamp_invalid");
  }
  return structuredClone(run);
}

function applySessionEvent(runInput, event) {
  const run = structuredClone(runInput);
  const at = Number.isFinite(Date.parse(event.at)) ? event.at : new Date().toISOString();
  let changed = false;

  if (event.kind === "tool" && event.name === "capability.verification.receipt" && event.phase === "completed" && event.payload) {
    run.receipt = structuredClone(event.payload);
    run.status = event.payload.passed === true ? "complete" : "failed";
    run.completedAt = at;
    changed = true;
  } else if (event.kind === "status") {
    if (event.status === "running" && run.status === "queued") {
      run.status = "running";
      run.startedAt ??= at;
      changed = true;
    } else if (event.status === "failed" || event.status === "interrupted") {
      run.status = event.status;
      run.completedAt = at;
      if (event.message) run.error = String(event.message).slice(0, 2_000);
      changed = true;
    } else if (event.status === "completed" && !run.receipt) {
      run.status = "verifying";
      changed = true;
    }
  } else if (event.kind === "error") {
    run.status = "failed";
    run.error = String(event.message ?? "capability_verification_failed").slice(0, 2_000);
    run.completedAt = at;
    changed = true;
  }

  if (!changed) return null;
  run.updatedAt = at;
  return run;
}
