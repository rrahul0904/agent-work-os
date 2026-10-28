import { randomUUID } from "node:crypto";
import { createLocalRequestGate, planInference } from "../../../packages/inference-policy/src/index.js";

const MAX_CONTEXT_BYTES = 16_384;
const MAX_PROVIDER_BYTES = 128 * 1024;

export function parseTokenIntelligenceEndpoint(raw, allowedOrigin = "", privateRemoteApproved = false) {
  if (!raw || typeof raw !== "string") throw new Error("TI_GATEWAY_ENDPOINT_REQUIRED");
  let url;
  try { url = new URL(raw); }
  catch { throw new Error("TI_GATEWAY_ENDPOINT_INVALID"); }
  if (url.username || url.password || url.hash || url.search) throw new Error("TI_GATEWAY_URL_CREDENTIALS_FORBIDDEN");
  if (url.pathname !== "/api/v1/inference/chat-completions") throw new Error("TI_GATEWAY_ENDPOINT_PATH_INVALID");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("TI_GATEWAY_SCHEME_FORBIDDEN");
  if (!local && (url.protocol !== "https:" || url.origin !== allowedOrigin)) throw new Error("TI_GATEWAY_REMOTE_ORIGIN_DENIED");
  if (!local && privateRemoteApproved !== true) throw new Error("TI_GATEWAY_PRIVATE_REMOTE_CONSENT_REQUIRED");
  return { endpoint: url.origin + url.pathname, kind: local ? "local_machine" : "approved_remote", region: local ? "local" : url.origin };
}

async function boundedJson(response) {
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("TI_GATEWAY_CONTENT_TYPE_INVALID");
  }
  if (Number(response.headers.get("content-length") || 0) > MAX_PROVIDER_BYTES) throw new Error("TI_GATEWAY_RESPONSE_TOO_LARGE");
  if (!response.body) throw new Error("TI_GATEWAY_EMPTY_BODY");
  const reader = response.body.getReader();
  const bytes = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > MAX_PROVIDER_BYTES) throw new Error("TI_GATEWAY_RESPONSE_TOO_LARGE");
      bytes.push(item.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const content = Buffer.concat(bytes, size).toString("utf8");
  try { return JSON.parse(content); } catch { throw new Error("TI_GATEWAY_RESPONSE_INVALID"); }
}

