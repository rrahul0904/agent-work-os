import { readFile } from "node:fs/promises";
import { DomainValidationError, WorkItemRepository, assertCanonicalId, assertNewWorkItem, canonicalDigest, createCanonicalId, transitionWorkItem, workItemCreateDigest } from "../../../packages/domain/src/index.js";

const MIGRATION_URL = new URL("../../../migrations/002_canonical_work_items.sql", import.meta.url);

export class OptimisticConcurrencyError extends Error {
  constructor({ workItemId, expectedVersion, actualVersion }) {
    super(`work_item_version_conflict:${workItemId}:expected=${expectedVersion}:actual=${actualVersion}`);
    this.name = "OptimisticConcurrencyError";
    this.code = "work_item_version_conflict";
    this.workItemId = workItemId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class IdempotencyConflictError extends Error {
  constructor(commandId) {
    super(`idempotency_key_reused_with_different_request:${commandId}`);
    this.name = "IdempotencyConflictError";
    this.code = "idempotency_key_conflict";
    this.commandId = commandId;
  }
}

export class PostgresWorkItemRepository extends WorkItemRepository {
  constructor(pool) {
    super();
    if (!pool || typeof pool.connect !== "function") throw new Error("postgres_pool_required");
    this.pool = pool;
  }

  async initialize() {
    await this.pool.query(await readFile(MIGRATION_URL, "utf8"));
  }

  async create(itemInput, { commandId, actorId, at = new Date().toISOString() } = {}) {
    const item = assertNewWorkItem(itemInput);
    const command = validateCommand({ commandId, actorId, at });
    const requestDigest = workItemCreateDigest(item, command.actorId);
    try {
      return await this.#transaction(async (client) => {
        const replay = await findReplay(client, command.commandId, requestDigest);
        if (replay) return replay;
        await client.query(
          `INSERT INTO agent_work_os_work_items_v1
             (id, organization_id, project_id, title, description, status, version, created_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'backlog', 1, $6, $7, $7)`,
          [item.id, item.organizationId, item.projectId, item.title, item.description, item.createdBy, item.createdAt]
        );
        await insertEvent(client, {
          workItemId: item.id, commandId: command.commandId, actorId: command.actorId, version: 1,
          fromStatus: null, toStatus: "backlog", requestDigest, reason: null, result: item, at: command.at
        });
        return { workItem: item, replayed: false };
      });
    } catch (error) {
      const replay = await this.#replayAfterRace(command.commandId, requestDigest);
      if (replay) return replay;
      if (error.code === "23505" && error.constraint?.includes("work_items_v1_pkey")) {
        const conflict = new Error(`work_item_already_exists:${item.id}`);
        conflict.code = "work_item_already_exists";
        throw conflict;
      }
      throw error;
    }
  }

  async get(id, organizationId) {
    assertCanonicalId("work", id, "id");
    assertCanonicalId("org", organizationId, "organizationId");
    const result = await this.pool.query("SELECT * FROM agent_work_os_work_items_v1 WHERE id = $1 AND organization_id = $2", [id, organizationId]);
    return result.rows[0] ? rowToWorkItem(result.rows[0]) : null;
  }

  async listByOrganization(organizationId) {
    assertCanonicalId("org", organizationId, "organizationId");
    const result = await this.pool.query(
      "SELECT * FROM agent_work_os_work_items_v1 WHERE organization_id = $1 ORDER BY updated_at DESC, id",
      [organizationId]
    );
    return result.rows.map(rowToWorkItem);
  }

