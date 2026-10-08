import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const temp = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-work-memory-"));
const port = 19400 + Math.floor(Math.random() * 500);
const env = {
  ...process.env,
  AGENT_WORK_OS_HOST: "127.0.0.1",
  AGENT_WORK_OS_PORT: String(port),
  AGENT_WORK_OS_TOKEN: "work-memory-acceptance-token",
  AGENT_WORK_OS_STATE_PATH: path.join(temp, "state.json"),
  AGENT_WORK_OS_ROOMS_PATH: path.join(temp, "rooms.json"),
};
const base = `http://127.0.0.1:${port}`;
const headers = { "content-type": "application/json", authorization: "Bearer work-memory-acceptance-token" };
let api;

try {
  api = startApi();
  await waitFor(async () => (await fetch(`${base}/health`)).ok, 8000, "integrated api health");

  const unauthorized = await fetch(`${base}/api/work-items`);
  assert.equal(unauthorized.status, 401);

  const createdResponse = await fetch(`${base}/api/work-items`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: "work:acceptance",
      projectId: "project:acceptance",
      title: "Verify authoritative Work Memory integration",
      description: "Project Desk remains authoritative while Work Memory projects continuity context.",
      createdBy: { id: "acceptance-human", kind: "human" },
    }),
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.lane, "backlog");

  const claimResponse = await fetch(`${base}/api/work-items/${encodeURIComponent(created.id)}/claim`, {
    method: "POST",
    headers,
    body: JSON.stringify({ actor: { id: "acceptance-codex", kind: "agent", provider: "openai" } }),
  });
  assert.equal(claimResponse.status, 200);
  assert.equal((await claimResponse.json()).lane, "in_progress");

  const firstProjectionResponse = await fetch(`${base}/api/work-items/${encodeURIComponent(created.id)}/work-memory`, { headers });
  assert.equal(firstProjectionResponse.status, 200);
  const firstProjection = await firstProjectionResponse.json();
  assert.equal(firstProjection.schema, "work-memory-projection/v1");
  assert.equal(firstProjection.workState.owner.id, "acceptance-codex");
  assert.equal(firstProjection.authority.statusAuthority, "project-desk");
  assert.equal(firstProjection.authority.approvalAuthority, "project-desk");
  assert.equal(firstProjection.authority.mutableThroughProjection, false);

  const mutationResponse = await fetch(`${base}/api/work-items/${encodeURIComponent(created.id)}/work-memory`, {
    method: "POST",
    headers,
    body: JSON.stringify({ lane: "done" }),
  });
  assert.equal(mutationResponse.status, 405);
  assert.equal((await mutationResponse.json()).error, "work_memory_read_only");

  const decisionResponse = await fetch(`${base}/api/work-items/${encodeURIComponent(created.id)}/decision-requests`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      question: "Approve completion after exact-head verification?",
      kind: "completion",
      actor: { id: "acceptance-codex", kind: "agent", provider: "openai" },
    }),
  });
  assert.equal(decisionResponse.status, 201);
  const decision = await decisionResponse.json();

  const pendingProjection = await (await fetch(`${base}/api/work-items/${encodeURIComponent(created.id)}/work-memory`, { headers })).json();
  assert.deepEqual(pendingProjection.pendingDecisionIds, [decision.id]);
  assert.equal(pendingProjection.entries.find((entry) => entry.id === `decision:${decision.id}`).kind, "question");

  const resolveResponse = await fetch(`${base}/api/decisions/${encodeURIComponent(decision.id)}/resolve`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      status: "approved",
      comment: "Acceptance evidence reviewed.",
      actor: { id: "acceptance-human", kind: "human" },
    }),
  });
  assert.equal(resolveResponse.status, 200);

  const reportResponse = await fetch(`${base}/api/work-items/${encodeURIComponent(created.id)}/completion-report`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      actor: { id: "acceptance-codex", kind: "agent", provider: "openai" },
      report: {
        summary: "Integrated routing and projection verified.",
        commitSha: "acceptance-sha",
        ciStatus: "passed",
        testInstructions: "npm run acceptance",
      },
    }),
  });
  assert.equal(reportResponse.status, 200);

  const preComplete = await (await fetch(`${base}/api/work-items/${encodeURIComponent(created.id)}/work-memory`, { headers })).json();
  const attempt = preComplete.entries.find((entry) => entry.id === "completion-report");
  assert.equal(attempt.kind, "attempt");
  assert.equal(attempt.verified, false);
  assert.equal(preComplete.workState.done, false);

  const completeResponse = await fetch(`${base}/api/work-items/${encodeURIComponent(created.id)}/complete`, {
    method: "POST",
    headers,
    body: JSON.stringify({ actor: { id: "acceptance-human", kind: "human" } }),
  });
  assert.equal(completeResponse.status, 200);
  assert.equal((await completeResponse.json()).lane, "done");

  const completedProjection = await (await fetch(`${base}/api/work-items/${encodeURIComponent(created.id)}/work-memory`, { headers })).json();
  assert.equal(completedProjection.workState.done, true);
  const approvalEntry = completedProjection.entries.find((entry) => entry.id === `decision:${decision.id}`);
  assert.equal(approvalEntry.kind, "approval");
  assert.equal(approvalEntry.actor.type, "human");
  const digestBeforeRestart = completedProjection.digest;

  await stop(api);
  api = startApi();
  await waitFor(async () => (await fetch(`${base}/health`)).ok, 8000, "integrated api restart");
  const restartedProjectionResponse = await fetch(`${base}/api/work-items/${encodeURIComponent(created.id)}/work-memory`, { headers });
  assert.equal(restartedProjectionResponse.status, 200);
  const restartedProjection = await restartedProjectionResponse.json();
  assert.equal(restartedProjection.digest, digestBeforeRestart);
  assert.equal(restartedProjection.workState.done, true);

  console.log("[work-memory-acceptance] PASS: auth + authoritative work truth + read-only projection + approval authority + restart persistence");
} finally {
  if (api && api.exitCode === null) await stop(api);
}

function startApi() {
  const child = spawn(process.execPath, ["services/control-api/src/integrated-index.js"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (data) => process.stdout.write(data));
  child.stderr.on("data", (data) => process.stderr.write(data));
  return child;
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 1000)),
  ]);
}

async function waitFor(fn, timeout, label) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
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
