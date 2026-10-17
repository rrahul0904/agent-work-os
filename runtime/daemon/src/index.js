#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { PROTOCOL_VERSION, decodeMessage, encodeMessage } from "../../../packages/protocol/src/index.js";
import { createDefaultShippingSupervisor } from "../../../services/control-api/src/shipping-supervisor.js";
import { ShippingStore } from "../../../services/control-api/src/shipping-store.js";
import { ClaudeCodeAdapter, CodexAdapter, EchoAdapter } from "./adapters.js";
import { CapabilityVerificationAdapter } from "./capability-verification-adapter.js";
import { loadMachineId } from "./identity.js";
import { createCommandReceiptCache } from "./command-receipts.js";
import { createPersistentWorkSupervisor } from "./work-supervisor-store.js";

const serverUrl = process.env.AGENT_WORK_OS_SERVER_URL ?? "ws://127.0.0.1:8787/ws";
const machineCredential = process.env.AGENT_WORK_OS_MACHINE_TOKEN ?? "";
const token = process.env.AGENT_WORK_OS_TOKEN ?? (process.env.NODE_ENV === "production" ? "" : "dev-token");
const machineName = process.env.AGENT_WORK_OS_MACHINE_NAME || os.hostname();
const heartbeatMs = Number(process.env.AGENT_WORK_OS_HEARTBEAT_MS ?? 15000);
const shippingStateRoot = path.resolve(process.env.AGENT_WORK_OS_SHIPPING_STATE ?? ".agent-work-os/shipping-state");
const runtimeSupervisorPath = path.resolve(process.env.AGENT_WORK_OS_RUNTIME_SUPERVISOR_STATE ?? ".agent-work-os/runtime-supervisor.json");
const machineId = await loadMachineId();
const adapters = new Map();
const nativeSessions = new Map();
const shippingRuns = new Set();
const activeWorkBySession = new Map();
const commandReceipts = createCommandReceiptCache();
const workSupervisor = await createPersistentWorkSupervisor({ filePath: runtimeSupervisorPath });
if (process.env.AGENT_WORK_OS_ENABLE_ECHO !== "false") adapters.set("echo", new EchoAdapter());
const codex = new CodexAdapter();
if (codex.capability()) adapters.set("codex", codex);
const claudeCode = new ClaudeCodeAdapter();
if (claudeCode.capability()) adapters.set("claude-code", claudeCode);
const capabilityVerification = new CapabilityVerificationAdapter(codex, claudeCode);
if (capabilityVerification.capability()) adapters.set("capability-verify", capabilityVerification);

