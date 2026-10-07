#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createDefaultShippingSupervisor } from "../services/control-api/src/shipping-supervisor.js";
import { validateShippingContract } from "../services/control-api/src/shipping-contract.js";

const [command, contractPath] = process.argv.slice(2);
if (!command || !contractPath || !["validate", "run"].includes(command)) {
  console.error("usage: node scripts/ship.mjs <validate|run> <shipping-contract.json>");
  process.exit(2);
}
const absolute = path.resolve(contractPath);
const contract = JSON.parse(await fs.readFile(absolute, "utf8"));
if (command === "validate") {
  const result = validateShippingContract(contract);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.valid ? 0 : 1);
}
const stateRoot = path.resolve(process.env.AGENT_WORK_OS_SHIPPING_STATE ?? ".agent-work-os/shipping-state");
const supervisor = createDefaultShippingSupervisor({
  stateRoot,
  timeoutMs: Number(process.env.AGENT_WORK_OS_COMMAND_TIMEOUT_MS ?? 600000)
});
const run = await supervisor.run(contract, { runId: process.env.SHIPPING_RUN_ID });
console.log(JSON.stringify({
  runId: run.runId,
  projectId: run.projectId,
  releaseVersion: run.releaseVersion,
  state: run.state,
  blocker: run.blocker,
  testedSha: run.testedSha,
  deployedSha: run.deployedSha,
  receiptFile: run.receiptFile ?? null,
  worktreePath: run.worktreePath
}, null, 2));
process.exit(run.state === "SHIPPED" ? 0 : 1);
