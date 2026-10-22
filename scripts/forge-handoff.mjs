#!/usr/bin/env node
// Operator-invoked, read-only REA Forge worker handoff preflight.
import { checkForgeHandoff } from "../runtime/verifier/forge-handoff-check.js";

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith("--") || !argv[i+1] || argv[i+1].startsWith("--")) {
      throw new Error("usage: forge:handoff -- --session SESSION_ID --destination /absolute/repo/path");
    }
    values[argv[i].slice(2)] = argv[i+1];
  }
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(values.session ?? "")) throw new Error("forge_session_id_invalid");
  if (!values.destination?.startsWith("/")) throw new Error("forge_destination_absolute_path_required");
  return values;
}
try {
  const opts = parseArgs(process.argv.slice(2));
  const root = process.env.AGENT_WORK_OS_FORGE_WORKTREE_ROOT;
  const token = process.env.AGENT_WORK_OS_TOKEN;
  if (!root || !token) throw new Error("set AGENT_WORK_OS_FORGE_WORKTREE_ROOT and AGENT_WORK_OS_TOKEN");
  const port = Number(process.env.AGENT_WORK_OS_PORT ?? process.env.PORT ?? 8787);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("forge_port_invalid");
  // Always loopback; never forward this token to a user-controlled URL.
  const response = await fetch("http://127.0.0.1:" + port + "/api/sessions/" + encodeURIComponent(opts.session), {
    headers: { authorization: "Bearer " + token },
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error("session_read_unavailable_" + response.status);
  const session = await response.json();
  if (session.id !== opts.session || session.status !== "completed" ||
      session.agent !== "codex" || !session.forgePlanId || !session.forgeTaskId) {
    throw new Error("forge_completed_codex_session_required");
  }
  const events = Array.isArray(session.events) ? session.events : [];
  const stage = events.findLast(e => e?.kind === "workspace")?.receipt;
  const diff = events.findLast(e => e?.kind === "workspace.diff")?.receipt;
  if (!stage || !diff || stage.sessionId !== session.id || diff.sessionId !== session.id ||
      stage.planId !== session.forgePlanId || stage.taskId !== session.forgeTaskId) {
    throw new Error("forge_matched_workspace_evidence_missing");
  }
  const report = checkForgeHandoff({
    stage, diff, sourceRoot: root, destination: opts.destination
  });
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} catch (error) {
  // Do not leak arbitrary absolute paths or full error stacks.
  const code = typeof error.code === "string" && error.code.startsWith("forge_")
    ? error.code : typeof error.message === "string" && error.message.startsWith("forge_")
      ? error.message : "forge_handoff_preflight_failed";
  process.stderr.write("REA Forge handoff: " + code + "\n");
  process.exitCode = 1;
}
