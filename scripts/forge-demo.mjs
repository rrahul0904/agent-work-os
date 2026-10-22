#!/usr/bin/env node
// REA Forge interactive live demo starter. Runs only against the loopback
// development control plane. No merge, publish, deployment or auto-attestation.
import process from "node:process";
import { forgeDemoSpec, summarizeForgeDemo } from "../services/control-api/src/forge-demo.js";

function parse(argv) {
  const result = {};
  const keys = new Set(["mode", "cwd", "machine", "inspect"]);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "--approve-echo") { result.approveEcho = true; continue; }
    if (!key.startsWith("--") || !keys.has(key.slice(2)) ||
        !argv[i+1] || argv[i+1].startsWith("--")) throw new Error("forge_demo_arguments_invalid");
    result[key.slice(2)] = argv[++i];
  }
  if (result.inspect && (result.mode || result.cwd || result.machine || result.approveEcho)) {
    throw new Error("forge_demo_inspect_cannot_create");
  }
  if (!result.inspect && result.mode && !["echo", "codex"].includes(result.mode)) {
    throw new Error("forge_demo_mode_invalid");
  }
  if (result.approveEcho && result.mode !== "echo") throw new Error("forge_demo_only_echo_auto_approval");
  return result;
}
function protectError(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_.:-]{3,130}$/.test(value)
    ? value : "forge_demo_request_failed";
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const args = parse(process.argv.slice(2));
  const port = Number(process.env.AGENT_WORK_OS_PORT ?? process.env.PORT ?? 8787);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("forge_demo_port_invalid");
  const token = process.env.AGENT_WORK_OS_TOKEN;
  if (!token) throw new Error("forge_demo_local_token_missing");
  const base = "http://127.0.0.1:" + port;
  const headers = { authorization: "Bearer " + token, "content-type": "application/json" };
  const request = async (endpoint, body) => {
    const res = await fetch(base + endpoint, {
      method: body === undefined ? "GET" : "POST", headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(6000)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(protectError(data.error) + "_http_" + res.status);
    return data;
  };
  const fetchObservation = async id => {
    if (!/^forge-[a-f0-9-]{30,60}$/.test(id)) throw new Error("forge_demo_plan_id_invalid");
    const plan = await request("/api/forge/plans/" + encodeURIComponent(id));
    const sessions = {};
    for (const task of plan.tasks) {
      if (task.sessionId) {
        try { sessions[task.sessionId] = await request("/api/sessions/" + encodeURIComponent(task.sessionId)); }
        catch { /* Missing is NOT_OBSERVED, not a fabricated session. */ }
      }
    }
    return summarizeForgeDemo(plan, sessions);
  };
  if (args.inspect) {
    process.stdout.write(JSON.stringify(await fetchObservation(args.inspect), null, 2) + "\n");
    return;
  }
  const mode = args.mode ?? "echo";
  const ready = await request("/api/forge/readiness");
  if (ready.releaseReady !== false) throw new Error("forge_demo_readiness_invariant_failed");
  const state = await request("/api/state");
  const online = (state.machines ?? []).filter(machine =>
    machine.status === "online" && machine.capabilities?.some(c => c.name === mode));
  const machine = args.machine ? online.find(m => m.id === args.machine)
    : online.length === 1 ? online[0] : null;
  if (!machine) throw new Error("forge_demo_machine_not_uniquely_available");
  const cwd = args.cwd ?? process.cwd();
  const spec = forgeDemoSpec({ mode, machineId: machine.id, cwd });
  const plan = await request("/api/forge/plans", spec);
  if (plan.state !== "draft" || plan.tasks.some(t => t.sessionId)) {
    throw new Error("forge_demo_draft_gate_broken");
  }
  const observations = await fetchObservation(plan.id);
  if (!observations.demonstrated.approvalGate) throw new Error("forge_demo_approval_gate_broken");
  if (args.approveEcho) {
    await request("/api/forge/plans/" + encodeURIComponent(plan.id) + "/approve", {});
    let last = null;
    const until = Date.now() + 22000;
    while (Date.now() < until) {
      await pause(200);
      last = await fetchObservation(plan.id);
      if (last.tasks.slice(0, 2).every(t => t.taskState === "awaiting_verification")) break;
      if (last.tasks.some(t => t.taskState === "blocked" || t.taskState === "failed")) break;
    }
    const firstDone = last?.tasks.slice(0, 2).every(t =>
      t.taskState === "awaiting_verification" && t.observedSessionStatus === "completed");
    const thirdBlocked = last?.tasks[2]?.taskState === "pending" && !last.tasks[2].sessionId;
    const verdict = firstDone && thirdBlocked ? "PASS_ECHO_APPROVAL_AND_DEPENDENCY_GATE" : "BLOCKED_INSPECT_REQUIRED";
    process.stdout.write(JSON.stringify({
      verdict, planId: plan.id, mode, observer: last,
      next: "Open Forge graph inside Codex. Echo is only a test fixture; tasks require separate explicit attestation.",
      controlRoom: base + "/forge.html",
      inspect: "npm run forge:demo -- --inspect " + plan.id
    }, null, 2) + "\n");
    if (!firstDone || !thirdBlocked) process.exitCode = 1;
    return;
  }
  process.stdout.write(JSON.stringify({
    verdict: "DRAFT_CREATED_NOT_EXECUTED", planId: plan.id, mode,
    graph: base + "/forge.html",
    next: mode === "codex"
      ? "Review this read-only Codex task in the graph and click Approve and dispatch. Watch actual tool events; subagent observation depends on local Codex capabilities."
      : "Open the graph, review this echo test draft and approve deliberately.",
    inspect: "npm run forge:demo -- --inspect " + plan.id
  }, null, 2) + "\n");
}
try { await main(); }
catch (e) {
  process.stderr.write("REA Forge demo: " + protectError(e.message) + "\n");
  process.exitCode = 1;
}
