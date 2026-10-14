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
  const port = 21500 + Math.floor(Math.random() * 10000);
  const origin = `http://127.0.0.1:${port}`;
  const emailTag = crypto.randomUUID();
  const ipBytes = crypto.randomBytes(2);
  const testClientIp = `198.18.${ipBytes[0]}.${ipBytes[1]}`;
  const authHeaders = { "content-type": "application/json", "x-forwarded-for": testClientIp };
  const ownerEmail = `owner-${emailTag}@example.test`;
  const viewerEmail = `viewer-${emailTag}@example.test`;
  const guestEmail = `guest-${emailTag}@example.test`;
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
    let rotatedMachineToken;
    try {
      await waitFor(async () => {
        const response = await api(owner.cookies, null, `/api/machines?organizationId=${encodeURIComponent(alphaId)}`);
        const body = await response.json();
        return response.ok && body.machines.some((machine) => machine.id === machineId && machine.organizationId === alphaId);
      }, 3_000, "organization-bound machine authentication");
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
      const sessionMessage = await api(owner.cookies, owner.body.csrfToken, `/api/sessions/${encodeURIComponent(createdSession.id)}/messages`, {
        method: "POST", body: { text: "continue the tenant-scoped task" }
      });
      assert.equal(sessionMessage.status, 202);
      const messageCommand = await machineSocket.readMessage();
      assert.equal(messageCommand.action, "session.message");
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
    const betaMachineId = crypto.randomUUID();
    const betaCredentialResponse = await api(viewerResult.cookies, viewerResult.body.csrfToken, `/api/organizations/${betaId}/machine-credentials`, {
      method: "POST", body: { machineId: betaMachineId, name: "Beta executor" }
    });
    const betaCredentialBody = await betaCredentialResponse.json();
    assert.equal(betaCredentialResponse.status, 201, JSON.stringify(betaCredentialBody));
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
    const wsGuest = await openClientSocket(port, guestResult.cookies);
    const wsViewer = await openClientSocket(port, viewerResult.cookies);
    try {
      const ownerSnapshot = await wsOwner.readMessage();
      const guestSnapshot = await wsGuest.readMessage();
      const viewerSnapshot = await wsViewer.readMessage();
      assert.equal(ownerSnapshot.type, "state.snapshot");
      assert.ok(ownerSnapshot.workItems.some((item) => item.id === workItemId));
      assert.ok(ownerSnapshot.machines.some((machine) => machine.id === machineId));
      assert.ok(ownerSnapshot.sessions.some((session) => session.id === alphaSessionId));
      assert.equal(guestSnapshot.workItems.length, 0, "WebSocket snapshot cannot expose another organization's WorkItems");
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

    const logout = await api(loginCookies, loginBody.csrfToken, "/api/auth/logout", { method: "POST", body: {} });
    assert.equal(logout.status, 200);
    assert.equal((await api(loginCookies, null, "/api/auth/me")).status, 401, "logout revokes the server-side session");
  } catch (error) {
    error.message += `\nAPI logs:\n${logs.join("")}`;
    throw error;
  } finally {
    await stopServer();
  }
});

function getCookies(response) {
  return response.headers.getSetCookie().map((cookie) => cookie.split(";", 1)[0]).join("; ");
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
    machine: { id: machineId, name: "Test executor", capabilities: [{ name: "echo" }], shipping: { enabled: false } }
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
    close() { if (socket.readyState < WebSocket.CLOSING) socket.close(); }
  };
}

function openClientSocket(port, cookies) {
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
    `GET /ws?role=client HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nOrigin: http://127.0.0.1:${port}\r\nCookie: ${cookies}\r\n\r\n`
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
