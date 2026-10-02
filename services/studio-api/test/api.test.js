import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createStudioService } from "../src/index.js";

function fakeFetch() {
  const sessions = new Map();
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const parsed = new URL(url);
    if (parsed.pathname === "/api/state") {
      return response(200, { machines: [{ id: "machine-1", status: "online", capabilities: [{ name: "echo" }] }], sessions: [] });
    }
    if (parsed.pathname === "/api/sessions" && (options.method ?? "GET") === "POST") {
      const body = JSON.parse(options.body);
      const session = { id: "session-1", status: "queued", ...body };
      sessions.set(session.id, session);
      return response(201, session);
    }
    if (parsed.pathname === "/api/sessions/session-1") return response(200, { ...sessions.get("session-1"), status: "completed" });
    return response(404, { error: "not_found" });
  };
  return { impl, calls };
}

function response(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function startService() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-studio-api-"));
  const fake = fakeFetch();
  const service = await createStudioService({ host: "127.0.0.1", port: 0, storePath: path.join(dir, "studio.json"), controlPlaneUrl: "http://control.invalid", fetchImpl: fake.impl });
  await new Promise((resolve) => service.server.listen(0, "127.0.0.1", resolve));
  const { port } = service.server.address();
  return { service, fake, base: `http://127.0.0.1:${port}` };
}

async function api(base, pathname, body) {
  const response = await fetch(`${base}${pathname}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

test("create -> publish -> preflight -> run launches through the existing control plane and records evidence", async () => {
  const { service, fake, base } = await startService();
  try {
    const created = await api(base, "/api/studio/agents", {
      name: "Research Builder",
      instructions: "Work from evidence.",
      machineId: "machine-1",
      cwd: "/workspace/project",
      agent: "echo"
    });
    assert.equal(created.status, 201);

    const published = await api(base, `/api/studio/agents/${created.body.id}/publish`, {});
    assert.equal(published.status, 201);
    assert.equal(published.body.number, 1);

    const preflight = await api(base, `/api/studio/agents/${created.body.id}/preflight`, { versionId: published.body.id });
    assert.equal(preflight.status, 200);
    assert.equal(preflight.body.ready, true);

    const run = await api(base, `/api/studio/agents/${created.body.id}/run`, { versionId: published.body.id, prompt: "Build the verified slice." });
    assert.equal(run.status, 202);
    assert.equal(run.body.session.id, "session-1");
    assert.equal(run.body.receipt.sessionId, "session-1");

    const downstream = fake.calls.find((call) => new URL(call.url).pathname === "/api/sessions" && call.options.method === "POST");
    const downstreamBody = JSON.parse(downstream.options.body);
    assert.match(downstreamBody.prompt, /PUBLISHED AGENT STUDIO SPEC/);
    assert.match(downstreamBody.prompt, /Build the verified slice/);

    const state = await api(base, "/api/studio/state");
    assert.equal(state.status, 200);
    assert.equal(state.body.receipts[0].status, "completed");
  } finally {
    await service.close();
  }
});

test("preflight refusal is durable and prevents a downstream launch", async () => {
  const { service, fake, base } = await startService();
  try {
    const created = await api(base, "/api/studio/agents", {
      name: "Unavailable Adapter",
      instructions: "Do not run if the adapter is absent.",
      machineId: "machine-1",
      cwd: "/workspace/project",
      agent: "codex-not-installed"
    });
    const published = await api(base, `/api/studio/agents/${created.body.id}/publish`, {});
    const run = await api(base, `/api/studio/agents/${created.body.id}/run`, { versionId: published.body.id, prompt: "Try it." });
    assert.equal(run.status, 409);
    assert.equal(run.body.error, "preflight_refused");
    assert.ok(run.body.preflight.reasons.includes("agent_adapter_not_available"));
    assert.equal(fake.calls.filter((call) => new URL(call.url).pathname === "/api/sessions" && call.options.method === "POST").length, 0);
  } finally {
    await service.close();
  }
});
