import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMachinePolicy } from "../src/machine-policy.js";
import { MachineTaskManager } from "../src/machine-tasks.js";

function fixture() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "awos-task-workspace-"));
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "awos-task-state-"));
  const policy = createMachinePolicy({ workspaceRoots: [workspace], permissions: ["execute"], commands: [process.execPath] });
  return { workspace, state, policy };
}

async function waitFor(manager, taskId, statuses, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const record = await manager.status(taskId);
    if (statuses.includes(record.status)) return record;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`task_timeout_waiting_for:${statuses.join(",")}`);
}

test("durable task records output and can be recovered by a new manager", async () => {
  const { workspace, state, policy } = fixture();
  const manager = new MachineTaskManager(policy, { root: state, maxTimeoutMs: 5000 });
  const started = await manager.start({
    program: process.execPath,
    args: ["-e", "process.stdout.write('durable-out'); process.stderr.write('durable-err')"],
    cwd: workspace
  });
  const terminal = await waitFor(manager, started.taskId, ["completed", "failed"]);
  assert.equal(terminal.status, "completed");
  assert.equal(terminal.exitCode, 0);

  const recovered = new MachineTaskManager(policy, { root: state, maxTimeoutMs: 5000 });
  assert.equal((await recovered.status(started.taskId)).status, "completed");
  assert.equal((await recovered.output(started.taskId, { stream: "stdout" })).content, "durable-out");
  assert.equal((await recovered.output(started.taskId, { stream: "stderr" })).content, "durable-err");
  assert.ok((await recovered.list()).some((record) => record.taskId === started.taskId));
});

test("durable task can be canceled through its persisted runner handle", async () => {
  const { workspace, state, policy } = fixture();
  const manager = new MachineTaskManager(policy, { root: state, maxTimeoutMs: 10000 });
  const started = await manager.start({
    program: process.execPath,
    args: ["-e", "setInterval(() => process.stdout.write('.'), 100)"],
    cwd: workspace,
    timeoutMs: 8000
  });
  await waitFor(manager, started.taskId, ["running"]);
  const requested = await manager.cancel(started.taskId);
  assert.equal(requested.status, "cancel_requested");
  const terminal = await waitFor(manager, started.taskId, ["canceled", "failed", "timed_out"]);
  assert.equal(terminal.status, "canceled");
});
