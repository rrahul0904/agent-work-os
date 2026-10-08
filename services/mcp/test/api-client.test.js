import test from "node:test";
import assert from "node:assert/strict";
import { AgentWorkOsApiClient, AgentWorkOsApiError } from "../src/api-client.js";

function fakeResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

test("MCP API client sends control-token auth for read-only work discovery", async () => {
  const calls = [];
  const client = new AgentWorkOsApiClient({
    baseUrl: "http://example.test/",
    token: "secret",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return fakeResponse(200, { workItems: [{ id: "w1" }] });
    },
  });
  const result = await client.listWorkItems();
  assert.deepEqual(result.workItems, [{ id: "w1" }]);
  assert.equal(calls[0].url, "http://example.test/api/work-items");
  assert.equal(calls[0].options.headers.authorization, "Bearer secret");
});

test("MCP API client encodes work IDs and only creates bounded verified handoffs", async () => {
  const calls = [];
  const client = new AgentWorkOsApiClient({
    baseUrl: "http://example.test",
    token: "secret",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return fakeResponse(201, { receipt: { handoffId: "h1" } });
    },
  });
  await client.createVerifiedHandoff("work/1", { fromSessionId: "s1", nextAction: "continue" });
  assert.equal(calls[0].url, "http://example.test/api/work-items/work%2F1/handoffs");
  assert.deepEqual(JSON.parse(calls[0].options.body), { fromSessionId: "s1", nextAction: "continue" });
});

test("MCP API client fails closed without a control token", async () => {
  const client = new AgentWorkOsApiClient({ baseUrl: "http://example.test", token: "", fetchImpl: async () => { throw new Error("must not fetch"); } });
  await assert.rejects(
    client.getWorkMemory("w1"),
    (error) => error instanceof AgentWorkOsApiError && error.code === "control_token_required" && error.status === 401,
  );
});

test("MCP API client preserves bounded API error codes", async () => {
  const client = new AgentWorkOsApiClient({
    baseUrl: "http://example.test",
    token: "secret",
    fetchImpl: async () => fakeResponse(404, { error: "work_item_not_found", message: "missing work" }),
  });
  await assert.rejects(
    client.getWorkMemory("missing"),
    (error) => error instanceof AgentWorkOsApiError && error.code === "work_item_not_found" && error.message === "missing work",
  );
});
