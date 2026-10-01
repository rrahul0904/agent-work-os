import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("organization API persists hierarchy and exposes bounded coordination previews", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-org-api-"));
  process.env.AGENT_WORK_OS_HOST = "127.0.0.1";
  process.env.AGENT_WORK_OS_PORT = "0";
  process.env.AGENT_WORK_OS_STATE_PATH = path.join(dir, "state.json");
  process.env.AGENT_WORK_OS_TOKEN = "org-api-test";

  const { createControlPlane } = await import(`../src/index.js?org-api-test=${Date.now()}`);
  let control = await createControlPlane();
  await control.listen();
  let base = `http://127.0.0.1:${control.server.address().port}`;

  const request = async (pathname, body) => {
    const response = await fetch(`${base}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return { response, body: await response.json() };
  };

  try {
    const created = await request("/api/organizations", {
      id: "org-a",
      name: "Alpha",
      agents: [
        { id: "lead", parentId: null },
        { id: "builder", parentId: "lead" },
        { id: "reviewer", parentId: "lead" }
      ]
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.schemaVersion, 1);

    const invalid = await request("/api/organizations", {
      id: "cycle",
      agents: [
        { id: "a", parentId: "b" },
        { id: "b", parentId: "a" }
      ]
    });
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.body.error, "invalid_organization");

    const list = await (await fetch(`${base}/api/organizations`)).json();
    assert.deepEqual(list.organizations.map((organization) => organization.id), ["org-a"]);

    const reparented = await request("/api/organizations/org-a/reparent", {
      agentId: "reviewer",
      parentId: "builder"
    });
    assert.equal(reparented.response.status, 200);
    assert.equal(reparented.body.agents.find((agent) => agent.id === "reviewer").parentId, "builder");

    const schedule = await request("/api/scheduler/preview", {
      maxConcurrent: 2,
      turns: [
        { id: "a1", organizationId: "a", agentId: "lead" },
        { id: "a2", organizationId: "a", agentId: "builder" },
        { id: "b1", organizationId: "b", agentId: "lead" }
      ]
    });
    assert.equal(schedule.response.status, 200);
    assert.deepEqual(schedule.body.dispatched.map((turn) => turn.id), ["a1", "b1"]);
    assert.deepEqual(schedule.body.snapshot.queued.map((turn) => turn.id), ["a2"]);

    const attention = await request("/api/attention/preview", {
      approvals: [{ id: "p1", state: "pending", priority: "critical", title: "Approve change" }],
      messages: [{ id: "m1", urgent: true, text: "Need input" }],
      workItems: [{ id: "w1", blockedByHuman: true, title: "Choose option" }],
      resolvedIds: ["w1"]
    });
    assert.equal(attention.response.status, 200);
    assert.deepEqual(attention.body.items.map((item) => item.id), ["approval:p1", "message:m1"]);

    const state = await (await fetch(`${base}/api/state`)).json();
    assert.deepEqual(state.organizations.map((organization) => organization.id), ["org-a"]);
  } finally {
    await control.close();
  }

  control = await createControlPlane();
  await control.listen();
  base = `http://127.0.0.1:${control.server.address().port}`;
  try {
    const persisted = await (await fetch(`${base}/api/organizations/org-a`)).json();
    assert.equal(persisted.agents.find((agent) => agent.id === "reviewer").parentId, "builder");
  } finally {
    await control.close();
  }
});
