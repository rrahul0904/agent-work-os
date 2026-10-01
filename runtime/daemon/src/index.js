#!/usr/bin/env node
import os from "node:os";
import { PROTOCOL_VERSION, decodeMessage, encodeMessage } from "../../../packages/protocol/src/index.js";
import { CodexAdapter, EchoAdapter } from "./adapters.js";
import { BENCHMARK_HARNESS_VERSION } from "./benchmark-harness.js";
import { EXECUTION_SAFETY_VERSION } from "./execution-safety.js";
import { HARNESS_POLICY_VERSION } from "./harness-policy.js";
import { INTEGRATION_RUNTIME_VERSION } from "./integration-runtime.js";
import { PERSISTENT_COMPUTE_VERSION } from "./persistent-compute.js";
import { createRepositoryPolicy, readRepositoryWindow, REPOSITORY_INTELLIGENCE_VERSION, searchRepository } from "./repository-intelligence.js";
import { SUBAGENT_COORDINATION_VERSION } from "./subagent-coordination.js";
import { loadMachineId } from "./identity.js";

const serverUrl = process.env.AGENT_WORK_OS_SERVER_URL ?? "ws://127.0.0.1:8787/ws";
const token = process.env.AGENT_WORK_OS_TOKEN ?? "dev-token";
const machineName = process.env.AGENT_WORK_OS_MACHINE_NAME || os.hostname();
const heartbeatMs = Number(process.env.AGENT_WORK_OS_HEARTBEAT_MS ?? 15000);
const machineId = await loadMachineId();
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
    console.log(`[daemon] connected as ${machineName} (${machineId}) agents=${capabilities.map((c) => c.name).join(",")}`);
  });
  ws.addEventListener("message", async (event) => {
    try {
      const command = decodeMessage(String(event.data)); if (command.type !== "server.command") return;
      const ack = (ok, error) => ws.send(encodeMessage({ type: "daemon.command.ack", machineId, commandId: command.commandId, ok, error }));
      const commandResult = (ok, result, error) => ws.send(encodeMessage({ type: "daemon.command.result", machineId, commandId: command.commandId, ok, result, error }));
      const emit = (agentEvent) => { if (agentEvent.kind === "thread") nativeSessions.set(command.sessionId, agentEvent.nativeSessionId); ws.send(encodeMessage({ type: "daemon.session.event", machineId, sessionId: command.sessionId, event: agentEvent })); };
      if (command.action === "harness.status") {
        const policy = createRepositoryPolicy({ root: command.payload?.cwd });
        commandResult(true, {
          versions: {
            harnessPolicy: HARNESS_POLICY_VERSION,
            repositoryIntelligence: REPOSITORY_INTELLIGENCE_VERSION,
            executionSafety: EXECUTION_SAFETY_VERSION,
            persistentCompute: PERSISTENT_COMPUTE_VERSION,
            subagentCoordination: SUBAGENT_COORDINATION_VERSION,
            integrationRuntime: INTEGRATION_RUNTIME_VERSION,
            benchmarkHarness: BENCHMARK_HARNESS_VERSION,
          },
          repositoryPolicy: {
            root: policy.root,
            ignoredDirectories: policy.ignoredDirectories,
            maxFiles: policy.maxFiles,
            maxFileBytes: policy.maxFileBytes,
            maxBytesScanned: policy.maxBytesScanned,
            maxMatches: policy.maxMatches,
            maxReadLines: policy.maxReadLines,
          },
          boundaries: {
            repositoryAccess: "read-only",
            mutationEndpoints: false,
            strongSandbox: false,
            networkIsolation: false,
          },
        }); return;
      }
      if (command.action === "harness.repo.read") {
        const p = command.payload ?? {};
        const policy = createRepositoryPolicy({ root: p.cwd });
        const result = await readRepositoryWindow({
          policy,
          relativePath: p.path,
          startLine: p.startLine ?? 1,
          lineCount: p.lineCount ?? 50,
        });
        commandResult(true, result); return;
      }
      if (command.action === "harness.repo.search") {
        const p = command.payload ?? {};
        const policy = createRepositoryPolicy({ root: p.cwd });
        const result = await searchRepository({
          policy,
          query: p.query,
          caseSensitive: p.caseSensitive === true,
        });
        commandResult(true, result); return;
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
    } catch (error) {
      try {
        const failed = decodeMessage(String(event.data));
        const type = String(failed.action ?? "").startsWith("harness.") ? "daemon.command.result" : "daemon.command.ack";
        ws.send(encodeMessage({ type, machineId, commandId: failed.commandId, ok: false, error: error.message }));
      } catch {}
    }
  });
  ws.addEventListener("close", () => { if (heartbeat) clearInterval(heartbeat); if (shuttingDown) return; const delay = Math.min(30000, 500 * 2 ** reconnectAttempt++); console.warn(`[daemon] disconnected; reconnecting in ${delay}ms`); setTimeout(connect, delay).unref(); });
  ws.addEventListener("error", () => {});
}
function fail(emit, error) { emit({ kind: "error", message: error.message, at: new Date().toISOString() }); emit({ kind: "status", status: "failed", at: new Date().toISOString() }); }
async function fetchSession(id) { const u = new URL(serverUrl); u.protocol = u.protocol === "wss:" ? "https:" : "http:"; u.pathname = `/api/sessions/${encodeURIComponent(id)}`; u.search = ""; const r = await fetch(u); if (!r.ok) throw new Error(`Unable to load session ${id}`); return r.json(); }
async function shutdown() { shuttingDown = true; if (heartbeat) clearInterval(heartbeat); ws?.close(); setTimeout(() => process.exit(0), 30).unref(); }
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown); connect();
