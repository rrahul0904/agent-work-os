#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repo = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const tmp = await mkdtemp(path.join(os.tmpdir(), "awos-ti-gateway-e2e-"));
const requests = [];
const apiKey = "test-only-dummy-daemon-private-key";
const model = "ti-fixture-model";
const gateway = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/api/v1/inference/chat-completions") {
    res.writeHead(404).end(); return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  requests.push({ method: req.method, headers: req.headers, body });
  if (req.headers.authorization !== "Bearer " + apiKey || !req.headers["idempotency-key"]) {
    res.writeHead(403).end(); return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({
    id: "fixture-" + requests.length, model,
    receipt_id: "iev_00000000-0000-4000-8000-000000000001",
    billing_state: "not_billed",
    choices: [{ index: 0, finish_reason: "stop",
      message: { role: "assistant", content: "Gateway reply " + requests.length } }],
    usage: { prompt_tokens: 11, completion_tokens: 5 },
  }));
});
gateway.listen(0, "127.0.0.1");
await once(gateway, "listening");
const controlPort = 20_000 + Math.floor(Math.random() * 20_000);
const token = "ti-gateway-control-test";
const env = {
  ...process.env, NODE_ENV: "test", DATABASE_URL: "",
  AGENT_WORK_OS_PORT: String(controlPort), AGENT_WORK_OS_HOST: "127.0.0.1",
  AGENT_WORK_OS_TOKEN: token, AGENT_WORK_OS_STATE_PATH: path.join(tmp, "state.json"),
  AGENT_WORK_OS_HOME: path.join(tmp, "machine"),
  AGENT_WORK_OS_SERVER_URL: "ws://127.0.0.1:" + controlPort + "/ws",
  AGENT_WORK_OS_MACHINE_NAME: "ti-gateway-e2e-machine",
  AGENT_WORK_OS_SHIPPING_STATE: path.join(tmp, "shipping"),
  AGENT_WORK_OS_TI_ENABLED: "true",
  AGENT_WORK_OS_TI_ENDPOINT: "http://127.0.0.1:" + gateway.address().port + "/api/v1/inference/chat-completions",
  AGENT_WORK_OS_TI_MODEL: model,
  AGENT_WORK_OS_TI_API_KEY: apiKey,
  AGENT_WORK_OS_TI_UPSTREAM_DESTINATION: "local_machine",
  AGENT_WORK_OS_TI_UPSTREAM_REGION: "local",
  AGENT_WORK_OS_TI_UPSTREAM_RETENTION: "zero",
  AGENT_WORK_OS_TI_PRIVATE_UPSTREAM_APPROVED: "true",
};
const children = [];
function start(file) {
  const child = spawn(process.execPath, [file], { cwd: repo, env, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (data) => {
    const output = data.toString("utf8");
    if (!output.includes(apiKey)) process.stdout.write(output);
  });
}
async function waitFor(fn, label, timeout = 11_000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try { const result = await fn(); if (result) return result; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error("timeout waiting for " + label);
}
const base = "http://127.0.0.1:" + controlPort;
const headers = { authorization: "Bearer " + token };
try {
  start("services/control-api/src/index.js");
  await waitFor(async () => (await fetch(base + "/health")).ok, "control API health");
  start("runtime/daemon/src/index.js");
  const machine = await waitFor(async () => {
    const snapshot = await (await fetch(base + "/api/state", { headers })).json();
    return snapshot.machines.find((m) => m.name === "ti-gateway-e2e-machine" &&
      m.status === "online" && m.capabilities.some((c) => c.name === "token-intelligence"));
  }, "daemon gateway capability");
  const created = await fetch(base + "/api/sessions", {
    method: "POST", headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ machineId: machine.id, cwd: repo, agent: "token-intelligence", prompt: "first gateway prompt" })
  });
  const createdBody = await created.text();
  assert.equal(created.status, 201, createdBody);
  const session = JSON.parse(createdBody);
  const first = await waitFor(async () => {
    const response = await fetch(base + "/api/sessions/" + session.id, { headers });
    const state = await response.json();
    return state.status === "completed" && state.messages?.some((m) => m.text === "Gateway reply 1") ? state : null;
  }, "first gateway completion");
  assert.equal(first.nativeSessionId, "ti-gateway-" + session.id);
  assert.equal(requests[0].body.store, false);
  assert.equal(requests[0].body.stream, false);
  assert.equal(requests[0].body.model, model);
  assert.ok(requests[0].headers["idempotency-key"]);
  assert.deepEqual(requests[0].body.messages, [{ role: "user", content: "first gateway prompt" }]);

  const follow = await fetch(base + "/api/sessions/" + session.id + "/messages", {
    method: "POST", headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ text: "second gateway prompt" })
  });
  assert.equal(follow.status, 202);
  await waitFor(async () => {
    const response = await fetch(base + "/api/sessions/" + session.id, { headers });
    const state = await response.json();
    return state.messages?.some((m) => m.text === "Gateway reply 2") ? state : null;
  }, "second gateway completion");
  assert.equal(requests.length, 2);
  assert.notEqual(requests[0].headers["idempotency-key"], requests[1].headers["idempotency-key"]);
  assert.deepEqual(requests[1].body.messages, [
    { role: "user", content: "first gateway prompt" },
    { role: "assistant", content: "Gateway reply 1" },
    { role: "user", content: "second gateway prompt" },
  ]);
  const state = await (await fetch(base + "/api/sessions/" + session.id, { headers })).text();
  assert.ok(!state.includes(apiKey));
  console.log("[token-intelligence-acceptance] PASS: control API → local daemon → authenticated gateway wire → persisted model response → native follow-up");
} finally {
  for (const child of children.reverse()) child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 220));
  gateway.close(); await once(gateway, "close");
  await rm(tmp, { recursive: true, force: true });
}
