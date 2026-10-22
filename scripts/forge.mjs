#!/usr/bin/env node
import process from "node:process";
import { buildForgeIntakeSpec } from "../services/control-api/src/forge-intake.js";

function args(argv) {
  const output = {};
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (!argument.startsWith("--") || !argv[i+1] || argv[i+1].startsWith("--")) {
      throw new Error("Usage: node scripts/forge.mjs intake --url https://target --cwd /absolute/worktree [--machine MACHINE_ID] [--title TITLE] [--agent codex|echo]");
    }
    output[argument.slice(2)] = argv[++i];
  }
  return output;
}
const command = process.argv[2];
if (command !== "intake") {
  process.stderr.write("Usage: node scripts/forge.mjs intake --url https://target --cwd /absolute/worktree [--machine MACHINE_ID] [--title TITLE] [--agent codex|echo]\n");
  process.exitCode = 2;
} else {
  try {
    const options = args(process.argv.slice(3));
    const port = Number(process.env.AGENT_WORK_OS_PORT ?? process.env.PORT ?? "8787");
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("invalid_local_port");
    const token = process.env.AGENT_WORK_OS_TOKEN;
    if (!token) throw new Error("AGENT_WORK_OS_TOKEN must be set for local supervisor access");
    const endpoint = "http://127.0.0.1:" + port;
    const headers = { authorization: "Bearer " + token, "content-type": "application/json" };
    const stateResponse = await fetch(endpoint + "/api/state", { headers, signal: AbortSignal.timeout(3000) });
    if (!stateResponse.ok) throw new Error("Local Agent Work OS API unavailable or unauthorized: " + stateResponse.status);
    const state = await stateResponse.json();
    const agent = options.agent ?? "codex";
    const available = (state.machines ?? []).filter(m =>
      m.status === "online" && m.capabilities?.some(c => c.name === agent));
    const chosen = options.machine
      ? available.find(m => m.id === options.machine)
      : available.length === 1 ? available[0] : null;
    if (!chosen) throw new Error("Select exactly one online compatible machine with --machine (or connect a local daemon)");
    const spec = buildForgeIntakeSpec({
      sourceUrl: options.url, cwd: options.cwd || process.cwd(),
      machineId: chosen.id, title: options.title, goal: options.goal, agent
    });
    const response = await fetch(endpoint + "/api/forge/plans", {
      method: "POST", headers, body: JSON.stringify(spec), signal: AbortSignal.timeout(5000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || body.message || "Forge intake failed: " + response.status);
    process.stdout.write(JSON.stringify({
      planId: body.id, state: body.state, tasks: body.tasks.map(t => ({id:t.id,dependsOn:t.dependsOn})),
      controlRoom: endpoint + "/forge.html",
      next: "Open REA Forge Control Room, inspect generated draft, and explicitly approve dispatch."
    }, null, 2) + "\n");
  } catch (error) {
    process.stderr.write("REA Forge intake: " + error.message + "\n");
    process.exitCode = 1;
  }
}