let ws; let heartbeat; let reconnectTimer; let reconnectAttempt = 0; let shuttingDown = false;
console.log(`[daemon] machine id ${machineId}`);
function connect() {
  if (shuttingDown) return;
  const url = new URL(serverUrl); url.searchParams.set("role", "daemon");
  if (!machineCredential && token) url.searchParams.set("token", token);
  ws = new WebSocket(url);
  ws.addEventListener("open", () => {
    reconnectAttempt = 0;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = undefined; }
    const capabilities = [...adapters.values()].map((a) => a.capability()).filter(Boolean);
    ws.send(encodeMessage({ type: "daemon.hello", protocolVersion: PROTOCOL_VERSION, ...(machineCredential ? { machineCredential } : {}), machine: { id: machineId, name: machineName, platform: os.platform(), arch: os.arch(), capabilities, shipping: { enabled: true } } }));
    heartbeat = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(encodeMessage({ type: "daemon.heartbeat", machineId, at: new Date().toISOString() })), heartbeatMs);
  });
  let commandMessageChain = Promise.resolve();
  ws.addEventListener("message", (event) => {
    commandMessageChain = commandMessageChain.then(async () => {
    let activeCommand = null;
    try {
      const command = decodeMessage(String(event.data));
      if (command.type === "server.machine.authenticated") {
        console.log(`[daemon] authenticated as ${machineName} (${machineId}) org=${command.organizationId ?? "local"} agents=${[...adapters.keys()].join(",")} shipping=enabled`);
        for (const recovered of workSupervisor.drainRecoveredWork()) {
          if (ws.readyState !== WebSocket.OPEN) break;
          ws.send(encodeMessage({
            type: "daemon.session.event",
            machineId,
            sessionId: recovered.work.sessionId,
            event: supervisorEvent(recovered.work, recovered.receipt, "lost")
          }));
        }
        return;
      }
      if (command.type !== "server.command") return;
      activeCommand = command;
      const receipt = commandReceipts.begin(command.commandId);
      if (receipt.kind === "in_flight") return;
      if (receipt.kind === "duplicate") {
        ws.send(encodeMessage({ type: "daemon.command.ack", machineId, commandId: command.commandId, ...receipt.receipt }));
        return;
      }
      const ack = (ok, error) => {
        const result = { ok, ...(error ? { error } : {}) };
        commandReceipts.complete(command.commandId, result);
        ws.send(encodeMessage({ type: "daemon.command.ack", machineId, commandId: command.commandId, ...result }));
      };
      const emit = (agentEvent) => { if (agentEvent.kind === "thread") nativeSessions.set(command.sessionId, agentEvent.nativeSessionId); ws.send(encodeMessage({ type: "daemon.session.event", machineId, sessionId: command.sessionId, event: agentEvent })); };
      if (command.action === "shipping.start") {
        const p = command.payload;
        if (!p?.contract || !p?.runId) throw new Error("shipping.start requires contract and runId");
        if (shippingRuns.has(p.runId)) throw new Error(`Shipping run ${p.runId} is already active`);
        shippingRuns.add(p.runId); ack(true);
        void runShipping(p.runId, p.contract).finally(() => shippingRuns.delete(p.runId));
        return;
      }
      if (command.action === "session.start") {
        const p = command.payload; const adapter = adapters.get(p?.agent); if (!p || !adapter) throw new Error(`Agent ${p?.agent ?? "unknown"} is unavailable`);
        const prepared = await prepareTrackedWork(command, p.agent, "session_start", emit);
        ack(true);
        void runPreparedWork({ prepared, command, adapter, cwd: p.cwd, prompt: p.prompt, model: p.model, emit });
        return;
      }
      const state = await fetchSession(command.sessionId); const adapter = adapters.get(state.agent); if (!adapter) throw new Error(`Agent ${state.agent} is unavailable`);
      if (command.action === "session.message") {
        const prepared = await prepareTrackedWork(command, state.agent, "session_message", emit);
        ack(true);
        void runPreparedWork({
          prepared,
          command,
          adapter,
          cwd: state.cwd,
          prompt: command.payload?.prompt,
          model: state.model,
          nativeSessionId: nativeSessions.get(command.sessionId) || state.nativeSessionId,
          emit
        });
        return;
      }
      if (command.action === "session.interrupt") {
        await adapter.interrupt(command.sessionId);
        const workId = activeWorkBySession.get(command.sessionId);
        if (workId) {
          const current = workSupervisor.getWork(workId);
          if (current && !["complete", "failed", "interrupted"].includes(current.state)) {
            const settled = await workSupervisor.transitionWork(workId, { expectedSequence: current.sequence, to: "interrupted", reason: "session_interrupt" });
            emit(supervisorEvent(settled.work, settled.receipt, "interrupted"));
          }
        }
        emit({ kind: "status", status: "interrupted", at: new Date().toISOString() }); ack(true);
      }
      else throw new Error(`Unsupported server command action ${command.action}`);
    } catch (error) {
      console.warn(`[daemon] command handling error: ${error.message}`);
      try {
        if (activeCommand?.commandId) {
          const receipt = { ok: false, error: error.message };
          commandReceipts.complete(activeCommand.commandId, receipt);
          ws.send(encodeMessage({ type: "daemon.command.ack", machineId, commandId: activeCommand.commandId, ...receipt }));
        }
      } catch {}
    }
    }).catch((error) => console.warn(`[daemon] command message handler failed: ${error.message}`));
  });
  ws.addEventListener("close", () => {
    if (heartbeat) { clearInterval(heartbeat); heartbeat = undefined; }
    if (shuttingDown) return;
    const delay = Math.min(30000, 500 * 2 ** reconnectAttempt++);
    console.warn(`[daemon] disconnected; reconnecting in ${delay}ms`);
    reconnectTimer = setTimeout(connect, delay);
  });
  ws.addEventListener("error", () => {});
}

async function prepareTrackedWork(command, adapterId, reason, emit) {
  const workId = `run:${command.commandId}`;
  const existing = workSupervisor.getWork(workId);
  if (existing) {
    throw new Error(existing.state === "lost" || existing.state === "unknown"
      ? "work_command_reconciliation_required"
      : "work_command_already_recorded");
  }
  await workSupervisor.createWork({
    id: workId,
    sessionId: command.sessionId,
    kind: adapterId === "capability-verify" ? "verification" : "process",
    adapterId,
    backendId: "local"
  });
  const started = await workSupervisor.transitionWork(workId, { expectedSequence: 0, to: "running", reason });
  activeWorkBySession.set(command.sessionId, workId);
  emit(supervisorEvent(started.work, started.receipt, "started"));
  return started.work;
}

