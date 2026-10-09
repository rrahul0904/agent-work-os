import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { DecisionMemory } from "../packages/decision-memory/src/index.js";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const temp = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-work-handoff-"));
const workspace = path.join(temp, "workspace");
await mkdir(workspace);
const memory = await DecisionMemory.init(workspace, "acceptance/work-handoff");
const verifiedDecision = await memory.log({
  claim: "Continuation must preserve verified evidence",
  choice: "Use the RE-297 handoff journal",
  rationale: "It is the existing durable verified handoff authority",
  source: "test://work-handoff-acceptance",
  sourceHash: "work-handoff-source-sha",
  actor: "acceptance",
  verification: "verified",
  sensitivity: "shareable",
});

const port = 19900 + Math.floor(Math.random() * 400);
const env = {
  ...process.env,
  AGENT_WORK_OS_HOST: "127.0.0.1",
  AGENT_WORK_OS_PORT: String(port),
  AGENT_WORK_OS_TOKEN: "handoff-acceptance-token",
  AGENT_WORK_OS_STATE_PATH: path.join(temp, "state.json"),
  AGENT_WORK_OS_ROOMS_PATH: path.join(temp, "rooms.json"),
  AGENT_WORK_OS_SERVER_URL: `ws://127.0.0.1:${port}/ws`,
  AGENT_WORK_OS_HOME: path.join(temp, "daemon-home"),
  AGENT_WORK_OS_MACHINE_NAME: "handoff-acceptance-machine",
  AGENT_WORK_OS_ENABLE_ECHO: "true",
};
const base = `http://127.0.0.1:${port}`;
const controlHeaders = { "content-type": "application/json", authorization: "Bearer handoff-acceptance-token" };
const children = [];

try {
  start(["services/control-api/src/integrated-index.js"]);
  await waitFor(async () => (await fetch(`${base}/health`)).ok, 8000, "integrated api health");
  start(["runtime/daemon/src/index.js"]);
  const machine = await waitFor(async () => {
    const state = await (await fetch(`${base}/api/state`)).json();
    return state.machines.find((item) => item.name === "handoff-acceptance-machine" && item.status === "online");
  }, 8000, "daemon registration");

  const firstResponse = await fetch(`${base}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ machineId: machine.id, cwd: workspace, agent: "echo", prompt: "establish source session" }),
  });
  assert.equal(firstResponse.status, 201);
  const first = await firstResponse.json();
  const firstCompleted = await waitFor(async () => {
    const session = await (await fetch(`${base}/api/sessions/${first.id}`)).json();
    return session.status === "completed" ? session : null;
  }, 8000, "source session completion");
  assert.ok(firstCompleted.nativeSessionId);

  const workResponse = await fetch(`${base}/api/work-items`, {
    method: "POST",
    headers: controlHeaders,
    body: JSON.stringify({
      id: "work:handoff",
      projectId: "project:handoff",
      title: "Continue work across agent sessions",
      description: "Bind authoritative project state to verified local handoff memory.",
      createdBy: { id: "acceptance-human", kind: "human" },
    }),
  });
  assert.equal(workResponse.status, 201);
  const claimResponse = await fetch(`${base}/api/work-items/${encodeURIComponent("work:handoff")}/claim`, {
    method: "POST",
    headers: controlHeaders,
    body: JSON.stringify({ actor: { id: "acceptance-agent", kind: "agent", provider: "openai" } }),
  });
  assert.equal(claimResponse.status, 200);

  const handoffResponse = await fetch(`${base}/api/work-items/${encodeURIComponent("work:handoff")}/handoffs`, {
    method: "POST",
    headers: controlHeaders,
    body: JSON.stringify({ fromSessionId: first.id, nextAction: "Resume in a fresh verifier session" }),
  });
  assert.equal(handoffResponse.status, 201);
  const handoff = await handoffResponse.json();
  assert.equal(handoff.receipt.schema, "work-memory-handoff-receipt/v1");
  assert.equal(handoff.receipt.workId, "work:handoff");
  assert.equal(handoff.receipt.snapshotHash, handoff.handoff.contentHash);
  assert.ok(handoff.handoff.checks.includes(`work-memory-sha256:${handoff.receipt.projectionDigest}`));
  assert.ok(handoff.handoff.decisions.some((reference) => reference.id === verifiedDecision.id));

  const freshResponse = await fetch(`${base}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      machineId: machine.id,
      cwd: workspace,
      agent: "echo",
      prompt: "continue from the verified work handoff",
      handoffId: handoff.receipt.handoffId,
      brainMode: "verified-context",
    }),
  });
  assert.equal(freshResponse.status, 201);
  const fresh = await freshResponse.json();
  const recalled = await waitFor(async () => {
    const session = await (await fetch(`${base}/api/sessions/${fresh.id}`)).json();
    return session.status === "completed" ? session : null;
  }, 8000, "fresh session verified recall");

  const proof = recalled.events.find((event) => event.kind === "memory.proof");
  assert.ok(proof);
  assert.equal(proof.handoffId, handoff.receipt.handoffId);
  assert.equal(proof.snapshotHash, handoff.receipt.snapshotHash);
  assert.ok(proof.decisionRefs.some((reference) => reference.id === verifiedDecision.id));
  const context = recalled.events.find((event) => event.kind === "memory.context");
  assert.ok(context);
  const brainMessage = recalled.messages.find((message) => message.role === "assistant" && message.text.includes("AGENT WORK OS SHARED BRAIN"));
  assert.ok(brainMessage);
  assert.match(brainMessage.text, /Continue work across agent sessions/);
  assert.match(brainMessage.text, new RegExp(`work-memory-sha256:${handoff.receipt.projectionDigest}`));
  assert.match(brainMessage.text, /Resume in a fresh verifier session/);
  assert.match(brainMessage.text, /Use the RE-297 handoff journal/);
  assert.match(brainMessage.text, /CURRENT USER REQUEST\ncontinue from the verified work handoff/);

  const view = await memory.load();
  assert.equal(view.handoffs[handoff.receipt.handoffId].contentHash, handoff.receipt.snapshotHash);
  assert.equal(view.recalls[`${handoff.receipt.handoffId}:${fresh.id}`].snapshotHash, handoff.receipt.snapshotHash);

  console.log("[work-handoff-acceptance] PASS: authoritative Work Memory projection -> RE-297 handoff -> fresh verified-context agent session");
} finally {
  for (const child of children.reverse()) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
}

function start(args) {
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  child.stdout.on("data", (data) => process.stdout.write(data));
  child.stderr.on("data", (data) => process.stderr.write(data));
  return child;
}

async function waitFor(fn, timeout, label) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    try {
      last = await fn();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out waiting for ${label}: ${last?.message || last || ""}`);
}
