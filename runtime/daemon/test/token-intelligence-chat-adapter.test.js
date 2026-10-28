import test from "node:test";
import assert from "node:assert/strict";
import { TokenIntelligenceChatAdapter, parseTokenIntelligenceEndpoint } from "../src/token-intelligence-chat-adapter.js";

const baseEnv = () => ({
  AGENT_WORK_OS_TI_ENABLED: "true",
  AGENT_WORK_OS_TI_ENDPOINT: "http://127.0.0.1:8000/api/v1/inference/chat-completions",
  AGENT_WORK_OS_TI_MODEL: "ti-live-test-qwen",
  AGENT_WORK_OS_TI_API_KEY: "ti_key_local_test_nonproduction",
  AGENT_WORK_OS_TI_UPSTREAM_DESTINATION: "local_machine",
  AGENT_WORK_OS_TI_UPSTREAM_REGION: "local",
  AGENT_WORK_OS_TI_UPSTREAM_RETENTION: "zero",
  AGENT_WORK_OS_TI_PRIVATE_UPSTREAM_APPROVED: "true"
});
const receipt = (output = "Verified via gateway") => Response.json({
  id: "fixture-model", model: "ti-live-test-qwen", billing_state: "not_billed",
  receipt_id: "iev_00000000-0000-4000-8000-000000000001",
  choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: output } }],
  usage: { prompt_tokens: 32, completion_tokens: 10 }
});

test("off by default and incomplete provider settings are never advertised", () => {
  assert.equal(new TokenIntelligenceChatAdapter({ env: {} }).capability(), null);
  assert.equal(new TokenIntelligenceChatAdapter({ env: { ...baseEnv(), AGENT_WORK_OS_TI_API_KEY: "" } }).capability(), null);
  assert.equal(new TokenIntelligenceChatAdapter({ env: { ...baseEnv(), AGENT_WORK_OS_TI_MODEL: "" } }).capability(), null);
});

test("local gateway URL does not prove upstream model is local or privacy-approved",()=>{
  const upstreamUnknown={...baseEnv(),AGENT_WORK_OS_TI_UPSTREAM_DESTINATION:""};
  assert.equal(new TokenIntelligenceChatAdapter({env:upstreamUnknown}).capability(),null);
  const noApproval={...baseEnv(),AGENT_WORK_OS_TI_PRIVATE_UPSTREAM_APPROVED:"false"};
  assert.equal(new TokenIntelligenceChatAdapter({env:noApproval}).capability(),null);
  const remoteBehindLocal={...baseEnv(),AGENT_WORK_OS_TI_UPSTREAM_DESTINATION:"approved_remote",
    AGENT_WORK_OS_TI_UPSTREAM_REGION:"us-east-1",AGENT_WORK_OS_TI_UPSTREAM_RETENTION:"bounded",
    AGENT_WORK_OS_TI_UPSTREAM_ORIGIN:"https://approved-inference.example"};
  const adapter=new TokenIntelligenceChatAdapter({env:remoteBehindLocal});
  assert.equal(adapter.capability().lane,"local_machine");
  assert.equal(adapter.capability().upstreamDestination,"approved_remote");
  assert.equal(adapter.capability().upstreamOrigin,"https://approved-inference.example");
  assert.equal(new TokenIntelligenceChatAdapter({env:{...remoteBehindLocal,AGENT_WORK_OS_TI_UPSTREAM_ORIGIN:"https://evil.example/secret"}}).capability(),null);
  assert.equal(adapter.capability().upstreamTrust,"operator_declared_not_independently_verified");
});
test("endpoint prevents URL credentials, redirects and remote private transfer without consent", () => {
  assert.equal(parseTokenIntelligenceEndpoint(baseEnv().AGENT_WORK_OS_TI_ENDPOINT).kind, "local_machine");
  for (const url of [
    "http://127.0.0.1:8000/admin",
    "file:///etc/passwd",
    "https://evil.example/api/v1/inference/chat-completions",
    "http://localhost.evil.example/api/v1/inference/chat-completions",
    "http://token:secret@127.0.0.1:8000/api/v1/inference/chat-completions",
  ]) assert.throws(() => parseTokenIntelligenceEndpoint(url));
  const https = "https://approved.example/api/v1/inference/chat-completions";
  assert.throws(() => parseTokenIntelligenceEndpoint(https, "https://approved.example"), /PRIVATE_REMOTE_CONSENT_REQUIRED/);
  assert.equal(parseTokenIntelligenceEndpoint(https, "https://approved.example", true).kind, "approved_remote");
  assert.throws(() => parseTokenIntelligenceEndpoint("https://approved.example.attacker/api/v1/inference/chat-completions", "https://approved.example", true), /REMOTE_ORIGIN_DENIED/);
});

