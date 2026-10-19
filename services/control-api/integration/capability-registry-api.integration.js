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
const baseDatabaseUrl = process.env.AGENT_WORK_OS_TEST_DATABASE_URL;
const root = path.resolve(new URL("../../..", import.meta.url).pathname);

test("tenant capability registry API resolves immutable versions into verification runs", { skip: !baseDatabaseUrl }, async () => {
  await waitForPostgres(baseDatabaseUrl);
  const databaseName = `awos_registry_api_${crypto.randomUUID().replaceAll("-", "")}`;
  const adminPool = new Pool({ connectionString: baseDatabaseUrl, max: 1 });
  await adminPool.query(`CREATE DATABASE "${databaseName}"`);
  const isolatedUrl = new URL(baseDatabaseUrl);
  isolatedUrl.pathname = `/${databaseName}`;
  const databaseUrl = isolatedUrl.toString();
  const temp = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-registry-api-"));
  const port = await getAvailablePort();
  const origin = `http://127.0.0.1:${port}`;
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
    const exited = await Promise.race([
      new Promise((resolve) => child.once("exit", () => resolve(true))),
      new Promise((resolve) => setTimeout(() => resolve(false), 2_000))
    ]);
    if (!exited && child.exitCode === null) {
      child.kill("SIGKILL");
      await new Promise((resolve) => child.once("exit", resolve));
    }
  };

  try {
    await waitFor(async () => {
      try { return (await fetch(`${origin}/readyz`)).ok; } catch { return false; }
    }, 15_000, "registry API readiness");

    const owner = await register(origin, `registry-${crypto.randomUUID()}@example.test`, "Registry API Org");
    assert.equal(owner.response.status, 201, JSON.stringify(owner.body));
    const organizationId = owner.body.organization.id;
    const other = await register(origin, `registry-other-${crypto.randomUUID()}@example.test`, "Other Registry Org");
    assert.equal(other.response.status, 201, JSON.stringify(other.body));

    const base = {
      id: "capability_00000000-0000-4000-8000-000000000088",
      kind: "skill",
      metadata: { name: "Registered Verification Skill", slug: "registered-verification-skill", description: "Return a registry marker." },
      provenance: { sourceUrl: "https://github.com/example/registered-skill", sourceCommit: "abcdef1234567", sourceLicense: "MIT" },
      evaluation: { testCases: [{ id: "registry-smoke", input: "Verify the registry capability.", expected: "REGISTRY_READY" }], qualityThreshold: 1 }
    };
    const v1 = createCapabilitySpec({ ...base, version: "1.0.0", execution: { instructions: "Return REGISTRY_READY_V1." } });
    const v2 = createCapabilitySpec({ ...base, version: "2.0.0", execution: { instructions: "Return REGISTRY_READY_V2." } });

    for (const spec of [v1, v2]) {
      const response = await api(origin, owner, "/api/capabilities", { method: "POST", body: { organizationId, spec } });
      const body = await response.json();
      assert.equal(response.status, 201, JSON.stringify(body));
      assert.equal(body.capabilityId, spec.id);
      assert.equal(body.version, spec.version);
      assert.equal(body.createdBy, owner.body.user.id);
    }

    const duplicate = await api(origin, owner, "/api/capabilities", { method: "POST", body: { organizationId, spec: v2 } });
    const duplicateBody = await duplicate.json();
    assert.equal(duplicate.status, 409, JSON.stringify(duplicateBody));
    assert.equal(duplicateBody.error, "capability_registry_version_exists");

    const latestResponse = await api(origin, owner, `/api/capabilities/registered-verification-skill?organizationId=${encodeURIComponent(organizationId)}`);
    const latest = await latestResponse.json();
    assert.equal(latestResponse.status, 200, JSON.stringify(latest));
    assert.equal(latest.version, "2.0.0");
    assert.equal(latest.spec.execution.instructions, "Return REGISTRY_READY_V2.");

    const exactResponse = await api(origin, owner, `/api/capabilities/registered-verification-skill?organizationId=${encodeURIComponent(organizationId)}&version=1.0.0`);
    const exact = await exactResponse.json();
    assert.equal(exactResponse.status, 200, JSON.stringify(exact));
    assert.equal(exact.version, "1.0.0");

    const listResponse = await api(origin, owner, `/api/capabilities?organizationId=${encodeURIComponent(organizationId)}&tag=missing`);
    const list = await listResponse.json();
    assert.equal(listResponse.status, 200, JSON.stringify(list));
    assert.deepEqual(list.capabilities, []);

    const crossTenant = await api(origin, other, `/api/capabilities/registered-verification-skill?organizationId=${encodeURIComponent(organizationId)}`);
    assert.equal(crossTenant.status, 404, "registered capabilities are tenant-scoped");

    const machineId = crypto.randomUUID();
    const credentialResponse = await api(origin, owner, `/api/organizations/${organizationId}/machine-credentials`, {
      method: "POST", body: { machineId, name: "Registry verifier" }
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
      }, 3_000, "registry verifier machine registration");

      const verifyResponse = await api(origin, owner, "/api/capability-verifications", {
        method: "POST",
        body: {
          organizationId,
          machineId,
          cwd: "/tmp/registry-api",
          harnessId: "codex",
          mode: "artifact-context",
          approveWrite: true,
          capabilitySlug: "registered-verification-skill",
          capabilityVersion: "1.0.0"
        }
      });
      const run = await verifyResponse.json();
      assert.equal(verifyResponse.status, 202, JSON.stringify(run));
      assert.equal(run.capabilityVersion, "1.0.0");
      assert.equal(run.capabilitySlug, "registered-verification-skill");

      const command = await machine.readMessage();
      assert.equal(command.action, "session.start");
      const payload = JSON.parse(command.payload.prompt);
      assert.equal(payload.spec.version, "1.0.0");
      assert.equal(payload.spec.execution.instructions, "Return REGISTRY_READY_V1.");
      assert.equal(payload.spec.provenance.sourceCommit, v1.provenance.sourceCommit);
      machine.sendMessage({ type: "daemon.command.ack", machineId, commandId: command.commandId, ok: true });
    } finally {
      machine.close();
    }
  } catch (error) {
    error.message += `\nAPI logs:\n${logs.join("")}`;
    throw error;
  } finally {
    await stopServer();
    await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await adminPool.end();
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
      name: "Registry verifier",
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

async function waitForPostgres(connectionString) {
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 1_000 });
  try {
    await waitFor(async () => {
      try { await pool.query("SELECT 1"); return true; } catch { return false; }
    }, 15_000, "PostgreSQL readiness");
  } finally {
    await pool.end();
  }
}
