import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { AgentDockReadOnlyAdapter } from "../src/agentdock-readonly-adapter.js";

test("AgentDock remains disabled without explicit local opt-in", () => {
  const adapter = new AgentDockReadOnlyAdapter({ env: {} });
  assert.equal(adapter.capability(), null);
  assert.equal(new AgentDockReadOnlyAdapter({ env: { AGENT_WORK_OS_AGENTDOCK_READONLY_ENABLED: "true", AGENT_WORK_OS_AGENTDOCK_PORT: "999999" } }).capability(), null);
});

test("AgentDock read-only adapter uses actual local routes and hides paths, process metadata and tokens", async () => {
  const queries = [];
  const server = http.createServer((req, res) => {
    queries.push(req.url);
    res.writeHead(200, { "content-type": "application/json" });
    if (req.url === "/v1/status") {
      res.end(JSON.stringify({ daemon: { version: "0.1.0", status: "running" },
        proxy: { enabled: true, bind: "127.0.0.1:7777" },
        registry: { sensitive: "/home/dev/.ssh" } }));
    } else if (req.url === "/v1/projects") {
      res.end(JSON.stringify({ projects: [
        { name: "topsecret", root: "/private/repo", token: "sensitive" },
        { name: "work", root: "/workspace" }
      ] }));
    } else { res.writeHead(404).end(); }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const adapter = new AgentDockReadOnlyAdapter({
      env: { AGENT_WORK_OS_AGENTDOCK_READONLY_ENABLED: "true", AGENT_WORK_OS_AGENTDOCK_PORT: String(server.address().port) }
    });
    assert.equal(adapter.capability().mode, "read_only");
    const events = [];
    const start = await adapter.run({ sessionId: "s", prompt: "status" }, (event) => events.push(event));
    assert.equal(start.nativeSessionId, "agentdock-s");
    const output = JSON.parse(events.find((event) => event.kind === "text").text);
    assert.equal(output.daemon, "running");
    assert.equal(output.proxyEnabled, true);
    assert.ok(!JSON.stringify(events).includes(".ssh"));
    await adapter.run({ sessionId: "s", nativeSessionId: "agentdock-s", prompt: "projects" }, (event) => events.push(event));
    const second = events.filter((e) => e.kind === "text").at(-1).text;
    assert.equal(JSON.parse(second).projectCount, 2);
    assert.ok(!JSON.stringify(events).includes("topsecret"));
    assert.ok(!JSON.stringify(events).includes("/private/repo"));
    assert.ok(!JSON.stringify(events).includes("sensitive"));
    assert.deepEqual(queries, ["/v1/status", "/v1/projects"]);
  } finally {
    server.close(); await once(server, "close");
  }
});

test("read-only AgentDock refuses mutations or arbitrary endpoints before any fetch", async () => {
  let calls = 0;
  const adapter = new AgentDockReadOnlyAdapter({
    env: { AGENT_WORK_OS_AGENTDOCK_READONLY_ENABLED: "true" },
    fetchImpl: async () => { calls++; return Response.json({ daemon: { status: "running" } }); }
  });
  for (const value of ["reserve_port", "release_port", "/v1/events", "http://evil/", "services", "projects?all=true"]) {
    await assert.rejects(adapter.run({ sessionId: "s", prompt: value }, () => {}), /AGENTDOCK_READONLY_COMMAND_DENIED/);
  }
  assert.equal(calls, 0);
});

test("AgentDock rejects invalid statuses, unexpected responses and wrong session identity", async () => {
  const adapter = new AgentDockReadOnlyAdapter({
    env: { AGENT_WORK_OS_AGENTDOCK_READONLY_ENABLED: "true" },
    fetchImpl: async () => Response.json({ daemon: { status: "offline" }, registry: { credentials: "secret" } })
  });
  await assert.rejects(adapter.run({ sessionId: "s", prompt: "status" }, () => {}), /AGENTDOCK_INVALID_REPLY/);
  await assert.rejects(adapter.run({ sessionId: "s", prompt: "status", nativeSessionId: "other" }, () => {}), /AGENTDOCK_SESSION_MISMATCH/);
});
