import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FederationStore } from "./federation.js";

const defaultStatePath = path.resolve(process.env.AGENT_WORK_OS_FEDERATION_PATH ?? ".data/federation.json");
const defaultHost = process.env.AGENT_WORK_OS_FEDERATION_HOST ?? "127.0.0.1";
const defaultPort = Number(process.env.AGENT_WORK_OS_FEDERATION_PORT ?? 8790);
const defaultToken = process.env.AGENT_WORK_OS_TOKEN ?? "dev-token";
const MAX_BODY_BYTES = 256_000;

export async function createFederationApi(options = {}) {
  const statePath = path.resolve(options.statePath ?? defaultStatePath);
  const host = options.host ?? defaultHost;
  const port = options.port ?? defaultPort;
  const token = options.token ?? defaultToken;
  const federation = options.store ?? new FederationStore(statePath);
  if (!options.store) await federation.load();

  const server = http.createServer(async (req, res) => {
    addCors(res);
    if (req.method === "OPTIONS") return end(res, 204);

    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      if (req.method === "GET" && url.pathname === "/health") {
        return json(res, 200, { ok: true, service: "agent-work-os-federation", contract: "federated-project/v1" });
      }

      if (req.method === "GET" && url.pathname === "/api/federation/agents") {
        return json(res, 200, { agents: federation.listPublicProfiles() });
      }
      if (req.method === "POST" && url.pathname === "/api/federation/agents") {
        requireControlToken(req, token);
        return json(res, 201, await federation.registerAgent(await readJson(req)));
      }

      const verifyAgentMatch = url.pathname.match(/^\/api\/federation\/agents\/([^/]+)\/verify$/);
      if (req.method === "POST" && verifyAgentMatch) {
        requireControlToken(req, token);
        const agentId = decodeURIComponent(verifyAgentMatch[1]);
        return json(res, 200, await federation.verifyAgent(agentId, await readJson(req)));
      }

      if (req.method === "GET" && url.pathname === "/api/federation/projects") {
        return json(res, 200, { projects: federation.listPublicProjects() });
      }
      if (req.method === "POST" && url.pathname === "/api/federation/projects") {
        requireControlToken(req, token);
        const actor = requiredActor(req);
        return json(res, 201, await federation.createProject(actor, await readJson(req)));
      }

      const projectMatch = url.pathname.match(/^\/api\/federation\/projects\/([^/]+)$/);
      if (req.method === "GET" && projectMatch) {
        const actor = optionalActor(req, token);
        const projectId = decodeURIComponent(projectMatch[1]);
        return json(res, 200, federation.getProject(projectId, actor));
      }

      const invitationCreateMatch = url.pathname.match(/^\/api\/federation\/projects\/([^/]+)\/invitations$/);
      if (req.method === "POST" && invitationCreateMatch) {
        requireControlToken(req, token);
        const actor = requiredActor(req);
        const body = await readJson(req);
        const projectId = decodeURIComponent(invitationCreateMatch[1]);
        return json(res, 201, await federation.inviteMember(projectId, actor, body.targetAgentId, body.role));
      }

      const invitationAcceptMatch = url.pathname.match(/^\/api\/federation\/invitations\/([^/]+)\/accept$/);
      if (req.method === "POST" && invitationAcceptMatch) {
        requireControlToken(req, token);
        const actor = requiredActor(req);
        const invitationId = decodeURIComponent(invitationAcceptMatch[1]);
        return json(res, 200, await federation.acceptInvitation(invitationId, actor));
      }

      const memberMatch = url.pathname.match(/^\/api\/federation\/projects\/([^/]+)\/members\/([^/]+)$/);
      if (memberMatch && req.method === "PATCH") {
        requireControlToken(req, token);
        const actor = requiredActor(req);
        const body = await readJson(req);
        return json(res, 200, await federation.changeRole(
          decodeURIComponent(memberMatch[1]), actor, decodeURIComponent(memberMatch[2]), body.role
        ));
      }
      if (memberMatch && req.method === "DELETE") {
        requireControlToken(req, token);
        const actor = requiredActor(req);
        return json(res, 200, await federation.removeMember(
          decodeURIComponent(memberMatch[1]), actor, decodeURIComponent(memberMatch[2])
        ));
      }

      const documentsMatch = url.pathname.match(/^\/api\/federation\/projects\/([^/]+)\/documents$/);
      if (req.method === "GET" && documentsMatch) {
        const actor = optionalActor(req, token);
        const projectId = decodeURIComponent(documentsMatch[1]);
        // Project privacy is the outer boundary. A document cannot widen a private project.
        federation.getProject(projectId, actor);
        return json(res, 200, { documents: federation.listDocuments(projectId, actor) });
      }

      const documentPutMatch = url.pathname.match(/^\/api\/federation\/projects\/([^/]+)\/documents\/([^/]+)$/);
      if (req.method === "PUT" && documentPutMatch) {
        requireControlToken(req, token);
        const actor = requiredActor(req);
        const body = await readJson(req);
        const projectId = decodeURIComponent(documentPutMatch[1]);
        const documentId = decodeURIComponent(documentPutMatch[2]);
        return json(res, 200, await federation.putDocument(projectId, actor, { ...body, documentId }));
      }

      const documentGetMatch = url.pathname.match(/^\/api\/federation\/documents\/([^/]+)$/);
      if (req.method === "GET" && documentGetMatch) {
        const actor = optionalActor(req, token);
        const documentId = decodeURIComponent(documentGetMatch[1]);
        const state = federation.snapshot();
        const projectId = state.documents[documentId]?.projectId;
        if (!projectId) throw new Error("document_not_found");
        // Preserve project privacy even when a document itself is marked public.
        federation.getProject(projectId, actor);
        const versionRaw = url.searchParams.get("version");
        const options = versionRaw === null ? {} : { version: Number(versionRaw) };
        return json(res, 200, federation.getDocument(documentId, actor, options));
      }

      const decisionsMatch = url.pathname.match(/^\/api\/federation\/projects\/([^/]+)\/decisions$/);
      if (req.method === "GET" && decisionsMatch) {
        const actor = optionalActor(req, token);
        const projectId = decodeURIComponent(decisionsMatch[1]);
        return json(res, 200, { decisions: federation.listDecisions(projectId, actor) });
      }
      if (req.method === "POST" && decisionsMatch) {
        requireControlToken(req, token);
        const actor = requiredActor(req);
        const projectId = decodeURIComponent(decisionsMatch[1]);
        return json(res, 201, await federation.recordDecision(projectId, actor, await readJson(req)));
      }

      return json(res, 404, { error: "not_found" });
    } catch (error) {
      const status = httpStatusFor(error?.message);
      return json(res, status, { error: error?.message ?? "internal_error" });
    }
  });

  return {
    server,
    federation,
    listen: () => new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve(server.address());
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    }),
    close: () => new Promise((resolve) => {
      if (!server.listening) return resolve();
      server.close(resolve);
    })
  };
}

