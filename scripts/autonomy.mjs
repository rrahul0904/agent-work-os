#!/usr/bin/env node
import fs from "node:fs/promises";
import { evaluateAutonomyGate, validateAutonomyContract } from "../services/control-api/src/autonomy-policy.js";
import { compileReaBacklog, rankReaFindings } from "../services/control-api/src/rea-intake.js";

const [command, ...args] = process.argv.slice(2);

try {
  if (command === "validate") {
    const contract = await readJson(required(args[0], "contract_file_required"));
    const result = validateAutonomyContract(contract);
    print(result);
    process.exitCode = result.valid ? 0 : 2;
  } else if (command === "gate") {
    const contract = await readJson(required(args[0], "contract_file_required"));
    const evidence = await readJson(required(args[1], "evidence_file_required"));
    const result = evaluateAutonomyGate(contract, evidence);
    print(result);
    process.exitCode = result.eligible ? 0 : 3;
  } else if (command === "rea-rank") {
    const findings = await readJson(required(args[0], "findings_file_required"));
    print(rankReaFindings(findings));
  } else if (command === "rea-backlog") {
    const findings = await readJson(required(args[0], "findings_file_required"));
    const projectId = required(args[1], "project_id_required");
    print(compileReaBacklog(findings, { projectId }));
  } else {
    usage();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exitCode = 1;
}

function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}
async function readJson(file) { return JSON.parse(await fs.readFile(file, "utf8")); }
function print(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
function usage() {
  console.error([
    "Usage:",
    "  node scripts/autonomy.mjs validate <contract.json>",
    "  node scripts/autonomy.mjs gate <contract.json> <evidence.json>",
    "  node scripts/autonomy.mjs rea-rank <findings.json>",
    "  node scripts/autonomy.mjs rea-backlog <findings.json> <project-id>"
  ].join("\n"));
}
