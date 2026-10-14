import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ProjectContextStore } from "../../../runtime/daemon/src/project-context-store.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const daemonPath = path.join(repoRoot, "runtime/daemon/src/index.js");

async function waitFor(check, { timeoutMs = 6000, intervalMs = 40 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await check();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for condition; last=${JSON.stringify(last)}`);
}

test("HTTP session request -> local context handoff -> daemon receipt -> completed session", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-work-os-context-e2e-"));
  const statePath = path.join(root, "control-state.json");
  const contextRoot = path.join(root, "private-context");
  const homeRoot = path.join(root, "daemon-home");

  process.env.PORT = "0";
  process.env.AGENT_WORK_OS_TOKEN = "context-e2e-token";
  process.env.AGENT_WORK_OS_STATE_PATH = statePath;
  const { createControlPlane } = await import(`../src/index.js?context-e2e=${Date.now()}`);
  const cp = await createControlPlane();
  await cp.listen();
  const address = cp.server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const contextStore = new ProjectContextStore(contextRoot);
  const revision = await contextStore.writeSnapshot({
    schemaVersion: "project-context/v1",
    projectId: "alpha",
    revision: "r1",
    updatedAt: "2026-10-08T18:30:00.000Z",
    summary: "The private project context used by the e2e fixture.",
    constraints: ["Do not treat context as authorization for external writes."],
    decisions: [{ id: "D001", status: "active", statement: "Bind every run to an immutable context digest." }],
    evidenceRefs: ["test:context-e2e"],
  });

  let daemonStdout = "";
  let daemonStderr = "";
  const daemon = spawn(process.execPath, [daemonPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AGENT_WORK_OS_SERVER_URL: `ws://127.0.0.1:${address.port}/ws`,
      AGENT_WORK_OS_TOKEN: "context-e2e-token",
      AGENT_WORK_OS_HOME: homeRoot,
      AGENT_WORK_OS_CONTEXT_ROOT: contextRoot,
      AGENT_WORK_OS_ENABLE_ECHO: "true",
      AGENT_WORK_OS_HEARTBEAT_MS: "100",
      AGENT_WORK_OS_MACHINE_NAME: "context-e2e-daemon",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  daemon.stdout.on("data", (chunk) => { daemonStdout += String(chunk); });
  daemon.stderr.on("data", (chunk) => { daemonStderr += String(chunk); });

  t.after(async () => {
    daemon.kill("SIGTERM");
    await new Promise((resolve) => {
      if (daemon.exitCode !== null) return resolve();
      const timer = setTimeout(resolve, 1000);
      daemon.once("exit", () => { clearTimeout(timer); resolve(); });
    });
    await cp.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  const machine = await waitFor(() => cp.store.listMachines().find((item) => item.status === "online"), { timeoutMs: 8000 });
  assert.equal(machine.projectContext?.enabled, true);
  assert.ok(machine.capabilities.some((capability) => capability.name === "echo"));

  const response = await fetch(`${base}/api/sessions`, {
    method: "POST",
    headers: {
      authorization: "Bearer context-e2e-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      machineId: machine.id,
      cwd: repoRoot,
      agent: "echo",
      prompt: "Verify the context-aware session path.",
      context: {
        projectId: "alpha",
        worktreeId: "wt-e2e",
        taskId: "task-e2e",
        budgetChars: 2048,
      },
    }),
  });
  assert.equal(response.status, 201, `daemon stdout=${daemonStdout}\ndaemon stderr=${daemonStderr}`);
  const created = await response.json();

  const completed = await waitFor(() => {
    const session = cp.store.getSession(created.id);
    return session?.status === "completed" ? session : null;
  }, { timeoutMs: 8000 });

  const contextEvent = completed.events.find((event) => event.kind === "context");
  assert.ok(contextEvent, `events=${JSON.stringify(completed.events)} daemon stderr=${daemonStderr}`);
  assert.equal(contextEvent.receipt.schemaVersion, "context-injection-receipt/v1");
  assert.equal(contextEvent.receipt.binding.projectId, "alpha");
  assert.equal(contextEvent.receipt.binding.worktreeId, "wt-e2e");
  assert.equal(contextEvent.receipt.binding.taskId, "task-e2e");
  assert.equal(contextEvent.receipt.binding.runId, created.id);
  assert.equal(contextEvent.receipt.context.revision, "r1");
  assert.equal(contextEvent.receipt.context.digest, revision.digest);
  assert.equal(JSON.stringify(contextEvent.receipt).includes("private project context"), false);

  const localHandoff = await contextStore.readHandoff("alpha", contextEvent.receipt.handoffId);
  assert.equal(localHandoff.context.digest, revision.digest);
  assert.match(localHandoff.prompt, /Bind every run to an immutable context digest/);
  assert.equal(contextEvent.receipt.contextPromptDigest, localHandoff.promptDigest);
});
