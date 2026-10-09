export class AgentWorkOsApiError extends Error {
  constructor(status, code, message) {
    super(message || code || `Agent Work OS API failed with HTTP ${status}`);
    this.name = "AgentWorkOsApiError";
    this.status = status;
    this.code = code || "api_error";
  }
}

export class AgentWorkOsApiClient {
  constructor({ baseUrl, token, fetchImpl = fetch } = {}) {
    this.baseUrl = String(baseUrl || process.env.AGENT_WORK_OS_API_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
    this.token = token ?? process.env.AGENT_WORK_OS_TOKEN ?? "";
    this.fetchImpl = fetchImpl;
  }

  async listWorkItems() {
    return this.#request("GET", "/api/work-items");
  }

  async getWorkMemory(workItemId) {
    requireText(workItemId, "workItemId");
    return this.#request("GET", `/api/work-items/${encodeURIComponent(workItemId)}/work-memory`);
  }

  async createVerifiedHandoff(workItemId, { fromSessionId, nextAction } = {}) {
    requireText(workItemId, "workItemId");
    requireText(fromSessionId, "fromSessionId");
    return this.#request("POST", `/api/work-items/${encodeURIComponent(workItemId)}/handoffs`, {
      fromSessionId,
      ...(nextAction ? { nextAction } : {}),
    });
  }

  async #request(method, pathname, body) {
    if (!this.token) throw new AgentWorkOsApiError(401, "control_token_required", "AGENT_WORK_OS_TOKEN is required for MCP access");
    const response = await this.fetchImpl(`${this.baseUrl}${pathname}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new AgentWorkOsApiError(response.status, payload.error, payload.message || payload.error);
    }
    return payload;
  }
}

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} is required`);
}
