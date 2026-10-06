#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { PROTOCOL_VERSION, decodeMessage, encodeMessage } from "../../../packages/protocol/src/index.js";
import { CodexAdapter, EchoAdapter } from "./adapters.js";
import { DurableSessionEventJournal } from "./event-journal.js";
import { loadMachineId } from "./identity.js";

const serverUrl = process.env.AGENT_WORK_OS_SERVER_URL ?? "ws://127.0.0.1:8787/ws";
const token = process.env.AGENT_WORK_OS_TOKEN ?? "dev-token";
const machineName = process.env.AGENT_WORK_OS_MACHINE_NAME || os.hostname();
const heartbeatMs = Number(process.env.AGENT_WORK_OS_HEARTBEAT_MS ?? 15000);
const agentHome = process.env.AGENT_WORK_OS_HOME ?? path.join(os.homedir(), ".agent-work-os");
const eventJournalPath = process.env.AGENT_WORK_OS_EVENT_JOURNAL ?? path.join(agentHome, "event-journal.json");
const machineId = await loadMachineId();
const eventJournal = new DurableSessionEventJournal(eventJournalPath); await eventJournal.load();
const adapters = new Map();
const nativeSessions = new Map();
if (process.env.AGENT_WORK_OS_ENABLE_ECHO !== "false") adapters.set("echo", new EchoAdapter());
const codex = new CodexAdapter(); if (codex.capability()) adapters.set("codex", codex);

let ws; let heartbeat; let reconnectAttempt = 0; let shuttingDown = false;
function connect() {
  if (shuttingDown) return;
  const url = new URL(serverUrl); url.searchParams.set("role", "daemon"); url.searchParams.set("token", token);
  ws = new WebSocket(url);
  ws.addEventListener("open", () => {
    reconnectAttempt = 0;
    const capabilities = [...adapters.values()].map((a) => a.capability()).filter(Boolean);
    ws.send(encodeMessage({ type: "daemon.hello", protocolVersion: PROTOCOL_VERSION, machine: { id: machineId, name: machineName, platform: os.platform(), arch: os.arch(), capabilities } }));
    heartbeat = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(encodeMessage({ type: "daemon.heartbeat", machineId, at: new Date().toISOString() })), heartbeatMs);
    void flushJournal().catch((error) => console.warn("[daemon] replay flush failed", error.message));
    console.log(`[daemon] connected as ${machineName} (${machineId}) agents=${capabilities.map((c) => c.name).join(",")}`);
  });
  ws.addEventListener("message", async (event) => {
    let incoming;
    try {
      incoming = decodeMessage(String(event.data));
      if (incoming.type === "server.session.ack") {
        await eventJournal.ack(incoming.sessionId, incoming.throughSequence);
        return;
      }
      if (incoming.type === "server.session.replay.request") {
        await flushJournal(incoming.sessionId, incoming.fromSequence);
        return;
      }
      if (incoming.type !== "server.command") return;
      const command = incoming;
      const ack = (ok, error) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(encodeMessage({ type: "daemon.command.ack", machineId, commandId: command.commandId, ok, error }));
      };
      const emit = (agentEvent) => {
        if (agentEvent.kind === "thread") nativeSessions.set(command.sessionId, agentEvent.nativeSessionId);
        void eventJournal.append(command.sessionId, agentEvent)
          .then((entry) => sendJournalEnvelope(entry))
          .catch((error) => console.warn("[daemon] event journal append failed", error.message));
      };
      if (command.action === "session.start") {
        const p = command.payload; const adapter = adapters.get(p?.agent); if (!p || !adapter) throw new Error(`Agent ${p?.agent ?? "unknown"} is unavailable`); ack(true);
        void adapter.run({ sessionId: command.sessionId, cwd: p.cwd, prompt: p.prompt, model: p.model }, emit).then((r) => r.nativeSessionId && nativeSessions.set(command.sessionId, r.nativeSessionId)).catch((e) => fail(emit, e)); return;
      }
      const state = await fetchSession(command.sessionId); const adapter = adapters.get(state.agent); if (!adapter) throw new Error(`Agent ${state.agent} is unavailable`);
      if (command.action === "session.message") {
        ack(true); void adapter.run({ sessionId: command.sessionId, cwd: state.cwd, prompt: command.payload?.prompt, model: state.model, nativeSessionId: nativeSessions.get(command.sessionId) || state.nativeSessionId }, emit).then((r) => r.nativeSessionId && nativeSessions.set(command.sessionId, r.nativeSessionId)).catch((e) => fail(emit, e)); return;
      }
      if (command.action === "session.interrupt") { await adapter.interrupt(command.sessionId); emit({ kind: "status", status: "interrupted", at: new Date().toISOString() }); ack(true); }
    } catch (error) {
      if (incoming?.type === "server.command" && ws.readyState === WebSocket.OPEN) {
        ws.send(encodeMessage({ type: "daemon.command.ack", machineId, commandId: incoming.commandId, ok: false, error: error.message }));
      } else {
        console.warn("[daemon] invalid server message", error.message);
      }
    }
  });
  ws.addEventListener("close", () => { if (heartbeat) clearInterval(heartbeat); if (shuttingDown) return; const delay = Math.min(30000, 500 * 2 ** reconnectAttempt++); console.warn(`[daemon] disconnected; reconnecting in ${delay}ms`); setTimeout(connect, delay).unref(); });
  ws.addEventListener("error", () => {});
}
function sendJournalEnvelope(entry) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(encodeMessage({
    type: "daemon.session.event",
    machineId,
    sessionId: entry.sessionId,
    sequence: entry.sequence,
    event: entry.event,
    journaledAt: entry.journaledAt
  }));
  return true;
}
async function flushJournal(sessionId, fromSequence = 1) {
  await eventJournal.flush();
  for (const entry of eventJournal.listUnacked(sessionId, { fromSequence })) {
    if (!sendJournalEnvelope(entry)) break;
  }
}
function fail(emit, error) { emit({ kind: "error", message: error.message, at: new Date().toISOString() }); emit({ kind: "status", status: "failed", at: new Date().toISOString() }); }
async function fetchSession(id) { const u = new URL(serverUrl); u.protocol = u.protocol === "wss:" ? "https:" : "http:"; u.pathname = `/api/sessions/${encodeURIComponent(id)}`; u.search = ""; const r = await fetch(u); if (!r.ok) throw new Error(`Unable to load session ${id}`); return r.json(); }
async function shutdown() { shuttingDown = true; if (heartbeat) clearInterval(heartbeat); await eventJournal.flush(); ws?.close(); setTimeout(() => process.exit(0), 30).unref(); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown); connect();
