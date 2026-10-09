import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const child = spawn(process.execPath, ["services/mcp/src/index.js"], {
  cwd: root,
  env: { ...process.env, AGENT_WORK_OS_TOKEN: "mcp-smoke-token" },
  stdio: ["pipe", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => { stdout += String(chunk); });
child.stderr.on("data", (chunk) => { stderr += String(chunk); });

try {
  await waitFor(() => stderr.includes("Agent Work OS MCP server running on stdio"), 4000, "MCP stdio startup");
  assert.equal(stdout, "", "MCP server must not log on the protocol stdout channel before a client connects");
  console.log("[mcp-smoke] PASS: official MCP v2 stdio server starts with a clean protocol stdout channel");
} finally {
  if (child.exitCode === null) child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 1000)),
  ]);
}

async function waitFor(check, timeout, label) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (check()) return;
    if (child.exitCode !== null) throw new Error(`${label} failed: process exited ${child.exitCode}; stderr=${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Timed out waiting for ${label}; stderr=${stderr}`);
}
