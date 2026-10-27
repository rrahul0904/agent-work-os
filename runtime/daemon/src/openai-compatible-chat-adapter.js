import { randomUUID } from "node:crypto";
import { createLocalRequestGate, planInference } from "../../../packages/inference-policy/src/index.js";

const MAX_PROMPT_CHARS = 16_000;
const MAX_HISTORY_CHARS = 80_000;
const MAX_RESPONSE_CHARS = 120_000;

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Exact-origin egress policy: loopback URLs are allowed for a user-controlled
 * local inference runtime; HTTPS remote providers require a separately declared
 * origin. No silent localhost-to-hosted fallback, redirects, or client URL input.
 */
export function parseCompatibleEndpoint(baseUrl, allowedOrigins = "") {
  if (!nonEmpty(baseUrl)) throw new Error("MODEL_CHAT_ENDPOINT_REQUIRED");
  let url;
  try { url = new URL(baseUrl); }
  catch { throw new Error("MODEL_CHAT_ENDPOINT_INVALID"); }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("MODEL_CHAT_ENDPOINT_CREDENTIALS_OR_QUERY_FORBIDDEN");
  }
  const basePath = url.pathname.replace(/\/+$/, "");
  if (!basePath.endsWith("/v1") || !/^\/[a-zA-Z0-9/_-]+$/.test(basePath)) {
    throw new Error("MODEL_CHAT_ENDPOINT_V1_PATH_REQUIRED");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("MODEL_CHAT_ENDPOINT_PROTOCOL_FORBIDDEN");
  if (!loopback && url.protocol !== "https:") throw new Error("MODEL_CHAT_REMOTE_HTTPS_REQUIRED");
  const allowed = allowedOrigins.split(",").map((item) => item.trim()).filter(Boolean);
  if (!loopback && !allowed.includes(url.origin)) {
    throw new Error("MODEL_CHAT_REMOTE_ORIGIN_NOT_APPROVED");
  }
  return {
    baseUrl: url.origin + basePath,
    endpoint: url.origin + basePath + "/chat/completions",
    kind: loopback ? "local_machine" : "approved_remote",
    origin: url.origin
  };
}

function positiveTimeout(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1_000 && n <= 120_000 ? n : 60_000;
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const input = usage.prompt_tokens;
  const output = usage.completion_tokens;
  if (![input, output].every((v) => Number.isSafeInteger(v) && v >= 0)) return null;
  return { inputTokens: input, outputTokens: output, source: "provider_reported" };
}

function textFromChatCompletion(payload) {
  if (!payload || typeof payload !== "object") throw new Error("MODEL_CHAT_INVALID_RESPONSE");
  const choice = payload.choices?.[0];
  if (!choice || typeof choice !== "object") throw new Error("MODEL_CHAT_MISSING_CHOICE");
  if (Array.isArray(choice.message?.tool_calls) && choice.message.tool_calls.length > 0) {
    throw new Error("MODEL_CHAT_TOOLS_UNSUPPORTED_IN_CHAT_ONLY_LANE");
  }
  if (choice.finish_reason && choice.finish_reason !== "stop") {
    throw new Error("MODEL_CHAT_INCOMPLETE_RESPONSE");
  }
  const text = choice.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("MODEL_CHAT_EMPTY_RESPONSE");
  if (text.length > MAX_RESPONSE_CHARS) throw new Error("MODEL_CHAT_RESPONSE_TOO_LARGE");
  return text;
}

/**
 * Read-only chat is intentionally separate from coding-agent execution.
 * Existing Codex/Claude/OpenCode/Cursor adapters retain tool/workspace rights.
 * This provider lane never runs tool calls or executes model-generated code.
 */
export class OpenAICompatibleChatAdapter {
  name = "model-chat";
  constructor({ env = process.env, fetchImpl = fetch } = {}) {
    this.fetchImpl = fetchImpl;
    this.model = env.AGENT_WORK_OS_COMPAT_CHAT_MODEL || "";
    this.apiKey = env.AGENT_WORK_OS_COMPAT_CHAT_API_KEY || "";
    this.timeoutMs = positiveTimeout(env.AGENT_WORK_OS_COMPAT_CHAT_TIMEOUT_MS);
    this.history = new Map();
    this.active = new Map();
    this.configError = null;
    try {
      if (env.AGENT_WORK_OS_COMPAT_CHAT_ENABLED !== "true") return;
      if (!nonEmpty(this.model) || this.model.length > 150 || !/^[a-zA-Z0-9._:/-]+$/.test(this.model)) {
        throw new Error("MODEL_CHAT_MODEL_REQUIRED");
      }
      this.endpoint = parseCompatibleEndpoint(
        env.AGENT_WORK_OS_COMPAT_CHAT_BASE_URL,
        env.AGENT_WORK_OS_COMPAT_CHAT_ALLOWED_ORIGINS
      );
      this.gate = createLocalRequestGate({
        requestsPerMinute: Number(env.AGENT_WORK_OS_COMPAT_CHAT_REQUESTS_PER_MINUTE || 30),
        maxConcurrent: Number(env.AGENT_WORK_OS_COMPAT_CHAT_MAX_CONCURRENT || 1)
      });
      this.privateRemoteApproved = env.AGENT_WORK_OS_COMPAT_CHAT_ALLOW_PRIVATE_REMOTE === "true";
      this.laneVerifiedAtMs = Date.now();
      this.enabled = true;
    } catch (error) {
      this.configError = error.message;
      this.enabled = false;
    }
  }

  capability() {
    if (!this.enabled || this.configError) return null;
    return { name: this.name, version: "model-chat/v1", model: this.model, lane: this.endpoint.kind, mode: "chat_only_no_tools" };
  }

