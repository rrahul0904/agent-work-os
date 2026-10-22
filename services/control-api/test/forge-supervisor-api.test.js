import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import net from "node:net";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStore } from "../src/store.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const s = net.createServer();
  await new Promise(resolve => s.listen(0, "127.0.0.1", resolve));
  const port = s.address().port;
  await new Promise(resolve => s.close(resolve));
  return port;
}
async function eventually(check, timeout = 13_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try { const value = await check(); if (value) return value; } catch {}
    await delay(100);
  }
  throw new Error("forge_acceptance_timed_out");
}

test("real local supervisor API + daemon enforce approval, dependency, evidence and restart persistence", { timeout: 30_000 }, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "rea-forge-acceptance-"));
  const statePath = path.join(temp, "state.json");
  const port = await freePort();
  const token = "local-forge-" + crypto.randomUUID();
  const base = "http://127.0.0.1:" + port;
  const env = {
    ...process.env, NODE_ENV: "test", PORT: String(port),
    AGENT_WORK_OS_HOST: "127.0.0.1", AGENT_WORK_OS_TOKEN: token,
    AGENT_WORK_OS_ENABLE_FORGE_SUPERVISOR: "true",
    AGENT_WORK_OS_ENABLE_ECHO: "true",
    AGENT_WORK_OS_STATE_PATH: statePath,
    AGENT_WORK_OS_FORGE_WORKSPACE_ROOT: temp,
    AGENT_WORK_OS_SERVER_URL: "ws://127.0.0.1:" + port + "/ws",
    AGENT_WORK_OS_HOME: path.join(temp, "daemon-home"),
    AGENT_WORK_OS_SHIPPING_STATE: path.join(temp, "ship")
  };
  const api = spawn(process.execPath, ["services/control-api/src/index.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  const log = [];
  api.stderr.on("data", b => log.push(String(b)));
  let daemon;
  const headers = { authorization: "Bearer " + token, "content-type": "application/json" };
  const get = async endpoint => {
    const res = await fetch(base + endpoint, { headers });
    if (!res.ok) throw new Error(endpoint + ": " + res.status);
    return res.json();
  };
  const post = async (endpoint, body = {}) => {
    const res = await fetch(base + endpoint, { method: "POST", headers, body: JSON.stringify(body) });
    const json = await res.json();
    assert.ok(res.ok, endpoint + " returned " + res.status + " " + JSON.stringify(json));
    return json;
  };
  try {
    await eventually(async () => (await fetch(base + "/readyz")).ok);
    daemon = spawn(process.execPath, ["runtime/daemon/src/index.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    daemon.stderr.on("data", b => log.push(String(b)));
    const machine = await eventually(async () => {
      const state = await get("/api/state");
      return state.machines.find(m => m.status === "online" && m.capabilities?.some(c => c.name === "echo"));
    });
    const created = await post("/api/forge/plans", {
      title: "End-to-end proof", machineId: machine.id, cwd: temp, maxParallel: 2,
      tasks: [
        { id: "source", title: "Inspect source", agent: "echo", prompt: "Source verified fixture", dependsOn: [] },
        { id: "implementation", title: "Implement after evidence", agent: "echo", prompt: "Implementation fixture", dependsOn: ["source"] }
      ]
    });
    assert.equal(created.state, "draft");
    await delay(1700);
    assert.equal((await get("/api/forge/plans/" + created.id)).tasks[0].state, "pending", "approval required");
    await post("/api/forge/plans/" + created.id + "/approve");
    const first = await eventually(async () => {
      const plan = await get("/api/forge/plans/" + created.id);
      return plan.tasks[0].state === "awaiting_verification" ? plan : null;
    });
    assert.equal(first.tasks[1].state, "pending", "downstream must not auto-start");
    const executed = await get("/api/sessions/" + first.tasks[0].sessionId);
    assert.equal(executed.status, "completed");
    const receiptDigest = "sha256:" + crypto.createHash("sha256").update(JSON.stringify({
      sessionId: executed.id, status: executed.status,
      eventCount: executed.events.length
    })).digest("hex");
    await post("/api/forge/plans/" + created.id + "/tasks/source/verify", {
      approved: true, reviewer: "Acceptance test external verifier", digest: receiptDigest
    });
    const second = await eventually(async () => {
      const plan = await get("/api/forge/plans/" + created.id);
      return plan.tasks[1].state === "awaiting_verification" ? plan : null;
    });
    assert.equal(second.tasks[0].state, "verified");
    const snapshot = await get("/api/state");
    assert.equal(snapshot.forgePlans.find(p => p.id === created.id).tasks.length, 2);
    assert.equal(snapshot.forgePlans.find(p => p.id === created.id).tasks[0].prompt, undefined);
    const store = new JsonStore(statePath); await store.load();
    const persisted = store.getForgePlan(created.id);
    assert.equal(persisted.tasks[1].state, "awaiting_verification");
    assert.ok(persisted.tasks[0].verification.digest.startsWith("sha256:"));
  } finally {
    daemon?.kill("SIGTERM"); api.kill("SIGTERM");
    await delay(250);
  }
  assert.equal(log.filter(s => /SyntaxError|uncaughtException/.test(s)).length, 0, log.join("\n"));
});
