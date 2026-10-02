import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentStudioStore } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "../../../apps/studio/public");

export async function createStudioService(options = {}) {
  const host = options.host ?? process.env.AGENT_STUDIO_HOST ?? "127.0.0.1";
  const port = Number(options.port ?? process.env.AGENT_STUDIO_PORT ?? 8790);
  const controlPlaneUrl = String(options.controlPlaneUrl ?? process.env.AGENT_STUDIO_CONTROL_PLANE_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
  const storePath = path.resolve(options.storePath ?? process.env.AGENT_STUDIO_STATE_PATH ?? ".data/studio.json");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const studio = new AgentStudioStore(storePath);
  await studio.load();

  const getRuntimeState = async () => requestJson(fetchImpl, `${controlPlaneUrl}/api/state`);
  const reconcileReceipts = async () => {
    const candidates = studio.snapshot().receipts.filter((receipt) => receipt.sessionId && ["launched", "queued", "running"].includes(receipt.status)).slice(0, 20);
    for (const receipt of candidates) {
      try {
        const session = await requestJson(fetchImpl, `${controlPlaneUrl}/api/sessions/${encodeURIComponent(receipt.sessionId)}`);
        const status = session.status || "running";
        if (status !== receipt.status) await studio.updateReceipt(receipt.id, { status, observedAt: new Date().toISOString() });
      } catch (error) {
        if (error.status === 404) await studio.updateReceipt(receipt.id, { status: "session_missing", error: "control_plane_session_missing" });
      }
    }
  };

  const server = http.createServer(async (req, res) => {
    try {
      addSecurityHeaders(res);
      if (req.method === "OPTIONS") return end(res, 204);
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      if (req.method === "GET" && url.pathname === "/health") {
        let controlPlane = "unreachable";
        try { await getRuntimeState(); controlPlane = "reachable"; } catch {}
        return json(res, 200, { ok: true, service: "agent-studio", controlPlane });
      }

      if (req.method === "GET" && url.pathname === "/api/studio/state") {
        await reconcileReceipts();
        let runtime = { machines: [], sessions: [], reachable: false };
        try {
          const state = await getRuntimeState();
          runtime = { machines: state.machines ?? [], sessions: state.sessions ?? [], reachable: true };
        } catch (error) {
          runtime = { machines: [], sessions: [], reachable: false, error: safeError(error) };
        }
        return json(res, 200, { ...studio.snapshot(), runtime });
      }

      if (req.method === "POST" && url.pathname === "/api/studio/skills") {
        return json(res, 201, await studio.createSkill(await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/api/studio/contexts") {
        return json(res, 201, await studio.createContext(await readJson(req)));
      }
      if (req.method === "POST" && url.pathname === "/api/studio/agents") {
        return json(res, 201, await studio.createAgent(await readJson(req)));
      }

      const draftMatch = url.pathname.match(/^\/api\/studio\/agents\/([^/]+)\/draft$/);
      if (req.method === "POST" && draftMatch) {
        return json(res, 200, await studio.updateDraft(decodeURIComponent(draftMatch[1]), await readJson(req)));
      }
      const publishMatch = url.pathname.match(/^\/api\/studio\/agents\/([^/]+)\/publish$/);
      if (req.method === "POST" && publishMatch) {
        return json(res, 201, await studio.publish(decodeURIComponent(publishMatch[1])));
      }
      const preflightMatch = url.pathname.match(/^\/api\/studio\/agents\/([^/]+)\/preflight$/);
      if (req.method === "POST" && preflightMatch) {
        const body = await readJson(req);
        const runtimeState = await getRuntimeState();
        const preflight = studio.preflight(decodeURIComponent(preflightMatch[1]), body, runtimeState);
        return json(res, preflight.ready ? 200 : 409, preflight);
      }
      const runMatch = url.pathname.match(/^\/api\/studio\/agents\/([^/]+)\/run$/);
      if (req.method === "POST" && runMatch) {
        const agentId = decodeURIComponent(runMatch[1]);
        const body = await readJson(req);
        let runtimeState;
        try {
          runtimeState = await getRuntimeState();
        } catch (error) {
          return json(res, 503, { error: "control_plane_unreachable", message: safeError(error) });
        }
        const preflight = studio.preflight(agentId, body, runtimeState);
        if (!preflight.ready) {
          const receipt = await studio.createReceipt({ agentId, versionId: preflight.versionId, specHash: preflight.specHash, status: "refused", preflight, error: preflight.reasons.join(",") });
          return json(res, 409, { error: "preflight_refused", preflight, receipt });
        }

        let prompt;
        try { prompt = studio.compilePrompt(agentId, preflight.versionId, body.prompt); }
        catch (error) {
          const receipt = await studio.createReceipt({ agentId, versionId: preflight.versionId, specHash: preflight.specHash, status: "refused", preflight, error: error.message });
          return json(res, 400, { error: error.message, receipt });
        }

        const spec = studio.getVersion(preflight.versionId).spec;
        const launchBody = {
          machineId: spec.machineId,
          cwd: spec.cwd,
          agent: spec.agent,
          model: spec.model || undefined,
          brainMode: spec.brainMode,
          handoffId: body.handoffId || undefined,
          prompt
        };
        try {
          const session = await requestJson(fetchImpl, `${controlPlaneUrl}/api/sessions`, { method: "POST", body: launchBody });
          const receipt = await studio.createReceipt({ agentId, versionId: preflight.versionId, specHash: preflight.specHash, status: session.status || "launched", preflight, sessionId: session.id });
          return json(res, 202, { session, receipt, preflight });
        } catch (error) {
          const receipt = await studio.createReceipt({ agentId, versionId: preflight.versionId, specHash: preflight.specHash, status: "downstream_refused", preflight, error: safeError(error) });
          return json(res, error.status && error.status < 500 ? 409 : 502, { error: "control_plane_launch_failed", message: safeError(error), receipt });
        }
      }

      if (req.method === "GET" && !url.pathname.startsWith("/api/")) return serveStatic(url.pathname, res);
      return json(res, 404, { error: "not_found" });
    } catch (error) {
      const status = error.message?.includes("not_found") ? 404 : 400;
      return json(res, status, { error: error.message || "request_failed" });
    }
  });

  return {
    server,
    studio,
    controlPlaneUrl,
    listen: () => new Promise((resolve) => server.listen(port, host, resolve)),
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function requestJson(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, {
    method: options.method ?? "GET",
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!response.ok) {
    const error = new Error(body.error || body.message || `request_failed_${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function serveStatic(urlPath, res) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
  const safe = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
  const file = path.join(webRoot, safe);
  try {
    const body = await readFile(file);
    res.statusCode = 200;
    res.setHeader("content-type", mime(path.extname(file)));
    res.end(body);
  } catch {
    if (rel !== "index.html") return serveStatic("/index.html", res);
    return json(res, 404, { error: "not_found" });
  }
}

function addSecurityHeaders(res) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'");
  res.setHeader("access-control-allow-origin", "http://127.0.0.1:8790");
  res.setHeader("access-control-allow-headers", "content-type");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
}
function mime(ext) { return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" }[ext] ?? "application/octet-stream"); }
function json(res, status, body) { res.statusCode = status; res.setHeader("content-type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); }
function end(res, status) { res.statusCode = status; res.end(); }
function safeError(error) { return String(error?.body?.error || error?.message || "request_failed").slice(0, 300); }
async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error("request_too_large");
  }
  return raw ? JSON.parse(raw) : {};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const service = await createStudioService();
  await service.listen();
  console.log(`[studio] listening on http://${process.env.AGENT_STUDIO_HOST ?? "127.0.0.1"}:${process.env.AGENT_STUDIO_PORT ?? 8790}`);
  const shutdown = async () => { await service.close(); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
