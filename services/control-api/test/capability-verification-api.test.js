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
import { createCapabilitySpec } from "../../../packages/capability-fabric/src/index.js";
import { PROTOCOL_VERSION, encodeMessage } from "../../../packages/protocol/src/index.js";

const { Pool } = pg;
const databaseUrl = process.env.AGENT_WORK_OS_TEST_DATABASE_URL;
const root = path.resolve(new URL("../../..", import.meta.url).pathname);

test("tenant capability verification API creates atomic run/session/outbox and persists daemon receipt", { skip: !databaseUrl }, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-capability-api-"));
  const port = await getAvailablePort();
  const origin = `http://127.0.0.1:${port}`;
  const databaseInspector = new Pool({ connectionString: databaseUrl, max: 1 });
  const logs = [];
  const child = spawn(process.execPath, ["services/control-api/src/index.js"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      AGENT_WORK_OS_HOST: "127.0.0.1",
      AGENT_WORK_OS_TOKEN: "",
      DATABASE_URL: databaseUrl,
      AGENT_WORK_OS_STATE_PATH: path.join(temp, "state.json")
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (data) => logs.push(String(data)));
  child.stderr.on("data", (data) => logs.push(String(data)));

  const stopServer = async () => {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    if (child.exitCode === null) child.kill("SIGKILL");
  };

  try {
    await waitForPostgres();
    await waitFor(async () => {
      try { return (await fetch(`${origin}/readyz`)).ok; } catch { return false; }
    }, 15_000, "capability API readiness");

    const owner = await register(origin, `capability-${crypto.randomUUID()}@example.test`, "Capability Org");
    assert.equal(owner.response.status, 201, JSON.stringify(owner.body));
    const organizationId = owner.body.organization.id;
    const machineId = crypto.randomUUID();
    const credentialResponse = await api(origin, owner, `/api/organizations/${organizationId}/machine-credentials`, {
      method: "POST", body: { machineId, name: "Capability verifier" }
    });
    const credentialBody = await credentialResponse.json();
    assert.equal(credentialResponse.status, 201, JSON.stringify(credentialBody));

    const machine = await openMachineSocket(port, credentialBody.credential.token, machineId);
    try {
      await waitFor(async () => {
        const response = await api(origin, owner, `/api/machines?organizationId=${encodeURIComponent(organizationId)}`);
        if (!response.ok) return false;
        const body = await response.json();
        return body.machines.some((entry) => entry.id === machineId && entry.capabilities?.some((capability) => capability.name === "capability-verify"));
      }, 3_000, "capability verifier machine registration");

      const spec = createCapabilitySpec({
        kind: "skill",
        version: "1.0.0",
        metadata: { name: "API Verification Skill", slug: "api-verification-skill", description: "Return READY." },
        execution: { instructions: "Return READY when verification is requested." },
        provenance: { sourceUrl: "https://github.com/example/source", sourceCommit: "abcdef1234567", sourceLicense: "MIT" },
        evaluation: { testCases: [{ id: "api-smoke", input: "Verify through API.", expected: "READY" }], qualityThreshold: 1 }
      });

      const createResponse = await api(origin, owner, "/api/capability-verifications", {
        method: "POST",
        body: { organizationId, machineId, cwd: "/tmp/capability-api", harnessId: "codex", mode: "artifact-context", approveWrite: true, spec }
      });
      const created = await createResponse.json();
      assert.equal(createResponse.status, 202, JSON.stringify(created));
      assert.equal(created.organizationId, organizationId);
      assert.equal(created.createdBy, owner.body.user.id);
      assert.equal(created.capabilityId, spec.id);
      assert.equal(created.status, "queued");

      const command = await machine.readMessage();
      assert.equal(command.type, "server.command");
      assert.equal(command.action, "session.start");
      assert.equal(command.sessionId, created.sessionId);
      assert.equal(command.payload.agent, "capability-verify");
      const verificationPayload = JSON.parse(command.payload.prompt);
      assert.equal(verificationPayload.spec.id, spec.id);
      assert.equal(verificationPayload.approveWrite, true);

      const atomicRows = await databaseInspector.query(
        `SELECT
           EXISTS (SELECT 1 FROM agent_work_os_capability_verification_runs_v1 WHERE run_id = $1) AS run_exists,
           EXISTS (SELECT 1 FROM agent_work_os_sessions_v1 WHERE session_id = $2) AS session_exists,
           EXISTS (SELECT 1 FROM agent_work_os_daemon_commands_v1 WHERE command_id = $3) AS command_exists`,
        [created.id, created.sessionId, command.commandId]
      );
      assert.equal(atomicRows.rows[0].run_exists, true);
      assert.equal(atomicRows.rows[0].session_exists, true);
      assert.equal(atomicRows.rows[0].command_exists, true);

      machine.sendMessage({ type: "daemon.command.ack", machineId, commandId: command.commandId, ok: true });
      machine.sendMessage({
        type: "daemon.session.event", machineId, sessionId: created.sessionId,
        event: { kind: "status", status: "running", at: "2026-10-16T18:00:00.000Z" }
      });
      const receipt = {
        schemaVersion: "1",
        verificationMode: "artifact-context",
        capabilityId: spec.id,
        capabilityVersion: spec.version,
        harnessId: "codex",
        score: 1,
        qualityThreshold: 1,
        passed: true,
        receiptDigest: "sha256:api-test-receipt"
      };
      machine.sendMessage({
        type: "daemon.session.event", machineId, sessionId: created.sessionId,
        event: { kind: "tool", name: "capability.verification.receipt", phase: "completed", payload: receipt, at: "2026-10-16T18:01:00.000Z" }
      });
      machine.sendMessage({
        type: "daemon.session.event", machineId, sessionId: created.sessionId,
        event: { kind: "status", status: "completed", at: "2026-10-16T18:01:01.000Z" }
      });

      let completed;
      await waitFor(async () => {
        const response = await api(origin, owner, `/api/capability-verifications/${encodeURIComponent(created.id)}?organizationId=${encodeURIComponent(organizationId)}`);
        if (!response.ok) return false;
        completed = await response.json();
        return completed.status === "complete" && completed.receipt?.receiptDigest === receipt.receiptDigest;
      }, 3_000, "verification receipt persistence");
      assert.equal(completed.receipt.passed, true);
      assert.equal(completed.sessionId, created.sessionId);

      const listResponse = await api(origin, owner, `/api/capability-verifications?organizationId=${encodeURIComponent(organizationId)}`);
      const list = await listResponse.json();
      assert.equal(listResponse.status, 200);
      assert.ok(list.runs.some((run) => run.id === created.id && run.status === "complete"));

      const other = await register(origin, `other-capability-${crypto.randomUUID()}@example.test`, "Other Capability Org");
      const crossTenant = await api(origin, other, `/api/capability-verifications/${encodeURIComponent(created.id)}?organizationId=${encodeURIComponent(organizationId)}`);
      assert.equal(crossTenant.status, 404, "verification runs are tenant-scoped");
    } finally {
      machine.close();
    }
  } catch (error) {
    error.message += `\nAPI logs:\n${logs.join("")}`;
    throw error;
  } finally {
    await stopServer();
    await databaseInspector.end();
  }
});