  async transition(id, { organizationId, commandId, actorId, expectedVersion, to, reason = null, at = new Date().toISOString() } = {}) {
    assertCanonicalId("work", id, "id");
    assertCanonicalId("org", organizationId, "organizationId");
    validateReason(reason);
    const command = validateCommand({ commandId, actorId, at });
    const requestDigest = canonicalDigest({ operation: "transition", id, organizationId, actorId: command.actorId, expectedVersion, to, reason });
    try {
      return await this.#transaction(async (client) => {
        const replay = await findReplay(client, command.commandId, requestDigest);
        if (replay) return replay;
        const selected = await client.query("SELECT * FROM agent_work_os_work_items_v1 WHERE id = $1 AND organization_id = $2 FOR UPDATE", [id, organizationId]);
        if (!selected.rows[0]) return null;
        const current = rowToWorkItem(selected.rows[0]);
        let updated;
        try {
          updated = transitionWorkItem(current, { to, expectedVersion, at: command.at });
        } catch (error) {
          if (error.code === "work_item_version_conflict") {
            throw new OptimisticConcurrencyError({ workItemId: id, expectedVersion, actualVersion: current.version });
          }
          throw error;
        }
        const result = await client.query(
          `UPDATE agent_work_os_work_items_v1
             SET status = $1, version = $2, updated_at = $3
           WHERE id = $4 AND version = $5
           RETURNING id`,
          [updated.status, updated.version, updated.updatedAt, id, expectedVersion]
        );
        if (result.rowCount !== 1) throw new OptimisticConcurrencyError({ workItemId: id, expectedVersion, actualVersion: current.version });
        await insertEvent(client, {
          workItemId: id, commandId: command.commandId, actorId: command.actorId, version: updated.version,
          fromStatus: current.status, toStatus: updated.status, requestDigest, reason, result: updated, at: command.at
        });
        return { workItem: updated, replayed: false };
      });
    } catch (error) {
      const replay = await this.#replayAfterRace(command.commandId, requestDigest);
      if (replay) return replay;
      throw error;
    }
  }

  async listEvents(id, organizationId) {
    assertCanonicalId("work", id, "id");
    assertCanonicalId("org", organizationId, "organizationId");
    const result = await this.pool.query(
      `SELECT event.* FROM agent_work_os_work_item_events_v1 AS event
       JOIN agent_work_os_work_items_v1 AS item ON item.id = event.work_item_id
       WHERE event.work_item_id = $1 AND item.organization_id = $2 ORDER BY event.version`,
      [id, organizationId]
    );
    return result.rows.map(rowToEvent);
  }

  async #transaction(operation) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  async #replayAfterRace(commandId, requestDigest) {
    const result = await this.pool.query("SELECT * FROM agent_work_os_work_item_events_v1 WHERE command_id = $1", [commandId]);
    if (!result.rows[0]) return null;
    const event = rowToEvent(result.rows[0]);
    if (event.requestDigest !== requestDigest) throw new IdempotencyConflictError(commandId);
    return { workItem: event.result, replayed: true };
  }
}

// Compatibility adapter: use the current atomic JSON state file until the caller opts into the
// row/event Postgres repository. Existing machine, session and Shipping Run paths are unchanged.
export class JsonWorkItemRepository extends WorkItemRepository {
  constructor(jsonStore) {
    super();
    if (!jsonStore || !jsonStore.state || typeof jsonStore.persistWorkItemState !== "function") {
      throw new Error("json_store_work_item_compatibility_adapter_required");
    }
    this.store = jsonStore;
  }
  create(item, command) { return this.store.createWorkItem(item, command); }
  get(id, organizationId) {
    assertCanonicalId("work", id, "id");
    assertCanonicalId("org", organizationId, "organizationId");
    return this.store.getWorkItem(id, organizationId);
  }
  listByOrganization(id) {
    assertCanonicalId("org", id, "organizationId");
    return this.store.listWorkItemsByOrganization(id);
  }
  transition(id, command) { return this.store.transitionWorkItem(id, command); }
  listEvents(id, organizationId) {
    assertCanonicalId("work", id, "id");
    assertCanonicalId("org", organizationId, "organizationId");
    return this.store.listWorkItemEvents(id, organizationId);
  }
}

export function createWorkItemRepository(jsonStore) {
  return jsonStore.pool ? new PostgresWorkItemRepository(jsonStore.pool) : new JsonWorkItemRepository(jsonStore);
}

async function insertEvent(client, event) {
  await client.query(
    `INSERT INTO agent_work_os_work_item_events_v1
       (event_id, work_item_id, command_id, actor_id, version, from_status, to_status, request_digest, reason, result, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)`,
    [createCanonicalId("event"), event.workItemId, event.commandId, event.actorId, event.version,
      event.fromStatus, event.toStatus, event.requestDigest, event.reason, JSON.stringify(event.result), event.at]
  );
}

async function findReplay(client, commandId, requestDigest) {
  const result = await client.query("SELECT * FROM agent_work_os_work_item_events_v1 WHERE command_id = $1", [commandId]);
  if (!result.rows[0]) return null;
  const event = rowToEvent(result.rows[0]);
  if (event.requestDigest !== requestDigest) throw new IdempotencyConflictError(commandId);
  return { workItem: event.result, replayed: true };
}

function validateCommand({ commandId, actorId, at }) {
  assertCanonicalId("command", commandId, "commandId");
  if (!["user", "agent", "service"].some((kind) => actorId?.startsWith(`${kind}_`))) {
    throw new Error("work_item_actor_id_invalid");
  }
  const kind = actorId.split("_", 1)[0];
  assertCanonicalId(kind, actorId, "actorId");
  if (!Number.isFinite(Date.parse(at))) throw new Error("work_item_timestamp_invalid");
  return { commandId, actorId, at };
}

function validateReason(reason) {
  if (reason !== null && (typeof reason !== "string" || reason.length > 2_000)) {
    throw new DomainValidationError("work_item_reason_invalid");
  }
}

function rowToWorkItem(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function rowToEvent(row) {
  return {
    eventId: row.event_id,
    workItemId: row.work_item_id,
    commandId: row.command_id,
    actorId: row.actor_id,
    version: Number(row.version),
    fromStatus: row.from_status,
    toStatus: row.to_status,
    requestDigest: row.request_digest,
    reason: row.reason,
    result: row.result,
    occurredAt: new Date(row.occurred_at).toISOString()
  };
}
