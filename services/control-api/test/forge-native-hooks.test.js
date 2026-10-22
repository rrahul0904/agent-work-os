import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStore } from "../src/store.js";
import { sanitizeForgeHook, nativeHookState } from "../src/forge-hook-observation.js";
import { projectHook } from "../../../.codex/hooks/rea-forge-observe.mjs";
import { buildForgeGraph } from "../../../apps/web/public/forge-graph.js";

const repo = fileURLToPath(new URL("../../../", import.meta.url));

test("native Codex hook projection strips prompts, cwd, token, tool args and results", () => {
  const raw = {
    hook_event_name: "SubagentStart", session_id: "parent-1",
    turn_id: "turn-5", agent_id: "child-1", agent_type: "reviewer",
    cwd: "/private/repo", prompt: "sensitive", transcript_path: "/private/rollout.jsonl",
    tool_response: { secret: "sk-test" }, tool_input: { command: "cat ~/.codex/auth.json" }
  };
  const client = projectHook(raw);
  const server = sanitizeForgeHook(client);
  assert.deepEqual(server, {
    source: "codex-hook/v1", sessionId: "parent-1", eventName: "SubagentStart",
    turnId: "turn-5", agentId: "child-1", agentType: "reviewer"
  });
  assert.ok(!JSON.stringify(server).includes("private"));
  assert.ok(!JSON.stringify(client).includes("secret"));
  assert.ok(!JSON.stringify(server).includes("sk-test"));
  assert.equal(nativeHookState("Stop"), "turn-ended");
  assert.equal(nativeHookState("PostToolUse"), null);
});

test("unexpected hook event and spoofed field schemas fail closed", () => {
  assert.throws(() => sanitizeForgeHook({ sessionId: "s1", eventName: "DeleteRun" }), /forge_hook_identity_invalid/);
  assert.throws(() => sanitizeForgeHook({ sessionId: "<iframe>", eventName: "Stop" }), /forge_hook_identity_invalid/);
  assert.equal(projectHook({ hook_event_name: "Stop", session_id: "<iframe>" }), null);
});

test("native hook records persist bounded and never change execution authority", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "rea-forge-hook-store-"));
  const file = path.join(root, "state.json");
  const store = new JsonStore(file); await store.load();
  const input = sanitizeForgeHook({ sessionId: "native-s1", eventName: "SessionStart" });
  const saved = await store.addForgeObservation(input);
  assert.ok(saved.id && saved.receivedAt);
  const reload = new JsonStore(file); await reload.load();
  assert.equal(reload.listForgeObservations().length, 1);
  assert.equal(reload.listForgeObservations()[0].sessionId, "native-s1");
  assert.equal(reload.listSessions().length, 0);
  assert.equal(reload.listShippingRuns().length, 0);
});

test("native Codex lifecycle hooks show real desktop subagents and tools, without phantom DAG", () => {
  const mk = (id, eventName, extra = {}) => ({
    id, source: "codex-hook/v1", sessionId: "desktop-1", eventName,
    receivedAt: "2026-10-22T01:00:00.000Z", ...extra
  });
  const graph = buildForgeGraph({ forgeObservations: [
    mk("a", "SessionStart"),
    mk("b", "PreToolUse", { turnId: "t1", toolUseId: "tool-1", toolName: "Bash" }),
    mk("c", "PostToolUse", { turnId: "t1", toolUseId: "tool-1", toolName: "Bash" }),
    mk("d", "SubagentStart", { turnId: "t1", agentId: "a2", agentType: "reviewer" }),
    mk("e", "SubagentStop", { turnId: "t1", agentId: "a2", agentType: "reviewer" }),
    mk("f", "Stop", { turnId: "t1" })
  ]});
  const root = graph.nodes.find(n => n.kind === "session");
  assert.equal(root.label, "Codex desktop · desktop-1");
  assert.equal(root.status, "turn-ended");
  assert.equal(graph.nodes.filter(n => n.kind === "subagent").length, 1);
  assert.equal(graph.nodes.find(n => n.kind === "subagent").status, "stopped");
  const tools = graph.nodes.filter(n => n.kind === "activity" && n.rawId === "tool-1");
  assert.equal(tools.length, 1);
  assert.equal(tools[0].status, "observed", "post-hook is observation, not a verification result");
  assert.ok(graph.edges.some(e => e.kind === "observed-native-subagent" && e.from === root.id));
  assert.equal(graph.taskDependencyGraphAvailable, false);
});

test("native hook endpoint is opt-in, loopback scoped and requires authenticated token", async () => {
  const port = await freePort();
  const tmp = await mkdtemp(path.join(os.tmpdir(), "rea-forge-hook-http-"));
  const token = "rea-forge-testing-token";
  const env = { ...process.env, NODE_ENV: "test", PORT: String(port),
    AGENT_WORK_OS_HOST: "127.0.0.1", AGENT_WORK_OS_TOKEN: token,
    AGENT_WORK_OS_ENABLE_FORGE_HOOKS: "true", AGENT_WORK_OS_STATE_PATH: path.join(tmp, "state.json") };
  const child = spawn(process.execPath, ["services/control-api/src/index.js"],
    { cwd: repo, env, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; child.stderr.on("data", chunk => logs.push(String(chunk)));
  const base = "http://127.0.0.1:" + port;
  try {
    await waitFor(async () => {
      try { return (await fetch(base + "/health")).ok; } catch { return false; }
    }, 9000);
    const body = JSON.stringify({ sessionId: "codex-native-1", eventName: "SubagentStart",
      agentId: "sub1", agentType: "reviewer", prompt: "secret", tool_input: { command: "password" } });
    const unauthenticated = await fetch(base + "/api/forge/observations", {
      method: "POST", headers: { "content-type": "application/json" }, body
    });
    assert.equal(unauthenticated.status, 401);
    const malformed = await fetch(base + "/api/forge/observations", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token },
      body: JSON.stringify({ sessionId: "forged", eventName: "VerifyShipped" })
    });
    assert.equal(malformed.status, 400);
    const accepted = await fetch(base + "/api/forge/observations", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body
    });
    assert.equal(accepted.status, 202, await accepted.text());
    const snapshot = await fetch(base + "/api/state", {
      headers: { authorization: "Bearer " + token }
    }).then(r => r.json());
    assert.equal(snapshot.forgeObservations.length, 1);
    assert.equal(snapshot.forgeObservations[0].agentId, "sub1");
    assert.equal(JSON.stringify(snapshot.forgeObservations).includes("secret"), false);
    assert.equal(snapshot.sessions.length, 0);
    assert.equal(snapshot.shippingRuns.length, 0);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([new Promise(resolve => child.once("exit", resolve)),
      new Promise(resolve => setTimeout(resolve, 1500))]);
  }
  assert.equal(logs.filter(s=>s.includes("request error")).length, 0);
});

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const p = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return p;
}
async function waitFor(fn, timeout) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw new Error("server_not_ready");
}