async function runPreparedWork({ prepared, command, adapter, cwd, prompt, model, nativeSessionId, emit }) {
  try {
    const response = await adapter.run({ sessionId: command.sessionId, cwd, prompt, model, nativeSessionId }, emit);
    if (response.nativeSessionId) nativeSessions.set(command.sessionId, response.nativeSessionId);
    const current = workSupervisor.getWork(prepared.id);
    if (current && !["complete", "failed", "interrupted"].includes(current.state)) {
      const completed = await workSupervisor.transitionWork(prepared.id, { expectedSequence: current.sequence, to: "complete", reason: "adapter_completed" });
      emit(supervisorEvent(completed.work, completed.receipt, "completed"));
    }
  } catch (error) {
    const current = workSupervisor.getWork(prepared.id);
    if (current && !["complete", "failed", "interrupted"].includes(current.state)) {
      try {
        const failedWork = await workSupervisor.transitionWork(prepared.id, {
          expectedSequence: current.sequence,
          to: "failed",
          reason: "adapter_failed",
          error: error.message
        });
        emit(supervisorEvent(failedWork.work, failedWork.receipt, "failed"));
      } catch (transitionError) {
        console.warn(`[daemon] unable to settle work ${prepared.id}: ${transitionError.message}`);
      }
    }
    fail(emit, error);
  } finally {
    if (activeWorkBySession.get(command.sessionId) === prepared.id) activeWorkBySession.delete(command.sessionId);
  }
}

function supervisorEvent(work, receipt, phase) {
  return {
    kind: "work",
    phase,
    workId: work.id,
    workKind: work.kind,
    state: work.state,
    sequence: work.sequence,
    adapterId: work.adapterId,
    backendId: work.backendId,
    receiptDigest: receipt?.digest ?? null,
    receipt: receipt ?? null,
    at: new Date(work.updatedAt).toISOString()
  };
}

async function runShipping(runId, contract) {
  const store = new ShippingStore(shippingStateRoot);
  const supervisor = createDefaultShippingSupervisor({ stateRoot: shippingStateRoot, timeoutMs: Number(process.env.AGENT_WORK_OS_COMMAND_TIMEOUT_MS ?? 600000) });
  let lastDigest = "";
  const publish = async () => {
    try {
      const run = await store.load(runId);
      const digest = JSON.stringify([run.state, run.updatedAt, run.events?.at(-1)?.digest, run.releaseReceipt?.receiptDigest]);
      if (digest === lastDigest) return;
      lastDigest = digest;
      if (ws?.readyState === WebSocket.OPEN) ws.send(encodeMessage({ type: "daemon.shipping.run", machineId, run }));
    } catch {}
  };
  const timer = setInterval(() => void publish(), 500);
  timer.unref?.();
  try {
    const run = await supervisor.run(contract, { runId });
    if (ws?.readyState === WebSocket.OPEN) ws.send(encodeMessage({ type: "daemon.shipping.run", machineId, run }));
  } catch (error) {
    const failed = { runId, machineId, projectId: contract?.project?.id ?? "unknown", releaseVersion: contract?.release?.version ?? "unknown", state: "FAILED", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), blocker: null, fatalError: error.message, events: [] };
    if (ws?.readyState === WebSocket.OPEN) ws.send(encodeMessage({ type: "daemon.shipping.run", machineId, run: failed }));
  } finally {
    clearInterval(timer);
    await publish();
  }
}
function fail(emit, error) { emit({ kind: "error", message: error.message, at: new Date().toISOString() }); emit({ kind: "status", status: "failed", at: new Date().toISOString() }); }
async function fetchSession(id) { const u = new URL(serverUrl); u.protocol = u.protocol === "wss:" ? "https:" : "http:"; u.pathname = `/api/sessions/${encodeURIComponent(id)}`; u.search = ""; const credential = machineCredential || token; const r = await fetch(u, { headers: { authorization: `Bearer ${credential}` } }); if (!r.ok) throw new Error(`Unable to load session ${id}`); return r.json(); }
async function shutdown() {
  shuttingDown = true;
  if (heartbeat) clearInterval(heartbeat);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  try { await workSupervisor.flush(); } catch (error) { console.warn(`[daemon] supervisor flush failed: ${error.message}`); }
  ws?.close();
  setTimeout(() => process.exit(0), 30).unref();
}
process.on("SIGINT", () => void shutdown()); process.on("SIGTERM", () => void shutdown()); connect();