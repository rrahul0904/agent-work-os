import crypto from "node:crypto";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROTOCOL_VERSION, decodeMessage, encodeMessage } from "../../../packages/protocol/src/index.js";
import { acceptWebSocket } from "../../../packages/protocol/src/websocket.js";
import { FairTurnScheduler, projectAttention, reparentAgent, validateOrganization } from "./coordination.js";
import { JsonStore } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "../../../apps/web/public");
const host = process.env.AGENT_WORK_OS_HOST ?? "127.0.0.1";
const port = Number(process.env.AGENT_WORK_OS_PORT ?? 8787);
const token = process.env.AGENT_WORK_OS_TOKEN ?? "dev-token";
const statePath = path.resolve(process.env.AGENT_WORK_OS_STATE_PATH ?? ".data/state.json");

export async function createControlPlane() {
  const store = new JsonStore(statePath);
  await store.load();
  const daemonSockets = new Map();
  const clientSockets = new Set();

  const broadcast = (event) => {
    const encoded = encodeMessage(event);
    for (const peer of clientSockets) peer.send(encoded);
  };
  const sendCommand = (machineId, command) => {
    const peer = daemonSockets.get(machineId);
    if (!peer || peer.closed) throw new Error(`Machine ${machineId} is not connected`);
    peer.send(encodeMessage(command));
  };

  const server = http.createServer(async (req, res) => {
    try {
      addCors(res);
      if (req.method === "OPTIONS") return end(res, 204);
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, protocolVersion: PROTOCOL_VERSION });
      if (req.method === "GET" && url.pathname === "/api/state") {
        return json(res, 200, {
          machines: store.listMachines(),
          sessions: store.listSessions(),
          organizations: store.listOrganizations()
        });
      }

      if (req.method === "GET" && url.pathname === "/api/organizations") {
        return json(res, 200, { organizations: store.listOrganizations() });
      }
      if (req.method === "POST" && url.pathname === "/api/organizations") {
        const body = await readJson(req);
        try {
          const organization = validateOrganization(body);
          const existed = Boolean(store.getOrganization(organization.id));
          await store.upsertOrganization(organization);
          broadcast({ type: "organization.updated", organization });
          return json(res, existed ? 200 : 201, organization);
        } catch (error) {
          return json(res, 400, { error: "invalid_organization", message: error.message });
        }
      }
      const organizationMatch = url.pathname.match(/^\/api\/organizations\/([^/]+)$/);
      if (req.method === "GET" && organizationMatch) {
        const organization = store.getOrganization(decodeURIComponent(organizationMatch[1]));
        return organization ? json(res, 200, organization) : json(res, 404, { error: "organization_not_found" });
      }
      const reparentMatch = url.pathname.match(/^\/api\/organizations\/([^/]+)\/reparent$/);
      if (req.method === "POST" && reparentMatch) {
        const organization = store.getOrganization(decodeURIComponent(reparentMatch[1]));
        if (!organization) return json(res, 404, { error: "organization_not_found" });
        const body = await readJson(req);
        try {
          const updated = reparentAgent(organization, body.agentId, body.parentId ?? null);
          await store.upsertOrganization(updated);
          broadcast({ type: "organization.updated", organization: updated });
          return json(res, 200, updated);
        } catch (error) {
          return json(res, 400, { error: "invalid_reparent", message: error.message });
        }
      }
      if (req.method === "POST" && url.pathname === "/api/attention/preview") {
        const body = await readJson(req);
        const items = projectAttention(body, { resolvedIds: Array.isArray(body.resolvedIds) ? body.resolvedIds : [] });
        return json(res, 200, { items });
      }
      if (req.method === "POST" && url.pathname === "/api/scheduler/preview") {
        const body = await readJson(req);
        try {
          const scheduler = new FairTurnScheduler({ maxConcurrent: body.maxConcurrent ?? 16 });
          if (!Array.isArray(body.turns)) return json(res, 400, { error: "turns must be an array" });
          for (const turn of body.turns) scheduler.enqueue(turn);
          const dispatched = scheduler.dispatch(body.dispatchLimit ?? scheduler.maxConcurrent);
          return json(res, 200, { dispatched, snapshot: scheduler.snapshot() });
        } catch (error) {
          return json(res, 400, { error: "invalid_schedule_preview", message: error.message });
        }
      }

      const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (req.method === "GET" && sessionMatch) {
        const session = store.getSession(decodeURIComponent(sessionMatch[1]));
        return session ? json(res, 200, session) : json(res, 404, { error: "session_not_found" });
      }
      if (req.method === "POST" && url.pathname === "/api/sessions") {
        const body = await readJson(req);
        if (!body.machineId || !body.cwd || !body.agent || !body.prompt?.trim()) return json(res, 400, { error: "machineId, cwd, agent and prompt are required" });
        const machine = store.getMachine(body.machineId);
        if (!machine || machine.status !== "online") return json(res, 409, { error: "machine_not_online" });
        if (!machine.capabilities.some((c) => c.name === body.agent)) return json(res, 400, { error: "agent_not_available" });
        const now = new Date().toISOString();
        const session = {
          id: crypto.randomUUID(), machineId: body.machineId, cwd: body.cwd, agent: body.agent,
          model: body.model || undefined, status: "queued", createdAt: now, updatedAt: now,
          messages: [{ id: crypto.randomUUID(), role: "user", text: body.prompt.trim(), createdAt: now }], events: []
        };
        await store.createSession(session); broadcast({ type: "session.updated", session });
        try {
          sendCommand(body.machineId, { type: "server.command", commandId: crypto.randomUUID(), sessionId: session.id, action: "session.start", payload: { cwd: body.cwd, agent: body.agent, model: body.model || undefined, prompt: body.prompt.trim() } });
        } catch (error) {
          const failed = await store.setSessionStatus(session.id, "failed"); broadcast({ type: "session.updated", session: failed }); return json(res, 409, { error: error.message, session: failed });
        }
        return json(res, 201, session);
      }
      const messageMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
      if (req.method === "POST" && messageMatch) {
        const session = store.getSession(decodeURIComponent(messageMatch[1]));
        if (!session) return json(res, 404, { error: "session_not_found" });
        const body = await readJson(req); const text = body.text?.trim();
        if (!text) return json(res, 400, { error: "text is required" });
        const updated = await store.addMessage(session.id, { id: crypto.randomUUID(), role: "user", text, createdAt: new Date().toISOString() }); broadcast({ type: "session.updated", session: updated });
        try { sendCommand(session.machineId, { type: "server.command", commandId: crypto.randomUUID(), sessionId: session.id, action: "session.message", payload: { prompt: text } }); }
        catch (error) { return json(res, 409, { error: error.message }); }
        return json(res, 202, updated);
      }
      const interruptMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/interrupt$/);
      if (req.method === "POST" && interruptMatch) {
        const session = store.getSession(decodeURIComponent(interruptMatch[1])); if (!session) return json(res, 404, { error: "session_not_found" });
        try { sendCommand(session.machineId, { type: "server.command", commandId: crypto.randomUUID(), sessionId: session.id, action: "session.interrupt" }); }
        catch (error) { return json(res, 409, { error: error.message }); }
        return json(res, 202, { ok: true });
      }
      if (req.method === "GET" && !url.pathname.startsWith("/api/")) return serveStatic(url.pathname, res);
      return json(res, 404, { error: "not_found" });
    } catch (error) {
      console.error("[api] request error", error); return json(res, 500, { error: "internal_error", message: error.message });
    }
  });

  server.on("upgrade", (req, socket) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname !== "/ws" || url.searchParams.get("token") !== token) return socket.destroy();
    const role = url.searchParams.get("role");
    if (role !== "daemon" && role !== "client") return socket.destroy();
    const peer = acceptWebSocket(req, socket); if (!peer) return;
    if (role === "client") {
      clientSockets.add(peer);
      peer.send(encodeMessage({
        type: "state.snapshot",
        machines: store.listMachines(),
        sessions: store.listSessions(),
        organizations: store.listOrganizations()
      }));
      peer.on("close", () => clientSockets.delete(peer)); return;
    }
    let machineId;
    peer.on("message", async (raw) => {
      try {
        const msg = decodeMessage(raw);
        if (msg.type === "daemon.hello") {
          if (msg.protocolVersion !== PROTOCOL_VERSION) return peer.close(1002, "protocol_version_mismatch");
          machineId = msg.machine.id;
          const machine = { ...msg.machine, status: "online", lastSeenAt: new Date().toISOString() };
          daemonSockets.set(machineId, peer); await store.upsertMachine(machine); broadcast({ type: "machine.updated", machine }); return;
        }
        if (msg.type === "daemon.heartbeat") { const machine = await store.touchMachine(msg.machineId); if (machine) broadcast({ type: "machine.updated", machine }); return; }
        if (msg.type === "daemon.session.event") { const session = await store.addEvent(msg.sessionId, msg.event); broadcast({ type: "session.updated", session }); return; }
      } catch (error) { console.warn("[api] invalid daemon message", error.message); }
    });
    peer.on("close", async () => {
      if (!machineId) return; if (daemonSockets.get(machineId) === peer) daemonSockets.delete(machineId);
      const machine = await store.markMachineOffline(machineId); if (machine) broadcast({ type: "machine.updated", machine });
    });
    peer.on("error", (error) => console.warn("[api] websocket peer error", error.message));
  });

  return {
    server, store,
    listen: () => new Promise((resolve) => server.listen(port, host, resolve)),
    close: () => new Promise((resolve) => {
      for (const peer of daemonSockets.values()) peer.close(1001, "server_shutdown");
      for (const peer of clientSockets) peer.close(1001, "server_shutdown");
      server.close(resolve);
    })
  };
}

async function serveStatic(urlPath, res) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
  const safe = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
  const file = path.join(webRoot, safe);
  try {
    const body = await readFile(file); const ext = path.extname(file);
    res.statusCode = 200; res.setHeader("content-type", mime(ext)); res.end(body);
  } catch { if (rel !== "index.html") return serveStatic("/index.html", res); json(res, 404, { error: "not_found" }); }
}
function mime(ext) { return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" }[ext] ?? "application/octet-stream"); }
function addCors(res) { res.setHeader("access-control-allow-origin", "*"); res.setHeader("access-control-allow-headers", "content-type"); res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS"); }
function json(res, status, body) { res.statusCode = status; res.setHeader("content-type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); }
function end(res, status) { res.statusCode = status; res.end(); }
async function readJson(req) { let raw = ""; for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw new Error("request too large"); } return raw ? JSON.parse(raw) : {}; }

if (import.meta.url === `file://${process.argv[1]}`) {
  const cp = await createControlPlane(); await cp.listen(); console.log(`[api] listening on http://${host}:${port}`);
  const shutdown = async () => { await cp.close(); process.exit(0); }; process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
}