function requiredActor(req) {
  const agentId = headerValue(req.headers["x-agent-id"]);
  const operatorId = headerValue(req.headers["x-operator-id"]);
  if (!agentId || !operatorId) throw new Error("actor_headers_required");
  return { agentId, operatorId };
}

function optionalActor(req, token) {
  const agentId = headerValue(req.headers["x-agent-id"]);
  const operatorId = headerValue(req.headers["x-operator-id"]);
  if (!agentId && !operatorId) return undefined;
  // Supplying an actor identity is itself privileged until signed federation exists.
  requireControlToken(req, token);
  if (!agentId || !operatorId) throw new Error("actor_headers_required");
  return { agentId, operatorId };
}

function requireControlToken(req, expectedToken) {
  const supplied = bearerToken(req.headers.authorization);
  if (!supplied || !timingSafeEqualString(supplied, expectedToken)) throw new Error("control_token_required");
}

function bearerToken(header) {
  const value = headerValue(header);
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

function headerValue(value) {
  if (Array.isArray(value)) return value[0]?.trim();
  return typeof value === "string" ? value.trim() : undefined;
}

function timingSafeEqualString(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return cryptoSafeEqual(a, b);
}

function cryptoSafeEqual(a, b) {
  // Lazy import avoidance is not worth weakening comparison semantics; node:crypto is available globally via require only in CJS,
  // so use a constant-time byte comparison loop here while keeping length private to this local control-token boundary.
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

async function readJson(req) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new Error("request_body_too_large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("request_json_object_required");
    return parsed;
  } catch (error) {
    if (error.message === "request_json_object_required") throw error;
    throw new Error("invalid_json");
  }
}

function httpStatusFor(code) {
  if (code === "control_token_required") return 401;
  if ([
    "project_access_denied", "document_access_denied", "project_write_forbidden", "project_invite_forbidden",
    "project_owner_required", "project_decision_forbidden", "actor_operator_mismatch", "self_verification_forbidden"
  ].includes(code)) return 403;
  if ([
    "agent_not_found", "project_not_found", "project_member_not_found", "project_invitation_not_found",
    "document_not_found", "document_version_not_found"
  ].includes(code)) return 404;
  if ([
    "agent_id_exists", "project_slug_exists", "project_member_exists", "project_invitation_pending",
    "project_invitation_not_pending", "document_version_conflict", "project_owner_removal_forbidden",
    "project_owner_role_fixed"
  ].includes(code)) return 409;
  if (code?.includes("required") || code?.includes("invalid") || code?.includes("mismatch") || code === "request_body_too_large") return 400;
  return 500;
}

function addCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Agent-Id,X-Operator-Id");
  res.setHeader("Cache-Control", "no-store");
}

function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", String(payload.length));
  res.end(payload);
}

function end(res, status) {
  res.statusCode = status;
  res.end();
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const app = await createFederationApi();
  const address = await app.listen();
  const printableHost = typeof address === "object" && address?.address ? address.address : defaultHost;
  const printablePort = typeof address === "object" && address?.port ? address.port : defaultPort;
  console.log(`Agent Work OS federation API listening on http://${printableHost}:${printablePort}`);
}
