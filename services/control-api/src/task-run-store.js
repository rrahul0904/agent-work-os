import { readFile } from "node:fs/promises";
import {
  assertCanonicalId, canonicalDigest, createCanonicalId, createTask, createTaskRun, transitionTaskRun
} from "../../../packages/domain/src/index.js";

const MIGRATION_URL = new URL("../../../migrations/009_canonical_tasks_runs.sql", import.meta.url);

export class TaskRunConcurrencyError extends Error {
  constructor(code, message = code) { super(message); this.name = "TaskRunConcurrencyError"; this.code = code; this.statusCode = 409; }
}

export class TaskRunIdempotencyConflictError extends Error {
  constructor(commandId) { super(`idempotency_key_reused_with_different_request:${commandId}`); this.name = "TaskRunIdempotencyConflictError"; this.code = "idempotency_key_conflict"; }
}

export class PostgresTaskRunRepository {
  constructor(pool) {
    if (!pool || typeof pool.connect !== "function") throw new Error("postgres_pool_required");
    this.pool = pool;
  }

  async initialize() {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["agent_work_os_canonical_tasks_runs_v1"]);
      await client.query(await readFile(MIGRATION_URL, "utf8"));
      await client.query("COMMIT");
    } catch (error) { try { await client.query("ROLLBACK"); } catch {} throw error; }
    finally { client.release(); }
  }

  async createTask(input, { commandId, actorId, at = new Date().toISOString() } = {}) {
    const task = createTask(input);
    const command = validateCommand(commandId, actorId, at);
    const requestDigest = canonicalDigest({ operation: "task.create", actorId: command.actorId, task: {
      id: task.id, organizationId: task.organizationId, workItemId: task.workItemId,
      title: task.title, description: task.description, createdBy: task.createdBy
    } });
    try { return await this.#transaction(async (client) => {
      const replay = await findEventReplay(client, "agent_work_os_task_events_v1", command.commandId, requestDigest);
      if (replay) return { task: replay.result, replayed: true };
      await client.query(
        `INSERT INTO agent_work_os_tasks_v1
           (id, organization_id, work_item_id, title, description, status, version, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'READY', 1, $6, $7, $7)`,
        [task.id, task.organizationId, task.workItemId, task.title, task.description, command.actorId, command.at]
      );
      await insertTaskEvent(client, { task, command, requestDigest, fromStatus: null });
      return { task, replayed: false };
    }); } catch (error) {
      if (error.code === "23505" && error.constraint?.includes("tasks_v1_pkey")) throw new TaskRunConcurrencyError("task_already_exists");
      throw error;
    }
  }

  async getTask(id, organizationId) {
    assertCanonicalId("task", id, "id");
    assertCanonicalId("org", organizationId, "organizationId");
    const result = await this.pool.query("SELECT * FROM agent_work_os_tasks_v1 WHERE id = $1 AND organization_id = $2", [id, organizationId]);
    return result.rows[0] ? rowToTask(result.rows[0]) : null;
  }

  async listTasksByOrganization(organizationId) {
    assertCanonicalId("org", organizationId, "organizationId");
    const result = await this.pool.query("SELECT * FROM agent_work_os_tasks_v1 WHERE organization_id = $1 ORDER BY updated_at DESC, id", [organizationId]);
    return result.rows.map(rowToTask);
  }

  async createRun(taskId, { organizationId, runId, commandId, actorId, at = new Date().toISOString() } = {}) {
    assertCanonicalId("task", taskId, "taskId");
    assertCanonicalId("org", organizationId, "organizationId");
    assertCanonicalId("run", runId, "runId");
    const command = validateCommand(commandId, actorId, at);
    const requestDigest = canonicalDigest({ operation: "task.run.create", taskId, organizationId, runId, actorId: command.actorId });
    try { return await this.#transaction(async (client) => {
      const replay = await findEventReplay(client, "agent_work_os_task_run_events_v1", command.commandId, requestDigest);
      if (replay) {
        const taskResult = await client.query("SELECT * FROM agent_work_os_tasks_v1 WHERE id = $1 AND organization_id = $2", [taskId, organizationId]);
        return { run: replay.result, task: taskResult.rows[0] ? rowToTask(taskResult.rows[0]) : null, replayed: true };
      }
      const selected = await client.query(
        "SELECT * FROM agent_work_os_tasks_v1 WHERE id = $1 AND organization_id = $2 FOR UPDATE",
        [taskId, organizationId]
      );
      if (!selected.rows[0]) return null;
      const task = rowToTask(selected.rows[0]);
      if (!["READY", "FAILED"].includes(task.status)) throw new TaskRunConcurrencyError("task_not_ready_for_attempt");
      const active = await client.query(
        `SELECT 1 FROM agent_work_os_task_runs_v1
         WHERE task_id = $1 AND status IN ('QUEUED', 'LEASED', 'PREPARING', 'RUNNING', 'WAITING_FOR_APPROVAL', 'VERIFYING', 'RECOVERING')`,
        [taskId]
      );
      if (active.rowCount) throw new TaskRunConcurrencyError("task_run_already_active");
      const attemptResult = await client.query("SELECT COALESCE(MAX(attempt), 0) + 1 AS attempt FROM agent_work_os_task_runs_v1 WHERE task_id = $1", [taskId]);
      const run = createTaskRun({ id: runId, organizationId, taskId, attempt: Number(attemptResult.rows[0].attempt), createdBy: command.actorId, createdAt: command.at });
      const nextTask = task.status === "FAILED"
        ? { ...task, status: "READY", version: task.version + 1, updatedAt: command.at }
        : task;
      await client.query(
        `INSERT INTO agent_work_os_task_runs_v1
           (id, organization_id, task_id, attempt, status, version, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'QUEUED', 1, $5, $6, $6)`,
        [run.id, run.organizationId, run.taskId, run.attempt, command.actorId, command.at]
      );
      if (nextTask !== task) {
        await client.query(
          "UPDATE agent_work_os_tasks_v1 SET status = 'READY', version = $1, updated_at = $2 WHERE id = $3 AND organization_id = $4",
          [nextTask.version, nextTask.updatedAt, taskId, organizationId]
        );
        await insertTaskEvent(client, { task: nextTask, command, requestDigest, fromStatus: task.status });
      }
      await insertRunEvent(client, { run, command, requestDigest, fromStatus: null });
      return { run, task: nextTask, replayed: false };
    }); } catch (error) {
      if (error.code === "23505" && (error.constraint?.includes("task_runs_v1_pkey") || error.constraint?.includes("task_runs_one_active"))) {
        throw new TaskRunConcurrencyError(error.constraint.includes("one_active") ? "task_run_already_active" : "run_already_exists");
      }
      throw error;
    }
  }

  async getRun(id, organizationId) {
    assertCanonicalId("run", id, "id");
    assertCanonicalId("org", organizationId, "organizationId");
    const result = await this.pool.query("SELECT * FROM agent_work_os_task_runs_v1 WHERE id = $1 AND organization_id = $2", [id, organizationId]);
    return result.rows[0] ? rowToRun(result.rows[0]) : null;
  }

  async listRunsByTask(taskId, organizationId) {
    assertCanonicalId("task", taskId, "taskId");
    assertCanonicalId("org", organizationId, "organizationId");
    const result = await this.pool.query(
      "SELECT * FROM agent_work_os_task_runs_v1 WHERE task_id = $1 AND organization_id = $2 ORDER BY attempt",
      [taskId, organizationId]
    );
    return result.rows.map(rowToRun);
  }

  async listRunsByOrganization(organizationId) {
    assertCanonicalId("org", organizationId, "organizationId");
    const result = await this.pool.query("SELECT * FROM agent_work_os_task_runs_v1 WHERE organization_id = $1 ORDER BY updated_at DESC, id", [organizationId]);
    return result.rows.map(rowToRun);
  }

  async transitionRun(id, { organizationId, commandId, actorId, expectedVersion, to, allowedFrom = null, at = new Date().toISOString() } = {}) {
    assertCanonicalId("run", id, "runId");
    assertCanonicalId("org", organizationId, "organizationId");
    const command = validateCommand(commandId, actorId, at);
    const requestDigest = canonicalDigest({ operation: "task.run.transition", id, organizationId, actorId: command.actorId, expectedVersion, to });
    return this.#transaction(async (client) => {
      const replay = await findEventReplay(client, "agent_work_os_task_run_events_v1", command.commandId, requestDigest);
      if (replay) {
        const taskResult = await client.query(
          `SELECT task.* FROM agent_work_os_tasks_v1 task
           JOIN agent_work_os_task_runs_v1 run ON run.task_id = task.id
           WHERE run.id = $1 AND run.organization_id = $2`, [id, organizationId]
        );
        return { run: replay.result, task: taskResult.rows[0] ? rowToTask(taskResult.rows[0]) : null, replayed: true };
      }
      const selected = await client.query("SELECT * FROM agent_work_os_task_runs_v1 WHERE id = $1 AND organization_id = $2 FOR UPDATE", [id, organizationId]);
      if (!selected.rows[0]) return null;
      const current = rowToRun(selected.rows[0]);
      if (allowedFrom && !allowedFrom.includes(current.status)) throw new TaskRunConcurrencyError("run_not_cancellable_by_user");
      const updated = transitionTaskRun(current, { to, expectedVersion, at: command.at });
      const saved = await client.query(
        `UPDATE agent_work_os_task_runs_v1 SET status = $1, version = $2, updated_at = $3
         WHERE id = $4 AND organization_id = $5 AND version = $6 RETURNING *`,
        [updated.status, updated.version, updated.updatedAt, id, organizationId, expectedVersion]
      );
      if (saved.rowCount !== 1) throw new TaskRunConcurrencyError("run_version_conflict");
      await insertRunEvent(client, { run: updated, command, requestDigest, fromStatus: current.status });
      const taskState = taskStatusForRun(updated.status);
      const taskResult = await client.query("SELECT * FROM agent_work_os_tasks_v1 WHERE id = $1 FOR UPDATE", [updated.taskId]);
      const currentTask = rowToTask(taskResult.rows[0]);
      let task = currentTask;
      if (taskState && taskState !== currentTask.status) {
        task = { ...currentTask, status: taskState, version: currentTask.version + 1, updatedAt: command.at };
        await client.query("UPDATE agent_work_os_tasks_v1 SET status = $1, version = $2, updated_at = $3 WHERE id = $4", [task.status, task.version, task.updatedAt, task.id]);
        await insertTaskEvent(client, { task, command, requestDigest, fromStatus: currentTask.status });
      }
      return { run: updated, task, replayed: false };
    });
  }

  async listRunEvents(runId, organizationId) {
    assertCanonicalId("run", runId, "runId");
    assertCanonicalId("org", organizationId, "organizationId");
    const result = await this.pool.query(
      `SELECT event.* FROM agent_work_os_task_run_events_v1 event
       JOIN agent_work_os_task_runs_v1 run ON run.id = event.run_id
       WHERE event.run_id = $1 AND run.organization_id = $2 ORDER BY event.version`,
      [runId, organizationId]
    );
    return result.rows.map(rowToEvent);
  }

  async listTaskEvents(taskId, organizationId) {
    assertCanonicalId("task", taskId, "taskId");
    assertCanonicalId("org", organizationId, "organizationId");
    const result = await this.pool.query(
      `SELECT event.* FROM agent_work_os_task_events_v1 event
       JOIN agent_work_os_tasks_v1 task ON task.id = event.task_id
       WHERE event.task_id = $1 AND task.organization_id = $2 ORDER BY event.version`,
      [taskId, organizationId]
    );
    return result.rows.map(rowToTaskEvent);
  }

  async #transaction(operation) {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); const result = await operation(client); await client.query("COMMIT"); return result; }
    catch (error) { try { await client.query("ROLLBACK"); } catch {} throw error; }
    finally { client.release(); }
  }
}

