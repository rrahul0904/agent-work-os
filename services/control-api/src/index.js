import crypto from "node:crypto";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROTOCOL_VERSION, decodeMessage, encodeMessage } from "../../../packages/protocol/src/index.js";
import { acceptWebSocket } from "../../../packages/protocol/src/websocket.js";
import { RoomStore } from "./rooms.js";
import { JsonStore } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "../../../apps/web/public");
const host = process.env.AGENT_WORK_OS_HOST ?? "127.0.0.1";
const port = Number(process.env.AGENT_WORK_OS_PORT ?? 8787);
const token = process.env.AGENT_WORK_OS_TOKEN ?? "dev-token";
const statePath = path.resolve(process.env.AGENT_WORK_OS_STATE_PATH ?? ".data/state.json");
const roomsPath = path.resolve(process.env.AGENT_WORK_OS_ROOMS_PATH ?? ".data/rooms.json");

export async function createControlPlane() {
  const store = new JsonStore(statePath);
  const rooms = new RoomStore(roomsPath);
  await Promise.all([store.load(), rooms.load()]);
  const daemonSockets = new Map();
  const clientSockets = new Set();
  const pendingCommands = new Map();

  const broadcast = (event) => {
    const encoded = encodeMessage(event);
    for (const peer of clientSockets) peer.send(encoded);
  };
  const broadcastRoom = (roomId) => {
    const room = rooms.publicRoom(roomId);
    if (room) broadcast({ type: "room.updated", room });
  };
  const sendCommand = (machineId, command) => {
    const peer = daemonSockets.get(machineId);
    if (!peer || peer.closed) throw new Error(`Machine ${machineId} is not connected`);
    peer.send(encodeMessage(command));
    pendingCommands.set(command.commandId, { machineId, sessionId: command.sessionId, action: command.action });
  };

  const startRoomSession = async ({ roomId, roomAgent, prompt, context }) => {
    const machine = store.getMachine(roomAgent.machineId);
    if (!machine || machine.status !== "online") throw new Error("machine_not_online");
    if (!machine.capabilities.some((capability) => capability.name === roomAgent.agent)) throw new Error("agent_not_available");
    const now = new Date().toISOString();
    const session = {
      id: crypto.randomUUID(), machineId: roomAgent.machineId, cwd: roomAgent.cwd, agent: roomAgent.agent,
      model: roomAgent.model || undefined, brainMode: "proof-only", status: "queued", createdAt: now, updatedAt: now,
      context: { kind: "shared-room", roomId, roomAgentId: roomAgent.id, collaborationDepth: 0, ...context },
      messages: [{ id: crypto.randomUUID(), role: "user", text: prompt, createdAt: now }], events: []
    };
    await store.createSession(session);
    broadcast({ type: "session.updated", session });
    try {
      sendCommand(roomAgent.machineId, {
        type: "server.command", commandId: crypto.randomUUID(), sessionId: session.id, action: "session.start",
        payload: { cwd: roomAgent.cwd, agent: roomAgent.agent, model: roomAgent.model || undefined, prompt, brainMode: "proof-only" }
      });
    } catch (error) {
      const failed = await store.setSessionStatus(session.id, "failed");
      broadcast({ type: "session.updated", session: failed });
      throw error;
    }
    return session;
  };

  const server = http.createServer(async (req, res) => {
    try {
      addCors(res);
      if (req.method === "OPTIONS") return end(res, 204);
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, protocolVersion: PROTOCOL_VERSION });
      if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, { machines: store.listMachines(), sessions: store.listSessions(), rooms: rooms.listRooms() });

      if (req.method === "GET" && url.pathname === "/api/rooms") return json(res, 200, { rooms: rooms.listRooms() });
      if (req.method === "POST" && url.pathname === "/api/rooms") {
        const body = await readJson(req);
        try {
          const room = await rooms.createRoom(body.name);
          broadcast({ type: "room.updated", room });
          return json(res, 201, room);
        } catch (error) {
          return json(res, 400, { error: error.message });
        }
      }
      const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)$/);
      if (req.method === "GET" && roomMatch) {
        const room = rooms.publicRoom(decodeURIComponent(roomMatch[1]));
        return room ? json(res, 200, room) : json(res, 404, { error: "room_not_found" });
      }
      const roomAgentMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/agents$/);
      if (req.method === "POST" && roomAgentMatch) {
        const roomId = decodeURIComponent(roomAgentMatch[1]);
        const body = await readJson(req);
        const machine = store.getMachine(body.machineId);
        if (!machine || machine.status !== "online") return json(res, 409, { error: "machine_not_online" });
        if (!machine.capabilities.some((capability) => capability.name === body.agent)) return json(res, 400, { error: "agent_not_available" });
        try {
          const agent = await rooms.addAgent(roomId, body);
          broadcastRoom(roomId);
          return json(res, 201, agent);
        } catch (error) {
          const status = error.message === "room_not_found" ? 404 : 400;
          return json(res, status, { error: error.message });
        }
      }
      const roomMessageMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/messages$/);
      if (req.method === "POST" && roomMessageMatch) {
        const roomId = decodeURIComponent(roomMessageMatch[1]);
        const body = await readJson(req);
        const text = body.text?.trim();
        if (!text) return json(res, 400, { error: "text is required" });
        const room = rooms.getRoom(roomId);
        if (!room) return json(res, 404, { error: "room_not_found" });
        const roomAgent = rooms.routeAgent(roomId, text);
        if (!roomAgent) return json(res, 409, { error: "room_has_no_agents" });
        const prompt = rooms.buildPrompt(roomId, roomAgent.id, text);
        const message = await rooms.addMessage(roomId, { role: "human", authorName: body.authorName || "You", text });
        broadcastRoom(roomId);
        try {
          const session = await startRoomSession({ roomId, roomAgent, prompt, context: { roomMessageId: message.id } });
          return json(res, 202, { message, sessionId: session.id, routedTo: { id: roomAgent.id, handle: roomAgent.handle, name: roomAgent.name } });
        } catch (error) {
          await rooms.addMessage(roomId, { role: "system", authorName: "Agent Work OS", text: `Could not start @${roomAgent.handle}: ${error.message}` });
          broadcastRoom(roomId);
          return json(res, 409, { error: error.message });
        }
      }
      const routineCreateMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/routines$/);
      if (req.method === "POST" && routineCreateMatch) {
        const roomId = decodeURIComponent(routineCreateMatch[1]);
        const body = await readJson(req);
        if (body.trigger && body.trigger !== "webhook") return json(res, 400, { error: "only_webhook_trigger_is_implemented" });
        try {
          const created = await rooms.createWebhookRoutine(roomId, body);
          broadcastRoom(roomId);
          return json(res, 201, created);
        } catch (error) {
          const status = error.message === "room_not_found" ? 404 : 400;
          return json(res, status, { error: error.message });
        }
      }
      const hookMatch = url.pathname.match(/^\/api\/hooks\/routines\/([^/]+)$/);
      if (req.method === "POST" && hookMatch) {
        const routineId = decodeURIComponent(hookMatch[1]);
        const routine = rooms.getRoutine(routineId);
        if (!routine) return json(res, 404, { error: "routine_not_found" });
        const secret = bearerToken(req.headers.authorization);
        if (!rooms.verifyWebhookSecret(routineId, secret)) return json(res, 401, { error: "invalid_routine_secret" });
        const payload = await readJson(req);
        const idempotencyKey = req.headers["idempotency-key"];
        const begun = await rooms.beginRoutineRun(routineId, { idempotencyKey, payload });
        if (begun.duplicate) return json(res, 200, { duplicate: true, run: begun.run });
        if (begun.busy) return json(res, 409, { error: "routine_already_running", run: begun.run });
        const room = rooms.getRoom(routine.roomId);
        const roomAgent = room?.agents.find((agent) => agent.id === routine.agentId);
        if (!roomAgent) {
          const run = await rooms.updateRoutineRun(begun.run.id, { status: "failed", error: "room_agent_not_found" });
          broadcastRoom(routine.roomId);
          return json(res, 409, { error: "room_agent_not_found", run });
        }
        const prompt = rooms.buildPrompt(routine.roomId, roomAgent.id, "", { routine, webhookPayload: payload });
        await rooms.addMessage(routine.roomId, { role: "system", authorName: routine.name, text: `Webhook routine triggered for @${roomAgent.handle}.`, routineRunId: begun.run.id });
        broadcastRoom(routine.roomId);
        try {
          const session = await startRoomSession({ roomId: routine.roomId, roomAgent, prompt, context: { routineRunId: begun.run.id } });
          const run = await rooms.updateRoutineRun(begun.run.id, { status: "running", sessionId: session.id });
          broadcastRoom(routine.roomId);
          return json(res, 202, { duplicate: false, run });
        } catch (error) {
          const run = await rooms.updateRoutineRun(begun.run.id, { status: "failed", error: error.message });
          broadcastRoom(routine.roomId);
          return json(res, 409, { error: error.message, run });
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
        if (body.handoffId !== undefined && (typeof body.handoffId !== "string" || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(body.handoffId))) return json(res, 400, { error: "invalid_handoff_id" });
        const brainMode = body.brainMode ?? "proof-only";
        if (!["proof-only", "verified-context"].includes(brainMode)) return json(res, 400, { error: "invalid_brain_mode" });
        if (brainMode === "verified-context" && !body.handoffId) return json(res, 400, { error: "verified_context_requires_handoff" });
        const machine = store.getMachine(body.machineId);
        if (!machine || machine.status !== "online") return json(res, 409, { error: "machine_not_online" });
        if (!machine.capabilities.some((c) => c.name === body.agent)) return json(res, 400, { error: "agent_not_available" });
        const now = new Date().toISOString();
        const session = {
          id: crypto.randomUUID(), machineId: body.machineId, cwd: body.cwd, agent: body.agent, handoffId: body.handoffId, brainMode,
          model: body.model || undefined, status: "queued", createdAt: now, updatedAt: now,
          messages: [{ id: crypto.randomUUID(), role: "user", text: body.prompt.trim(), createdAt: now }], events: []
        };
        await store.createSession(session); broadcast({ type: "session.updated", session });
        try {
          sendCommand(body.machineId, { type: "server.command", commandId: crypto.randomUUID(), sessionId: session.id, action: "session.start", payload: { cwd: body.cwd, agent: body.agent, model: body.model || undefined, prompt: body.prompt.trim(), handoffId: body.handoffId, brainMode } });
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
      clientSockets.add(peer); peer.send(encodeMessage({ type: "state.snapshot", machines: store.listMachines(), sessions: store.listSessions(), rooms: rooms.listRooms() })); peer.on("close", () => clientSockets.delete(peer)); return;
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
        if (msg.type === "daemon.command.ack") {
          const pending = pendingCommands.get(msg.commandId);
          if (!pending || pending.machineId !== machineId) return;
          pendingCommands.delete(msg.commandId);
          if (!msg.ok) {
            let session = await store.addEvent(pending.sessionId, { kind: "error", message: String(msg.error ?? "daemon rejected command"), at: new Date().toISOString() });
            if (pending.action === "session.start") session = await store.addEvent(pending.sessionId, { kind: "status", status: "failed", at: new Date().toISOString() });
            broadcast({ type: "session.updated", session });
            await syncRoomFromEvent(session, { kind: "status", status: "failed", at: new Date().toISOString() });
          }
          return;
        }
        if (msg.type === "daemon.heartbeat") { const machine = await store.touchMachine(msg.machineId); if (machine) broadcast({ type: "machine.updated", machine }); return; }
        if (msg.type === "daemon.session.event") {
          const session = await store.addEvent(msg.sessionId, msg.event);
          broadcast({ type: "session.updated", session });
          await syncRoomFromEvent(session, msg.event);
          return;
        }
      } catch (error) { console.warn("[api] invalid daemon message", error.message); }
    });
    peer.on("close", async () => {
      if (!machineId) return; if (daemonSockets.get(machineId) === peer) daemonSockets.delete(machineId);
      const machine = await store.markMachineOffline(machineId); if (machine) broadcast({ type: "machine.updated", machine });
    });
    peer.on("error", (error) => console.warn("[api] websocket peer error", error.message));
  });

  async function syncRoomFromEvent(session, event) {
    const context = session?.context;
    if (context?.kind !== "shared-room" || !context.roomId) return;
    const room = rooms.getRoom(context.roomId);
    const roomAgent = room?.agents.find((agent) => agent.id === context.roomAgentId);
    if (!room || !roomAgent) return;
    if (event.kind === "text" && event.text?.trim()) {
      await rooms.addMessage(context.roomId, {
        role: "agent", authorId: roomAgent.id, authorName: roomAgent.handle,
        text: event.text, sessionId: session.id, routineRunId: context.routineRunId, createdAt: event.at
      });
      const depth = Number(context.collaborationDepth ?? 0);
      if (depth < 2) {
        const collaborator = rooms.mentionedAgent(context.roomId, event.text, { excludeAgentId: roomAgent.id });
        if (collaborator) {
          const prompt = rooms.buildPrompt(context.roomId, collaborator.id, event.text, { collaboration: { fromHandle: roomAgent.handle } });
          try {
            const collaborationSession = await startRoomSession({
              roomId: context.roomId, roomAgent: collaborator, prompt,
              context: { collaborationDepth: depth + 1, collaborationFromAgentId: roomAgent.id, collaborationRootSessionId: context.collaborationRootSessionId || session.id }
            });
            await rooms.addMessage(context.roomId, {
              role: "system", authorName: "Agent Work OS",
              text: `Routed collaboration from @${roomAgent.handle} to @${collaborator.handle}.`,
              sessionId: collaborationSession.id, createdAt: new Date().toISOString()
            });
          } catch (error) {
            await rooms.addMessage(context.roomId, {
              role: "system", authorName: "Agent Work OS",
              text: `Could not route collaboration to @${collaborator.handle}: ${error.message}`,
              createdAt: new Date().toISOString()
            });
          }
        }
      }
    }
    if (context.routineRunId && event.kind === "status" && ["completed", "failed", "interrupted"].includes(event.status)) {
      await rooms.updateRoutineRun(context.routineRunId, { status: event.status, sessionId: session.id });
    }
    broadcastRoom(context.roomId);
  }

  return {
    server, store, rooms,
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
function addCors(res) { res.setHeader("access-control-allow-origin", "*"); res.setHeader("access-control-allow-headers", "content-type,authorization,idempotency-key"); res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS"); }
function json(res, status, body) { res.statusCode = status; res.setHeader("content-type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); }
function end(res, status) { res.statusCode = status; res.end(); }
function bearerToken(value) { const match = /^Bearer\s+(.+)$/i.exec(String(value ?? "")); return match?.[1]; }
async function readJson(req) { let raw = ""; for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw new Error("request too large"); } return raw ? JSON.parse(raw) : {}; }

if (import.meta.url === `file://${process.argv[1]}`) {
  const cp = await createControlPlane(); await cp.listen(); console.log(`[api] listening on http://${host}:${port}`);
  const shutdown = async () => { await cp.close(); process.exit(0); }; process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
}
