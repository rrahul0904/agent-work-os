import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { AgentWorkOsApiClient } from "./api-client.js";

export function buildMcpServer({ client = new AgentWorkOsApiClient() } = {}) {
  const server = new McpServer({ name: "agent-work-os", version: "0.1.0" });

  server.registerTool(
    "agent_work_list",
    {
      title: "List Agent Work OS work items",
      description: "List authoritative Project Desk work items. This tool is read-only.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => toolResult(() => client.listWorkItems()),
  );

  server.registerTool(
    "agent_work_memory",
    {
      title: "Read Work Memory",
      description: "Read the deterministic Work Memory projection for one authoritative work item. The projection cannot change work status or approvals.",
      inputSchema: z.object({ workItemId: z.string().min(1).max(240) }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ workItemId }) => toolResult(() => client.getWorkMemory(workItemId)),
  );

  server.registerTool(
    "agent_work_create_handoff",
    {
      title: "Create verified work handoff",
      description: "Create a bounded RE-297 verified handoff from a real source session. This does not approve, complete, deploy, or otherwise mutate authoritative work status.",
      inputSchema: z.object({
        workItemId: z.string().min(1).max(240),
        fromSessionId: z.string().min(1).max(240),
        nextAction: z.string().min(1).max(280).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ workItemId, fromSessionId, nextAction }) => toolResult(
      () => client.createVerifiedHandoff(workItemId, { fromSessionId, nextAction }),
    ),
  );

  return server;
}

async function toolResult(work) {
  try {
    const value = await work();
    return {
      content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
      structuredContent: value,
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `${error.code || error.name || "error"}: ${error.message}` }],
      isError: true,
    };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void serveStdio(() => buildMcpServer());
  console.error("Agent Work OS MCP server running on stdio");
}
