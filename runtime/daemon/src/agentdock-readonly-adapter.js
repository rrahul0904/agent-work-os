/**
 * Wave 3: read-only AgentDock local daemon integration.
 * Never forwards arbitrary API paths, service command lines or filesystem roots.
 * The coding agent daemon itself remains the sole approved local executor.
 */
export class AgentDockReadOnlyAdapter {
  name = "agentdock";
  constructor({ env = process.env, fetchImpl = fetch } = {}) {
    this.fetchImpl = fetchImpl;
    this.enabled = env.AGENT_WORK_OS_AGENTDOCK_READONLY_ENABLED === "true";
    const port = Number(env.AGENT_WORK_OS_AGENTDOCK_PORT ?? 7317);
    this.port = Number.isSafeInteger(port) && port >= 1 && port <= 65535 ? port : null;
    this.active = new Map();
  }

  capability() {
    if (!this.enabled || !this.port) return null;
    return { name: this.name, version: "agentdock-readonly/v1", executable: "local-agentdock-api",
      mode: "read_only", allowedActions: ["status", "projects"], network: "loopback_only" };
  }

  async run(request, emit) {
    if (!this.capability()) throw new Error("AGENTDOCK_READONLY_NOT_CONFIGURED");
    if (!request || typeof request.sessionId !== "string" || !request.sessionId) throw new Error("AGENTDOCK_SESSION_REQUIRED");
    const command = typeof request.prompt === "string" ? request.prompt.trim().toLowerCase() : "";
    if (!["status", "projects"].includes(command)) throw new Error("AGENTDOCK_READONLY_COMMAND_DENIED");
    if (this.active.has(request.sessionId)) throw new Error("AGENTDOCK_SESSION_BUSY");
    const nativeSessionId = "agentdock-" + request.sessionId;
    if (request.nativeSessionId && request.nativeSessionId !== nativeSessionId) throw new Error("AGENTDOCK_SESSION_MISMATCH");
    const controller = new AbortController();
    this.active.set(request.sessionId, controller);
    const timer = setTimeout(() => controller.abort("timeout"), 4_000);
    timer.unref?.();
    try {
      emit({ kind: "status", status: "running", message: "Read-only AgentDock inspection", at: new Date().toISOString() });
      if (!request.nativeSessionId) emit({ kind: "thread", nativeSessionId, at: new Date().toISOString() });
      const path = command === "status" ? "/v1/status" : "/v1/projects";
      const response = await this.fetchImpl("http://127.0.0.1:" + this.port + path, {
        method: "GET", redirect: "manual", signal: controller.signal,
        headers: { accept: "application/json" }
      });
      if (response?.status !== 200) throw new Error("AGENTDOCK_UNAVAILABLE_OR_DENIED");
      if (!(response.headers?.get("content-type") ?? "").includes("application/json")) throw new Error("AGENTDOCK_INVALID_REPLY");
      const payload = await response.json();
      if (controller.signal.aborted) throw new Error("AGENTDOCK_INTERRUPTED");
      let output;
      if (command === "status") {
        if (!payload || payload.daemon?.status !== "running") throw new Error("AGENTDOCK_INVALID_REPLY");
        // The registry is not exposed wholesale: it can include machine-local metadata.
        output = { source: "agentdock", scope: "read_only", daemon: "running",
          version: typeof payload.daemon.version === "string" ? payload.daemon.version.slice(0, 40) : "unknown",
          proxyEnabled: payload.proxy?.enabled === true };
      } else {
        if (!payload || !Array.isArray(payload.projects)) throw new Error("AGENTDOCK_INVALID_REPLY");
        // Return the count only to avoid exposing local workspace names/paths.
        output = { source: "agentdock", scope: "read_only", projectCount: payload.projects.length };
      }
      emit({ kind: "text", text: JSON.stringify(output), at: new Date().toISOString() });
      emit({ kind: "status", status: "completed", at: new Date().toISOString() });
      return { nativeSessionId };
    } catch (error) {
      if (controller.signal.aborted) throw new Error("AGENTDOCK_INTERRUPTED_OR_TIMEOUT");
      if (error.message?.startsWith("AGENTDOCK_")) throw error;
      throw new Error("AGENTDOCK_TRANSPORT_ERROR");
    } finally {
      clearTimeout(timer);
      this.active.delete(request.sessionId);
    }
  }

  async interrupt(sessionId) { this.active.get(sessionId)?.abort("interrupt"); }
}
