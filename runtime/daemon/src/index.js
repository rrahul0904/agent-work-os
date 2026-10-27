#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { PROTOCOL_VERSION, decodeMessage, encodeMessage } from "../../../packages/protocol/src/index.js";
import { createDefaultShippingSupervisor } from "../../../services/control-api/src/shipping-supervisor.js";
import { ShippingStore } from "../../../services/control-api/src/shipping-store.js";
import { ClaudeCodeAdapter, CodexAdapter, EchoAdapter } from "./adapters.js";
import { OpenCodeAdapter } from "./opencode-adapter.js";
import { CursorAdapter } from "./cursor-adapter.js";
import { OpenAICompatibleChatAdapter } from "./openai-compatible-chat-adapter.js";
import { AgentDockReadOnlyAdapter } from "./agentdock-readonly-adapter.js";
import { CodeAtlasSearchAdapter } from "./codeatlas-search-adapter.js";
import { CoworkReadOnlyFilesAdapter } from "./cowork-files-adapter.js";
import { CapabilityVerificationAdapter } from "./capability-verification-adapter.js";
import { loadMachineId } from "./identity.js";
import { createCommandReceiptCache } from "./command-receipts.js";

const serverUrl = process.env.AGENT_WORK_OS_SERVER_URL ?? "ws://127.0.0.1:8787/ws";
const machineCredential = process.env.AGENT_WORK_OS_MACHINE_TOKEN ?? "";
const token = process.env.AGENT_WORK_OS_TOKEN ?? (process.env.NODE_ENV === "production" ? "" : "dev-token");
const machineName = process.env.AGENT_WORK_OS_MACHINE_NAME || os.hostname();
const heartbeatMs = Number(process.env.AGENT_WORK_OS_HEARTBEAT_MS ?? 15000);
const shippingStateRoot = path.resolve(process.env.AGENT_WORK_OS_SHIPPING_STATE ?? ".agent-work-os/shipping-state");
const machineId = await loadMachineId();
const adapters = new Map();
const nativeSessions = new Map();
const shippingRuns = new Set();
const commandReceipts = createCommandReceiptCache();
if (process.env.AGENT_WORK_OS_ENABLE_ECHO !== "false") adapters.set("echo", new EchoAdapter());
const codex = new CodexAdapter();
if (codex.capability()) adapters.set("codex", codex);
const claudeCode = new ClaudeCodeAdapter();
if (claudeCode.capability()) adapters.set("claude-code", claudeCode);
const openCode = new OpenCodeAdapter();
if (openCode.capability()) adapters.set("opencode", openCode);
const cursor = new CursorAdapter();
if (cursor.capability()) adapters.set("cursor", cursor);
const modelChat = new OpenAICompatibleChatAdapter();
if (modelChat.capability()) adapters.set("model-chat", modelChat);
const agentDock = new AgentDockReadOnlyAdapter();
if (agentDock.capability()) adapters.set("agentdock", agentDock);
const codeAtlas = new CodeAtlasSearchAdapter();
if (codeAtlas.capability()) adapters.set("codeatlas-search", codeAtlas);
const coworkFiles = new CoworkReadOnlyFilesAdapter();
if (coworkFiles.capability()) adapters.set("cowork-files", coworkFiles);
const capabilityVerification = new CapabilityVerificationAdapter(codex, claudeCode, openCode, cursor);
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
        const p = command.payload; const adapter = adapters.get(p?.agent); if (!p || !adapter) throw new Error(`Agent ${p?.agent ?? "unknown"} is unavailable`); ack(true);
        void adapter.run({ sessionId: command.sessionId, cwd: p.cwd, prompt: p.prompt, model: p.model }, emit).then((r) => r.nativeSessionId && nativeSessions.set(command.sessionId, r.nativeSessionId)).catch((e) => fail(emit, e)); return;
      }
      const state = await fetchSession(command.sessionId); const adapter = adapters.get(state.agent); if (!adapter) throw new Error(`Agent ${state.agent} is unavailable`);
      if (command.action === "session.message") {
        ack(true); void adapter.run({ sessionId: command.sessionId, cwd: state.cwd, prompt: command.payload?.prompt, model: state.model, nativeSessionId: nativeSessions.get(command.sessionId) || state.nativeSessionId }, emit).then((r) => r.nativeSessionId && nativeSessions.set(command.sessionId, r.nativeSessionId)).catch((e) => fail(emit, e)); return;
      }
      if (command.action === "session.interrupt") { await adapter.interrupt(command.sessionId); emit({ kind: "status", status: "interrupted", at: new Date().toISOString() }); ack(true); }
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
  ws?.close();
  setTimeout(() => process.exit(0), 30).unref();
}
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown); connect();