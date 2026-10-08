import crypto from "node:crypto";
import { createControlPlane } from "./index.js";
import { ProjectDesk } from "./project-desk.js";
import { handleProjectDeskRequest } from "./project-desk-routes.js";
import { WorkMemoryService } from "./work-memory-service.js";
import { handleWorkMemoryRequest } from "./work-memory-routes.js";

const host = process.env.AGENT_WORK_OS_HOST ?? "127.0.0.1";
const port = Number(process.env.AGENT_WORK_OS_PORT ?? 8787);
const token = process.env.AGENT_WORK_OS_TOKEN ?? "dev-token";

export async function createIntegratedControlPlane() {
  const controlPlane = await createControlPlane();
  const requestListeners = controlPlane.server.listeners("request");
  if (requestListeners.length !== 1) {
    throw new Error(`expected exactly one legacy request listener, found ${requestListeners.length}`);
  }

  const legacyRequestHandler = requestListeners[0];
  controlPlane.server.removeListener("request", legacyRequestHandler);

  const desk = new ProjectDesk(controlPlane.store);
  const workMemory = new WorkMemoryService(controlPlane.store);
  const authorize = (req) => controlTokenMatches(req.headers.authorization, token);

  controlPlane.server.on("request", async (req, res) => {
    if (req.method === "OPTIONS") return legacyRequestHandler(req, res);
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    try {
      addCors(res);
      if (await handleProjectDeskRequest(req, res, url, { desk, json, readJson, authorize })) return;
      if (handleWorkMemoryRequest(req, res, url, { service: workMemory, json, authorize })) return;
      return legacyRequestHandler(req, res);
    } catch (error) {
      console.error("[integrated-api] request error", error);
      if (!res.headersSent) return json(res, 500, { error: "internal_error", message: error.message });
      if (!res.writableEnded) res.end();
    }
  });

  return { ...controlPlane, desk, workMemory };
}

function addCors(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type,authorization,idempotency-key");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function bearerToken(value) {
  const match = /^Bearer\s+(.+)$/i.exec(String(value ?? ""));
  return match?.[1];
}

function controlTokenMatches(value, expected) {
  const supplied = bearerToken(value);
  if (!supplied) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(String(expected));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error("request too large");
  }
  return raw ? JSON.parse(raw) : {};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cp = await createIntegratedControlPlane();
  await cp.listen();
  console.log(`[integrated-api] listening on http://${host}:${port}`);
  const shutdown = async () => { await cp.close(); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
