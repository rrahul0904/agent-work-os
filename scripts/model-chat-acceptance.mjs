import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const temp = await mkdtemp(path.join(os.tmpdir(), "awos-model-chat-e2e-"));
const calls = [];
const provider = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
    res.writeHead(404).end();
    return;
  }
  const input = [];
  for await (const part of req) input.push(part);
  const data = JSON.parse(Buffer.concat(input).toString("utf8"));
  calls.push({ model: data.model, messages: data.messages, authorization: req.headers.authorization });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({
    id: "fixture-completion",
    choices: [{ message: { role: "assistant", content: "verified response " + calls.length }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 4 }
  }));
});
provider.listen(0, "127.0.0.1");
await once(provider, "listening");
const providerPort = provider.address().port;
const controlPort = 20_000 + Math.floor(Math.random() * 10_000);
const token = "acceptance-model-chat-token";
const env = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: "",
  AGENT_WORK_OS_PORT: String(controlPort),
  AGENT_WORK_OS_TOKEN: token,
  AGENT_WORK_OS_HOST: "127.0.0.1",
  AGENT_WORK_OS_STATE_PATH: path.join(temp, "state.json"),
  AGENT_WORK_OS_HOME: path.join(temp, "machine"),
  AGENT_WORK_OS_SERVER_URL: "ws://127.0.0.1:" + controlPort + "/ws",
  AGENT_WORK_OS_MACHINE_NAME: "model-chat-e2e",
  AGENT_WORK_OS_SHIPPING_STATE: path.join(temp, "shipping"),
  AGENT_WORK_OS_COMPAT_CHAT_ENABLED: "true",
  AGENT_WORK_OS_COMPAT_CHAT_MODEL: "e2e-model",
  AGENT_WORK_OS_COMPAT_CHAT_BASE_URL: "http://127.0.0.1:" + providerPort + "/v1",
  AGENT_WORK_OS_COMPAT_CHAT_API_KEY: "e2e-machine-local-key"
};
const children = [];
function spawnService(file) {
  const child = spawn(process.execPath, [file], { env, cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  // Preserve child process error telemetry but prevent provider credentials from being printed.
  child.stdout.on("data", (data) => {
    if (!data.toString("utf8").includes("e2e-machine-local-key")) process.stdout.write(data);
  });
  child.stderr.on("data", (data) => {
    if (!data.toString("utf8").includes("e2e-machine-local-key")) process.stderr.write(data);
  });
  return child;
}
const headers = { authorization: "Bearer " + token };
async function waitFor(fn, label, ms = 10_000) {
  const started = Date.now();
  while (Date.now() - started < ms) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error("timeout waiting for " + label);
}
const base = "http://127.0.0.1:" + controlPort;
try {
  spawnService("services/control-api/src/index.js");
  await waitFor(async () => (await fetch(base + "/health")).ok, "control plane");
  spawnService("runtime/daemon/src/index.js");
  const machine = await waitFor(async () => {
    const reply = await fetch(base + "/api/state", { headers });
    const snapshot = await reply.json();
    return snapshot.machines.find((m) => m.name === "model-chat-e2e" && m.status === "online" && m.capabilities?.some((c) => c.name === "model-chat"));
  }, "advertised model-chat capability");

  const create = await fetch(base + "/api/sessions", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ machineId: machine.id, cwd: root, agent: "model-chat", prompt: "text-only question" })
  });
  const sessionBody = await create.text();
  assert.equal(create.status, 201, sessionBody);
  const session = JSON.parse(sessionBody);
  const first = await waitFor(async () => {
    const response = await fetch(base + "/api/sessions/" + session.id, { headers });
    if (!response.ok) return null;
    const value = await response.json();
    return value.status === "completed" && value.messages?.some((m) => m.text === "verified response 1") ? value : null;
  }, "real local model-completion through control plane");
  assert.equal(first.nativeSessionId, "model-chat-" + session.id);
  assert.equal(calls[0].model, "e2e-model");
  assert.equal(calls[0].authorization, "Bearer e2e-machine-local-key");
  assert.deepEqual(calls[0].messages, [{ role: "user", content: "text-only question" }]);

  const follow = await fetch(base + "/api/sessions/" + session.id + "/messages", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ text: "follow-up question" })
  });
  assert.equal(follow.status, 202);
  await waitFor(async () => {
    const response = await fetch(base + "/api/sessions/" + session.id, { headers });
    const value = await response.json();
    return value.messages?.some((m) => m.text === "verified response 2") ? value : null;
  }, "continued model session");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].messages, [
    { role: "user", content: "text-only question" },
    { role: "assistant", content: "verified response 1" },
    { role: "user", content: "follow-up question" }
  ]);
  console.log("[model-chat-acceptance] PASS: UI API -> local daemon -> configured compatible HTTP provider -> persisted response -> native session resume");
} finally {
  for (const child of children.reverse()) child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 220));
  provider.close();
  await once(provider, "close");
  await rm(temp, { recursive: true, force: true });
}