test("calls actual gateway-compatible POST with idempotency and secrets confined to fetch headers", async () => {
  const calls = [];
  const adapter = new TokenIntelligenceChatAdapter({
    env: baseEnv(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return receipt("Response " + calls.length);
    }
  });
  assert.equal(adapter.capability().quotaAuthority, "token_intelligence_postgres");
  const events = [];
  const emit = (event) => events.push(event);
  const first = await adapter.run({ sessionId: "session-one", prompt: "Explain algorithm" }, emit);
  assert.equal(first.nativeSessionId, "ti-gateway-session-one");
  assert.equal(calls[0].url, baseEnv().AGENT_WORK_OS_TI_ENDPOINT);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.redirect, "manual");
  assert.equal(calls[0].options.headers.authorization, "Bearer " + baseEnv().AGENT_WORK_OS_TI_API_KEY);
  assert.match(calls[0].options.headers["idempotency-key"], /^awos_[a-f0-9-]{36}$/);
  const firstBody = JSON.parse(calls[0].options.body);
  assert.equal(firstBody.store, false);
  assert.equal(firstBody.stream, false);
  assert.equal(firstBody.max_tokens, 256);
  assert.deepEqual(firstBody.messages, [{ role: "user", content: "Explain algorithm" }]);
  const next = await adapter.run({ sessionId: "session-one", nativeSessionId: first.nativeSessionId, prompt: "What next?" }, emit);
  assert.equal(next.nativeSessionId, first.nativeSessionId);
  assert.notEqual(calls[0].options.headers["idempotency-key"], calls[1].options.headers["idempotency-key"]);
  assert.deepEqual(JSON.parse(calls[1].options.body).messages, [
    { role: "user", content: "Explain algorithm" },
    { role: "assistant", content: "Response 1" },
    { role: "user", content: "What next?" }
  ]);
  assert.equal(events.filter((e) => e.kind === "text").length, 2);
  assert.ok(events.some((e) => e.kind === "usage" && e.usage.source === "provider_reported" && e.usage.billingState === "not_billed"));
  assert.ok(!JSON.stringify(events).includes(baseEnv().AGENT_WORK_OS_TI_API_KEY));
});

test("all gateway failures or billing/receipt mismatch fail closed without storing failed turns", async () => {
  const responses = [
    new Response("quota secret", { status: 429 }),
    new Response("idempotency conflict", { status: 409 }),
    Response.json({ ...{}, billing_state: "billed", receipt_id: "malicious" }),
    Response.json({ id: "x", model: "ti-live-test-qwen", billing_state: "not_billed",
      receipt_id: "iev_00000000-0000-4000-8000-000000000001",
      choices: [{ finish_reason: "tool_calls", message: { content: "ignored", tool_calls: [{ name: "rm" }] } }] })
  ];
  const adapter = new TokenIntelligenceChatAdapter({ env: baseEnv(), fetchImpl: async () => responses.shift() });
  const emitted = [];
  const emit = (e) => emitted.push(e);
  for (const re of [/TI_GATEWAY_QUOTA_EXCEEDED/, /TI_GATEWAY_IDEMPOTENCY_REFUSED/, /TI_GATEWAY_RESPONSE_INVALID/]) {
    await assert.rejects(adapter.run({ sessionId: "s", prompt: "test private prompt" }, emit), re);
  }
  await assert.rejects(adapter.run({ sessionId: "s", prompt: "test private prompt" }, emit), /TI_GATEWAY_RESPONSE_INVALID/);
  assert.equal(adapter.history.has("s"), false);
  assert.equal(emitted.some((e) => e.kind === "status" && e.status === "completed"), false);
});

test("model, context resumption, and local rate limit are enforced before sending", async () => {
  let calls = 0;
  const adapter = new TokenIntelligenceChatAdapter({
    env: { ...baseEnv(), AGENT_WORK_OS_TI_REQUESTS_PER_MINUTE: "1" },
    fetchImpl: async () => { calls++; return receipt(); }
  });
  await assert.rejects(adapter.run({ sessionId: "s", prompt: "prompt", model: "unapproved" }, () => {}), /TI_GATEWAY_MODEL_DENIED/);
  await assert.rejects(adapter.run({ sessionId: "s", prompt: "prompt", nativeSessionId: "ti-gateway-s" }, () => {}), /TI_GATEWAY_CONTEXT_UNAVAILABLE/);
  await adapter.run({ sessionId: "s", prompt: "prompt" }, () => {});
  await assert.rejects(adapter.run({ sessionId: "different", prompt: "prompt" }, () => {}), /MODEL_CHAT_RATE_QUOTA_EXCEEDED/);
  assert.equal(calls, 1);
});

test("browser requests cannot swap the provider URL or run gateway tools", async () => {
  let called = 0;
  const adapter = new TokenIntelligenceChatAdapter({ env: baseEnv(), fetchImpl: async () => { called++; return receipt(); } });
  await assert.rejects(adapter.run({ sessionId: "s", prompt: "A".repeat(17000) }, () => {}), /TI_GATEWAY_CONTEXT_LIMIT/);
  assert.equal(adapter.capability().mode, "chat_only_no_tools");
  assert.equal(called, 0);
});
