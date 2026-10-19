import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
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
    this.localPath = `${store.filePath}.capability-verification-runs.json`;
    this.localWriteChain = Promise.resolve();
    this.migrationPromise = null;
    this.sessionEventConsumers = new Set();
  }

  async initialize() {
    if (!this.store.pool) await this.#readLocalState();
  }

  registerSessionEventConsumer(consumer) {
    if (typeof consumer !== "function") throw new TypeError("session event consumer must be a function");
    this.sessionEventConsumers.add(consumer);
    return () => this.sessionEventConsumers.delete(consumer);
  }

  async createWithSession(runInput, session, command) {
    await this.#ensurePostgresStore();
    const run = validateRun(runInput);
    if (!session?.id || session.organizationId !== run.organizationId || session.machineId !== run.machineId) {
      throw new CapabilityVerificationStoreError("capability_verification_session_scope_invalid");
    }
    if (run.sessionId !== session.id) throw new CapabilityVerificationStoreError("capability_verification_session_id_invalid");
    if (!command?.commandId || command.sessionId !== session.id || command.action !== "session.start") {
      throw new CapabilityVerificationStoreError("capability_verification_command_invalid");
    }

    if (!this.store.pool) {
      const state = await this.#readLocalState();
      if (state.runs[run.id]) throw new CapabilityVerificationStoreError("capability_verification_run_exists", undefined, 409);
      await this.store.createSession(session);
      state.runs[run.id] = structuredClone(run);
      await this.#writeLocalState(state);
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
      if (!savedSession.rowCount) throw new CapabilityVerificationStoreError("machine_not_available_in_organization", undefined, 409);
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
      if (error?.code === "23505") throw new CapabilityVerificationStoreError("capability_verification_run_exists", undefined, 409);
      throw error;
    } finally {
      client.release();
    }
  }

  async get(id, organizationId) {
    await this.#ensurePostgresStore();
    if (!id || !organizationId) return null;
    if (this.store.pool) {
      const result = await this.store.pool.query(
        "SELECT record FROM agent_work_os_capability_verification_runs_v1 WHERE run_id = $1 AND organization_id = $2",
        [id, organizationId]
      );
      return result.rows[0]?.record ?? null;
    }
    const state = await this.#readLocalState();
    const run = state.runs[id];
    return run?.organizationId === organizationId ? structuredClone(run) : null;
  }

  async listByOrganization(organizationId) {
    await this.#ensurePostgresStore();
    if (this.store.pool) {
      const result = await this.store.pool.query(
        "SELECT record FROM agent_work_os_capability_verification_runs_v1 WHERE organization_id = $1 ORDER BY updated_at DESC, run_id",
        [organizationId]
      );
      return result.rows.map((row) => row.record);
    }
    const state = await this.#readLocalState();
    return Object.values(state.runs)
      .filter((run) => run.organizationId === organizationId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((run) => structuredClone(run));
  }

  async updateFromSessionEvent(sessionId, event) {
    await this.#ensurePostgresStore();
    if (!sessionId || !event) return null;
    let verification = null;

    if (this.store.pool) {
      const client = await this.store.pool.connect();
      try {
        await client.query("BEGIN");
        const selected = await client.query(
          "SELECT record FROM agent_work_os_capability_verification_runs_v1 WHERE session_id = $1 FOR UPDATE",
          [sessionId]
        );
        if (selected.rows[0]) {
          const updated = applySessionEvent(selected.rows[0].record, event);
          if (!updated) verification = selected.rows[0].record;
          else {
            const result = await client.query(
              `UPDATE agent_work_os_capability_verification_runs_v1
               SET status = $1, record = $2::jsonb, updated_at = $3
               WHERE session_id = $4 RETURNING record`,
              [updated.status, JSON.stringify(updated), updated.updatedAt, sessionId]
            );
            verification = result.rows[0].record;
          }
        }
        await client.query("COMMIT");
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        client.release();
      }
    } else {
      const state = await this.#readLocalState();
      const entry = Object.values(state.runs).find((run) => run.sessionId === sessionId);
      if (entry) {
        const updated = applySessionEvent(entry, event);
        if (!updated) verification = structuredClone(entry);
        else {
          state.runs[entry.id] = updated;
          await this.#writeLocalState(state);
          verification = structuredClone(updated);
        }
      }
    }

    await this.#notifySessionEventConsumers(sessionId, event);
    return verification;
  }

  async #notifySessionEventConsumers(sessionId, event) {
    for (const consumer of this.sessionEventConsumers) await consumer({ sessionId, event });
  }

  async #ensurePostgresStore() {
    if (!this.store.pool) return;
    if (!this.migrationPromise) {
      this.migrationPromise = readFile(MIGRATION_URL, "utf8")
        .then((migration) => this.store.pool.query(migration))
        .catch((error) => {
          this.migrationPromise = null;
          throw error;
        });
    }
    await this.migrationPromise;
  }

  async #readLocalState() {
    try {
      const parsed = JSON.parse(await readFile(this.localPath, "utf8"));
      if (parsed?.schemaVersion !== "1" || !parsed.runs || typeof parsed.runs !== "object" || Array.isArray(parsed.runs)) {
        throw new CapabilityVerificationStoreError("capability_verification_local_store_invalid", undefined, 500);
      }
      return parsed;
    } catch (error) {
      if (error?.code === "ENOENT") return { schemaVersion: "1", runs: {} };
      if (error instanceof SyntaxError) throw new CapabilityVerificationStoreError("capability_verification_local_store_invalid_json", undefined, 500);
      throw error;
    }
  }

  #writeLocalState(state) {
    const snapshot = `${JSON.stringify(state, null, 2)}\n`;
    this.localWriteChain = this.localWriteChain.catch(() => {}).then(async () => {
      await mkdir(path.dirname(this.localPath), { recursive: true });
      const temp = `${this.localPath}.tmp`;
      await writeFile(temp, snapshot, "utf8");
      await rename(temp, this.localPath);
    });
    return this.localWriteChain;
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
      run.startedAt = at;
      changed = true;
    } else if (event.status === "completed" && run.status !== "complete" && run.status !== "failed") {
      // A capability is not verified until the normalized receipt arrives.
      run.status = "verifying";
      changed = true;
    } else if (event.status === "failed" || event.status === "interrupted") {
      run.status = event.status;
      run.error = event.message ?? event.error ?? null;
      run.completedAt = at;
      changed = true;
    }
  } else if (event.kind === "error") {
    run.status = "failed";
    run.error = event.message ?? "capability verification failed";
    run.completedAt = at;
    changed = true;
  }

  if (!changed) return null;
  run.updatedAt = at;
  return run;
}
