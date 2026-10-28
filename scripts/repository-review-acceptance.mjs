#!/usr/bin/env node
/**
 * Multi-agent real-path acceptance with disposable dependencies. This launches
 * a real control API + daemon, fake but protocol-valid local model servers,
 * and a stub CodeAtlas executable bound to an actual Git revision/index.
 * Never reads an operator repository or sends data over the internet.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, chmod, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sealCodeAtlasIndex } from "../runtime/daemon/src/codeatlas-search-adapter.js";

const root = process.cwd();
const tmp = await mkdtemp(path.join(os.tmpdir(), "awos-multi-agent-e2e-"));
const project = path.join(tmp, "project");
const bin = path.join(tmp, "bin");
const children = [];
const observed = { analyst: [], reviewer: [], index: [] };
const token = "mission-e2e-control-token";
const gatewayKey = "mission-e2e-token-intelligence-test-only-key";
const headers = { authorization: "Bearer " + token };
const servers = [];
function createProvider(kind) {
  const server = http.createServer(async (req, res) => {
    if (kind === "analyst" && req.url !== "/v1/chat/completions") { res.writeHead(404).end(); return; }
    if (kind === "reviewer" && req.url !== "/api/v1/inference/chat-completions") { res.writeHead(404).end(); return; }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    observed[kind].push({ path: req.url, input, authorization: req.headers.authorization,
      idempotencyKey: req.headers["idempotency-key"] });
    if (kind === "reviewer" && (req.headers.authorization !== "Bearer " + gatewayKey || !req.headers["idempotency-key"])) {
      res.writeHead(401).end(); return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    const isAnalyst = kind === "analyst";
    res.end(JSON.stringify({
      id: "e2e-" + kind,
      model: isAnalyst ? "mission-analyst-fixture" : "mission-reviewer-fixture",
      ...(isAnalyst ? {} : {
        receipt_id: "iev_00000000-0000-4000-8000-000000000001", billing_state: "not_billed"
      }),
      choices: [{ finish_reason: "stop", message: {
        role: "assistant", content: isAnalyst
          ? "Hypothesis: possible duplicate-order retry. Inspect idempotency safeguards."
          : "Review: hypothesis is unproven; require duplicate-event regression and source inspection."
      } }],
      usage: { prompt_tokens: isAnalyst ? 35 : 57, completion_tokens: 14 }
    }));
  });
  servers.push(server);
  return server;
}
const analystServer = createProvider("analyst");
const reviewServer = createProvider("reviewer");
const port = 24_000 + Math.floor(Math.random() * 19_000);
async function waitFor(fn, label, timeout = 14_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const answer = await fn(); if (answer) return answer; }
    catch {}
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error("timeout: " + label);
}
function launch(file, env) {
  const child = spawn(process.execPath, [file], { env, cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (data) => {
    const str = data.toString("utf8");
    if (!str.includes(gatewayKey)) process.stdout.write(str);
  });
}
try {
  await mkdir(project);
  await mkdir(bin);
  await writeFile(path.join(project, "orders.py"), "def process_orders(order):\n    return order\n");
  await writeFile(path.join(project, ".env"), "REAL_SECRET_MUST_NOT_LEAK=disposable");
  execFileSync("git", ["init", "-q", project]);
  execFileSync("git", ["-C", project, "add", "orders.py"]);
  execFileSync("git", ["-C", project, "-c", "user.name=CI", "-c", "user.email=ci@example.invalid",
    "commit", "-qm", "approved fixture"]);
  await mkdir(path.join(project, ".codeatlas"));
  await writeFile(path.join(project, ".codeatlas", "index.sqlite3"), "fixture synthetic database");
  const seal = sealCodeAtlasIndex(project);
  const executable = path.join(bin, "codeatlas");
  await writeFile(executable, "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify([{qualified_name:'process_orders',kind:'function',language:'python',file_path:'orders.py',start_line:1,private_details:'SENSITIVE_NOT_FOR_EXPORT'}]));\n");
  await chmod(executable, 0o755);
  for (const server of servers) {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
  }
  const env = {
    ...process.env, NODE_ENV: "test", DATABASE_URL: "",
    PATH: bin + path.delimiter + process.env.PATH,
    AGENT_WORK_OS_PORT: String(port), AGENT_WORK_OS_HOST: "127.0.0.1",
    AGENT_WORK_OS_TOKEN: token,
    AGENT_WORK_OS_STATE_PATH: path.join(tmp, "state.json"),
    AGENT_WORK_OS_HOME: path.join(tmp, "daemon-home"),
    AGENT_WORK_OS_SERVER_URL: "ws://127.0.0.1:" + port + "/ws",
    AGENT_WORK_OS_SHIPPING_STATE: path.join(tmp, "shipping"),
    AGENT_WORK_OS_MACHINE_NAME: "mission-review-e2e",
    AGENT_WORK_OS_CODEATLAS_READONLY_ENABLED: "true",
    AGENT_WORK_OS_CODEATLAS_ROOT: project,
    AGENT_WORK_OS_COMPAT_CHAT_ENABLED: "true",
    AGENT_WORK_OS_COMPAT_CHAT_BASE_URL: "http://127.0.0.1:" + analystServer.address().port + "/v1",
    AGENT_WORK_OS_COMPAT_CHAT_MODEL: "mission-analyst-fixture",
    AGENT_WORK_OS_COMPAT_CHAT_UPSTREAM_REGION: "local",
    AGENT_WORK_OS_COMPAT_CHAT_UPSTREAM_RETENTION: "zero",
    AGENT_WORK_OS_TI_ENABLED: "true",
    AGENT_WORK_OS_TI_ENDPOINT: "http://127.0.0.1:" + reviewServer.address().port + "/api/v1/inference/chat-completions",
    AGENT_WORK_OS_TI_API_KEY: gatewayKey,
    AGENT_WORK_OS_TI_MODEL: "mission-reviewer-fixture",
    AGENT_WORK_OS_TI_UPSTREAM_DESTINATION: "local_machine",
    AGENT_WORK_OS_TI_UPSTREAM_REGION: "local",
    AGENT_WORK_OS_TI_UPSTREAM_RETENTION: "zero",
    AGENT_WORK_OS_TI_PRIVATE_UPSTREAM_APPROVED: "true",
    AGENT_WORK_OS_MISSION_REVIEW_ENABLED: "true",
    AGENT_WORK_OS_MISSION_CONTEXT_EXPORT_APPROVED: "true",
    AGENT_WORK_OS_MISSION_GATEWAY_PRIVACY_REVIEWED: "true"
  };
  const base = "http://127.0.0.1:" + port;
  launch("services/control-api/src/index.js", env);
  await waitFor(async () => (await fetch(base + "/health")).ok, "control health");
  launch("runtime/daemon/src/index.js", env);
  const machine = await waitFor(async () => {
    const state = await (await fetch(base + "/api/state", { headers })).json();
    return state.machines.find((m) => m.name === "mission-review-e2e" && m.status === "online" &&
      m.capabilities?.some((c) => c.name === "repository-review"));
  }, "verified capability");
  const initial = await fetch(base + "/api/sessions", {
    method: "POST", headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      machineId: machine.id, cwd: project, agent: "repository-review",
      prompt: "investigate process_orders | Explain the possible retry bug"
    })
  });
  const body = await initial.text();
  assert.equal(initial.status, 201, body);
  const session = JSON.parse(body);
  const prepared = await waitFor(async () => {
    const response = await fetch(base + "/api/sessions/" + session.id, { headers });
    const state = await response.json();
    if (state.status === "failed") throw new Error("prepare failed " + JSON.stringify(state));
    const proposal = state.messages?.find((m) => m.text?.includes("mission.approval_required"));
    return proposal ? { state, proposal: JSON.parse(proposal.text) } : null;
  }, "approval proposal");
  assert.equal(prepared.proposal.type, "mission.approval_required");
  assert.deepEqual([observed.analyst.length, observed.reviewer.length], [0, 0]);
  assert.equal(prepared.proposal.plan.revision, seal.revision);

  // A wrong digest is refused without a provider request.
  const wrong = await fetch(base + "/api/sessions/" + session.id + "/messages", {
    method: "POST", headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ text: "approve " + "f".repeat(64) })
  });
  assert.equal(wrong.status, 202);
  await waitFor(async () => {
    const state = await (await fetch(base + "/api/sessions/" + session.id, { headers })).json();
    return state.status === "failed" ? state : null;
  }, "wrong approval refused");
  assert.deepEqual([observed.analyst.length, observed.reviewer.length], [0, 0]);

  // Create a fresh session for the valid-approval success path.
  const fresh = await fetch(base + "/api/sessions", {
    method: "POST", headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ machineId: machine.id, cwd: project, agent: "repository-review",
      prompt: "investigate process_orders | Explain the possible retry bug" })
  });
  assert.equal(fresh.status, 201);
  const acceptedSession = await fresh.json();
  const ready = await waitFor(async () => {
    const state = await (await fetch(base + "/api/sessions/" + acceptedSession.id, { headers })).json();
    const approval = state.messages?.find((m) => m.text?.includes("mission.approval_required"));
    return approval ? JSON.parse(approval.text) : null;
  }, "fresh proposal");
  const approve = await fetch(base + "/api/sessions/" + acceptedSession.id + "/messages", {
    method: "POST", headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ text: "approve " + ready.approvalHash })
  });
  assert.equal(approve.status, 202);
  const final = await waitFor(async () => {
    const state = await (await fetch(base + "/api/sessions/" + acceptedSession.id, { headers })).json();
    if (state.status === "failed") throw new Error("approved mission failed " + JSON.stringify(state));
    const report = state.messages?.find((m) => m.text?.includes("mission.review_complete"));
    return report ? { state, report: JSON.parse(report.text) } : null;
  }, "completed multi-agent run");
  assert.equal(final.report.status, "human_review_required");
  assert.equal(final.report.indexDigest, seal.dbSha256);
  assert.equal(final.report.deployed, false);
  assert.equal(final.report.codeChanged, false);
  assert.deepEqual([observed.analyst.length, observed.reviewer.length], [1, 1]);
  assert.equal(observed.analyst[0].input.model, "mission-analyst-fixture");
  assert.equal(observed.reviewer[0].input.model, "mission-reviewer-fixture");
  assert.equal(observed.reviewer[0].authorization, "Bearer " + gatewayKey);
  assert.equal(observed.reviewer[0].input.store, false);
  assert.equal(observed.reviewer[0].input.stream, false);
  const transcript = JSON.stringify(final.state);
  assert.ok(!transcript.includes(gatewayKey));
  assert.ok(!transcript.includes("SENSITIVE_NOT_FOR_EXPORT"));
  assert.ok(!transcript.includes("REAL_SECRET_MUST_NOT_LEAK"));
  console.log("[repository-review-acceptance] PASS: browser API -> approval -> CodeAtlas -> two real model HTTP calls -> human review evidence; wrong digest blocked");
} finally {
  for (const child of children.reverse()) child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 250));
  for (const server of servers) {
    if (server.listening) {
      server.close();
      await once(server, "close");
    }
  }
  await rm(tmp, { recursive: true, force: true });
}
