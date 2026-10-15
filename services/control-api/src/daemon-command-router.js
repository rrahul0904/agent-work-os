import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { encodeMessage } from "../../../packages/protocol/src/index.js";

const MIGRATION_URL = new URL("../../../migrations/008_daemon_commands.sql", import.meta.url);

export class PostgresDaemonCommandRouter {
  constructor(pool, { getConnectedMachineIds, getPeer, onAcknowledged = async () => {}, onError = console.warn, pollIntervalMs = 100, leaseMs = 15_000 } = {}) {
    if (!pool || typeof getConnectedMachineIds !== "function" || typeof getPeer !== "function") {
      throw new Error("daemon_command_router_configuration_invalid");
    }
    this.pool = pool;
    this.getConnectedMachineIds = getConnectedMachineIds;
    this.getPeer = getPeer;
    this.onAcknowledged = onAcknowledged;
    this.onError = onError;
    this.pollIntervalMs = pollIntervalMs;
    this.leaseMs = leaseMs;
    this.instanceId = crypto.randomUUID();
    this.timer = null;
    this.polling = false;
    this.closed = false;
  }

  async start() {
    const migration = await readFile(MIGRATION_URL, "utf8");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["agent_work_os_daemon_commands_v1"]);
      await client.query(migration);
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }
    this.timer = setInterval(() => void this.#poll(), this.pollIntervalMs);
    this.timer.unref?.();
    void this.#poll();
  }

  async enqueue(machineId, command) {
    if (this.closed) throw new Error("daemon_command_router_closed");
    const commandId = command.commandId;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(commandId ?? "")) {
      throw new Error("daemon_command_id_invalid");
    }
    await this.pool.query(
      `INSERT INTO agent_work_os_daemon_commands_v1 (command_id, machine_id, payload)
       VALUES ($1, $2, $3::jsonb) ON CONFLICT (command_id) DO NOTHING`,
      [commandId, machineId, JSON.stringify(command)]
    );
    return commandId;
  }

  async acknowledge(machineId, { commandId, ok, error = null }) {
    if (typeof ok !== "boolean") return false;
    const result = await this.pool.query(
      `UPDATE agent_work_os_daemon_commands_v1
       SET status = $1, ack_error = $2, lease_expires_at = NULL,
           ack_reconciliation_status = $6,
           ack_reconciliation_owner_instance_id = NULL,
           ack_reconciliation_lease_expires_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE command_id = $3 AND machine_id = $4 AND status = 'dispatching' AND owner_instance_id = $5
       RETURNING payload`,
      [ok ? "acked" : "failed", ok ? null : String(error ?? "daemon_command_failed").slice(0, 2_000), commandId, machineId, this.instanceId, ok ? "complete" : "pending"]
    );
    if (!result.rowCount) return false;
    return true;
  }

  async close() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    while (this.polling) await new Promise((resolve) => setTimeout(resolve, 5));
    await this.pool.query(
      `UPDATE agent_work_os_daemon_commands_v1
       SET status = 'pending', owner_instance_id = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE status = 'dispatching' AND owner_instance_id = $1`,
      [this.instanceId]
    );
    await this.pool.query(
      `UPDATE agent_work_os_daemon_commands_v1
       SET ack_reconciliation_status = 'pending', ack_reconciliation_owner_instance_id = NULL,
           ack_reconciliation_lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE ack_reconciliation_status = 'processing' AND ack_reconciliation_owner_instance_id = $1`,
      [this.instanceId]
    );
  }

  async #poll() {
    if (this.closed || this.polling) return;
    const machineIds = [...new Set(this.getConnectedMachineIds())];
    this.polling = true;
    try {
      await this.#reconcileAcknowledgements();
      if (!machineIds.length) return;
      await this.pool.query(
        `UPDATE agent_work_os_daemon_commands_v1
         SET status = 'pending', owner_instance_id = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE status = 'dispatching' AND lease_expires_at <= CURRENT_TIMESTAMP`
      );
      const client = await this.pool.connect();
      let commands;
      try {
        await client.query("BEGIN");
        const selected = await client.query(
          `SELECT command_id, machine_id, payload
           FROM agent_work_os_daemon_commands_v1
           WHERE status = 'pending' AND machine_id = ANY($1::text[])
           ORDER BY created_at, command_id
           LIMIT 50 FOR UPDATE SKIP LOCKED`,
          [machineIds]
        );
        commands = selected.rows;
        if (commands.length) {
          await client.query(
            `UPDATE agent_work_os_daemon_commands_v1
             SET status = 'dispatching', owner_instance_id = $1,
                 lease_expires_at = CURRENT_TIMESTAMP + ($2 * INTERVAL '1 millisecond'),
                 updated_at = CURRENT_TIMESTAMP
             WHERE command_id = ANY($3::uuid[])`,
            [this.instanceId, this.leaseMs, commands.map((row) => row.command_id)]
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        throw error;
      } finally {
        client.release();
      }
      for (const row of commands ?? []) {
        const peer = this.getPeer(row.machine_id);
        try {
          if (!peer || peer.closed) throw new Error("machine_connection_unavailable");
          peer.send(encodeMessage(row.payload));
        } catch (error) {
          await this.pool.query(
            `UPDATE agent_work_os_daemon_commands_v1
             SET status = 'pending', owner_instance_id = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE command_id = $1 AND owner_instance_id = $2 AND status = 'dispatching'`,
            [row.command_id, this.instanceId]
          );
          this.onError(`[api] daemon command dispatch failed for ${row.command_id}: ${error.message}`);
        }
      }
    } catch (error) {
      this.onError(`[api] daemon command poll failed: ${error.message}`);
    } finally {
      this.polling = false;
    }
  }

  async #reconcileAcknowledgements() {
    await this.pool.query(
      `UPDATE agent_work_os_daemon_commands_v1
       SET ack_reconciliation_status = 'pending', ack_reconciliation_owner_instance_id = NULL,
           ack_reconciliation_lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE status = 'failed' AND ack_reconciliation_status = 'processing'
         AND ack_reconciliation_lease_expires_at <= CURRENT_TIMESTAMP`
    );
    const client = await this.pool.connect();
    let commands;
    try {
      await client.query("BEGIN");
      const selected = await client.query(
        `SELECT command_id, payload, ack_error
         FROM agent_work_os_daemon_commands_v1
         WHERE status = 'failed' AND ack_reconciliation_status = 'pending'
         ORDER BY updated_at, command_id
         LIMIT 50 FOR UPDATE SKIP LOCKED`
      );
      commands = selected.rows;
      if (commands.length) {
        await client.query(
          `UPDATE agent_work_os_daemon_commands_v1
           SET ack_reconciliation_status = 'processing', ack_reconciliation_owner_instance_id = $1,
               ack_reconciliation_lease_expires_at = CURRENT_TIMESTAMP + ($2 * INTERVAL '1 millisecond'),
               updated_at = CURRENT_TIMESTAMP
           WHERE command_id = ANY($3::uuid[])`,
          [this.instanceId, this.leaseMs, commands.map((row) => row.command_id)]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }
    for (const row of commands ?? []) {
      try {
        await this.onAcknowledged(row.payload, { ok: false, error: row.ack_error });
        await this.pool.query(
          `UPDATE agent_work_os_daemon_commands_v1
           SET ack_reconciliation_status = 'complete', ack_reconciliation_owner_instance_id = NULL,
               ack_reconciliation_lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE command_id = $1 AND status = 'failed' AND ack_reconciliation_owner_instance_id = $2
             AND ack_reconciliation_status = 'processing'`,
          [row.command_id, this.instanceId]
        );
      } catch (error) {
        this.onError(`[api] daemon command acknowledgement reconciliation failed for ${row.command_id}: ${error.message}`);
      }
    }
  }
}
