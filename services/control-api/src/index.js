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
import { DomainValidationError, createWorkItem } from "../../../packages/domain/src/index.js";
import { createWorkItemRepository } from "./work-item-store.js";
import { IdentityError, IdentityRepository } from "./identity-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");
const webRoot = path.join(projectRoot, "apps/web/public");
const host = process.env.AGENT_WORK_OS_HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? process.env.AGENT_WORK_OS_PORT ?? 8787);
const token = process.env.AGENT_WORK_OS_TOKEN ?? (process.env.NODE_ENV === "production" ? "" : "dev-token");
const isProduction = process.env.NODE_ENV === "production";
const sessionCookieName = "awos_session";
const csrfCookieName = "awos_csrf";
const cookieSameSite = process.env.AGENT_WORK_OS_COOKIE_SAME_SITE ?? "Strict";
const statePath = path.resolve(process.env.AGENT_WORK_OS_STATE_PATH ?? ".data/state.json");
const portfolioPath = path.resolve(process.env.AGENT_WORK_OS_PORTFOLIO_PATH ?? path.join(projectRoot, "config/portfolio.json"));
const receiptsRoot = path.resolve(process.env.AGENT_WORK_OS_RECEIPTS_ROOT ?? path.join(projectRoot, "receipts"));
const exampleContractPath = path.join(projectRoot, "contracts/shipping-os-selftest.example.json");
const CONTROL_PLANE_ACTOR_ID = "service_00000000-0000-4000-8000-000000000001";

