#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createMachinePolicyFromEnv } from "./machine-policy.js";

const specPath = process.argv[2];
if (!specPath) throw new Error("machine_task_spec_required");

async function atomicWriteJson(destination, value) {
  const temp = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temp, destination);
}

const policy = createMachinePolicyFromEnv();
const spec = JSON.parse(await fs.readFile(specPath, "utf8"));
if (typeof spec.taskId !== "string" || !/^task-[a-f0-9-]{36}$/.test(spec.taskId)) throw new Error("machine_task_id_invalid");
const root = path.dirname(path.resolve(specPath));
const expectedSpec = path.join(root, `${spec.taskId}.spec.json`);
if (path.resolve(specPath) !== expectedSpec) throw new Error("machine_task_spec_path_invalid");
const recordPath = path.join(root, `${spec.taskId}.json`);
const stdoutPath = path.join(root, `${spec.taskId}.stdout.log`);
const stderrPath = path.join(root, `${spec.taskId}.stderr.log`);
const program = policy.assertCommand(spec.program);
const cwd = policy.resolveWorkspacePath(spec.cwd, "execute");
const args = Array.isArray(spec.args) ? spec.args : [];
if (args.some((arg) => typeof arg !== "string") || args.length > 256) throw new Error("machine_task_args_invalid");
const timeoutMs = Math.max(1, Number(spec.timeoutMs) || 1);
const maxLogBytes = Math.max(1024, Number(spec.maxLogBytes) || 10 * 1024 * 1024);
const now = () => new Date().toISOString();
let child;
let cancelRequested = false;
let timedOut = false;
let stdoutBytes = 0;
let stderrBytes = 0;
let stdoutTruncated = false;
let stderrTruncated = false;
let forceKillTimer;

async function readRecord() {
  try { return JSON.parse(await fs.readFile(recordPath, "utf8")); }
  catch { return { taskId: spec.taskId, program, args, cwd, createdAt: spec.createdAt ?? now() }; }
}

async function save(patch) {
  const current = await readRecord();
  const next = { ...current, ...patch, updatedAt: now() };
  await atomicWriteJson(recordPath, next);
  return next;
}

async function appendBounded(target, chunk, stream) {
  const current = stream === "stdout" ? stdoutBytes : stderrBytes;
  if (current >= maxLogBytes) {
    if (stream === "stdout") stdoutTruncated = true; else stderrTruncated = true;
    return;
  }
  const remaining = maxLogBytes - current;
  const slice = chunk.subarray(0, remaining);
  if (slice.length) await fs.appendFile(target, slice, { mode: 0o600 });
  if (stream === "stdout") {
    stdoutBytes += slice.length;
    if (chunk.length > slice.length) stdoutTruncated = true;
  } else {
    stderrBytes += slice.length;
    if (chunk.length > slice.length) stderrTruncated = true;
  }
}

function requestStop(reason) {
  if (reason === "timeout") timedOut = true;
  else cancelRequested = true;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (forceKillTimer) clearTimeout(forceKillTimer);
  forceKillTimer = setTimeout(() => {
    if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }, 5000);
  forceKillTimer.unref?.();
}

process.on("SIGTERM", () => requestStop("cancel"));
process.on("SIGINT", () => requestStop("cancel"));

const childEnv = { ...process.env };
delete childEnv.AGENT_WORK_OS_MACHINE_TOKEN;
delete childEnv.AGENT_WORK_OS_TOKEN;
delete childEnv.AGENT_WORK_OS_MCP_TOKEN;

try {
  await fs.writeFile(stdoutPath, "", { flag: "a", mode: 0o600 });
  await fs.writeFile(stderrPath, "", { flag: "a", mode: 0o600 });
  child = spawn(program, args, { cwd, env: childEnv, shell: false, stdio: ["ignore", "pipe", "pipe"] });
  await save({
    status: cancelRequested ? "cancel_requested" : "running",
    runnerPid: process.pid,
    childPid: child.pid,
    startedAt: now(),
    timeoutMs,
    stdoutPath,
    stderrPath
  });
  if (cancelRequested) requestStop("cancel");

  let writeChain = Promise.resolve();
  child.stdout.on("data", (chunk) => { writeChain = writeChain.then(() => appendBounded(stdoutPath, Buffer.from(chunk), "stdout")); });
  child.stderr.on("data", (chunk) => { writeChain = writeChain.then(() => appendBounded(stderrPath, Buffer.from(chunk), "stderr")); });
  child.once("error", async (error) => {
    await save({ status: "failed", error: error.message, finishedAt: now() }).catch(() => {});
  });

  const timeout = setTimeout(() => requestStop("timeout"), timeoutMs);
  timeout.unref?.();
  const result = await new Promise((resolve) => child.once("close", (exitCode, signal) => resolve({ exitCode, signal })));
  clearTimeout(timeout);
  if (forceKillTimer) clearTimeout(forceKillTimer);
  await writeChain;
  const terminalStatus = cancelRequested ? "canceled" : timedOut ? "timed_out" : result.exitCode === 0 ? "completed" : "failed";
  await save({
    status: terminalStatus,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut,
    cancelRequested,
    stdoutBytes,
    stderrBytes,
    stdoutTruncated,
    stderrTruncated,
    finishedAt: now()
  });
} catch (error) {
  await save({ status: "failed", error: error.message, finishedAt: now() }).catch(() => {});
  process.exitCode = 1;
}
