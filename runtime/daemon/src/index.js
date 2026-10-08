#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { PROTOCOL_VERSION, decodeMessage, encodeMessage } from "../../../packages/protocol/src/index.js";
import { createDefaultShippingSupervisor } from "../../../services/control-api/src/shipping-supervisor.js";
import { ShippingStore } from "../../../services/control-api/src/shipping-store.js";
import { CodexAdapter, EchoAdapter } from "./adapters.js";
import { prepareContextInjection } from "./context-injection.js";
import { loadMachineId } from "./identity.js";
import { ProjectContextStore } from "./project-context-store.js";

const serverUrl = process.env.AGENT_WORK_OS_SERVER_URL ?? "ws://127.0.0.1:8787/ws";
const token = process.env.AGENT_WORK_OS_TOKEN ?? "dev-token";
const machineName = process.env.AGENT_WORK_OS_MACHINE_NAME || os.hostname();
const heartbeatMs = Number(process.env.AGENT_WORK_OS_HEARTBEAT_MS ?? 15000);
const shippingStateRoot = path.resolve(process.env.AGENT_WORK_OS_SHIPPING_STATE ?? ".agent-work-os/shipping-state");
const contextRoot = path.resolve(process.env.AGENT_WORK_OS_CONTEXT_ROOT ?? path.join(os.homedir(), ".agent-work-os", "project-context"));
const machineId = await loadMachineId();
const projectContextStore = new ProjectContextStore(contextRoot);
const adapters = new Map();
const nativeSessions = new Map();
const shippingRuns = new Set();
if (process.env.AGENT_WORK_OS_ENABLE_ECHO !== "false") adapters.set("echo", new EchoAdapter());
const codex = new CodexAdapter(); if (codex.capability()) adapters.set("codex", codex);

let ws; let heartbeat; let reconnectTimer; let reconnectAttempt = 0; let shuttingDown = false;
function connect() {
  if (shuttingDown) return;
  const url = new URL(serverUrl); url.searchParams.set("role", "daemon"); url.searchParams.set("token", token);
  ws = new WebSocket(url);
  ws.addEventListener("open", () => {
    reconnectAttempt = 0;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = undefined; }
    const capabilities = [...adapters.values()].map((a) => a.capability()).filter(Boolean);
    ws.send(encodeMessage({ type: "daemon.hello", protocolVersion: PROTOCOL_VERSION, machine: { id: machineId, name: machineName, platform: os.platform(), arch: os.arch(), capabilities, shipping: { enabled: true }, projectContext: { enabled: true } } }));
    heartbeat = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(encodeMessage({ type: "daemon.heartbeat", machineId, at: new Date().toISOString() })), heartbeatMs);
    console.log(`[daemon] connected as ${machineName} (${machineId}) agents=${capabilities.map((c) => c.name).join(",")} shipping=enabled context=enabled`);
  });
  ws.addEventListener("message", async (event) => {
    try {
      const command = decodeMessage(String(event.data)); if (command.type !== "server.command") return;
      const ack = (ok, error) => ws.send(encodeMessage({ type: "daemon.command.ack", machineId, commandId: command.commandId, ok, error }));
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
        const prepared = await prepareContextInjection({ store: projectContextStore, request: p.context, prompt: p.prompt, defaultRunId: command.sessionId });
        ack(true);
        if (prepared.receipt) emit({ kind: "context", receipt: prepared.receipt, at: prepared.receipt.at });
        void adapter.run({ sessionId: command.sessionId, cwd: p.cwd, prompt: prepared.prompt, model: p.model }, emit).then((r) => r.nativeSessionId && nativeSessions.set(command.sessionId, r.nativeSessionId)).catch((e) => fail(emit, e)); return;
      }
      const state = await fetchSession(command.sessionId); const adapter = adapters.get(state.agent); if (!adapter) throw new Error(`Agent ${state.agent} is unavailable`);
      if (command.action === "session.message") {
        ack(true); void adapter.run({ sessionId: command.sessionId, cwd: state.cwd, prompt: command.payload?.prompt, model: state.model, nativeSessionId: nativeSessions.get(command.sessionId) || state.nativeSessionId }, emit).then((r) => r.nativeSessionId && nativeSessions.set(command.sessionId, r.nativeSessionId)).catch((e) => fail(emit, e)); return;
      }
      if (command.action === "session.interrupt") { await adapter.interrupt(command.sessionId); emit({ kind: "status", status: "interrupted", at: new Date().toISOString() }); ack(true); }
    } catch (error) { try { ws.send(encodeMessage({ type: "daemon.command.ack", machineId, commandId: decodeMessage(String(event.data)).commandId, ok: false, error: error.message })); } catch {} }
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
async function fetchSession(id) { const u = new URL(serverUrl); u.protocol = u.protocol === "wss:" ? "https:" : "http:"; u.pathname = `/api/sessions/${encodeURIComponent(id)}`; u.search = ""; const r = await fetch(u, { headers: { authorization: `Bearer ${token}` } }); if (!r.ok) throw new Error(`Unable to load session ${id}`); return r.json(); }
async function shutdown() {
  shuttingDown = true;
  if (heartbeat) clearInterval(heartbeat);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  ws?.close();
  setTimeout(() => process.exit(0), 30).unref();
}
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown); connect();