export async function createControlPlane() {
  if (isProduction && !process.env.DATABASE_URL) throw new Error("DATABASE_URL_required_in_production");
  if (!["Strict", "Lax", "None"].includes(cookieSameSite)) throw new Error("AGENT_WORK_OS_COOKIE_SAME_SITE_must_be_Strict_Lax_or_None");
  if (cookieSameSite === "None" && !isProduction) throw new Error("cross_site_auth_cookies_require_production_secure_transport");
  const store = new JsonStore(statePath);
  await store.load();
  const workItems = createWorkItemRepository(store);
  if (typeof workItems.initialize === "function") await workItems.initialize();
  if (isProduction && !store.pool) throw new Error("DATABASE_URL_required_in_production");
  const identities = store.pool ? new IdentityRepository(store.pool) : null;
  if (identities) await identities.initialize();
  await store.initializeMachineSessionStore();
  const daemonSockets = new Map();
  const clientSockets = new Map();

  const broadcast = (event) => {
    const encoded = encodeMessage(event);
    for (const [peer, principal] of clientSockets) {
      const organizationId = event.workItem?.organizationId ?? event.run?.organizationId ?? event.session?.organizationId ?? event.machine?.organizationId;
      if (principal.kind === "legacy" || (organizationId && principal.organizationIds?.includes(organizationId))) peer.send(encoded);
    }
  };
  const sendCommand = (machineId, command) => {
    const peer = daemonSockets.get(machineId);
    if (!peer || peer.closed) throw new Error(`Machine ${machineId} is not connected`);
    peer.send(encodeMessage(command));
  };

  const server = http.createServer(async (req, res) => {
    try {
      if (!addCors(req, res)) return json(res, 403, { error: "origin_not_allowed" });
      if (req.method === "OPTIONS") return end(res, 204);
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, product: "agent-work-os", protocolVersion: PROTOCOL_VERSION });
      if (req.method === "GET" && url.pathname === "/readyz") {
        if (store.pool) await store.pool.query("SELECT 1");
        return json(res, 200, { ok: true, database: store.pool ? "ready" : "local" });
      }
      const isPublicAuthRoute = req.method === "POST" && ["/api/auth/register", "/api/auth/login"].includes(url.pathname);
      let principal = null;
      if (url.pathname.startsWith("/api/") && !isPublicAuthRoute) {
        principal = identities ? await authenticateSession(req, identities) : null;
        if (!principal && identities) principal = await authenticateMachineRequest(req, identities);
        if (!principal && !isProduction && isAuthorized(req)) principal = { kind: "legacy", actorId: CONTROL_PLANE_ACTOR_ID };
        if (!principal) return json(res, 401, { error: "unauthorized" });
        if (principal.kind === "user") {
          if (!isUserScopedRoute(url.pathname)) return json(res, 403, { error: "resource_tenant_scope_unavailable" });
          if (isMutation(req.method) && !isValidCsrf(req)) return json(res, 403, { error: "csrf_validation_failed" });
        } else if (principal.kind === "machine" && !isMachineScopedRoute(req.method, url.pathname)) {
          return json(res, 403, { error: "machine_resource_scope_denied" });
        }
      }

      if (req.method === "POST" && url.pathname === "/api/auth/register") {
        if (!identities) return json(res, 503, { error: "identity_requires_postgres" });
        await identities.consumeAuthAttempt(`register:${clientAddress(req)}`, { limit: 10, windowMs: 15 * 60 * 1000 });
        const body = await readJson(req);
        const account = await identities.register({ email: body.email, password: body.password, organizationName: body.organizationName });
        setAuthCookies(res, account.session);
        return json(res, 201, { user: account.user, organization: account.organization, memberships: account.memberships, csrfToken: account.session.csrfToken });
      }
      if (req.method === "POST" && url.pathname === "/api/auth/login") {
        if (!identities) return json(res, 503, { error: "identity_requires_postgres" });
        const body = await readJson(req);
        const emailKey = typeof body.email === "string" ? body.email.trim().toLowerCase() : "invalid-email";
        await identities.consumeAuthAttempt(`login-ip:${clientAddress(req)}`, { limit: 30, windowMs: 15 * 60 * 1000 });
        await identities.consumeAuthAttempt(`login-email:${emailKey}`, { limit: 10, windowMs: 15 * 60 * 1000 });
        const account = await identities.login({ email: body.email, password: body.password });
        setAuthCookies(res, account.session);
        return json(res, 200, { user: account.user, memberships: account.memberships, csrfToken: account.session.csrfToken });
      }
      if (req.method === "GET" && url.pathname === "/api/auth/me" && principal.kind === "user") {
        return json(res, 200, { user: { id: principal.userId, email: principal.email }, memberships: await identities.listMemberships(principal.userId), csrfToken: readCookie(req, csrfCookieName) ?? null });
      }
      if (req.method === "POST" && url.pathname === "/api/auth/logout" && principal.kind === "user") {
        const rawToken = readCookie(req, sessionCookieName);
        await identities.revokeSession(rawToken);
        for (const [peer, client] of clientSockets) if (client.sessionId === principal.sessionId) peer.close(1008, "session_revoked");
        clearAuthCookies(res);
        return json(res, 200, { ok: true });
      }
      if (req.method === "GET" && url.pathname === "/api/organizations" && principal.kind === "user") {
        return json(res, 200, { organizations: await identities.listMemberships(principal.userId) });
      }
      const invitationMatch = url.pathname.match(/^\/api\/organizations\/([^/]+)\/invitations$/);
      if (invitationMatch && req.method === "POST" && principal.kind === "user") {
        const organizationId = decodeURIComponent(invitationMatch[1]);
        const body = await readJson(req);
        const invitation = await identities.createInvitation({ organizationId, actorId: principal.userId, email: body.email, role: body.role });
        return json(res, 201, { invitation });
      }
      const machineCredentialsMatch = url.pathname.match(/^\/api\/organizations\/([^/]+)\/machine-credentials$/);
      if (machineCredentialsMatch && req.method === "POST" && principal.kind === "user") {
        const body = await readJson(req);
        const credential = await identities.createMachineCredential({
          organizationId: decodeURIComponent(machineCredentialsMatch[1]),
          actorId: principal.userId,
          machineId: body.machineId,
          name: body.name
        });
        return json(res, 201, { credential });
      }
      const machineCredentialRotateMatch = url.pathname.match(/^\/api\/organizations\/([^/]+)\/machine-credentials\/([^/]+)\/rotate$/);
      if (machineCredentialRotateMatch && req.method === "POST" && principal.kind === "user") {
        const credential = await identities.rotateMachineCredential({
          organizationId: decodeURIComponent(machineCredentialRotateMatch[1]),
          credentialId: decodeURIComponent(machineCredentialRotateMatch[2]),
          actorId: principal.userId
        });
        daemonSockets.get(credential.machineId)?.close(1008, "machine_credential_rotated");
        return json(res, 200, { credential });
      }
      const machineCredentialRevokeMatch = url.pathname.match(/^\/api\/organizations\/([^/]+)\/machine-credentials\/([^/]+)$/);
      if (machineCredentialRevokeMatch && req.method === "POST" && principal.kind === "user") {
        const result = await identities.revokeMachineCredential({
          organizationId: decodeURIComponent(machineCredentialRevokeMatch[1]),
          credentialId: decodeURIComponent(machineCredentialRevokeMatch[2]),
          actorId: principal.userId
        });
        daemonSockets.get(result.machineId)?.close(1008, "machine_credential_revoked");
        return json(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/auth/accept-invitation" && principal.kind === "user") {
        const body = await readJson(req);
        const membership = await identities.acceptInvitation(body.token, principal.userId);
        const organizationIds = (await identities.listMemberships(principal.userId)).map((entry) => entry.organizationId);
        for (const client of clientSockets.values()) if (client.userId === principal.userId) client.organizationIds = organizationIds;
        return json(res, 200, { membership });
      }

      if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, { machines: await store.listMachines(), sessions: await store.listSessions(), shippingRuns: store.listShippingRuns() });
      if (req.method === "GET" && url.pathname === "/api/work-items") {
        const organizationId = url.searchParams.get("organizationId");
        if (!organizationId) return json(res, 400, { error: "organization_id_required" });
        if (principal.kind === "user" && !(await identities.getMembership(principal.userId, organizationId))) return json(res, 404, { error: "organization_not_found" });
        return json(res, 200, { workItems: await workItems.listByOrganization(organizationId) });
      }
      if (req.method === "POST" && url.pathname === "/api/work-items") {
        const body = await readJson(req);
        if (!body.id || !body.commandId || !body.organizationId || !body.title) {
          return json(res, 400, { error: "id, commandId, organizationId and title are required" });
        }
        const membership = principal.kind === "user" ? await identities.getMembership(principal.userId, body.organizationId) : null;
        if (principal.kind === "user" && !membership) return json(res, 404, { error: "organization_not_found" });
        if (membership?.role === "viewer") return json(res, 403, { error: "organization_permission_denied" });
        const actorId = principal.kind === "user" ? principal.userId : CONTROL_PLANE_ACTOR_ID;
        const item = createWorkItem({
          id: body.id,
          organizationId: body.organizationId,
          projectId: body.projectId ?? null,
          title: body.title,
          description: body.description ?? "",
          createdBy: actorId
        });
        const result = await workItems.create(item, { commandId: body.commandId, actorId });
        broadcast({ type: "work.item.updated", workItem: result.workItem });
        return json(res, result.replayed ? 200 : 201, result);
      }
      const workItemEventsMatch = url.pathname.match(/^\/api\/work-items\/([^/]+)\/events$/);
      if (req.method === "GET" && workItemEventsMatch) {
        const organizationId = url.searchParams.get("organizationId");
        if (!organizationId) return json(res, 400, { error: "organization_id_required" });
        if (principal.kind === "user" && !(await identities.getMembership(principal.userId, organizationId))) return json(res, 404, { error: "organization_not_found" });
        const events = await workItems.listEvents(decodeURIComponent(workItemEventsMatch[1]), organizationId);
        if (events.length === 0 && !(await workItems.get(decodeURIComponent(workItemEventsMatch[1]), organizationId))) return json(res, 404, { error: "work_item_not_found" });
        return json(res, 200, { events });
      }
      const workItemTransitionMatch = url.pathname.match(/^\/api\/work-items\/([^/]+)\/transitions$/);
      if (req.method === "POST" && workItemTransitionMatch) {
        const body = await readJson(req);
        if (!body.organizationId || !body.commandId || !Number.isSafeInteger(body.expectedVersion) || !body.to) {
          return json(res, 400, { error: "organizationId, commandId, expectedVersion and to are required" });
        }
        const membership = principal.kind === "user" ? await identities.getMembership(principal.userId, body.organizationId) : null;
        if (principal.kind === "user" && !membership) return json(res, 404, { error: "organization_not_found" });
        if (membership?.role === "viewer") return json(res, 403, { error: "organization_permission_denied" });
        const actorId = principal.kind === "user" ? principal.userId : CONTROL_PLANE_ACTOR_ID;
        const result = await workItems.transition(decodeURIComponent(workItemTransitionMatch[1]), {
          organizationId: body.organizationId,
          commandId: body.commandId,
          actorId,
          expectedVersion: body.expectedVersion,
          to: body.to,
          reason: body.reason ?? null
        });
        if (!result) return json(res, 404, { error: "work_item_not_found" });
        broadcast({ type: "work.item.updated", workItem: result.workItem });
        return json(res, 200, result);
      }
      const workItemMatch = url.pathname.match(/^\/api\/work-items\/([^/]+)$/);
      if (req.method === "GET" && workItemMatch) {
        const organizationId = url.searchParams.get("organizationId");
        if (!organizationId) return json(res, 400, { error: "organization_id_required" });
        if (principal.kind === "user" && !(await identities.getMembership(principal.userId, organizationId))) return json(res, 404, { error: "organization_not_found" });
        const item = await workItems.get(decodeURIComponent(workItemMatch[1]), organizationId);
        return item ? json(res, 200, item) : json(res, 404, { error: "work_item_not_found" });
      }
      if (req.method === "GET" && url.pathname === "/api/product") {
        const [portfolio, committedReceipts] = await Promise.all([loadPortfolio(portfolioPath), listReceipts(receiptsRoot)]);
        const [runs, machines, sessions] = await Promise.all([Promise.resolve(store.listShippingRuns()), store.listMachines(), store.listSessions()]);
        const runReceipts = runs.filter((run) => run.releaseReceipt).map((run) => ({ ...run.releaseReceipt, runId: run.runId, projectId: run.projectId, releaseVersion: run.releaseVersion, path: null, source: "runtime" }));
        return json(res, 200, buildProductSummary({ portfolio, runs, receipts: [...committedReceipts, ...runReceipts], machines, sessions }));
      }
      if (req.method === "GET" && url.pathname === "/api/portfolio") return json(res, 200, { projects: rankPortfolio(await loadPortfolio(portfolioPath)) });
      if (req.method === "GET" && url.pathname === "/api/receipts") return json(res, 200, { receipts: await listReceipts(receiptsRoot) });
      if (req.method === "GET" && url.pathname === "/api/shipping/example") return json(res, 200, JSON.parse(await readFile(exampleContractPath, "utf8")));
      if (req.method === "GET" && url.pathname === "/api/shipping/runs" && principal.kind === "legacy") return json(res, 200, { runs: store.listShippingRuns() });
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
      if (req.method === "POST" && url.pathname === "/api/shipping/runs" && principal.kind === "legacy") {
        const body = await readJson(req);
        const machine = await store.getMachine(body.machineId);
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
      if (req.method === "GET" && sessionMatch && principal.kind === "legacy") {
        const session = await store.getSession(decodeURIComponent(sessionMatch[1]));
        return session ? json(res, 200, session) : json(res, 404, { error: "session_not_found" });
      }
      if (req.method === "POST" && url.pathname === "/api/sessions" && principal.kind === "legacy") {
        const body = await readJson(req);
        if (!body.machineId || !body.cwd || !body.agent || !body.prompt?.trim()) return json(res, 400, { error: "machineId, cwd, agent and prompt are required" });
        const machine = await store.getMachine(body.machineId);
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
      if (req.method === "POST" && messageMatch && principal.kind === "legacy") {
        const session = await store.getSession(decodeURIComponent(messageMatch[1]));
        if (!session) return json(res, 404, { error: "session_not_found" });
        const body = await readJson(req); const text = body.text?.trim();
        if (!text) return json(res, 400, { error: "text is required" });
        const updated = await store.addMessage(session.id, { id: crypto.randomUUID(), role: "user", text, createdAt: new Date().toISOString() }); broadcast({ type: "session.updated", session: updated });
        try { sendCommand(session.machineId, { type: "server.command", commandId: crypto.randomUUID(), sessionId: session.id, action: "session.message", payload: { prompt: text } }); }
        catch (error) { return json(res, 409, { error: error.message }); }
        return json(res, 202, updated);
      }
      const interruptMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/interrupt$/);
      if (req.method === "POST" && interruptMatch && principal.kind === "legacy") {
        const session = await store.getSession(decodeURIComponent(interruptMatch[1])); if (!session) return json(res, 404, { error: "session_not_found" });
        try { sendCommand(session.machineId, { type: "server.command", commandId: crypto.randomUUID(), sessionId: session.id, action: "session.interrupt" }); }
        catch (error) { return json(res, 409, { error: error.message }); }
        return json(res, 202, { ok: true });
      }
      if (req.method === "GET" && !url.pathname.startsWith("/api/")) return serveStatic(url.pathname, res);

      if (req.method === "GET" && url.pathname === "/api/machines" && principal.kind === "user") {
        const organizationId = url.searchParams.get("organizationId");
        if (!organizationId) return json(res, 400, { error: "organization_id_required" });
        if (!(await identities.getMembership(principal.userId, organizationId))) return json(res, 404, { error: "organization_not_found" });
        return json(res, 200, { machines: await store.listMachinesByOrganization(organizationId) });
      }
      if (req.method === "GET" && url.pathname === "/api/sessions" && principal.kind === "user") {
        const organizationId = url.searchParams.get("organizationId");
        if (!organizationId) return json(res, 400, { error: "organization_id_required" });
        if (!(await identities.getMembership(principal.userId, organizationId))) return json(res, 404, { error: "organization_not_found" });
        return json(res, 200, { sessions: await store.listSessionsByOrganization(organizationId) });
      }
      if (req.method === "POST" && url.pathname === "/api/sessions" && principal.kind === "user") {
        const body = await readJson(req);
        if (!body.organizationId || !body.machineId || !body.cwd || !body.agent || !body.prompt?.trim()) return json(res, 400, { error: "organizationId, machineId, cwd, agent and prompt are required" });
        const membership = await identities.getMembership(principal.userId, body.organizationId);
        if (!membership) return json(res, 404, { error: "organization_not_found" });
        if (membership.role === "viewer") return json(res, 403, { error: "organization_permission_denied" });
        const machine = await store.getMachine(body.machineId);
        if (!machine || machine.organizationId !== body.organizationId || machine.status !== "online") return json(res, 409, { error: "machine_not_available_in_organization" });
        if (!machine.capabilities.some((capability) => capability.name === body.agent)) return json(res, 400, { error: "agent_not_available" });
        const now = new Date().toISOString();
        const session = {
          id: crypto.randomUUID(), organizationId: body.organizationId, createdBy: principal.userId, machineId: body.machineId,
          cwd: body.cwd, agent: body.agent, model: body.model || undefined,
          status: "queued", createdAt: now, updatedAt: now,
          messages: [{ id: crypto.randomUUID(), role: "user", text: body.prompt.trim(), createdAt: now }], events: []
        };
        await store.createSession(session);
        broadcast({ type: "session.updated", session });
        try { sendCommand(body.machineId, { type: "server.command", commandId: crypto.randomUUID(), sessionId: session.id, action: "session.start", payload: { cwd: body.cwd, agent: body.agent, model: body.model || undefined, prompt: body.prompt.trim() } }); }
        catch (error) { const failed = await store.setSessionStatus(session.id, "failed"); broadcast({ type: "session.updated", session: failed }); return json(res, 409, { error: error.message, session: failed }); }
        return json(res, 201, session);
      }
      const scopedSessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (req.method === "GET" && scopedSessionMatch) {
        const session = await store.getSession(decodeURIComponent(scopedSessionMatch[1]));
        if (principal.kind === "machine") {
          if (!session || session.machineId !== principal.machineId || session.organizationId !== principal.organizationId) return json(res, 404, { error: "session_not_found" });
          return json(res, 200, session);
        }
        if (principal.kind === "user") {
          const organizationId = url.searchParams.get("organizationId");
          if (!organizationId || !(await identities.getMembership(principal.userId, organizationId))) return json(res, 404, { error: "session_not_found" });
          return session?.organizationId === organizationId ? json(res, 200, session) : json(res, 404, { error: "session_not_found" });
        }
      }
      const sessionMessageMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
      if (req.method === "POST" && sessionMessageMatch && principal.kind === "user") {
        const session = await store.getSession(decodeURIComponent(sessionMessageMatch[1]));
        if (!session || !(await identities.getMembership(principal.userId, session.organizationId))) return json(res, 404, { error: "session_not_found" });
        const membership = await identities.getMembership(principal.userId, session.organizationId);
        if (membership.role === "viewer") return json(res, 403, { error: "organization_permission_denied" });
        const machine = await store.getMachine(session.machineId);
        if (machine?.organizationId !== session.organizationId) return json(res, 409, { error: "session_machine_organization_mismatch" });
        const body = await readJson(req); const message = body.text?.trim();
        if (!message) return json(res, 400, { error: "text is required" });
        const updated = await store.addMessage(session.id, { id: crypto.randomUUID(), role: "user", text: message, createdAt: new Date().toISOString() });
        broadcast({ type: "session.updated", session: updated });
        try { sendCommand(session.machineId, { type: "server.command", commandId: crypto.randomUUID(), sessionId: session.id, action: "session.message", payload: { prompt: message } }); }
        catch (error) { return json(res, 409, { error: error.message }); }
        return json(res, 202, updated);
      }
      const sessionInterruptMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/interrupt$/);
      if (req.method === "POST" && sessionInterruptMatch && principal.kind === "user") {
        const session = await store.getSession(decodeURIComponent(sessionInterruptMatch[1]));
        if (!session || !(await identities.getMembership(principal.userId, session.organizationId))) return json(res, 404, { error: "session_not_found" });
        const membership = await identities.getMembership(principal.userId, session.organizationId);
        if (membership.role === "viewer") return json(res, 403, { error: "organization_permission_denied" });
        const machine = await store.getMachine(session.machineId);
        if (machine?.organizationId !== session.organizationId) return json(res, 409, { error: "session_machine_organization_mismatch" });
        try { sendCommand(session.machineId, { type: "server.command", commandId: crypto.randomUUID(), sessionId: session.id, action: "session.interrupt" }); }
        catch (error) { return json(res, 409, { error: error.message }); }
        return json(res, 202, { ok: true });
      }
      return json(res, 404, { error: "not_found" });
    } catch (error) {
      const status = error instanceof IdentityError ? error.status
        : error.code === "work_item_version_conflict" || error.code === "idempotency_key_conflict" || error.code === "work_item_already_exists" ? 409
        : error instanceof DomainValidationError ? 400
          : error instanceof SyntaxError ? 400
            : error.statusCode ?? 500;
      if (status === 500) console.error("[api] request error", error);
      if (error.retryAfterSeconds) res.setHeader("retry-after", String(error.retryAfterSeconds));
      return json(res, status, {
        error: status === 500 ? "internal_error" : error.code ?? (status === 413 ? "request_too_large" : "invalid_request"),
        message: status === 500 ? "Request could not be completed" : error.message
      });
    }
  });

  server.on("upgrade", (req, socket) => {
    void (async () => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (url.pathname !== "/ws" || !isAllowedOrigin(req)) return socket.destroy();
      const role = url.searchParams.get("role");
      if (role !== "daemon" && role !== "client") return socket.destroy();
      let clientPrincipal = null;
      let daemonPrincipal = null;
      let daemonAuthTimeout = null;
      if (role === "daemon" && !isProduction && token && constantTimeEqual(url.searchParams.get("token") ?? "", token)) {
        daemonPrincipal = { kind: "legacy" };
      } else if (role === "client") {
        clientPrincipal = identities ? await authenticateSession(req, identities) : null;
        if (!clientPrincipal && !isProduction && constantTimeEqual(url.searchParams.get("token") ?? "", token)) clientPrincipal = { kind: "legacy" };
        if (!clientPrincipal) return socket.destroy();
        if (clientPrincipal.kind === "user") {
          clientPrincipal.organizationIds = (await identities.listMemberships(clientPrincipal.userId)).map((membership) => membership.organizationId);
        }
      }
      const peer = acceptWebSocket(req, socket); if (!peer) return;
      if (role === "daemon" && !daemonPrincipal) {
        daemonAuthTimeout = setTimeout(() => peer.close(1008, "machine_authentication_required"), 5_000);
        daemonAuthTimeout.unref?.();
        peer.on("close", () => clearTimeout(daemonAuthTimeout));
      }
      if (role === "client") {
        clientSockets.set(peer, clientPrincipal);
        if (clientPrincipal.kind === "user") {
          const remaining = Math.max(0, Date.parse(clientPrincipal.expiresAt) - Date.now());
          const expiry = setTimeout(() => peer.close(1008, "session_expired"), remaining);
          expiry.unref?.();
          peer.on("close", () => clearTimeout(expiry));
        }
        const state = clientPrincipal.kind === "user"
          ? {
              machines: (await Promise.all(clientPrincipal.organizationIds.map((organizationId) => store.listMachinesByOrganization(organizationId)))).flat(),
              sessions: (await Promise.all(clientPrincipal.organizationIds.map((organizationId) => store.listSessionsByOrganization(organizationId)))).flat(),
              shippingRuns: store.listShippingRuns().filter((run) => clientPrincipal.organizationIds.includes(run.organizationId)),
              workItems: (await Promise.all(clientPrincipal.organizationIds.map((organizationId) => workItems.listByOrganization(organizationId)))).flat()
            }
          : { machines: await store.listMachines(), sessions: await store.listSessions(), shippingRuns: store.listShippingRuns() };
        peer.send(encodeMessage({ type: "state.snapshot", ...state }));
        peer.on("close", () => clientSockets.delete(peer));
        return;
      }
      let machineId;
      peer.on("message", async (raw) => {
        try {
          if (peer.closed) return;
          const msg = decodeMessage(raw);
          if (msg.type === "daemon.hello") {
            if (msg.protocolVersion !== PROTOCOL_VERSION) return peer.close(1002, "protocol_version_mismatch");
            if (machineId) return peer.close(1008, "machine_already_authenticated");
            if (!daemonPrincipal) {
              daemonPrincipal = await identities.authenticateMachine(msg.machineCredential);
              if (!daemonPrincipal || daemonPrincipal.machineId !== msg.machine?.id) return peer.close(1008, "machine_authentication_failed");
              clearTimeout(daemonAuthTimeout);
              daemonAuthTimeout = null;
            }
            machineId = msg.machine.id;
            const machine = {
              ...msg.machine,
              ...(daemonPrincipal.kind === "machine" ? { organizationId: daemonPrincipal.organizationId } : {}),
              status: "online", lastSeenAt: new Date().toISOString()
            };
            delete machine.machineCredential;
            const priorPeer = daemonSockets.get(machineId);
            if (priorPeer && priorPeer !== peer) priorPeer.close(1008, "machine_connection_replaced");
            daemonSockets.set(machineId, peer);
            await store.upsertMachine(machine);
            peer.send(encodeMessage({ type: "server.machine.authenticated", machineId, organizationId: machine.organizationId ?? null }));
            broadcast({ type: "machine.updated", machine }); return;
          }
          if (!daemonPrincipal || !machineId || msg.machineId !== machineId) return peer.close(1008, "machine_authentication_required");
          if (msg.type === "daemon.heartbeat") { const machine = await store.touchMachine(machineId); if (machine) broadcast({ type: "machine.updated", machine }); return; }
          if (msg.type === "daemon.session.event") {
            const current = await store.getSession(msg.sessionId);
            if (!current || current.machineId !== machineId || (daemonPrincipal.kind === "machine" && current.organizationId !== daemonPrincipal.organizationId)) return;
            const session = await store.addEvent(msg.sessionId, msg.event); broadcast({ type: "session.updated", session }); return;
          }
          if (msg.type === "daemon.shipping.run") {
            const run = { ...msg.run, machineId, ...(daemonPrincipal.kind === "machine" ? { organizationId: daemonPrincipal.organizationId } : {}) };
            await store.upsertShippingRun(run); broadcast({ type: "shipping.run.updated", run }); return;
          }
        } catch (error) { console.warn("[api] invalid daemon message", error.message); }
      });
      peer.on("close", async () => {
        if (!machineId || daemonSockets.get(machineId) !== peer) return;
        daemonSockets.delete(machineId);
        const machine = await store.markMachineOffline(machineId); if (machine) broadcast({ type: "machine.updated", machine });
      });
      peer.on("error", (error) => console.warn("[api] websocket peer error", error.message));
    })().catch(() => socket.destroy());
  });

  return {
    server, store,
    listen: () => new Promise((resolve) => server.listen(port, host, resolve)),
    close: () => new Promise((resolve) => {
      for (const peer of daemonSockets.values()) peer.close(1001, "server_shutdown");
      for (const peer of clientSockets.keys()) peer.close(1001, "server_shutdown");
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
async function authenticateSession(req, identities) {
  return identities.authenticate(readCookie(req, sessionCookieName));
}
function isPublicAuthRoute(pathname) {
  return ["/api/auth/register", "/api/auth/login"].includes(pathname);
}
function isUserScopedRoute(pathname) {
  return pathname === "/api/auth/me" || pathname === "/api/auth/logout" || pathname === "/api/auth/accept-invitation"
    || pathname === "/api/organizations" || /^\/api\/organizations\/[^/]+\/invitations$/.test(pathname)
    || /^\/api\/organizations\/[^/]+\/machine-credentials(?:\/[^/]+(?:\/rotate)?)?$/.test(pathname)
    || pathname === "/api/machines" || pathname === "/api/sessions" || /^\/api\/sessions\/[^/]+(?:\/messages|\/interrupt)?$/.test(pathname)
    || pathname === "/api/work-items" || /^\/api\/work-items\/[^/]+(?:\/events|\/transitions)?$/.test(pathname);
}
function isMachineScopedRoute(method, pathname) {
  return method === "GET" && /^\/api\/sessions\/[^/]+$/.test(pathname);
}
function isMutation(method) { return !["GET", "HEAD", "OPTIONS"].includes(method); }
async function authenticateMachineRequest(req, identities) {
  const raw = req.headers.authorization ?? "";
  const supplied = String(raw).startsWith("Bearer ") ? String(raw).slice(7) : "";
  return identities.authenticateMachine(supplied);
}
function readCookie(req, name) {
  const entry = String(req.headers.cookie ?? "").split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : null;
}
function isValidCsrf(req) {
  const cookie = readCookie(req, csrfCookieName) ?? "";
  const header = String(req.headers["x-csrf-token"] ?? "");
  return /^[0-9a-f]{64}$/.test(cookie) && constantTimeEqual(cookie, header);
}
function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left)); const b = Buffer.from(String(right));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}
function setAuthCookies(res, session) {
  const secure = isProduction ? "; Secure" : "";
  const sameSite = `SameSite=${cookieSameSite}`;
  const maxAge = Math.max(0, Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000));
  res.setHeader("set-cookie", [
    `${sessionCookieName}=${session.token}; Path=/; HttpOnly; ${sameSite}; Max-Age=${maxAge}${secure}`,
    `${csrfCookieName}=${session.csrfToken}; Path=/; ${sameSite}; Max-Age=${maxAge}${secure}`
  ]);
}
function clearAuthCookies(res) {
  const secure = isProduction ? "; Secure" : "";
  const sameSite = `SameSite=${cookieSameSite}`;
  res.setHeader("set-cookie", [
    `${sessionCookieName}=; Path=/; HttpOnly; ${sameSite}; Max-Age=0${secure}`,
    `${csrfCookieName}=; Path=/; ${sameSite}; Max-Age=0${secure}`
  ]);
}
async function serveStatic(urlPath, res) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
  const safe = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
  const file = path.join(webRoot, safe);
  try { const body = await readFile(file); const ext = path.extname(file); res.statusCode = 200; res.setHeader("content-type", mime(ext)); res.end(body); }
  catch { if (rel !== "index.html") return serveStatic("/index.html", res); json(res, 404, { error: "not_found" }); }
}
function mime(ext) { return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" }[ext] ?? "application/octet-stream"); }
function isAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  let normalizedOrigin;
  try { normalizedOrigin = new URL(origin).origin; } catch { return false; }
  const configured = (process.env.AGENT_WORK_OS_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const forwardedProto = process.env.AGENT_WORK_OS_TRUST_PROXY === "true" ? String(req.headers["x-forwarded-proto"] ?? "").split(",")[0] : "";
  const protocol = forwardedProto || (req.socket.encrypted ? "https" : "http");
  let sameOrigin;
  try { sameOrigin = new URL(`${protocol}://${req.headers.host}`).origin; } catch { sameOrigin = ""; }
  return normalizedOrigin === sameOrigin || configured.includes(normalizedOrigin);
}
function clientAddress(req) {
  if (process.env.AGENT_WORK_OS_TRUST_PROXY === "true") {
    const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress ?? "unknown";
}
function addCors(req, res) {
  if (!isAllowedOrigin(req)) return false;
  if (req.headers.origin) {
    res.setHeader("access-control-allow-origin", new URL(req.headers.origin).origin);
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("vary", "Origin");
  }
  res.setHeader("access-control-allow-headers", "content-type,authorization,x-agent-work-os-token,x-csrf-token");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  return true;
}
function json(res, status, body) { res.statusCode = status; res.setHeader("content-type", "application/json; charset=utf-8"); res.setHeader("cache-control", "no-store"); res.end(JSON.stringify(body)); }
function end(res, status) { res.statusCode = status; res.end(); }
async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) {
      const error = new Error("request body exceeds 1 MB");
      error.statusCode = 413;
      throw error;
    }
  }
  return raw ? JSON.parse(raw) : {};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cp = await createControlPlane(); await cp.listen(); console.log(`[api] listening on http://${host}:${port}`);
  const shutdown = async () => { await cp.close(); process.exit(0); }; process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
}