async function register(origin, email, organizationName) {
  const response = await fetch(`${origin}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "correct horse battery staple", organizationName })
  });
  return { response, body: await response.json(), cookies: getCookies(response) };
}

function api(origin, account, pathname, { method = "GET", body } = {}) {
  return fetch(`${origin}${pathname}`, {
    method,
    headers: {
      cookie: account.cookies,
      ...(body !== undefined ? { "content-type": "application/json", "x-csrf-token": account.body.csrfToken } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
}

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
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.type === "server.machine.authenticated") return;
    const waiter = waiters.shift();
    if (waiter) { clearTimeout(waiter.timer); waiter.resolve(message); }
    else queue.push(message);
  });
  socket.addEventListener("error", () => {
    failure = new Error("machine WebSocket failed");
    for (const waiter of waiters.splice(0)) waiter.reject(failure);
  });
  socket.send(encodeMessage({
    type: "daemon.hello",
    protocolVersion: PROTOCOL_VERSION,
    machineCredential,
    machine: {
      id: machineId,
      name: "Capability verifier",
      capabilities: [
        { name: "codex", executable: "/fake/codex", version: "codex-test" },
        { name: "capability-verify", executable: "builtin", version: "1", harnesses: ["codex"], modes: ["artifact-context", "native-discovery"] }
      ],
      shipping: { enabled: false }
    }
  }));
  return {
    readMessage(timeoutMs = 3_000) {
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
    close() { if (socket.readyState < WebSocket.CLOSING) socket.close(); },
    sendMessage(message) { socket.send(encodeMessage(message)); }
  };
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
