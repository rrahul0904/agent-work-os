import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sessionHandler from "./api/session.js";
import briefHandler from "./api/brief.js";
import healthHandler from "./api/health.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const MAX_BODY = 1_500_000;

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".ico", "image/x-icon"]
]);

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("Request body too large"), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

function adapter(res) {
  return {
    status(code) { res.statusCode = code; return this; },
    setHeader(name, value) { res.setHeader(name, value); return this; },
    send(body) { if (!res.writableEnded) res.end(body); return this; }
  };
}

function applyHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), payment=()");
}

async function serveStatic(pathname, res) {
  const clean = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(clean);
  const absolute = path.resolve(root, `.${decoded}`);
  if (!absolute.startsWith(`${root}${path.sep}`)) return false;
  if (absolute.includes(`${path.sep}api${path.sep}`) || absolute.includes(`${path.sep}lib${path.sep}`) || absolute.includes(`${path.sep}test${path.sep}`)) return false;
  try {
    const stat = await fs.stat(absolute);
    if (!stat.isFile()) return false;
    const ext = path.extname(absolute).toLowerCase();
    res.statusCode = 200;
    res.setHeader("Content-Type", contentTypes.get(ext) || "application/octet-stream");
    if ([".html", ".css", ".js"].includes(ext)) res.setHeader("Cache-Control", "public, max-age=60");
    res.end(await fs.readFile(absolute));
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  applyHeaders(res);
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;
    if (pathname.startsWith("/api/")) {
      req.body = ["POST", "PUT", "PATCH"].includes(req.method || "") ? await readBody(req) : {};
      const mapped = adapter(res);
      if (pathname === "/api/session") return await sessionHandler(req, mapped);
      if (pathname === "/api/brief") return await briefHandler(req, mapped);
      if (pathname === "/api/health") return await healthHandler(req, mapped);
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ error: "Not found" }));
    }
    if (await serveStatic(pathname, res)) return;
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
  } catch (error) {
    res.statusCode = error.statusCode || 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: error.message || "Request failed" }));
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ service: "context-continuity", status: "listening", port }));
});
