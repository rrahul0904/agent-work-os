import crypto from "node:crypto";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROTOCOL_VERSION, decodeMessage, encodeMessage } from "../../../packages/protocol/src/index.js";
import { acceptWebSocket } from "../../../packages/protocol/src/websocket.js";
import { digestShippingContract, validateShippingContract } from "./shipping-contract.js";
import { buildProductSummary, listReceipts, loadPortfolio, rankPortfolio } from "./product-state.js";
import { JsonStore } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");
const webRoot = path.join(projectRoot, "apps/web/public");
const host = process.env.AGENT_WORK_OS_HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? process.env.AGENT_WORK_OS_PORT ?? 8787);
const token = process.env.AGENT_WORK_OS_TOKEN ?? "dev-token";
const statePath = path.resolve(process.env.AGENT_WORK_OS_STATE_PATH ?? ".data/state.json");
const portfolioPath = path.resolve(process.env.AGENT_WORK_OS_PORTFOLIO_PATH ?? path.join(projectRoot, "config/portfolio.json"));
const receiptsRoot = path.resolve(process.env.AGENT_WORK_OS_RECEIPTS_ROOT ?? path.join(projectRoot, "receipts"));
const exampleContractPath = path.join(projectRoot, "contracts/shipping-os-selftest.example.json");

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
      if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, product: "shipping-os", protocolVersion: PROTOCOL_VERSION });
      if (url.pathname.startsWith("/api/") && !isAuthorized(req)) return json(res, 401, { error: "unauthorized" });

      if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, { machines: store.listMachines(), sessions: store.listSessions(), shippingRuns: store.listShippingRuns() });
      if (req.method === "GET" && url.pathname === "/api/product") {
        const [portfolio, committedReceipts] = await Promise.all([loadPortfolio(portfolioPath), listReceipts(receiptsRoot)]);
        const runReceipts = store.listShippingRuns().filter((run) => run.releaseReceipt).map((run) => ({ ...run.releaseReceipt, runId: run.runId, projectId: run.projectId, releaseVersion: run.releaseVersion, path: null, source: "runtime" }));
        return json(res, 200, buildProductSummary({ portfolio, runs: store.listShippingRuns(), receipts: [...committedReceipts, ...runReceipts], machines: store.listMachines(), sessions: store.listSessions() }));
      }
      if (req.method === "GET" && url.pathname === "/api/portfolio") return json(res, 200, { projects: rankPortfolio(await loadPortfolio(portfolioPath)) });
      if (req.method === "GET" && url.pathname === "/api/receipts") return json(res, 200, { receipts: await listReceipts(receiptsRoot) });
      if (req.method === "GET" && url.pathname === "/api/shipping/example") return json(res, 200, JSON.parse(await readFile(exampleContractPath, "utf8")));
      if (req.method === "GET" && url.pathname === "/api/shipping/runs") return json(res, 200, { runs: store.listShippingRuns() });
      const shippingRunMatch = url.pathname.match(/^\/api\/shipping\/runs\/([^/]+)$/);
      if (req.method === "GET" && shippingRunMatch) {
        const run = store.getShippingRun(decodeURIComponent(shippingRunMatch[1]));
        return run ? json(res, 200, run) : json(res, 404, { error: "shipping_run_not_found" });
      }
      if (req.method === "POST" && url.pathname === "/api/shipping/contracts/validate") {
        const body = await readJson(req);
        const result = validateShippingContract(body.contract ?? body);
        return json(res, result.valid ? 200 : 400, result);
      }
      if (req.method === "POST" && url.pathname === "/api/shipping/runs") {
        const body = await readJson(req);
        const machine = store.getMachine(body.machineId);
        if (!machine || machine.status !== "online") return json(res, 409, { error: "machine_not_online" });
        if (!machine.shipping?.enabled) return json(res, 409, { error: "shipping_not_enabled_on_machine" });
        const validation = validateShippingContract(body.contract);
        if (!validation.valid) return json(res, 400, { error: "shipping_contract_invalid", details: validation.errors });
        const runId = body.runId?.trim() || `ship-${crypto.randomUUID()}`;
        if (store.getShippingRun(runId)) return json(res, 409, { error: "shipping_run_exists" });
        const now = new Date().toISOString();
        let queued = {
          version: "shipping-run-remote/v1",
          runId,
          machineId: machine.id,
          projectId: body.contract.project.id,
          releaseVersion: body.contract.release.version,
          contractDigest: digestShippingContract(body.contract),
          state: "QUEUED",
          blocker: null,
          createdAt: now,
          updatedAt: now,
          testedSha: null,
          deployedSha: null,
          events: []
        };
        await store.upsertShippingRun(queued); broadcast({ type: "shipping.run.updated", run: queued });
        try {
          sendCommand(machine.id, { type: "server.command", commandId: crypto.randomUUID(), sessionId: `shipping:${runId}`, action: "shipping.start", payload: { runId, contract: body.contract } });
        } catch (error) {
          queued = { ...queued, state: "FAILED", fatalError: error.message, updatedAt: new Date().toISOString() };
          await store.upsertShippingRun(queued); broadcast({ type: "shipping.run.updated", run: queued });
          return json(res, 409, { error: error.message, run: queued });
        }
        return json(res, 202, queued);
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
        const session = { id: crypto.randomUUID(), machineId: body.machineId, cwd: body.cwd, agent: body.agent, model: body.model || undefined, status: "queued", createdAt: now, updatedAt: now, messages: [{ id: crypto.randomUUID(), role: "user", text: body.prompt.trim(), createdAt: now }], events: [] };
        await store.createSession(session); broadcast({ type: "session.updated", session });
        try { sendCommand(body.machineId, { type: "server.command", commandId: crypto.randomUUID(), sessionId: session.id, action: "session.start", payload: { cwd: body.cwd, agent: body.agent, model: body.model || undefined, prompt: body.prompt.trim() } }); }
        catch (error) { const failed = await store.setSessionStatus(session.id, "failed"); broadcast({ type: "session.updated", session: failed }); return json(res, 409, { error: error.message, session: failed }); }
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
      clientSockets.add(peer); peer.send(encodeMessage({ type: "state.snapshot", machines: store.listMachines(), sessions: store.listSessions(), shippingRuns: store.listShippingRuns() })); peer.on("close", () => clientSockets.delete(peer)); return;
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
        if (msg.type === "daemon.shipping.run") {
          const run = { ...msg.run, machineId: msg.machineId ?? msg.run.machineId };
          await store.upsertShippingRun(run); broadcast({ type: "shipping.run.updated", run }); return;
        }
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

function isAuthorized(req) {
  const raw = req.headers.authorization ?? req.headers["x-agent-work-os-token"] ?? "";
  const supplied = String(raw).startsWith("Bearer ") ? String(raw).slice(7) : String(raw);
  const a = Buffer.from(supplied); const b = Buffer.from(token);
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}
async function serveStatic(urlPath, res) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
  const safe = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
  const file = path.join(webRoot, safe);
  try { const body = await readFile(file); const ext = path.extname(file); res.statusCode = 200; res.setHeader("content-type", mime(ext)); res.end(body); }
  catch { if (rel !== "index.html") return serveStatic("/index.html", res); json(res, 404, { error: "not_found" }); }
}
function mime(ext) { return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" }[ext] ?? "application/octet-stream"); }
function addCors(res) { res.setHeader("access-control-allow-origin", "*"); res.setHeader("access-control-allow-headers", "content-type,authorization,x-agent-work-os-token"); res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS"); }
function json(res, status, body) { res.statusCode = status; res.setHeader("content-type", "application/json; charset=utf-8"); res.setHeader("cache-control", "no-store"); res.end(JSON.stringify(body)); }
function end(res, status) { res.statusCode = status; res.end(); }
async function readJson(req) { let raw = ""; for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw new Error("request too large"); } return raw ? JSON.parse(raw) : {}; }

if (import.meta.url === `file://${process.argv[1]}`) {
  const cp = await createControlPlane(); await cp.listen(); console.log(`[api] listening on http://${host}:${port}`);
  const shutdown = async () => { await cp.close(); process.exit(0); }; process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
}