export class TokenIntelligenceChatAdapter {
  name = "token-intelligence";
  constructor({ env = process.env, fetchImpl = fetch } = {}) {
    this.enabled = false;
    this.configError = null;
    this.fetchImpl = fetchImpl;
    this.active = new Map();
    this.history = new Map();
    try {
      if (env.AGENT_WORK_OS_TI_ENABLED !== "true") return;
      this.model = env.AGENT_WORK_OS_TI_MODEL || "";
      this.upstreamDestination = env.AGENT_WORK_OS_TI_UPSTREAM_DESTINATION || "";
      this.upstreamRegion = env.AGENT_WORK_OS_TI_UPSTREAM_REGION || "";
      this.upstreamRetention = env.AGENT_WORK_OS_TI_UPSTREAM_RETENTION || "";
      if (!["local_machine", "approved_remote"].includes(this.upstreamDestination) ||
          !/^[A-Za-z0-9._:/-]{2,120}$/.test(this.upstreamRegion) ||
          !["zero", "bounded"].includes(this.upstreamRetention) ||
          env.AGENT_WORK_OS_TI_PRIVATE_UPSTREAM_APPROVED !== "true") {
        throw new Error("TI_GATEWAY_UPSTREAM_PRIVACY_ATTESTATION_REQUIRED");
      }

      this.apiKey = env.AGENT_WORK_OS_TI_API_KEY || "";
      if (!/^[a-zA-Z0-9._:/-]{1,150}$/.test(this.model)) throw new Error("TI_GATEWAY_MODEL_REQUIRED");
      if (!this.apiKey || this.apiKey.length < 16 || this.apiKey.length > 512) throw new Error("TI_GATEWAY_SCOPED_API_KEY_REQUIRED");
      this.endpoint = parseTokenIntelligenceEndpoint(
        env.AGENT_WORK_OS_TI_ENDPOINT,
        env.AGENT_WORK_OS_TI_ALLOWED_ORIGIN,
        env.AGENT_WORK_OS_TI_PRIVATE_REMOTE_APPROVED === "true",
      );
      const maxTokens = Number(env.AGENT_WORK_OS_TI_MAX_OUTPUT_TOKENS || 256);
      if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 2048) throw new Error("TI_GATEWAY_MAX_OUTPUT_TOKENS_INVALID");
      this.maxTokens = maxTokens;
      this.gate = createLocalRequestGate({
        requestsPerMinute: Number(env.AGENT_WORK_OS_TI_REQUESTS_PER_MINUTE || 30),
        maxConcurrent: Number(env.AGENT_WORK_OS_TI_MAX_CONCURRENT || 1),
      });
      this.enabled = true;
    } catch (error) {
      this.configError = error.message;
    }
  }

  capability() {
    if (!this.enabled || this.configError) return null;
    return { name: this.name, version: "token-intelligence-live/v1", model: this.model,
      mode: "chat_only_no_tools", quotaAuthority: "token_intelligence_postgres",
      lane: this.endpoint.kind, upstreamDestination:this.upstreamDestination,
      upstreamRegion:this.upstreamRegion, upstreamRetention:this.upstreamRetention,
      upstreamTrust:"operator_declared_not_independently_verified" };
  }

  async run(request, emit) {
    if (!this.capability()) throw new Error(this.configError || "TI_GATEWAY_DISABLED");
    if (!request || typeof request.sessionId !== "string" || !request.sessionId ||
      typeof request.prompt !== "string" || !request.prompt.trim()) throw new Error("TI_GATEWAY_INVALID_PROMPT");
    if (request.model && request.model !== this.model) throw new Error("TI_GATEWAY_MODEL_DENIED");
    if (this.active.has(request.sessionId)) throw new Error("TI_GATEWAY_SESSION_BUSY");
    const nativeSessionId = "ti-gateway-" + request.sessionId;
    const previous = this.history.get(request.sessionId);
    if (request.nativeSessionId && (request.nativeSessionId !== nativeSessionId || !previous)) throw new Error("TI_GATEWAY_CONTEXT_UNAVAILABLE");
    if (!request.nativeSessionId && previous) throw new Error("TI_GATEWAY_SESSION_ALREADY_EXISTS");
    const messages = [...(previous || []), { role: "user", content: request.prompt }];
    if (messages.length > 16 || messages.reduce((sum, m) => sum + Buffer.byteLength(m.content, "utf8"), 0) > MAX_CONTEXT_BYTES) {
      throw new Error("TI_GATEWAY_CONTEXT_LIMIT");
    }
    // Control-plane routing proposal has no authority to bypass provider policy.
    const route = planInference({
      request: { protocol: "chat_completions", privacy: "private", tools: false,
        contextTokens: Math.ceil(messages.reduce((sum, m) => sum + Buffer.byteLength(m.content, "utf8"), 0) / 4) },
      lanes: [{
        id: "token-intelligence-gateway", type: this.endpoint.kind, model: this.model,
        protocol: "chat_completions", health: "ready", verifiedAtMs: Date.now(),
        maxContextTokens: MAX_CONTEXT_BYTES, tools: false, permitsPrivate: true,
        region: this.upstreamRegion, runtimeRevision: "upstream_operator_attested_unverified",
      }],
      policy: {
        allowedLaneTypes: [this.endpoint.kind], allowedModels: [this.model],
        allowedRegions: [this.upstreamRegion], maxHealthAgeMs: 60_000,
      }
    });
    if (route.status !== "eligible") throw new Error("TI_GATEWAY_POLICY_DENIED");
    const releaseAdmission = this.gate.admit();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), 65_000);
    timeout.unref?.();
    this.active.set(request.sessionId, controller);
    emit({ kind: "status", status: "running", message: "Token Intelligence gateway request admitted locally", at: new Date().toISOString() });
    if (!request.nativeSessionId) emit({ kind: "thread", nativeSessionId, at: new Date().toISOString() });
    try {
      // Always use a NEW key for a new turn. Never retry a possibly-executed
      // provider call: the gateway will reject a repeated idempotency key.
      const idempotencyKey = "awos_" + randomUUID();
      const response = await this.fetchImpl(this.endpoint.endpoint, {
        method: "POST", redirect: "manual", signal: controller.signal,
        headers: {
          "content-type": "application/json", accept: "application/json",
          authorization: "Bearer " + this.apiKey, "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          model: this.model, messages, max_tokens: this.maxTokens,
          store: false, stream: false,
        }),
      });
      if (controller.signal.aborted) throw new Error("TI_GATEWAY_INTERRUPTED_OR_TIMEOUT");
      if (response?.status === 429) throw new Error("TI_GATEWAY_QUOTA_EXCEEDED");
      if (response?.status === 409) throw new Error("TI_GATEWAY_IDEMPOTENCY_REFUSED");
      if (response?.status !== 200) throw new Error("TI_GATEWAY_PROVIDER_UNAVAILABLE");
      const payload = await boundedJson(response);
      const answer = payload?.choices?.[0];
      if (answer?.finish_reason !== "stop" || typeof answer?.message?.content !== "string" ||
        !answer.message.content.trim() || answer.message.content.length > 32_768 ||
        (Array.isArray(answer.message.tool_calls) && answer.message.tool_calls.length)) {
        throw new Error("TI_GATEWAY_RESPONSE_INVALID");
      }
      if (payload.model !== this.model || payload.billing_state !== "not_billed" ||
        !/^iev_[A-Za-z0-9_-]{8,}$/.test(String(payload.receipt_id || ""))) {
        throw new Error("TI_GATEWAY_RECEIPT_INVALID");
      }
      if (controller.signal.aborted) throw new Error("TI_GATEWAY_INTERRUPTED_OR_TIMEOUT");
      this.history.set(request.sessionId, [...messages, { role: "assistant", content: answer.message.content }]);
      emit({ kind: "text", text: answer.message.content, at: new Date().toISOString() });
      if (payload.usage && Number.isSafeInteger(payload.usage.prompt_tokens) &&
        Number.isSafeInteger(payload.usage.completion_tokens)) {
        emit({ kind: "usage", usage: {
          inputTokens: payload.usage.prompt_tokens, outputTokens: payload.usage.completion_tokens,
          source: "provider_reported", billingState: "not_billed",
        }, at: new Date().toISOString() });
      }
      emit({ kind: "status", status: "completed", at: new Date().toISOString() });
      return { nativeSessionId };
    } catch (error) {
      if (controller.signal.aborted) throw new Error("TI_GATEWAY_INTERRUPTED_OR_TIMEOUT");
      if (error.message?.startsWith("TI_GATEWAY_")) throw error;
      throw new Error("TI_GATEWAY_TRANSPORT_ERROR");
    } finally {
      clearTimeout(timeout);
      this.active.delete(request.sessionId);
      releaseAdmission();
    }
  }
  async interrupt(sessionId) { this.active.get(sessionId)?.abort("operator_interrupted"); }
}