  async run(request, emit) {
    if (!this.enabled || this.configError) throw new Error(this.configError || "MODEL_CHAT_DISABLED");
    if (!nonEmpty(request.sessionId) || !nonEmpty(request.prompt) || request.prompt.length > MAX_PROMPT_CHARS) {
      throw new Error("MODEL_CHAT_INVALID_REQUEST");
    }
    if (request.model && request.model !== this.model) throw new Error("MODEL_CHAT_MODEL_NOT_APPROVED");
    if (this.active.has(request.sessionId)) throw new Error("MODEL_CHAT_SESSION_BUSY");

    const nativeSessionId = "model-chat-" + request.sessionId;
    const previous = this.history.get(request.sessionId);
    if (request.nativeSessionId && (request.nativeSessionId !== nativeSessionId || !previous)) {
      // Stateless providers do not guarantee resumption after a daemon restart.
      throw new Error("MODEL_CHAT_CONTEXT_UNAVAILABLE");
    }
    if (!request.nativeSessionId && previous) throw new Error("MODEL_CHAT_SESSION_ALREADY_EXISTS");
    const messages = [...(previous || []), { role: "user", content: request.prompt }];
    const size = messages.reduce((n, message) => n + message.content.length, 0);
    if (size > MAX_HISTORY_CHARS) throw new Error("MODEL_CHAT_CONTEXT_LIMIT");
    const lane = {
      id: "configured-model-chat",
      type: this.endpoint.kind,
      model: this.model,
      protocol: "chat_completions",
      health: "ready", // Config acceptance only, not a verified model-health probe.
      verifiedAtMs: this.laneVerifiedAtMs,
      maxContextTokens: 1_000_000, // Local admission bound below; NOT a model capacity claim.
      tools: false,
      permitsPrivate: this.endpoint.kind === "local_machine" || this.privateRemoteApproved,
      region: this.endpoint.kind === "local_machine" ? "local" : this.endpoint.origin,
      runtimeRevision: "operator_configured_unverified",
      priority: 0
    };
    const route = planInference({
      request: { protocol: "chat_completions", privacy: "private", tools: false, contextTokens: Math.ceil(size / 4) },
      lanes: [lane],
      policy: {
        allowedLaneTypes: ["local_machine", "approved_remote"],
        allowedModels: [this.model], allowedRegions: [lane.region], maxHealthAgeMs: 24 * 60 * 60 * 1000
      }
    });
    if (route.status !== "eligible") throw new Error("MODEL_CHAT_ROUTE_POLICY_DENIED");
    // Process-local safety bounds. Tenant-wide atomic quotas remain owned by Token Intelligence.
    const releaseAdmission = this.gate.admit();
    const controller = new AbortController();
    this.active.set(request.sessionId, controller);
    emit({ kind: "status", status: "running", message: "Open-model chat admitted (tools disabled; policy " + route.digest.slice(0, 12) + ")", at: new Date().toISOString() });
    if (!request.nativeSessionId) emit({ kind: "thread", nativeSessionId, at: new Date().toISOString() });

    const timer = setTimeout(() => controller.abort("timeout"), this.timeoutMs);
    timer.unref?.();
    try {
      const headers = { "content-type": "application/json", "accept": "application/json" };
      if (this.apiKey) headers.authorization = "Bearer " + this.apiKey;
      const response = await this.fetchImpl(this.endpoint.endpoint, {
        method: "POST",
        redirect: "manual",
        headers,
        body: JSON.stringify({ model: this.model, messages, stream: false, tools: undefined }),
        signal: controller.signal
      });
      if (!response || response.status !== 200) {
        const status = response?.status;
        if (status >= 300 && status < 400) throw new Error("MODEL_CHAT_REDIRECT_FORBIDDEN");
        if (status === 429) throw new Error("MODEL_CHAT_RATE_LIMITED");
        if (status === 503) throw new Error("MODEL_CHAT_UNAVAILABLE");
        throw new Error("MODEL_CHAT_PROVIDER_HTTP_" + (Number.isInteger(status) ? status : "UNKNOWN"));
      }
      const contentType = response.headers?.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/json")) throw new Error("MODEL_CHAT_UNEXPECTED_CONTENT_TYPE");
      const payload = await response.json();
      const output = textFromChatCompletion(payload);
      if (controller.signal.aborted) throw new Error("MODEL_CHAT_INTERRUPTED");
      const nextHistory = [...messages, { role: "assistant", content: output }];
      this.history.set(request.sessionId, nextHistory);
      emit({ kind: "text", text: output, at: new Date().toISOString() });
      const usage = normalizeUsage(payload.usage);
      if (usage) emit({ kind: "usage", usage, at: new Date().toISOString() });
      emit({ kind: "status", status: "completed", at: new Date().toISOString() });
      return { nativeSessionId, provenance: "configured_openai_compatible_chat_api", provider: this.endpoint.kind };
    } catch (error) {
      // Never propagate a provider response body, token or raw prompt into logs.
      if (controller.signal.aborted) throw new Error("MODEL_CHAT_INTERRUPTED_OR_TIMEOUT");
      if (error.message?.startsWith("MODEL_CHAT_")) throw error;
      throw new Error("MODEL_CHAT_TRANSPORT_ERROR");
    } finally {
      clearTimeout(timer);
      this.active.delete(request.sessionId);
      releaseAdmission();
    }
  }

  async interrupt(sessionId) {
    this.active.get(sessionId)?.abort("user_interrupt");
  }
}

export function createModelChatVerificationFixture() {
  return { id: randomUUID(), mode: "chat_only_no_tools", provider: "configured_runtime", defaultConfigured: false };
}
