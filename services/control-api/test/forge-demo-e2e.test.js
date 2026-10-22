import test from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import net from "node:net";
import crypto from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() {
  const s = net.createServer();
  await new Promise(resolve => s.listen(0, "127.0.0.1", resolve));
  const number = s.address().port;
  await new Promise(resolve => s.close(resolve));
  return number;
}
async function waitFor(predicate, ms = 12000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { if (await predicate()) return; } catch {}
    await sleep(100);
  }
  throw new Error("forge_demo_server_timeout");
}

test("live demo CLI proves echo approval/dependency and inspect reads actual session events", { timeout: 45_000 }, async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "forge-demo-e2e-"));
  const apiPort = await port();
  const token = "demo-" + crypto.randomUUID();
  const base = "http://127.0.0.1:" + apiPort;
  const env = {
    ...process.env, NODE_ENV:"test", PORT: String(apiPort),
    AGENT_WORK_OS_HOST:"127.0.0.1", AGENT_WORK_OS_TOKEN:token,
    AGENT_WORK_OS_ENABLE_FORGE_SUPERVISOR:"true",
    AGENT_WORK_OS_ENABLE_ECHO:"true",
    AGENT_WORK_OS_STATE_PATH: path.join(home,"state.json"),
    AGENT_WORK_OS_FORGE_WORKSPACE_ROOT:home,
    AGENT_WORK_OS_SERVER_URL: "ws://127.0.0.1:" + apiPort + "/ws",
    AGENT_WORK_OS_HOME:path.join(home,"daemon"),
    AGENT_WORK_OS_SHIPPING_STATE:path.join(home,"shipping")
  };
  const api = spawn(process.execPath, ["services/control-api/src/index.js"], {cwd:root,env,stdio:"ignore"});
  let daemon;
  try {
    await waitFor(async () => (await fetch(base + "/readyz")).ok);
    daemon = spawn(process.execPath, ["runtime/daemon/src/index.js"], {cwd:root,env,stdio:"ignore"});
    await waitFor(async () => {
      const response = await fetch(base + "/api/state", {
        headers: {authorization:"Bearer "+token}
      });
      const json = await response.json();
      return json.machines?.some(m => m.status === "online" && m.capabilities?.some(c=>c.name==="echo"));
    });
    const {stdout} = await run(process.execPath, [
      "scripts/forge-demo.mjs", "--mode","echo","--cwd",home,"--approve-echo"
    ], {cwd:root,env,timeout:30_000,maxBuffer:2_000_000});
    const outcome = JSON.parse(stdout);
    assert.equal(outcome.verdict,"PASS_ECHO_APPROVAL_AND_DEPENDENCY_GATE");
    assert.equal(outcome.observer.demonstrated.localExecution,true);
    assert.equal(outcome.observer.demonstrated.codexActivity,false);
    assert.equal(outcome.observer.tasks[0].taskState,"awaiting_verification");
    assert.equal(outcome.observer.tasks[1].taskState,"awaiting_verification");
    assert.equal(outcome.observer.tasks[2].taskState,"pending");
    assert.equal(outcome.observer.tasks[2].sessionId,null);
    const {stdout:inspect} = await run(process.execPath, [
      "scripts/forge-demo.mjs","--inspect",outcome.planId
    ], {cwd:root,env,timeout:8_000});
    const inspection = JSON.parse(inspect);
    assert.equal(inspection.planId,outcome.planId);
    assert.equal(inspection.demonstrated.independentDependencyGate,true);
    assert.equal(inspection.tasks[2].observedSessionStatus,"not_observed");
    const planResponse = await fetch(base + "/api/forge/plans/" + outcome.planId, {
      headers:{authorization:"Bearer "+token}
    });
    const plan = await planResponse.json();
    assert.equal(plan.tasks[0].prompt,undefined);
    assert.equal(plan.tasks[1].verification,null);
  } finally {
    daemon?.kill("SIGTERM"); api.kill("SIGTERM");
    await sleep(150);
  }
});
