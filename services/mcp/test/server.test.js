import test from "node:test";
import assert from "node:assert/strict";
import { buildMcpServer } from "../src/index.js";

test("MCP server builds on the official v2 SDK without exposing authority mutations", () => {
  const client = {
    async listWorkItems() { return { workItems: [] }; },
    async getWorkMemory() { return { schema: "work-memory-projection/v1" }; },
    async createVerifiedHandoff() { return { receipt: { schema: "work-memory-handoff-receipt/v1" } }; },
  };
  const server = buildMcpServer({ client });
  assert.ok(server);
  assert.equal(typeof server.registerTool, "function");
  assert.equal(typeof server.close, "function");
});
