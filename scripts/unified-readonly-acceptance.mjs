#!/usr/bin/env node
/**
 * Disposable, full-process integration acceptance for Wave 3/4 capabilities.
 * Never contacts external inference or an actual user-owned AgentDock daemon.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, chmod, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sealCodeAtlasIndex } from "../runtime/daemon/src/codeatlas-search-adapter.js";

const root = process.cwd();
const tmp = await mkdtemp(path.join(os.tmpdir(), "awos-unified-integration-"));
const workdir = path.join(tmp, "approved-repo");
const bin = path.join(tmp, "bin");
const children = [];
const port = 25_000 + Math.floor(Math.random() * 20_000);
const token = "integrations-acceptance-token";
const headers = { authorization: "Bearer " + token };
const agentdock = http.createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url === "/v1/status") return res.end(JSON.stringify({
    daemon: { status: "running", version: "fixture" },
    proxy: { enabled: true }, registry: { privateCommand: "SECRET_PROCESS_ARG" }
  }));
  if (req.url === "/v1/projects") return res.end(JSON.stringify({
    projects: [{ name: "hidden-repo", root: "/private/repo" }]
  }));
  res.writeHead(404).end(JSON.stringify({ error: "not_found" }));
});
agentdock.listen(0, "127.0.0.1");
await once(agentdock, "listening");

try {
  await mkdir(workdir);
  await mkdir(bin);
  await writeFile(path.join(workdir, "README.md"), "approved text for Cowork");
  await writeFile(path.join(workdir, ".env"), "PRIVATE_TOKEN=forbidden");
  execFileSync("git", ["init", "-q", workdir]);
  execFileSync("git", ["-C", workdir, "add", "README.md"]);
  execFileSync("git", ["-C", workdir, "-c", "user.name=CI", "-c", "user.email=ci@example.invalid", "commit", "-qm", "fixture"]);
  await mkdir(path.join(workdir, ".codeatlas"));
  await writeFile(path.join(workdir, ".codeatlas", "index.sqlite3"), "disposable fixture db");
  const seal = sealCodeAtlasIndex(workdir);
  const executable = path.join(bin, "codeatlas");
  await writeFile(executable, "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify([{qualified_name:'fixture.symbol',kind:'function',language:'python',file_path:'README.md',start_line:1,metadata:{secret:'hide'}}]));\n");
  await chmod(executable, 0o755);

  const env = {
    ...process.env,
    NODE_ENV: "test", DATABASE_URL: "",
    PATH: bin + path.delimiter + process.env.PATH,
    AGENT_WORK_OS_PORT: String(port), AGENT_WORK_OS_HOST: "127.0.0.1",
    AGENT_WORK_OS_TOKEN: token,
    AGENT_WORK_OS_STATE_PATH: path.join(tmp, "agent-work-os-state.json"),
    AGENT_WORK_OS_HOME: path.join(tmp, "daemon-home"),
    AGENT_WORK_OS_SERVER_URL: "ws://127.0.0.1:" + port + "/ws",
    AGENT_WORK_OS_MACHINE_NAME: "readonly-integration-acceptance",
    AGENT_WORK_OS_SHIPPING_STATE: path.join(tmp, "shipping"),
    AGENT_WORK_OS_AGENTDOCK_READONLY_ENABLED: "true",
    AGENT_WORK_OS_AGENTDOCK_PORT: String(agentdock.address().port),
    AGENT_WORK_OS_CODEATLAS_READONLY_ENABLED: "true",
    AGENT_WORK_OS_CODEATLAS_ROOT: workdir,
    AGENT_WORK_OS_COWORK_FILES_READONLY_ENABLED: "true",
    AGENT_WORK_OS_COWORK_FILES_ROOT: workdir
  };
  function start(file) {
    const child = spawn(process.execPath, [file], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    children.push(child);
    child.stdout.on("data", (data) => process.stdout.write(data));
    child.stderr.on("data", (data) => process.stderr.write(data));
  }
  async function waitFor(check, label, ms = 12_000) {
    const started = Date.now();
    while (Date.now() - started < ms) {
      try {
        const answer = await check();
        if (answer) return answer;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    throw new Error("timeout: " + label);
  }
  const base = "http://127.0.0.1:" + port;
  start("services/control-api/src/index.js");
  await waitFor(async () => (await fetch(base + "/health")).ok, "control health");
  start("runtime/daemon/src/index.js");
  const machine = await waitFor(async () => {
    const state = await (await fetch(base + "/api/state", { headers })).json();
    return state.machines.find((m) =>
      m.name === "readonly-integration-acceptance" && m.status === "online" &&
      ["agentdock", "codeatlas-search", "cowork-files"].every((name) => m.capabilities.some((c) => c.name === name))
    );
  }, "all three read-only capabilities");

  async function run(agent, prompt) {
    const created = await fetch(base + "/api/sessions", {
      method: "POST", headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ machineId: machine.id, cwd: workdir, agent, prompt })
    });
    const body = await created.text();
    assert.equal(created.status, 201, body);
    const session = JSON.parse(body);
    return await waitFor(async () => {
      const response = await fetch(base + "/api/sessions/" + session.id, { headers });
      const value = await response.json();
      if (value.status === "failed") throw new Error("session failed: " + JSON.stringify(value));
      return value.status === "completed" && value.messages?.length ? value : null;
    }, "session " + agent);
  }
  const dock = await run("agentdock", "status");
  const dockMessage = JSON.stringify(dock.messages);
  assert.ok(dockMessage.includes("running"));
  assert.ok(!dockMessage.includes("SECRET_PROCESS_ARG"));

  const code = await run("codeatlas-search", "search fixture");
  const codeMessage = JSON.stringify(code.messages);
  assert.ok(codeMessage.includes("fixture.symbol"));
  assert.ok(codeMessage.includes(seal.revision));
  assert.ok(!codeMessage.includes("hide"));

  const cowork = await run("cowork-files", "read README.md");
  const coworkMessage = JSON.stringify(cowork.messages);
  assert.ok(coworkMessage.includes("approved text for Cowork"));
  assert.ok(!coworkMessage.includes("PRIVATE_TOKEN"));

  console.log("[unified-readonly-acceptance] PASS: 3 browser API -> local daemon -> owned integration paths; no host file/secrets echoed");
} finally {
  for (const child of children.reverse()) child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 250));
  agentdock.close(); await once(agentdock, "close");
  await rm(tmp, { recursive: true, force: true });
}
