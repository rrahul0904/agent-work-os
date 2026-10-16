import assert from "node:assert/strict";
import crypto from "node:crypto";
import net from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import pg from "pg";
import { createCanonicalId } from "../../../packages/domain/src/index.js";
import { PROTOCOL_VERSION, encodeMessage } from "../../../packages/protocol/src/index.js";

const { Pool } = pg;
const databaseUrl = process.env.AGENT_WORK_OS_TEST_DATABASE_URL;
const root = path.resolve(new URL("../../..", import.meta.url).pathname);

test("production identity, machine credentials, scoped sessions, WorkItem tenancy, CSRF, and WebSocket scope", { skip: !databaseUrl }, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-identity-"));
  const port = await getAvailablePort();
  const replicaPort = await getAvailablePort();
  const origin = `http://127.0.0.1:${port}`;
  const emailTag = crypto.randomUUID();
  const ipBytes = crypto.randomBytes(2);
  const testClientIp = `198.18.${ipBytes[0]}.${ipBytes[1]}`;
  const authHeaders = { "content-type": "application/json", "x-forwarded-for": testClientIp };
  const ownerEmail = `owner-${emailTag}@example.test`;
  const viewerEmail = `viewer-${emailTag}@example.test`;
  const guestEmail = `guest-${emailTag}@example.test`;
  const databaseInspector = new Pool({ connectionString: databaseUrl, max: 1 });
  const serverEnv = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    AGENT_WORK_OS_HOST: "127.0.0.1",
    AGENT_WORK_OS_TOKEN: "",
    AGENT_WORK_OS_TRUST_PROXY: "true",
    DATABASE_URL: databaseUrl,
    AGENT_WORK_OS_STATE_PATH: path.join(temp, "state.json")
  };
  let child;
  let replicaChild;
  const logs = [];
  const startServer = async () => {
    child = spawn(process.execPath, ["services/control-api/src/index.js"], { cwd: root, env: serverEnv, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (data) => logs.push(String(data)));
    child.stderr.on("data", (data) => logs.push(String(data)));
    await waitFor(async () => {
      try { return (await fetch(`${origin}/readyz`)).ok; } catch { return false; }
    }, 15_000, "API readiness");
  };
  const stopServer = async () => {
    if (!child || child.exitCode !== null) return;
    const current = child;
    current.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => current.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    if (current.exitCode === null) current.kill("SIGKILL");
  };
  const startReplica = async () => {
    replicaChild = spawn(process.execPath, ["services/control-api/src/index.js"], {
      cwd: root,
      env: { ...serverEnv, PORT: String(replicaPort), AGENT_WORK_OS_STATE_PATH: path.join(temp, "replica-state.json") },
      stdio: ["ignore", "pipe", "pipe"]
    });
    replicaChild.stdout.on("data", (data) => logs.push(String(data)));
    replicaChild.stderr.on("data", (data) => logs.push(String(data)));
    replicaChild.on("exit", (code, signal) => logs.push(`[replica] exited code=${code} signal=${signal}\n`));
    await waitFor(async () => {
      try { return (await fetch(`http://127.0.0.1:${replicaPort}/readyz`)).ok; } catch { return false; }
    }, 15_000, "replica API readiness");
  };
  const stopReplica = async () => {
    if (!replicaChild || replicaChild.exitCode !== null) return;
    const current = replicaChild;
    current.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => current.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    if (current.exitCode === null) current.kill("SIGKILL");
  };
  const register = async (email, organizationName) => {
    const response = await fetch(`${origin}/api/auth/register`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ email, password: "correct horse battery staple", organizationName })
    });
    return { response, body: await response.json(), cookies: getCookies(response) };
  };
  const api = (cookies, csrfToken, pathname, { method = "GET", body, headers = {} } = {}) => fetch(`${origin}${pathname}`, {
    method,
    headers: {
      ...(cookies ? { cookie: cookies } : {}),
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });

  try {
    await waitForPostgres();
    await startServer();
    const expiredEventKey = `expired-${crypto.randomUUID()}`;
    await databaseInspector.query(
      "INSERT INTO agent_work_os_realtime_events_v1 (event_key, origin_id, event, created_at) VALUES ($1, 'test', $2::jsonb, clock_timestamp() - INTERVAL '8 days')",
      [expiredEventKey, JSON.stringify({ type: "test.expired" })]
    );
    await startReplica();
    const expiredEvent = await databaseInspector.query("SELECT 1 FROM agent_work_os_realtime_events_v1 WHERE event_key = $1", [expiredEventKey]);
    assert.equal(expiredEvent.rowCount, 0, "event fan-out storage prunes records older than seven days");
    assert.equal((await fetch(`${origin}/api/state`, { headers: { authorization: "Bearer daemon-only-test-secret" } })).status, 401,
      "the daemon credential must not authenticate customer REST requests");
    assert.equal((await fetch(`${origin}/api/state`, { headers: { origin: "https://evil.example" } })).status, 403,
      "unlisted browser origins must be rejected");
    const malformed = await fetch(`${origin}/api/auth/register`, { method: "POST", headers: authHeaders, body: "{" });
    assert.equal(malformed.status, 400, "malformed JSON is rejected as a client error");
    const weakPassword = await fetch(`${origin}/api/auth/register`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ email: `weak-${emailTag}@example.test`, password: "short", organizationName: "Weak" })
    });
    assert.equal(weakPassword.status, 400, "weak credentials are rejected");

    const rateIpBytes = crypto.randomBytes(2);
    const rateLimitIp = `198.19.${rateIpBytes[0]}.${rateIpBytes[1]}`;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const limited = await fetch(`${origin}/api/auth/register`, {
        method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": rateLimitIp }, body: "{"
      });
      assert.equal(limited.status, 400);
    }
    const rateLimited = await fetch(`${origin}/api/auth/register`, {
      method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": rateLimitIp }, body: "{"
    });
    assert.equal(rateLimited.status, 429, "registration attempts are rate-limited across API requests");
    assert.ok(Number(rateLimited.headers.get("retry-after")) > 0);

    const owner = await register(ownerEmail, "Alpha Org");
    assert.equal(owner.response.status, 201, JSON.stringify(owner.body));
    const otherTenant = await register(`other-${emailTag}@example.test`, "Other Org");
    assert.equal(otherTenant.response.status, 201, JSON.stringify(otherTenant.body));
    const ownerSetCookies = owner.response.headers.getSetCookie().join("\n");
    assert.match(ownerSetCookies, /awos_session=[0-9a-f]{64}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=\d+; Secure/);
    assert.match(ownerSetCookies, /awos_csrf=[0-9a-f]{64}; Path=\/; SameSite=Strict; Max-Age=\d+; Secure/);
    assert.equal(owner.body.user.email, ownerEmail);
    assert.equal(owner.body.memberships[0].role, "owner");
    const duplicateAccount = await fetch(`${origin}/api/auth/register`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ email: ownerEmail, password: "correct horse battery staple", organizationName: "Duplicate" })
    });
    assert.equal(duplicateAccount.status, 409);
    const wrongPassword = await fetch(`${origin}/api/auth/login`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ email: ownerEmail, password: "incorrect password" })
    });
    assert.equal(wrongPassword.status, 401);

    const ownerOrgsResponse = await api(owner.cookies, null, "/api/organizations");
    const ownerOrgs = await ownerOrgsResponse.json();
    assert.equal(ownerOrgsResponse.status, 200);
    const alphaId = owner.body.organization.id;
    assert.equal(ownerOrgs.organizations[0].organizationId, alphaId);

    const noCsrf = await api(owner.cookies, null, "/api/work-items", {
      method: "POST", body: { id: createCanonicalId("work"), commandId: createCanonicalId("command"), organizationId: alphaId, title: "Denied without CSRF" }
    });
    assert.equal(noCsrf.status, 403);

    const workItemId = createCanonicalId("work");
    const created = await api(owner.cookies, owner.body.csrfToken, "/api/work-items", {
      method: "POST", body: { id: workItemId, commandId: createCanonicalId("command"), organizationId: alphaId, title: "Alpha confidential item" }
    });
    const createdBody = await created.json();
    assert.equal(created.status, 201, JSON.stringify(createdBody));
    assert.equal(createdBody.workItem.createdBy, owner.body.user.id);

    const taskResponse = await api(owner.cookies, owner.body.csrfToken, `/api/work-items/${encodeURIComponent(workItemId)}/tasks`, {
      method: "POST", body: { id: createCanonicalId("task"), organizationId: alphaId, commandId: createCanonicalId("command"), title: "Run a coding task", description: "Persist one execution attempt" }
    });
    const createdTask = await taskResponse.json();
    assert.equal(taskResponse.status, 201, JSON.stringify(createdTask));
    assert.equal(createdTask.task.status, "READY");
    const foreignTaskRead = await api(otherTenant.cookies, null, `/api/tasks/${encodeURIComponent(createdTask.task.id)}?organizationId=${encodeURIComponent(alphaId)}`);
    assert.equal(foreignTaskRead.status, 404, "a different organization cannot read the Task");
    const taskRunCommandId = createCanonicalId("command");
    const taskRunId = createCanonicalId("run");
    const taskRunResponse = await api(owner.cookies, owner.body.csrfToken, `/api/tasks/${encodeURIComponent(createdTask.task.id)}/runs`, {
      method: "POST", body: { organizationId: alphaId, runId: taskRunId, commandId: taskRunCommandId }
    });
    const createdTaskRun = await taskRunResponse.json();
    assert.equal(taskRunResponse.status, 201, JSON.stringify(createdTaskRun));
    assert.equal(createdTaskRun.run.attempt, 1);
    assert.equal(createdTaskRun.run.status, "QUEUED");
    assert.equal(createdTaskRun.task.status, "READY", "a queued Run has not been claimed by a worker");
    const duplicateTaskRun = await api(owner.cookies, owner.body.csrfToken, `/api/tasks/${encodeURIComponent(createdTask.task.id)}/runs`, {
      method: "POST", body: { organizationId: alphaId, runId: taskRunId, commandId: taskRunCommandId }
    });
    assert.equal(duplicateTaskRun.status, 200, "repeated Run command returns its stored outcome");
    assert.equal((await duplicateTaskRun.json()).run.id, createdTaskRun.run.id);
    const forgedTaskRunCompletion = await api(owner.cookies, owner.body.csrfToken, `/api/runs/${encodeURIComponent(createdTaskRun.run.id)}/transitions`, {
      method: "POST", body: { organizationId: alphaId, commandId: createCanonicalId("command"), expectedVersion: 1, to: "SUCCEEDED" }
    });
    assert.equal(forgedTaskRunCompletion.status, 403, "users cannot fabricate worker-managed Run lifecycle transitions");
    const cancelTaskRun = await api(owner.cookies, owner.body.csrfToken, `/api/runs/${encodeURIComponent(createdTaskRun.run.id)}/transitions`, {
      method: "POST", body: { organizationId: alphaId, commandId: createCanonicalId("command"), expectedVersion: 1, to: "CANCELLED" }
    });
    assert.equal(cancelTaskRun.status, 200);
    assert.equal((await cancelTaskRun.json()).run.status, "CANCELLED");
    const taskRunEvents = await api(owner.cookies, null, `/api/runs/${encodeURIComponent(createdTaskRun.run.id)}/events?organizationId=${encodeURIComponent(alphaId)}`);
    assert.equal((await taskRunEvents.json()).events.length, 2);

    const machineId = crypto.randomUUID();
    const credentialResponse = await api(owner.cookies, owner.body.csrfToken, `/api/organizations/${alphaId}/machine-credentials`, {
      method: "POST", body: { machineId, name: "Alpha executor" }
    });
    const credentialBody = await credentialResponse.json();
    assert.equal(credentialResponse.status, 201, JSON.stringify(credentialBody));
    const machineCredential = credentialBody.credential;
    assert.match(machineCredential.token, /^[0-9a-f]{64}$/);
    const machineSocket = await openMachineSocket(port, machineCredential.token, machineId);
    let replacementMachineSocket;
    let alphaSessionId;
    let alphaShippingRunId;
    let rotatedMachineToken;
    try {
      await waitFor(async () => {
        const response = await api(owner.cookies, null, `/api/machines?organizationId=${encodeURIComponent(alphaId)}`);
        const body = await response.json();
        return response.ok && body.machines.some((machine) => machine.id === machineId && machine.organizationId === alphaId);
      }, 3_000, "organization-bound machine authentication");
      await stopReplica();
      await startReplica();
      const machineAfterReplicaRestart = await api(owner.cookies, null, `/api/machines?organizationId=${encodeURIComponent(alphaId)}`);
      const machinesAfterReplicaRestart = await machineAfterReplicaRestart.json();
      assert.equal(machinesAfterReplicaRestart.machines.find((machine) => machine.id === machineId)?.status, "online",
        "starting another API instance does not mark a recently active machine offline");
      const replicaSessionResponse = await fetch(`http://127.0.0.1:${replicaPort}/api/sessions`, {
        method: "POST",
        headers: { cookie: owner.cookies, "x-csrf-token": owner.body.csrfToken, "content-type": "application/json" },
        body: JSON.stringify({ organizationId: alphaId, machineId, cwd: "/tmp", agent: "echo", prompt: "route through the other API instance" })
      });
      const replicaSession = await replicaSessionResponse.json();
      assert.equal(replicaSessionResponse.status, 201, JSON.stringify(replicaSession));
      const routedCommand = await machineSocket.readMessage();
      assert.equal(routedCommand.type, "server.command");
      assert.equal(routedCommand.sessionId, replicaSession.id, "a command submitted on the replica reaches the daemon connected to the primary instance");
      machineSocket.sendMessage({ type: "daemon.command.ack", machineId, commandId: routedCommand.commandId, ok: false, error: "agent_unavailable" });
      await waitFor(async () => {
        const [result, failedSessionResponse] = await Promise.all([
          databaseInspector.query("SELECT status, ack_error FROM agent_work_os_daemon_commands_v1 WHERE command_id = $1", [routedCommand.commandId]),
          api(owner.cookies, null, `/api/sessions/${encodeURIComponent(replicaSession.id)}?organizationId=${encodeURIComponent(alphaId)}`)
        ]);
        const failedSession = await failedSessionResponse.json();
        return result.rows[0]?.status === "failed" && failedSession.status === "failed";
      }, 2_000, "routed daemon rejection persists and fails the queued session");
      const rejectedCommand = await databaseInspector.query(
        "SELECT status, ack_error, ack_reconciliation_status FROM agent_work_os_daemon_commands_v1 WHERE command_id = $1", [routedCommand.commandId]
      );
      assert.equal(rejectedCommand.rows[0]?.ack_error, "agent_unavailable");
      assert.equal(rejectedCommand.rows[0]?.ack_reconciliation_status, "complete");
      await databaseInspector.query(
        `UPDATE agent_work_os_sessions_v1
         SET status = 'queued', record = jsonb_set(record, '{status}', '"queued"'::jsonb)
         WHERE session_id = $1`, [replicaSession.id]
      );
      await databaseInspector.query(
        `UPDATE agent_work_os_daemon_commands_v1
         SET status = 'dispatching', owner_instance_id = $2,
             ack_reconciliation_status = 'complete', ack_reconciliation_owner_instance_id = NULL,
             ack_reconciliation_lease_expires_at = NULL
         WHERE command_id = $1`, [routedCommand.commandId, crypto.randomUUID()]
      );
      await databaseInspector.query(
        `UPDATE agent_work_os_daemon_commands_v1
         SET status = 'failed', ack_error = 'agent_unavailable'
         WHERE command_id = $1`, [routedCommand.commandId]
      );
      await waitFor(async () => {
        const [commandState, sessionResponse] = await Promise.all([
          databaseInspector.query("SELECT ack_reconciliation_status FROM agent_work_os_daemon_commands_v1 WHERE command_id = $1", [routedCommand.commandId]),
          api(owner.cookies, null, `/api/sessions/${encodeURIComponent(replicaSession.id)}?organizationId=${encodeURIComponent(alphaId)}`)
        ]);
        const recoveredSession = await sessionResponse.json();
        return commandState.rows[0]?.ack_reconciliation_status === "complete" && recoveredSession.status === "failed";
      }, 2_000, "durable acknowledgement reconciliation retries after an interrupted resource update");
      const reconciledEvents = await databaseInspector.query(
        `SELECT count(*)::int AS count
         FROM agent_work_os_sessions_v1, jsonb_array_elements(record->'events') AS event
         WHERE session_id = $1 AND event->>'commandId' = $2`, [replicaSession.id, routedCommand.commandId]
      );
      assert.equal(reconciledEvents.rows[0]?.count, 1, "replayed reconciliation does not duplicate session failure events");

      const createdSessionResponse = await api(owner.cookies, owner.body.csrfToken, "/api/sessions", {
        method: "POST", body: { organizationId: alphaId, machineId, cwd: "/tmp", agent: "echo", prompt: "tenant-scoped session" }
      });
      const createdSession = await createdSessionResponse.json();
      assert.equal(createdSessionResponse.status, 201, JSON.stringify(createdSession));
      assert.equal(createdSession.organizationId, alphaId);
      assert.equal(createdSession.createdBy, owner.body.user.id);
      alphaSessionId = createdSession.id;
      const machineCommand = await machineSocket.readMessage();
      assert.equal(machineCommand.action, "session.start");
      const globalSnapshotBeforeSessionUpdates = await databaseInspector.query(
        "SELECT payload FROM agent_work_os_state_v1 WHERE state_key = 'global'"
      );
      const sessionMessage = await api(owner.cookies, owner.body.csrfToken, `/api/sessions/${encodeURIComponent(createdSession.id)}/messages`, {
        method: "POST", body: { text: "continue the tenant-scoped task" }
      });
      assert.equal(sessionMessage.status, 202);
      const messageCommand = await machineSocket.readMessage();
      assert.equal(messageCommand.action, "session.message");
      const concurrentMessages = await Promise.all(["parallel update A", "parallel update B"].map((text) => api(owner.cookies, owner.body.csrfToken, `/api/sessions/${encodeURIComponent(createdSession.id)}/messages`, {
        method: "POST", body: { text }
      })));
      assert.ok(concurrentMessages.every((response) => response.status === 202), "concurrent session updates are accepted");
      await machineSocket.readMessage();
      await machineSocket.readMessage();
      const listedSessions = await api(owner.cookies, null, `/api/sessions?organizationId=${encodeURIComponent(alphaId)}`);
      const listedSessionBody = await listedSessions.json();
      assert.equal(listedSessionBody.sessions.find((session) => session.id === createdSession.id).messages.length, 4,
        "concurrent session messages persist without overwriting one another");
      const globalSnapshotAfterSessionUpdates = await databaseInspector.query(
        "SELECT payload FROM agent_work_os_state_v1 WHERE state_key = 'global'"
      );
      assert.deepEqual(globalSnapshotAfterSessionUpdates.rows[0]?.payload, globalSnapshotBeforeSessionUpdates.rows[0]?.payload,
        "machine and session mutations do not replace the shared legacy JSONB snapshot");

      const shippingContractResponse = await api(owner.cookies, null, "/api/shipping/example");
      const shippingContractForOutboxRollback = await shippingContractResponse.json();
      const outboxRollbackPrompt = `outbox rollback ${crypto.randomUUID()}`;
      const outboxRollbackRunId = `outbox-rollback-${crypto.randomUUID()}`;
      await databaseInspector.query(`
        CREATE OR REPLACE FUNCTION awos_test_reject_selected_outbox_command() RETURNS trigger AS $$
        BEGIN
          IF NEW.payload->>'action' = 'session.start'
             AND NEW.payload->'payload'->>'prompt' = '${outboxRollbackPrompt}' THEN
            RAISE EXCEPTION 'test_reject_session_outbox_command';
          END IF;
          IF NEW.payload->>'action' = 'session.message'
             AND NEW.payload->'payload'->>'prompt' = '${outboxRollbackPrompt}' THEN
            RAISE EXCEPTION 'test_reject_session_message_outbox_command';
          END IF;
          IF NEW.payload->>'action' = 'shipping.start'
             AND NEW.payload->'payload'->>'runId' = '${outboxRollbackRunId}' THEN
            RAISE EXCEPTION 'test_reject_shipping_outbox_command';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER awos_test_reject_selected_outbox_command
        BEFORE INSERT ON agent_work_os_daemon_commands_v1
        FOR EACH ROW EXECUTE FUNCTION awos_test_reject_selected_outbox_command();
      `);
      try {
        const rejectedSessionResponse = await api(owner.cookies, owner.body.csrfToken, "/api/sessions", {
          method: "POST", body: { organizationId: alphaId, machineId, cwd: "/tmp", agent: "echo", prompt: outboxRollbackPrompt }
        });
        assert.equal(rejectedSessionResponse.status, 500, "outbox failure rejects the session request");
        const rolledBackSession = await databaseInspector.query(
          "SELECT count(*)::int AS count FROM agent_work_os_sessions_v1 WHERE record->'messages'->0->>'text' = $1", [outboxRollbackPrompt]
        );
        assert.equal(rolledBackSession.rows[0].count, 0, "session creation rolls back when its outbox insert fails");

        const rejectedMessageResponse = await api(owner.cookies, owner.body.csrfToken, `/api/sessions/${encodeURIComponent(createdSession.id)}/messages`, {
          method: "POST", body: { text: outboxRollbackPrompt }
        });
        assert.equal(rejectedMessageResponse.status, 500, "outbox failure rejects the session message request");
        const rolledBackMessage = await databaseInspector.query(
          "SELECT count(*)::int AS count FROM agent_work_os_sessions_v1 WHERE session_id = $1 AND record->'messages' @> $2::jsonb",
          [createdSession.id, JSON.stringify([{ text: outboxRollbackPrompt }])]
        );
        assert.equal(rolledBackMessage.rows[0].count, 0, "session message rolls back when its outbox insert fails");

        const rejectedShippingResponse = await api(owner.cookies, owner.body.csrfToken, "/api/shipping/runs", {
          method: "POST", body: { organizationId: alphaId, machineId, runId: outboxRollbackRunId, contract: shippingContractForOutboxRollback }
        });
        assert.equal(rejectedShippingResponse.status, 500, "outbox failure rejects the shipping request");
        const rolledBackShippingRun = await databaseInspector.query(
          "SELECT count(*)::int AS count FROM agent_work_os_shipping_runs_v1 WHERE run_id = $1", [outboxRollbackRunId]
        );
        assert.equal(rolledBackShippingRun.rows[0].count, 0, "ShippingRun creation rolls back when its outbox insert fails");
      } finally {
        await databaseInspector.query("DROP TRIGGER IF EXISTS awos_test_reject_selected_outbox_command ON agent_work_os_daemon_commands_v1");
        await databaseInspector.query("DROP FUNCTION IF EXISTS awos_test_reject_selected_outbox_command()");
      }

      const shippingContract = shippingContractForOutboxRollback;
      alphaShippingRunId = `tenant-${crypto.randomUUID()}`;
      const createdShippingRunResponse = await api(owner.cookies, owner.body.csrfToken, "/api/shipping/runs", {
        method: "POST", body: { organizationId: alphaId, machineId, runId: alphaShippingRunId, contract: shippingContract }
      });
      const createdShippingRun = await createdShippingRunResponse.json();
      assert.equal(createdShippingRunResponse.status, 202, JSON.stringify(createdShippingRun));
      assert.equal(createdShippingRun.organizationId, alphaId);
      assert.equal(createdShippingRun.createdBy, owner.body.user.id);
      assert.equal((await machineSocket.readMessage()).action, "shipping.start");
      const tenantRunRows = await databaseInspector.query(
        "SELECT organization_id, record FROM agent_work_os_shipping_runs_v1 WHERE run_id = $1", [alphaShippingRunId]
      );
      assert.equal(tenantRunRows.rows[0]?.organization_id, alphaId, "ShippingRun is stored with an organization boundary");
      const legacyRunRow = await databaseInspector.query(
        "SELECT payload #> ARRAY['shippingRuns', $1] AS run FROM agent_work_os_state_v1 WHERE state_key = 'global'", [alphaShippingRunId]
      );
      assert.equal(legacyRunRow.rows[0]?.run, null, "tenant ShippingRun writes do not mutate the legacy global snapshot");
      const listedShippingRunsResponse = await api(owner.cookies, null, `/api/shipping/runs?organizationId=${encodeURIComponent(alphaId)}`);
      const listedShippingRuns = await listedShippingRunsResponse.json();
      assert.equal(listedShippingRunsResponse.status, 200);
      assert.ok(listedShippingRuns.runs.some((run) => run.runId === alphaShippingRunId));
      const scopedShippingRunResponse = await api(owner.cookies, null, `/api/shipping/runs/${encodeURIComponent(alphaShippingRunId)}?organizationId=${encodeURIComponent(alphaId)}`);
      assert.equal(scopedShippingRunResponse.status, 200);
      machineSocket.sendMessage({ type: "daemon.shipping.run", machineId, run: {
        ...createdShippingRun, state: "RUNNING", updatedAt: "2099-01-01T00:00:00.000Z", createdBy: "forged-user", projectId: "forged-project"
      } });
      const firstRunEvent = await waitForShippingRun(api, owner, alphaId, alphaShippingRunId, "RUNNING");
      assert.ok(Date.parse(firstRunEvent.updatedAt) < Date.parse("2099-01-01T00:00:00.000Z"),
        "authenticated daemon events cannot poison tenant ShippingRun ordering with client timestamps");
      assert.equal(firstRunEvent.createdBy, owner.body.user.id, "daemon updates cannot replace the run's creator");
      assert.equal(firstRunEvent.projectId, shippingContract.project.id, "daemon updates cannot replace the run's project provenance");
      machineSocket.sendMessage({ type: "daemon.shipping.run", machineId, run: { ...createdShippingRun, state: "SUCCEEDED", updatedAt: "2000-01-01T00:00:00.000Z" } });
      const secondRunEvent = await waitForShippingRun(api, owner, alphaId, alphaShippingRunId, "SUCCEEDED");
      assert.ok(Date.parse(secondRunEvent.updatedAt) > Date.parse(firstRunEvent.updatedAt),
        `same-run updates keep database-assigned timestamps monotonic (${firstRunEvent.updatedAt} then ${secondRunEvent.updatedAt})`);
      assert.equal(replicaChild.exitCode, null, `replica API exited unexpectedly: ${logs.join("")}`);
      await waitFor(async () => (await fetch(`http://127.0.0.1:${replicaPort}/readyz`)).ok, 2_000, "replica still ready before fanout test");
      let fanoutClient = await openClientSocket(replicaPort, owner.cookies);
      const otherOrgFanoutClient = await openClientSocket(replicaPort, otherTenant.cookies);
      try {
        const ownerSnapshot = await readUntilMessage(fanoutClient, (message) => message.type === "state.snapshot");
        const otherOrgSnapshot = await readUntilMessage(otherOrgFanoutClient, (message) => message.type === "state.snapshot");
        assert.match(ownerSnapshot.cursor, /^[A-Za-z0-9_-]{40,128}$/, "snapshots expose only opaque cursors");
        assert.equal(Object.hasOwn(ownerSnapshot, "eventCursor"), false, "snapshots do not expose database sequence values");
        assert.match(otherOrgSnapshot.cursor, /^[A-Za-z0-9_-]{40,128}$/);
        machineSocket.sendMessage({ type: "daemon.shipping.run", machineId, run: { ...secondRunEvent, state: "RUNNING" } });
        const canonicalFanoutRun = await waitForShippingRun(api, owner, alphaId, alphaShippingRunId, "RUNNING");
        const replicatedEvent = await readUntilMessage(fanoutClient, (message) =>
          message.type === "shipping.run.updated" && message.run?.updatedAt === canonicalFanoutRun.updatedAt
        );
        assert.equal(replicatedEvent.type, "shipping.run.updated", "another API instance receives persisted live events");
        assert.equal(replicatedEvent.run.runId, alphaShippingRunId);
        assert.equal(replicatedEvent.run.organizationId, alphaId, "cross-instance fan-out retains tenant scope");
        assert.match(replicatedEvent.eventId, /^[A-Za-z0-9_-]{43}$/, "live event IDs are opaque stable tags");
        assert.match(replicatedEvent.cursor, /^[A-Za-z0-9_-]{40,128}$/, "live events include an opaque reconnect cursor");
        await assert.rejects(otherOrgFanoutClient.readMessage(250), /timed out/, "cross-instance fan-out does not disclose another organization's event");

        fanoutClient.close();
        machineSocket.sendMessage({ type: "daemon.shipping.run", machineId, run: { ...canonicalFanoutRun, state: "SUCCEEDED" } });
        const replayRun = await waitForShippingRun(api, owner, alphaId, alphaShippingRunId, "SUCCEEDED");
        fanoutClient = await openClientSocket(replicaPort, owner.cookies, replicatedEvent.cursor);
        const replayedEvent = await fanoutClient.readMessage();
        assert.equal(replayedEvent.type, "shipping.run.updated", "reconnect replays retained events instead of requiring an initial snapshot");
        assert.equal(replayedEvent.run.updatedAt, replayRun.updatedAt);
        assert.notEqual(replayedEvent.eventId, replicatedEvent.eventId);
        const replayCursor = await fanoutClient.readMessage();
        assert.equal(replayCursor.type, "realtime.cursor");
        assert.match(replayCursor.cursor, /^[A-Za-z0-9_-]{40,128}$/);
        await assert.rejects(fanoutClient.readMessage(250), /timed out/, "listener catch-up does not duplicate the replayed event");

        const replayTaskId = createCanonicalId("task");
        const replayTaskResponse = await api(owner.cookies, owner.body.csrfToken, `/api/work-items/${encodeURIComponent(workItemId)}/tasks`, {
          method: "POST", body: { id: replayTaskId, organizationId: alphaId, commandId: createCanonicalId("command"), title: "Replay task event" }
        });
        assert.equal(replayTaskResponse.status, 201);
        fanoutClient.close();
        fanoutClient = await openClientSocket(replicaPort, owner.cookies, replicatedEvent.cursor);
        const replayedTaskEvent = await readUntilMessage(fanoutClient, (message) => message.type === "task.updated");
        assert.equal(replayedTaskEvent.task.id, replayTaskId, "reconnect replays tenant-scoped Task updates");
        assert.equal(replayedTaskEvent.task.organizationId, alphaId);
        await assert.rejects(otherOrgFanoutClient.readMessage(250), /timed out/, "Task replay does not disclose another organization's event");

        await databaseInspector.query("DELETE FROM agent_work_os_realtime_events_v1");
        await databaseInspector.query(
          "INSERT INTO agent_work_os_realtime_events_v1 (event_key, origin_id, event) VALUES ($1, 'retention-test', $2::jsonb)",
          [`retention-gap-${crypto.randomUUID()}`, JSON.stringify({ type: "test.retained_event_removed" })]
        );
        await databaseInspector.query("DELETE FROM agent_work_os_realtime_events_v1");
        await databaseInspector.query("SELECT pg_notify('agent_work_os_realtime_events_v1', 'retention-gap-test')");
        const recoveredSnapshot = await readUntilMessage(fanoutClient, (message) => message.type === "state.snapshot");
        assert.ok(recoveredSnapshot.shippingRuns.some((run) => run.runId === alphaShippingRunId),
          "a listener catching up after retention removes every event receives a fresh tenant-scoped snapshot");
        const expiredCursorClient = await openClientSocket(replicaPort, owner.cookies, replicatedEvent.cursor);
        try {
          const fallbackSnapshot = await expiredCursorClient.readMessage();
          assert.equal(fallbackSnapshot.type, "state.snapshot", "a reconnect cursor outside retained history falls back to a full snapshot");
          assert.ok(fallbackSnapshot.shippingRuns.some((run) => run.runId === alphaShippingRunId));
        } finally {
          expiredCursorClient.close();
        }
      } finally {
        fanoutClient.close();
        otherOrgFanoutClient.close();
      }
      const forgedShippingRunId = `daemon-forged-${crypto.randomUUID()}`;
      machineSocket.sendMessage({ type: "daemon.shipping.run", machineId, run: {
        runId: forgedShippingRunId, state: "SHIPPED", testedSha: "forged", deployedSha: "forged", events: [{ type: "release.succeeded" }]
      } });
      await new Promise((resolve) => setTimeout(resolve, 100));
      const forgedShippingRunRead = await api(owner.cookies, null, `/api/shipping/runs/${encodeURIComponent(forgedShippingRunId)}?organizationId=${encodeURIComponent(alphaId)}`);
      assert.equal(forgedShippingRunRead.status, 404, "an authenticated daemon cannot create a ShippingRun outside the validated launch route");
      const machineSessionResponse = await fetch(`${origin}/api/sessions/${encodeURIComponent(createdSession.id)}`, {
        headers: { authorization: `Bearer ${machineCredential.token}` }
      });
      assert.equal(machineSessionResponse.status, 200, "machine credential reads sessions bound to its machine and organization");
      const crossMachineRead = await fetch(`${origin}/api/sessions/${encodeURIComponent(createdSession.id)}`, {
        headers: { authorization: "Bearer daemon-only-test-secret" }
      });
      assert.equal(crossMachineRead.status, 401, "the shared daemon token cannot authenticate production REST");
      replacementMachineSocket = await openMachineSocket(port, machineCredential.token, machineId);
      assert.equal(await machineSocket.closed, true, "a new daemon socket replaces the old connection");
      await waitFor(async () => {
        const response = await api(owner.cookies, null, `/api/machines?organizationId=${encodeURIComponent(alphaId)}`);
        const body = await response.json();
        return response.ok && body.machines.some((machine) => machine.id === machineId && machine.status === "online");
      }, 3_000, "replacement machine socket remains online");
      const rotationResponse = await api(owner.cookies, owner.body.csrfToken, `/api/organizations/${alphaId}/machine-credentials/${machineCredential.id}/rotate`, {
        method: "POST", body: {}
      });
      const rotationBody = await rotationResponse.json();
      assert.equal(rotationResponse.status, 200, JSON.stringify(rotationBody));
      assert.equal(await replacementMachineSocket.closed, true, "credential rotation closes the active machine WebSocket");
      rotatedMachineToken = rotationBody.credential.token;
      const oldMachineRead = await fetch(`${origin}/api/sessions/${encodeURIComponent(createdSession.id)}`, {
        headers: { authorization: `Bearer ${machineCredential.token}` }
      });
      assert.equal(oldMachineRead.status, 401, "rotated machine credentials stop authenticating REST");
      const rotatedMachineRead = await fetch(`${origin}/api/sessions/${encodeURIComponent(createdSession.id)}`, {
        headers: { authorization: `Bearer ${rotatedMachineToken}` }
      });
      assert.equal(rotatedMachineRead.status, 200, "rotated credential retains the same machine and organization binding");
    } finally {
      machineSocket.close();
      replacementMachineSocket?.close();
    }

    const viewerResult = await register(viewerEmail, "Beta Org");
    assert.equal(viewerResult.response.status, 201, JSON.stringify(viewerResult.body));
    const betaId = viewerResult.body.organization.id;
    const betaShippingRuns = await api(viewerResult.cookies, null, `/api/shipping/runs?organizationId=${encodeURIComponent(betaId)}`);
    assert.deepEqual((await betaShippingRuns.json()).runs, [], "a tenant's ShippingRun list excludes another organization's runs");
    const foreignShippingRunRead = await api(viewerResult.cookies, null, `/api/shipping/runs/${encodeURIComponent(alphaShippingRunId)}?organizationId=${encodeURIComponent(betaId)}`);
    assert.equal(foreignShippingRunRead.status, 404, "a tenant cannot fetch another organization's ShippingRun by ID");
    const betaMachineId = crypto.randomUUID();
    const betaCredentialResponse = await api(viewerResult.cookies, viewerResult.body.csrfToken, `/api/organizations/${betaId}/machine-credentials`, {
      method: "POST", body: { machineId: betaMachineId, name: "Beta executor" }
    });
    const betaCredentialBody = await betaCredentialResponse.json();
    assert.equal(betaCredentialResponse.status, 201, JSON.stringify(betaCredentialBody));
    const foreignMachineRun = await api(owner.cookies, owner.body.csrfToken, "/api/shipping/runs", {
      method: "POST", body: {
        organizationId: owner.body.organization.id,
        machineId: betaMachineId,
        contract: await (await api(owner.cookies, null, "/api/shipping/example")).json()
      }
    });
    assert.equal(foreignMachineRun.status, 404, "an organization cannot launch a ShippingRun on another organization's machine");
    const machineReassignment = await api(viewerResult.cookies, viewerResult.body.csrfToken, `/api/organizations/${betaId}/machine-credentials`, {
      method: "POST", body: { machineId, name: "Attempted reassignment" }
    });
    assert.equal(machineReassignment.status, 409, "a machine ID with existing sessions cannot be reassigned to another org");
    const foreignMachineRead = await fetch(`${origin}/api/sessions/${encodeURIComponent(alphaSessionId)}`, {
      headers: { authorization: `Bearer ${betaCredentialBody.credential.token}` }
    });
    assert.equal(foreignMachineRead.status, 404, "a valid machine cannot read sessions owned by another organization");
    const revokedCredential = await api(owner.cookies, owner.body.csrfToken, `/api/organizations/${alphaId}/machine-credentials/${machineCredential.id}`, {
      method: "POST", body: {}
    });
    assert.equal(revokedCredential.status, 200);
    const revokedMachineRead = await fetch(`${origin}/api/sessions/${encodeURIComponent(alphaSessionId)}`, {
      headers: { authorization: `Bearer ${rotatedMachineToken}` }
    });
    assert.equal(revokedMachineRead.status, 401, "revoked machine credentials stop authenticating REST");
    const guestResult = await register(guestEmail, "Gamma Org");
    assert.equal(guestResult.response.status, 201, JSON.stringify(guestResult.body));
    const foreignShippingRunList = await api(viewerResult.cookies, null, `/api/shipping/runs?organizationId=${encodeURIComponent(owner.body.organization.id)}`);
    assert.equal(foreignShippingRunList.status, 404, "non-members cannot enumerate another organization's ShippingRuns");
    const nonMemberShippingRunRead = await api(viewerResult.cookies, null, `/api/shipping/runs/${encodeURIComponent(alphaShippingRunId)}?organizationId=${encodeURIComponent(owner.body.organization.id)}`);
    assert.equal(nonMemberShippingRunRead.status, 404, "non-members cannot read another organization's ShippingRun");

    const outsiderRead = await api(viewerResult.cookies, null, `/api/work-items/${workItemId}?organizationId=${encodeURIComponent(alphaId)}`);
    assert.equal(outsiderRead.status, 404, "non-member cannot read a foreign WorkItem");
    const outsiderList = await api(viewerResult.cookies, null, `/api/work-items?organizationId=${encodeURIComponent(alphaId)}`);
    assert.equal(outsiderList.status, 404, "non-member cannot enumerate a foreign organization");
    const outsiderEvents = await api(viewerResult.cookies, null, `/api/work-items/${workItemId}/events?organizationId=${encodeURIComponent(alphaId)}`);
    assert.equal(outsiderEvents.status, 404, "non-member cannot inspect foreign WorkItem evidence");
    const outsiderWrite = await api(viewerResult.cookies, viewerResult.body.csrfToken, "/api/work-items", {
      method: "POST", body: { id: createCanonicalId("work"), commandId: createCanonicalId("command"), organizationId: alphaId, title: "Foreign write" }
    });
    assert.equal(outsiderWrite.status, 404, "non-member cannot create into a foreign organization");

    const badInvite = await api(viewerResult.cookies, viewerResult.body.csrfToken, "/api/auth/accept-invitation", {
      method: "POST", body: { token: createCanonicalId("command") }
    });
    assert.equal(badInvite.status, 404);

    const mismatchedInviteResponse = await api(owner.cookies, owner.body.csrfToken, `/api/organizations/${alphaId}/invitations`, {
      method: "POST", body: { email: `not-${viewerEmail}`, role: "member" }
    });
    const mismatchedInvite = await mismatchedInviteResponse.json();
    assert.equal(mismatchedInviteResponse.status, 201);
    const inviteMismatch = await api(viewerResult.cookies, viewerResult.body.csrfToken, "/api/auth/accept-invitation", {
      method: "POST", body: { token: mismatchedInvite.invitation.token }
    });
    assert.equal(inviteMismatch.status, 403, "invitation token is bound to the invited email");

    const invitationResponse = await api(owner.cookies, owner.body.csrfToken, `/api/organizations/${alphaId}/invitations`, {
      method: "POST", body: { email: viewerEmail, role: "viewer" }
    });
    const invitationBody = await invitationResponse.json();
    assert.equal(invitationResponse.status, 201, JSON.stringify(invitationBody));
    const invitationToken = invitationBody.invitation.token;

    const wsOwner = await openClientSocket(port, owner.cookies);
    assert.equal(replicaChild.exitCode, null, `replica API exited unexpectedly: ${logs.join("")}`);
    const wsReplica = await openClientSocket(replicaPort, owner.cookies);
    const wsGuest = await openClientSocket(port, guestResult.cookies);
    const wsViewer = await openClientSocket(port, viewerResult.cookies);
    try {
      const ownerSnapshot = await wsOwner.readMessage();
      const replicaSnapshot = await wsReplica.readMessage();
      const guestSnapshot = await wsGuest.readMessage();
      const viewerSnapshot = await wsViewer.readMessage();
      assert.equal(ownerSnapshot.type, "state.snapshot");
      assert.equal(replicaSnapshot.type, "state.snapshot");
      assert.ok(replicaSnapshot.shippingRuns.some((run) => run.runId === alphaShippingRunId));
      assert.ok(ownerSnapshot.workItems.some((item) => item.id === workItemId));
      assert.ok(ownerSnapshot.machines.some((machine) => machine.id === machineId));
      assert.ok(ownerSnapshot.sessions.some((session) => session.id === alphaSessionId));
      assert.ok(ownerSnapshot.shippingRuns.some((run) => run.runId === alphaShippingRunId));
      assert.equal(guestSnapshot.workItems.length, 0, "WebSocket snapshot cannot expose another organization's WorkItems");
      assert.equal(viewerSnapshot.shippingRuns.length, 0, "WebSocket snapshot cannot expose another organization's ShippingRuns");
      assert.equal(viewerSnapshot.workItems.length, 0, "WebSocket snapshot cannot expose another organization's WorkItems");
      assert.equal(guestSnapshot.sessions.length, 0, "WebSocket snapshot cannot expose another organization's sessions");
      assert.equal(guestSnapshot.machines.length, 0, "WebSocket snapshot cannot expose another organization's machines");

      const memberInvite = await api(viewerResult.cookies, viewerResult.body.csrfToken, "/api/auth/accept-invitation", {
        method: "POST", body: { token: invitationToken }
      });
      assert.equal(memberInvite.status, 200);
      const sharedRead = await api(viewerResult.cookies, null, `/api/work-items/${workItemId}?organizationId=${encodeURIComponent(alphaId)}`);
      assert.equal(sharedRead.status, 200, "accepted invitation grants membership");
      const viewerSessionRead = await api(viewerResult.cookies, null, `/api/sessions/${encodeURIComponent(alphaSessionId)}?organizationId=${encodeURIComponent(alphaId)}`);
      assert.equal(viewerSessionRead.status, 200, "viewer membership permits reading organization sessions");
      const viewerSessionWrite = await api(viewerResult.cookies, viewerResult.body.csrfToken, `/api/sessions/${encodeURIComponent(alphaSessionId)}/messages`, {
        method: "POST", body: { text: "viewer cannot control session" }
      });
      assert.equal(viewerSessionWrite.status, 403);
      const viewerWrite = await api(viewerResult.cookies, viewerResult.body.csrfToken, "/api/work-items", {
        method: "POST", body: { id: createCanonicalId("work"), commandId: createCanonicalId("command"), organizationId: alphaId, title: "Viewer cannot write" }
      });
      assert.equal(viewerWrite.status, 403);

      const foreignCreate = await api(viewerResult.cookies, viewerResult.body.csrfToken, "/api/work-items", {
        method: "POST", body: { id: createCanonicalId("work"), commandId: createCanonicalId("command"), organizationId: betaId, title: "Beta item" }
      });
      assert.equal(foreignCreate.status, 201);
      const betaEvent = await wsViewer.readMessage(2_000);
      assert.equal(betaEvent.workItem.organizationId, betaId);

      const secondItemId = createCanonicalId("work");
      const secondItem = await api(owner.cookies, owner.body.csrfToken, "/api/work-items", {
        method: "POST", body: { id: secondItemId, commandId: createCanonicalId("command"), organizationId: alphaId, title: "Alpha event" }
      });
      assert.equal(secondItem.status, 201);
      const ownerEvent = await wsOwner.readMessage(2_000);
      const viewerEvent = await wsViewer.readMessage(2_000);
      assert.equal(ownerEvent.workItem.id, secondItemId);
      assert.equal(viewerEvent.workItem.id, secondItemId, "invited member's live WebSocket gains the organization subscription");
      await assert.rejects(wsGuest.readMessage(150), /timed out/, "unrelated org socket receives no WorkItem event");
    } finally {
      wsOwner.close();
      wsReplica.close();
      wsGuest.close();
      wsViewer.close();
    }

    const login = await fetch(`${origin}/api/auth/login`, {
      method: "POST", headers: authHeaders,
      body: JSON.stringify({ email: ownerEmail.toUpperCase(), password: "correct horse battery staple" })
    });
    assert.equal(login.status, 200);
    const loginBody = await login.json();
    const loginCookies = getCookies(login);

    await stopServer();
    await startServer();
    const afterRestart = await api(loginCookies, null, `/api/work-items/${workItemId}?organizationId=${encodeURIComponent(alphaId)}`);
    assert.equal(afterRestart.status, 200, "database session and WorkItem survive control-plane restart");
    const sessionAfterRestart = await api(loginCookies, null, `/api/sessions/${encodeURIComponent(alphaSessionId)}?organizationId=${encodeURIComponent(alphaId)}`);
    const persistedSession = await sessionAfterRestart.json();
    assert.equal(sessionAfterRestart.status, 200, "normalized session rows survive control-plane restart");
    assert.equal(persistedSession.messages.length, 4, "all concurrent message updates survive restart");
    const shippingRunsAfterRestart = await api(loginCookies, null, `/api/shipping/runs?organizationId=${encodeURIComponent(owner.body.organization.id)}`);
    const persistedShippingRuns = await shippingRunsAfterRestart.json();
    assert.equal(shippingRunsAfterRestart.status, 200);
    assert.ok(persistedShippingRuns.runs.some((run) => run.runId === alphaShippingRunId), "tenant ShippingRuns survive control-plane restart");
    const machinesAfterRestart = await api(loginCookies, null, `/api/machines?organizationId=${encodeURIComponent(alphaId)}`);
    const persistedMachineList = await machinesAfterRestart.json();
    assert.ok(persistedMachineList.machines.some((machine) => machine.id === machineId && machine.status === "offline"),
      "normalized machine inventory survives restart and marks disconnected machines offline");

    const logout = await api(loginCookies, loginBody.csrfToken, "/api/auth/logout", { method: "POST", body: {} });
    assert.equal(logout.status, 200);
    assert.equal((await api(loginCookies, null, "/api/auth/me")).status, 401, "logout revokes the server-side session");
  } catch (error) {
    error.message += `\nAPI logs:\n${logs.join("")}`;
    throw error;
  } finally {
    await stopServer();
    await stopReplica();
    await databaseInspector.end();
  }
});

