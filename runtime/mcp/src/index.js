#!/usr/bin/env node
import { createServer } from "node:http";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from "@modelcontextprotocol/node";
import * as z from "zod/v4";
import { createMachinePolicyFromEnv } from "../../daemon/src/machine-policy.js";
import { createMachineTools } from "../../daemon/src/machine-tools.js";
import { createMachineTaskManagerFromEnv } from "../../daemon/src/machine-tasks.js";

const host = process.env.AGENT_WORK_OS_MCP_HOST ?? "127.0.0.1";
const port = Number(process.env.AGENT_WORK_OS_MCP_PORT ?? 8790);
const localToken = process.env.AGENT_WORK_OS_MCP_TOKEN ?? "";
if (!new Set(["127.0.0.1", "localhost", "::1"]).has(host)) throw new Error("mcp_host_must_be_loopback");
const policy = createMachinePolicyFromEnv();
const machineTools = createMachineTools(policy);
const machineTasks = createMachineTaskManagerFromEnv(policy);

function toolResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value
  };
}

function toolError(error) {
  return {
    isError: true,
    content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }]
  };
}

function guarded(fn) {
  return async (input) => {
    try { return toolResult(await fn(input)); }
    catch (error) { return toolError(error); }
  };
}

const executionInput = z.object({
  program: z.string().min(1),
  args: z.array(z.string()).max(256).default([]),
  cwd: z.string().default("."),
  timeoutMs: z.number().int().positive().optional()
});
const taskIdInput = z.string().regex(/^task-[a-f0-9-]{36}$/);

function buildServer() {
  const server = new McpServer({ name: "agent-work-os-machine", version: "0.2.0" });
  const grants = new Set(policy.describe().permissions);

  server.registerTool(
    "system_info",
    {
      description: "Describe the connected machine and the local machine-tool policy/grants. This tool does not modify the machine.",
      inputSchema: z.object({})
    },
    guarded(async () => machineTools.info())
  );

  if (grants.has("read")) {
    server.registerTool(
      "workspace_list",
      {
        description: "List entries under an explicitly granted workspace path. Paths outside configured roots are rejected.",
        inputSchema: z.object({ path: z.string().default(".") })
      },
      guarded(async ({ path }) => machineTools.list(path))
    );
    server.registerTool(
      "workspace_read",
      {
        description: "Read a bounded UTF-8 file from an explicitly granted workspace. Returns SHA-256 for safe follow-up writes.",
        inputSchema: z.object({ path: z.string().min(1) })
      },
      guarded(async ({ path }) => machineTools.read(path))
    );
  }

  if (grants.has("write")) {
    server.registerTool(
      "workspace_write",
      {
        description: "Atomically write a bounded UTF-8 file inside a granted workspace. Supply expectedSha256 when replacing a file to prevent stale overwrites.",
        inputSchema: z.object({
          path: z.string().min(1),
          content: z.string(),
          expectedSha256: z.string().regex(/^[a-f0-9]{64}$/).optional()
        })
      },
      guarded(async (request) => machineTools.write(request))
    );
  }

  if (grants.has("execute")) {
    server.registerTool(
      "execution_run",
      {
        description: "Run one short explicitly allowlisted executable with argv (never an implicit shell) in a granted workspace, with bounded time and output.",
        inputSchema: executionInput
      },
      guarded(async (request) => machineTools.run(request))
    );
    server.registerTool(
      "execution_start",
      {
        description: "Start a durable allowlisted process. Returns a persisted task handle that can be inspected after the MCP client or main daemon reconnects.",
        inputSchema: executionInput
      },
      guarded(async (request) => machineTasks.start(request))
    );
    server.registerTool(
      "execution_status",
      {
        description: "Read the persisted lifecycle record for a durable execution task.",
        inputSchema: z.object({ taskId: taskIdInput })
      },
      guarded(async ({ taskId }) => machineTasks.status(taskId))
    );
    server.registerTool(
      "execution_output",
      {
        description: "Read a bounded stdout or stderr segment from a durable task using byte offsets for resumable polling.",
        inputSchema: z.object({
          taskId: taskIdInput,
          stream: z.enum(["stdout", "stderr"]).default("stdout"),
          offset: z.number().int().nonnegative().default(0),
          maxBytes: z.number().int().positive().max(65536).default(65536)
        })
      },
      guarded(async ({ taskId, stream, offset, maxBytes }) => machineTasks.output(taskId, { stream, offset, maxBytes }))
    );
    server.registerTool(
      "execution_cancel",
      {
        description: "Request cancellation of a durable task through its persisted runner handle.",
        inputSchema: z.object({ taskId: taskIdInput })
      },
      guarded(async ({ taskId }) => machineTasks.cancel(taskId))
    );
    server.registerTool(
      "execution_list",
      {
        description: "List persisted durable execution task records, newest first.",
        inputSchema: z.object({})
      },
      guarded(async () => machineTasks.list())
    );
  }

  return server;
}

const handler = createMcpHandler(buildServer);
const nodeHandler = toNodeHandler(handler);
const validateHost = localhostHostValidation();
const validateOrigin = localhostOriginValidation();

function bearerAuthorized(req) {
  if (!localToken) return true;
  return req.headers.authorization === `Bearer ${localToken}`;
}

const httpServer = createServer((req, res) => {
  const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (requestUrl.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, machineTools: policy.enabled }));
    return;
  }
  if (requestUrl.pathname !== "/mcp") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }
  if (!validateHost(req, res) || !validateOrigin(req, res)) return;
  if (!bearerAuthorized(req)) {
    res.writeHead(401, { "content-type": "application/json", "www-authenticate": "Bearer" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  void nodeHandler(req, res);
});

httpServer.listen(port, host, () => {
  console.error(`[mcp] Agent Work OS machine provider listening on http://${host}:${port}/mcp`);
  console.error(`[mcp] machine tools ${policy.enabled ? "enabled" : "disabled"}; grants=${policy.describe().permissions.join(",") || "none"}`);
});

async function shutdown() {
  await handler.close();
  httpServer.close(() => process.exit(0));
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
