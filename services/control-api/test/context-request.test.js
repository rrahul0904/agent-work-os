import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-work-os-context-api-"));
process.env.PORT = "0";
process.env.AGENT_WORK_OS_TOKEN = "context-test-token";
process.env.AGENT_WORK_OS_STATE_PATH = path.join(root, "state.json");
const { createControlPlane } = await import(`../src/index.js?context-request-test=${Date.now()}`);

async function startControlPlane(t) {
  const cp = await createControlPlane();
  await cp.listen();
  t.after(async () => {
    await cp.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  await cp.store.upsertMachine({
    id: "machine-1",
    name: "test-machine",
    status: "online",
    lastSeenAt: new Date().toISOString(),
    capabilities: [{ name: "echo" }],
    shipping: { enabled: true },
    projectContext: { enabled: true },
  });
  const address = cp.server.address();
  return { cp, base: `http://127.0.0.1:${address.port}` };
}

async function post(base, body) {
  return fetch(`${base}/api/sessions`, {
    method: "POST",
    headers: {
      authorization: "Bearer context-test-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test("hosted session API rejects arbitrary private context payloads", async (t) => {
  const { cp, base } = await startControlPlane(t);
  const response = await post(base, {
    machineId: "machine-1",
    cwd: "/tmp/project",
    agent: "echo",
    prompt: "do work",
    context: {
      projectId: "alpha",
      privateText: "this must never cross the hosted context boundary",
    },
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, "invalid_context_request");
  assert.match(body.message, /unsupported context fields/);
  assert.equal(cp.store.listSessions().length, 0);
});

test("hosted session API persists only bounded context references", async (t) => {
  const { cp, base } = await startControlPlane(t);
  const response = await post(base, {
    machineId: "machine-1",
    cwd: "/tmp/project",
    agent: "echo",
    prompt: "do work",
    context: {
      projectId: "alpha",
      worktreeId: "wt-1",
      taskId: "task-2",
      budgetChars: 4096,
    },
  });

  // There is deliberately no daemon websocket in this test, so dispatch fails
  // after the session has been created. The stored request boundary is what is
  // under test here.
  assert.equal(response.status, 409);
  const sessions = cp.store.listSessions();
  assert.equal(sessions.length, 1);
  assert.deepEqual(sessions[0].context, {
    projectId: "alpha",
    worktreeId: "wt-1",
    taskId: "task-2",
    runId: sessions[0].id,
    budgetChars: 4096,
  });
  assert.equal(JSON.stringify(sessions[0]).includes("privateText"), false);
});

test("context identifiers and prompt budget fail closed", async (t) => {
  const { cp, base } = await startControlPlane(t);
  const traversal = await post(base, {
    machineId: "machine-1",
    cwd: "/tmp/project",
    agent: "echo",
    prompt: "do work",
    context: { projectId: "../../escape" },
  });
  assert.equal(traversal.status, 400);

  const oversized = await post(base, {
    machineId: "machine-1",
    cwd: "/tmp/project",
    agent: "echo",
    prompt: "do work",
    context: { projectId: "alpha", budgetChars: 1000000 },
  });
  assert.equal(oversized.status, 400);
  assert.equal(cp.store.listSessions().length, 0);
});