function getCookies(response) {
  return response.headers.getSetCookie().map((cookie) => cookie.split(";", 1)[0]).join("; ");
}

async function getAvailablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function openMachineSocket(port, machineCredential, machineId) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?role=daemon`);
  const queue = [];
  const waiters = [];
  let failure;
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  socket.addEventListener("close", () => resolveClosed(true), { once: true });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.type === "server.machine.authenticated") return;
    const waiter = waiters.shift();
    if (waiter) { clearTimeout(waiter.timer); waiter.resolve(message); }
    else queue.push(message);
  });
  socket.addEventListener("error", () => { failure = new Error("machine WebSocket failed"); for (const waiter of waiters.splice(0)) waiter.reject(failure); });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.send(encodeMessage({
    type: "daemon.hello", protocolVersion: PROTOCOL_VERSION, machineCredential,
    machine: { id: machineId, name: "Test executor", capabilities: [{ name: "echo" }], shipping: { enabled: true } }
  }));
  return {
    readMessage(timeoutMs = 2_000) {
      if (failure) return Promise.reject(failure);
      if (queue.length) return Promise.resolve(queue.shift());
      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject, timer: undefined };
        waiter.timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("machine WebSocket message timed out"));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    closed,
    close() { if (socket.readyState < WebSocket.CLOSING) socket.close(); },
    sendMessage(message) { socket.send(encodeMessage(message)); }
  };
}

async function waitForShippingRun(api, account, organizationId, runId, expectedState) {
  let current;
  await waitFor(async () => {
    const response = await api(account.cookies, null, `/api/shipping/runs/${encodeURIComponent(runId)}?organizationId=${encodeURIComponent(organizationId)}`);
    if (!response.ok) return false;
    current = await response.json();
    return current.state === expectedState;
  }, 3_000, `ShippingRun state ${expectedState}`);
  return current;
}

function openClientSocket(port, cookies, cursor = null) {
  const socket = net.connect(port, "127.0.0.1");
  const key = crypto.randomBytes(16).toString("base64");
  let buffer = Buffer.alloc(0);
  let handshakeDone = false;
  const queue = [];
  const waiters = [];
  let handshakeResolve;
  let handshakeReject;
  const handshake = new Promise((resolve, reject) => { handshakeResolve = resolve; handshakeReject = reject; });
  socket.on("connect", () => socket.write(
    `GET /ws?role=client${typeof cursor === "string" ? `&cursor=${encodeURIComponent(cursor)}` : ""} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nOrigin: http://127.0.0.1:${port}\r\nCookie: ${cookies}\r\n\r\n`
  ));
  socket.on("error", (error) => { if (!handshakeDone) handshakeReject(error); for (const waiter of waiters.splice(0)) waiter.reject(error); });
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (!handshakeDone) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const headers = buffer.subarray(0, headerEnd).toString("utf8");
      if (!headers.startsWith("HTTP/1.1 101")) return handshakeReject(new Error(`websocket rejected: ${headers}`));
      buffer = buffer.subarray(headerEnd + 4);
      handshakeDone = true;
      handshakeResolve();
    }
    parseFrames();
  });
  const parseFrames = () => {
    while (buffer.length >= 2) {
      let length = buffer[1] & 0x7f;
      let offset = 2;
      if (length === 126) { if (buffer.length < 4) return; length = buffer.readUInt16BE(2); offset = 4; }
      else if (length === 127) { if (buffer.length < 10) return; length = Number(buffer.readBigUInt64BE(2)); offset = 10; }
      if (buffer.length < offset + length) return;
      const opcode = buffer[0] & 0x0f;
      const payload = buffer.subarray(offset, offset + length);
      buffer = buffer.subarray(offset + length);
      if (opcode !== 0x1) continue;
      const message = JSON.parse(payload.toString("utf8"));
      const waiter = waiters.shift();
      if (waiter) { clearTimeout(waiter.timer); waiter.resolve(message); }
      else queue.push(message);
    }
  };
  return {
    async readMessage(timeoutMs = 2_000) {
      await handshake;
      if (queue.length) return queue.shift();
      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject, timer: setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("timed out waiting for websocket message"));
        }, timeoutMs) };
        waiters.push(waiter);
      });
    },
    close() { socket.destroy(); }
  };
}

async function readUntilMessage(socket, predicate, timeoutMs = 3_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const message = await socket.readMessage(end - Date.now());
    if (predicate(message)) return message;
  }
  throw new Error("timed out waiting for matching websocket message");
}

async function waitFor(check, timeoutMs, label) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try { if (await check()) return; } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}

async function waitForPostgres() {
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 1_000 });
  try {
    await waitFor(async () => {
      try { await pool.query("SELECT 1"); return true; } catch { return false; }
    }, 15_000, "PostgreSQL readiness");
  } finally {
    await pool.end();
  }
}
