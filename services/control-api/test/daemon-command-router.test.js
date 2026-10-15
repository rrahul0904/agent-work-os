import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import pg from "pg";
import { PostgresDaemonCommandRouter } from "../src/daemon-command-router.js";

const { Pool } = pg;
const databaseUrl = process.env.AGENT_WORK_OS_TEST_DATABASE_URL;

test("daemon command migration serializes concurrent startup and reconciles legacy failures", { skip: !databaseUrl }, async () => {
  const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
  const schema = `awos_commands_${crypto.randomBytes(6).toString("hex")}`;
  let poolA;
  let poolB;
  let routerA;
  let routerB;
  const reconciled = [];
  try {
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    const poolOptions = { connectionString: databaseUrl, options: `-c search_path=${schema}`, max: 2 };
    poolA = new Pool(poolOptions);
    poolB = new Pool(poolOptions);
    await poolA.query(`
      CREATE TABLE agent_work_os_machines_v1 (machine_id TEXT PRIMARY KEY);
      CREATE TABLE agent_work_os_daemon_commands_v1 (
        command_id UUID PRIMARY KEY,
        machine_id TEXT NOT NULL REFERENCES agent_work_os_machines_v1(machine_id) ON DELETE CASCADE,
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatching', 'acked', 'failed')),
        owner_instance_id UUID,
        lease_expires_at TIMESTAMPTZ,
        ack_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO agent_work_os_machines_v1 (machine_id) VALUES ('legacy-machine');
    `);
    const legacyCommandId = crypto.randomUUID();
    await poolA.query(
      `INSERT INTO agent_work_os_daemon_commands_v1 (command_id, machine_id, payload, status, ack_error)
       VALUES ($1, 'legacy-machine', $2::jsonb, 'failed', 'legacy_failure')`,
      [legacyCommandId, JSON.stringify({ type: "server.command", commandId: legacyCommandId, action: "session.start", sessionId: "legacy-session" })]
    );
    const routerOptions = {
      getConnectedMachineIds: () => [],
      getPeer: () => null,
      pollIntervalMs: 20,
      leaseMs: 1_000,
      onAcknowledged: async (command, receipt) => { reconciled.push([command.commandId, receipt.error]); },
      onError: () => {}
    };
    routerA = new PostgresDaemonCommandRouter(poolA, routerOptions);
    routerB = new PostgresDaemonCommandRouter(poolB, routerOptions);
    await Promise.all([routerA.start(), routerB.start()]);

    await waitFor(async () => {
      const result = await poolA.query(
        "SELECT ack_reconciliation_status FROM agent_work_os_daemon_commands_v1 WHERE command_id = $1", [legacyCommandId]
      );
      return result.rows[0]?.ack_reconciliation_status === "complete" && reconciled.length === 1;
    }, 3_000, "legacy failed command reconciliation");
    assert.deepEqual(reconciled[0], [legacyCommandId, "legacy_failure"]);

    const rollingCommandId = crypto.randomUUID();
    await poolA.query(
      `INSERT INTO agent_work_os_daemon_commands_v1
         (command_id, machine_id, payload, status, owner_instance_id, lease_expires_at)
       VALUES ($1, 'legacy-machine', $2::jsonb, 'dispatching', $3, CURRENT_TIMESTAMP + INTERVAL '1 minute')`,
      [rollingCommandId, JSON.stringify({ type: "server.command", commandId: rollingCommandId, action: "session.start", sessionId: "rolling-session" }), crypto.randomUUID()]
    );
    await poolA.query(
      "UPDATE agent_work_os_daemon_commands_v1 SET status = 'failed', ack_error = 'rolling_failure' WHERE command_id = $1",
      [rollingCommandId]
    );
    await waitFor(async () => {
      const result = await poolA.query(
        "SELECT ack_reconciliation_status FROM agent_work_os_daemon_commands_v1 WHERE command_id = $1", [rollingCommandId]
      );
      return result.rows[0]?.ack_reconciliation_status === "complete" && reconciled.length === 2;
    }, 3_000, "old API acknowledgement reconciliation during rolling deployment");
    assert.deepEqual(reconciled[1], [rollingCommandId, "rolling_failure"]);
  } finally {
    await routerA?.close();
    await routerB?.close();
    await poolA?.end();
    await poolB?.end();
    await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await adminPool.end();
  }
});

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`timed out waiting for ${label}`);
}
