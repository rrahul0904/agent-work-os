import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const TASK_ID = /^task-[a-f0-9-]{36}$/;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_MAX_LOG_BYTES = 10 * 1024 * 1024;
const DEFAULT_OUTPUT_BYTES = 64 * 1024;

function assertTaskId(taskId) {
  if (typeof taskId !== "string" || !TASK_ID.test(taskId)) throw new Error("machine_task_id_invalid");
  return taskId;
}

async function atomicWriteJson(destination, value) {
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temp = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temp, destination);
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export class MachineTaskManager {
  constructor(policy, options = {}) {
    this.policy = policy;
    this.root = path.resolve(options.root ?? ".agent-work-os/machine-tasks");
    this.maxTimeoutMs = Number(options.maxTimeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.maxLogBytes = Number(options.maxLogBytes ?? DEFAULT_MAX_LOG_BYTES);
    this.outputBytes = Number(options.outputBytes ?? DEFAULT_OUTPUT_BYTES);
    this.spawnImpl = options.spawnImpl ?? spawn;
    this.runner = options.runner ?? fileURLToPath(new URL("./machine-task-runner.js", import.meta.url));
  }

  paths(taskId) {
    assertTaskId(taskId);
    return {
      spec: path.join(this.root, `${taskId}.spec.json`),
      record: path.join(this.root, `${taskId}.json`),
      stdout: path.join(this.root, `${taskId}.stdout.log`),
      stderr: path.join(this.root, `${taskId}.stderr.log`)
    };
  }

  async start(request = {}) {
    const program = this.policy.assertCommand(request.program);
    const cwd = this.policy.resolveWorkspacePath(request.cwd ?? ".", "execute");
    const args = Array.isArray(request.args) ? request.args : [];
    if (args.some((arg) => typeof arg !== "string")) throw new Error("machine_task_args_invalid");
    if (args.length > 256) throw new Error("machine_task_args_too_many");
    const requestedTimeout = Number(request.timeoutMs ?? this.maxTimeoutMs);
    const timeoutMs = Math.max(1, Math.min(Number.isFinite(requestedTimeout) ? requestedTimeout : this.maxTimeoutMs, this.maxTimeoutMs));
    const taskId = `task-${randomUUID()}`;
    const files = this.paths(taskId);
    const now = new Date().toISOString();
    const spec = { taskId, program, args, cwd, timeoutMs, maxLogBytes: this.maxLogBytes, createdAt: now };
    const record = { taskId, status: "starting", program, args, cwd, createdAt: now, updatedAt: now, timeoutMs };
    await atomicWriteJson(files.spec, spec);
    await atomicWriteJson(files.record, record);

    const description = this.policy.describe();
    const env = {
      ...process.env,
      AGENT_WORK_OS_WORKSPACE_ROOTS: description.workspaceRoots.join(path.delimiter),
      AGENT_WORK_OS_MACHINE_PERMISSIONS: description.permissions.join(","),
      AGENT_WORK_OS_EXEC_ALLOW: description.commands.join(",")
    };
    delete env.AGENT_WORK_OS_MACHINE_TOKEN;
    delete env.AGENT_WORK_OS_TOKEN;
    delete env.AGENT_WORK_OS_MCP_TOKEN;
    const runner = this.spawnImpl(process.execPath, [this.runner, files.spec], {
      cwd,
      env,
      detached: true,
      shell: false,
      stdio: "ignore"
    });
    await new Promise((resolve, reject) => {
      runner.once("spawn", resolve);
      runner.once("error", reject);
    });
    runner.unref?.();

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const current = await this.status(taskId);
      if (current.runnerPid || current.status !== "starting") return current;
      await sleep(25);
    }
    return { ...(await this.status(taskId)), launchPid: runner.pid };
  }

  async status(taskId) {
    const files = this.paths(taskId);
    try { return JSON.parse(await fs.readFile(files.record, "utf8")); }
    catch (error) {
      if (error.code === "ENOENT") throw new Error("machine_task_not_found");
      throw error;
    }
  }

  async list() {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const names = await fs.readdir(this.root);
    const taskIds = names.filter((name) => /^task-[a-f0-9-]{36}\.json$/.test(name)).map((name) => name.slice(0, -5));
    const records = await Promise.all(taskIds.map((taskId) => this.status(taskId).catch(() => null)));
    return records.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async output(taskId, { stream = "stdout", offset = 0, maxBytes = this.outputBytes } = {}) {
    if (!new Set(["stdout", "stderr"]).has(stream)) throw new Error("machine_task_stream_invalid");
    const files = this.paths(taskId);
    const target = files[stream];
    const start = Math.max(0, Number(offset) || 0);
    const requested = Math.max(1, Number(maxBytes) || this.outputBytes);
    const length = Math.min(requested, this.outputBytes);
    let handle;
    try {
      handle = await fs.open(target, "r");
      const stat = await handle.stat();
      if (start >= stat.size) return { taskId, stream, offset: start, nextOffset: start, eof: true, content: "" };
      const buffer = Buffer.alloc(Math.min(length, stat.size - start));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
      const nextOffset = start + bytesRead;
      return { taskId, stream, offset: start, nextOffset, eof: nextOffset >= stat.size, content: buffer.subarray(0, bytesRead).toString("utf8") };
    } catch (error) {
      if (error.code === "ENOENT") return { taskId, stream, offset: start, nextOffset: start, eof: true, content: "" };
      throw error;
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  async cancel(taskId) {
    const record = await this.status(taskId);
    if (!["starting", "running", "cancel_requested"].includes(record.status)) return record;
    if (!record.runnerPid) throw new Error("machine_task_runner_unavailable");
    try { process.kill(record.runnerPid, "SIGTERM"); }
    catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    const next = { ...record, status: "cancel_requested", cancelRequestedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await atomicWriteJson(this.paths(taskId).record, next);
    return next;
  }
}

export function createMachineTaskManagerFromEnv(policy, env = process.env) {
  return new MachineTaskManager(policy, {
    root: env.AGENT_WORK_OS_MACHINE_TASKS_STATE ?? ".agent-work-os/machine-tasks",
    maxTimeoutMs: Number(env.AGENT_WORK_OS_MACHINE_TASK_MAX_MS ?? DEFAULT_TIMEOUT_MS),
    maxLogBytes: Number(env.AGENT_WORK_OS_MACHINE_TASK_LOG_BYTES ?? DEFAULT_MAX_LOG_BYTES)
  });
}
