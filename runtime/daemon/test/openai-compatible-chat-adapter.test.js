import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { OpenAICompatibleChatAdapter, parseCompatibleEndpoint } from "../src/openai-compatible-chat-adapter.js";

const localEnv = (overrides = {}) => ({
  AGENT_WORK_OS_COMPAT_CHAT_ENABLED: "true",
  AGENT_WORK_OS_COMPAT_CHAT_BASE_URL: "http://127.0.0.1:9123/api/model/v1",
  AGENT_WORK_OS_COMPAT_CHAT_MODEL: "qwen-test",
  AGENT_WORK_OS_COMPAT_CHAT_API_KEY: "sensitive-key-only-in-daemon",
  ...overrides
});

function completion(text, usage = { prompt_tokens: 10, completion_tokens: 4 }) {
  return Response.json({ id: "mock", choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }], usage });
}

test("disabled by default; remote inference cannot be enabled by model input", () => {
  const adapter = new OpenAICompatibleChatAdapter({ env: {} });
  assert.equal(adapter.capability(), null);
  assert.equal(new OpenAICompatibleChatAdapter({ env: localEnv({ AGENT_WORK_OS_COMPAT_CHAT_MODEL: "" }) }).capability(), null);
});

test("only exact loopback or explicitly approved HTTPS origins are allowed", () => {
  const local = parseCompatibleEndpoint("http://127.0.0.1:9123/api/model/v1");
  assert.equal(local.kind, "local_machine");
  assert.equal(local.endpoint, "http://127.0.0.1:9123/api/model/v1/chat/completions");
  assert.throws(() => parseCompatibleEndpoint("http://127.0.0.1.evil.com/v1"), /MODEL_CHAT_REMOTE_HTTPS_REQUIRED/);
  assert.throws(() => parseCompatibleEndpoint("https://model.example/v1"), /MODEL_CHAT_REMOTE_ORIGIN_NOT_APPROVED/);
  assert.equal(parseCompatibleEndpoint("https://model.example/v1", "https://model.example").kind, "approved_remote");
  assert.throws(() => parseCompatibleEndpoint("https://model.example.evil/v1", "https://model.example"), /MODEL_CHAT_REMOTE_ORIGIN_NOT_APPROVED/);
  assert.throws(() => parseCompatibleEndpoint("https://user:pass@model.example/v1", "https://model.example"), /MODEL_CHAT_ENDPOINT_CREDENTIALS_OR_QUERY_FORBIDDEN/);
  assert.throws(() => parseCompatibleEndpoint("https://model.example/v1?access_token=secret", "https://model.example"), /MODEL_CHAT_ENDPOINT_CREDENTIALS_OR_QUERY_FORBIDDEN/);
  assert.throws(() => parseCompatibleEndpoint("file:///etc/passwd/v1"), /MODEL_CHAT_ENDPOINT_PROTOCOL_FORBIDDEN/);
});

test("real configured local HTTP provider sends a prompt, preserves in-memory turns and normalizes telemetry", async () => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    requests.push({ url: req.url, authorization: req.headers.authorization, data });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: "assistant turn " + requests.length }, finish_reason: "stop" }], usage: { prompt_tokens: 42, completion_tokens: 7 } }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const port = server.address().port;
    const adapter = new OpenAICompatibleChatAdapter({ env: localEnv({ AGENT_WORK_OS_COMPAT_CHAT_BASE_URL: "http://127.0.0.1:" + port + "/v1" }) });
    const events = [];
    assert.equal(adapter.capability().name, "model-chat");
    const emit = (event) => events.push(event);
    const start = await adapter.run({ sessionId: "s1", prompt: "explain this code", cwd: "/unused" }, emit);
    assert.equal(start.nativeSessionId, "model-chat-s1");
    assert.equal(events.find((event) => event.kind === "text").text, "assistant turn 1");
    assert.equal(events.find((event) => event.kind === "usage").usage.source, "provider_reported");
    assert.equal(requests[0].authorization, "Bearer sensitive-key-only-in-daemon");
    assert.equal(requests[0].url, "/v1/chat/completions");
    assert.deepEqual(requests[0].data.messages, [{ role: "user", content: "explain this code" }]);
    assert.equal(requests[0].data.model, "qwen-test");
    assert.equal(requests[0].data.stream, false);
    const resume = await adapter.run({ sessionId: "s1", prompt: "and the tests?", nativeSessionId: start.nativeSessionId }, emit);
    assert.equal(resume.nativeSessionId, start.nativeSessionId);
    assert.deepEqual(requests[1].data.messages, [
      { role: "user", content: "explain this code" },
      { role: "assistant", content: "assistant turn 1" },
      { role: "user", content: "and the tests?" }
    ]);
    assert.ok(events.some((event) => event.kind === "status" && event.status === "completed"));
    assert.ok(!events.some((event) => JSON.stringify(event).includes("sensitive-key-only-in-daemon")));
    assert.equal(adapter.history.get("s1").length, 4);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("rejects session restart without memory and disallows arbitrary models", async () => {
  let calls = 0;
  const adapter = new OpenAICompatibleChatAdapter({ env: localEnv(), fetchImpl: async () => { calls++; return completion("ok"); } });
  const emit = () => {};
  await assert.rejects(adapter.run({ sessionId: "n", prompt: "old", nativeSessionId: "model-chat-n" }, emit), /MODEL_CHAT_CONTEXT_UNAVAILABLE/);
  await assert.rejects(adapter.run({ sessionId: "n", prompt: "request", model: "unapproved" }, emit), /MODEL_CHAT_MODEL_NOT_APPROVED/);
  assert.equal(calls, 0);
});