async function insertTaskEvent(client, { task, command, requestDigest, fromStatus }) {
  await client.query(
    `INSERT INTO agent_work_os_task_events_v1
       (event_id, task_id, command_id, actor_id, version, from_status, to_status, request_digest, result, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
    [createCanonicalId("event"), task.id, command.commandId, command.actorId, task.version, fromStatus, task.status, requestDigest, JSON.stringify(task), command.at]
  );
}

async function insertRunEvent(client, { run, command, requestDigest, fromStatus }) {
  await client.query(
    `INSERT INTO agent_work_os_task_run_events_v1
       (event_id, run_id, command_id, actor_id, version, from_status, to_status, request_digest, result, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
    [createCanonicalId("event"), run.id, command.commandId, command.actorId, run.version, fromStatus, run.status, requestDigest, JSON.stringify(run), command.at]
  );
}

async function findEventReplay(client, table, commandId, requestDigest) {
  const result = await client.query(`SELECT result, request_digest FROM ${table} WHERE command_id = $1`, [commandId]);
  if (!result.rows[0]) return null;
  if (result.rows[0].request_digest !== requestDigest) throw new TaskRunIdempotencyConflictError(commandId);
  return { result: result.rows[0].result, replayed: true };
}

function validateCommand(commandId, actorId, at) {
  assertCanonicalId("command", commandId, "commandId");
  const kind = ["user", "agent", "service"].find((candidate) => actorId?.startsWith(`${candidate}_`));
  if (!kind) throw new Error("task_run_actor_id_invalid");
  assertCanonicalId(kind, actorId, "actorId");
  if (!Number.isFinite(Date.parse(at))) throw new Error("task_run_timestamp_invalid");
  return { commandId, actorId, at };
}

function taskStatusForRun(status) {
  if (["LEASED", "PREPARING", "RUNNING", "WAITING_FOR_APPROVAL", "VERIFYING", "RECOVERING"].includes(status)) return "ACTIVE";
  if (status === "SUCCEEDED") return "SUCCEEDED";
  if (status === "CANCELLED" || status === "QUEUED") return "READY";
  if (["FAILED", "TIMED_OUT", "INTERRUPTED"].includes(status)) return "FAILED";
  return null;
}

function rowToTask(row) {
  return { id: row.id, organizationId: row.organization_id, workItemId: row.work_item_id, title: row.title, description: row.description,
    status: row.status, version: Number(row.version), createdBy: row.created_by, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
}

function rowToRun(row) {
  return { id: row.id, organizationId: row.organization_id, taskId: row.task_id, attempt: Number(row.attempt), status: row.status,
    version: Number(row.version), createdBy: row.created_by, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
}

function rowToEvent(row) {
  return { eventId: row.event_id, runId: row.run_id, commandId: row.command_id, actorId: row.actor_id, version: Number(row.version),
    fromStatus: row.from_status, toStatus: row.to_status, requestDigest: row.request_digest, result: row.result, occurredAt: new Date(row.occurred_at).toISOString() };
}

function rowToTaskEvent(row) {
  return { eventId: row.event_id, taskId: row.task_id, commandId: row.command_id, actorId: row.actor_id, version: Number(row.version),
    fromStatus: row.from_status, toStatus: row.to_status, requestDigest: row.request_digest, result: row.result, occurredAt: new Date(row.occurred_at).toISOString() };
}