test("rejects model tool execution or incomplete responses without claiming success", async () => {
  const results = [
    { choices: [{ message: { content: "", tool_calls: [{ id: "unsafe", function: { name: "delete_files" } }] }, finish_reason: "tool_calls" }] },
    { choices: [{ message: { content: "partial" }, finish_reason: "length" }] }
  ];
  const adapter = new OpenAICompatibleChatAdapter({ env: localEnv(), fetchImpl: async () => Response.json(results.shift()) });
  const events = [];
  await assert.rejects(adapter.run({ sessionId: "u1", prompt: "prompt" }, (x) => events.push(x)), /MODEL_CHAT_TOOLS_UNSUPPORTED/);
  await assert.rejects(adapter.run({ sessionId: "u1", prompt: "prompt" }, (x) => events.push(x)), /MODEL_CHAT_INCOMPLETE_RESPONSE/);
  assert.equal(events.some((e) => e.status === "completed"), false);
  assert.equal(adapter.history.has("u1"), false);
});

test("rejects redirects, rate-limits and HTTP errors without leaking provider body", async () => {
  const statuses = [302, 429, 503, 400];
  const adapter = new OpenAICompatibleChatAdapter({ env: localEnv(), fetchImpl: async () => new Response("token=LEAK", { status: statuses.shift(), headers: { Location: "https://evil.example" } }) });
  for (const code of ["MODEL_CHAT_REDIRECT_FORBIDDEN", "MODEL_CHAT_RATE_LIMITED", "MODEL_CHAT_UNAVAILABLE", "MODEL_CHAT_PROVIDER_HTTP_400"]) {
    await assert.rejects(adapter.run({ sessionId: "same", prompt: "secret prompt" }, () => {}), (e) => e.message === code && !e.message.includes("LEAK"));
  }
});

test("interrupt aborts the active HTTP request and no successful output is recorded", async () => {
  const adapter = new OpenAICompatibleChatAdapter({
    env: localEnv(),
    fetchImpl: async (_url, options) => await new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("client closed")), { once: true });
    })
  });
  const events = [];
  const running = adapter.run({ sessionId: "stop", prompt: "safe content" }, (event) => events.push(event));
  await adapter.interrupt("stop");
  await assert.rejects(running, /MODEL_CHAT_INTERRUPTED_OR_TIMEOUT/);
  assert.equal(events.some((event) => event.status === "completed"), false);
  assert.equal(adapter.active.size, 0);
});


test("remote HTTPS requires separate explicit approval before any private prompt is sent", async () => {
  let called = 0;
  const env = localEnv({
    AGENT_WORK_OS_COMPAT_CHAT_BASE_URL: "https://inference.example/v1",
    AGENT_WORK_OS_COMPAT_CHAT_ALLOWED_ORIGINS: "https://inference.example"
  });
  const adapter = new OpenAICompatibleChatAdapter({ env, fetchImpl: async () => { called += 1; return completion("remote"); } });
  await assert.rejects(adapter.run({ sessionId: "private", prompt: "private repository code" }, () => {}), /MODEL_CHAT_ROUTE_POLICY_DENIED/);
  assert.equal(called, 0);
  const authorized = new OpenAICompatibleChatAdapter({
    env: { ...env, AGENT_WORK_OS_COMPAT_CHAT_ALLOW_PRIVATE_REMOTE: "true" },
    fetchImpl: async () => { called += 1; return completion("operator approved"); }
  });
  await authorized.run({ sessionId: "operator-approved", prompt: "authorized operator test" }, () => {});
  assert.equal(called, 1);
});

test("process-local admission enforces bounded request rate, never silently falls back", async () => {
  let calls = 0;
  const adapter = new OpenAICompatibleChatAdapter({
    env: localEnv({ AGENT_WORK_OS_COMPAT_CHAT_REQUESTS_PER_MINUTE: "1" }),
    fetchImpl: async () => { calls += 1; return completion("ok"); }
  });
  await adapter.run({ sessionId: "first", prompt: "first" }, () => {});
  await assert.rejects(adapter.run({ sessionId: "second", prompt: "second" }, () => {}), /MODEL_CHAT_RATE_QUOTA_EXCEEDED/);
  assert.equal(calls, 1);
  assert.equal(adapter.gate.snapshot().active, 0);
});

test("concurrent requests are refused even when rate quota has spare capacity", async () => {
  let abort = null;
  const adapter = new OpenAICompatibleChatAdapter({
    env: localEnv({ AGENT_WORK_OS_COMPAT_CHAT_MAX_CONCURRENT: "1", AGENT_WORK_OS_COMPAT_CHAT_REQUESTS_PER_MINUTE: "10" }),
    fetchImpl: async (_url, options) => await new Promise((_resolve, reject) => {
      abort = () => reject(new Error("stopped"));
      options.signal.addEventListener("abort", abort, { once: true });
    })
  });
  const first = adapter.run({ sessionId: "one", prompt: "first" }, () => {});
  await assert.rejects(adapter.run({ sessionId: "two", prompt: "second" }, () => {}), /MODEL_CHAT_CONCURRENCY_QUOTA_EXCEEDED/);
  assert.equal(adapter.gate.snapshot().active, 1);
  await adapter.interrupt("one");
  await assert.rejects(first, /MODEL_CHAT_INTERRUPTED_OR_TIMEOUT/);
  assert.equal(adapter.gate.snapshot().active, 0);
});
