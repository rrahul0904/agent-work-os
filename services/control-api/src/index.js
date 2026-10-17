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
import { CapabilityVerificationRepository } from "./capability-verification-store.js";
import { TenantCapabilityRegistryRepository } from "./capability-registry-store.js";
import { handleCapabilityRegistryRequest, resolveVerificationCapabilitySpec } from "./capability-registry-routes.js";
import { IdentityError, IdentityRepository } from "./identity-store.js";
import { createOpaqueCursorCodec, PostgresEventFanout } from "./realtime-events.js";
import { PostgresDaemonCommandRouter } from "./daemon-command-router.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");
const webRoot = path.join(projectRoot, "apps/web/public");
const host = process.env.AGENT_WORK_OS_HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? process.env.AGENT_WORK_OS_PORT ?? 8787);
const machineStaleAfterMs = Number(process.env.AGENT_WORK_OS_MACHINE_STALE_AFTER_MS ?? 45_000);
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
  if (!Number.isFinite(machineStaleAfterMs) || machineStaleAfterMs < 1) throw new Error("AGENT_WORK_OS_MACHINE_STALE_AFTER_MS_must_be_positive");
  if (!["Strict", "Lax", "None"].includes(cookieSameSite)) throw new Error("AGENT_WORK_OS_COOKIE_SAME_SITE_must_be_Strict_Lax_or_None");
  if (cookieSameSite === "None" && !isProduction) throw new Error("cross_site_auth_cookies_require_production_secure_transport");
  const store = new JsonStore(statePath);
  await store.load();
  const workItems = createWorkItemRepository(store);
  if (typeof workItems.initialize === "function") await workItems.initialize();
  const capabilityVerifications = new CapabilityVerificationRepository(store);
  await capabilityVerifications.initialize();
  if (isProduction && !store.pool) throw new Error("DATABASE_URL_required_in_production");
  const identities = store.pool ? new IdentityRepository(store.pool) : null;
  if (identities) await identities.initialize();
  const capabilityRegistry = new TenantCapabilityRegistryRepository(store);
  await capabilityRegistry.initialize();
  const staleMachinesAtStartup = await store.initializeMachineSessionStore(machineStaleAfterMs);
  await store.initializeShippingRunStore();
  await store.initializeRealtimeEventStore();
  const daemonSockets = new Map();
  const clientSockets = new Map();
  const pendingDaemonCloseTasks = new Set();
  const pendingDaemonMessageTasks = new Set();
  const snapshotForClient = async (principal) => {
    const sequenceCursor = eventFanout ? await eventFanout.currentCursor() : null;
    const cursor = sequenceCursor === null ? null : cursorCodec.encode(sequenceCursor);
    if (principal.kind === "user") {
      principal.organizationIds = (await identities.listMemberships(principal.userId)).map((membership) => membership.organizationId);
      return {
        cursor,
        sequenceCursor,
        machines: (await Promise.all(principal.organizationIds.map((organizationId) => store.listMachinesByOrganization(organizationId)))).flat(),
        sessions: (await Promise.all(principal.organizationIds.map((organizationId) => store.listSessionsByOrganization(organizationId)))).flat(),
        shippingRuns: (await Promise.all(principal.organizationIds.map((organizationId) => store.listShippingRunsByOrganization(organizationId)))).flat(),
        workItems: (await Promise.all(principal.organizationIds.map((organizationId) => workItems.listByOrganization(organizationId)))).flat(),
        capabilityVerificationRuns: (await Promise.all(principal.organizationIds.map((organizationId) => capabilityVerifications.listByOrganization(organizationId)))).flat()
      };
    }
    return { cursor, sequenceCursor, machines: await store.listMachines(), sessions: await store.listSessions(), shippingRuns: await store.listShippingRuns() };
  };
  const finishClientResync = (peer, state, snapshot = null) => {
    try {
      if (snapshot) {
        const { sequenceCursor, ...wireSnapshot } = snapshot;
        peer.send(encodeMessage({ type: "state.snapshot", ...wireSnapshot }));
        state.lastSentEventId = sequenceCursor;
      }
      while (state.pendingEvents.length) {
        const pending = state.pendingEvents.shift();
        if (pending.eventId !== null && state.lastSentEventId !== null && pending.eventId <= state.lastSentEventId) continue;
        peer.send(pending.encoded);
        if (pending.eventId !== null) state.lastSentEventId = pending.eventId;
      }
    } catch (error) {
      clientSockets.delete(peer);
      console.warn("[api] websocket resync send failed", error.message);
      return;
    }
    state.resyncing = false;
  };
  const resyncClient = async (peer, state) => {
    try {
      const snapshot = await snapshotForClient(state.principal);
      if (clientSockets.get(peer) === state) finishClientResync(peer, state, snapshot);
    } catch (error) {
      console.warn("[api] websocket resync failed", error.message);
      if (clientSockets.get(peer) === state) {
        clientSockets.delete(peer);
        peer.close(1011, "state_resync_failed");
      }
    }
  };
  const resyncClients = () => {
    for (const [peer, state] of clientSockets) {
      if (state.resyncing) continue;
      state.resyncing = true;
      void resyncClient(peer, state);
    }
  };

  const broadcastLocal = (event, eventId = null) => {
    const encoded = encodeMessage(eventId === null ? event : {
      ...event,
      eventId: cursorCodec.eventTag(eventId),
      cursor: cursorCodec.encode(eventId)
    });
    for (const [peer, state] of clientSockets) {
      const principal = state.principal;
      const organizationId = event.workItem?.organizationId ?? event.capabilityVerification?.organizationId ?? event.run?.organizationId ?? event.session?.organizationId ?? event.machine?.organizationId;
      if (principal.kind === "legacy" || (organizationId && principal.organizationIds?.includes(organizationId))) {
        if (eventId !== null && state.lastSentEventId !== null && eventId <= state.lastSentEventId) continue;
        if (state.resyncing) {
          state.pendingEvents.push({ eventId, encoded });
          continue;
        }
        try {
          peer.send(encoded);
          if (eventId !== null) state.lastSentEventId = eventId;
        } catch (error) {
          clientSockets.delete(peer);
          console.warn("[api] client websocket send failed", error.message);
        }
      }
    }
  };
  const eventFanout = store.pool ? new PostgresEventFanout(store.pool, broadcastLocal, { onGap: resyncClients }) : null;
  const commandRouter = store.pool ? new PostgresDaemonCommandRouter(store.pool, {
    getConnectedMachineIds: () => [...daemonSockets.keys()],
    getPeer: (machineId) => daemonSockets.get(machineId),
    onAcknowledged: async (command, receipt) => {
      if (receipt.ok) return;
      const error = String(receipt.error ?? "daemon_command_failed").slice(0, 2_000);
      if (command.action === "session.start") {
        const session = await store.getSession(command.sessionId);
        if (!session) return;
        const failureEvent = { kind: "status", status: "failed", error, message: error, commandId: command.commandId, at: new Date().toISOString() };
        const updated = await store.addEvent(session.id, failureEvent);
        if (updated) broadcast({ type: "session.updated", session: updated });
        const verification = await capabilityVerifications.updateFromSessionEvent(session.id, failureEvent);
        if (verification) broadcast({ type: "capability.verification.updated", capabilityVerification: verification });
      } else if (command.action === "session.message" || command.action === "session.interrupt") {
        const session = await store.getSession(command.sessionId);
        if (!session) return;
        const updated = await store.addEvent(session.id, { kind: "error", message: error, commandId: command.commandId, at: new Date().toISOString() });
        if (updated) broadcast({ type: "session.updated", session: updated });
      } else if (command.action === "shipping.start") {
        const run = await store.getShippingRun(command.payload?.runId);
        if (!run || run.state !== "QUEUED") return;
        const updated = await store.upsertShippingRun({ ...run, state: "FAILED", fatalError: error, updatedAt: new Date().toISOString() });
        if (updated) broadcast({ type: "shipping.run.updated", run: updated });
      }
    }
  }) : null;
  const cursorCodec = eventFanout
    ? createOpaqueCursorCodec(process.env.AGENT_WORK_OS_EVENT_CURSOR_SECRET ?? process.env.DATABASE_URL)
    : null;
  const replayClient = async (peer, state, cursor) => {
    try {
      const history = await eventFanout.replayAfter(cursor);
      if (clientSockets.get(peer) !== state) return;
      if (history.gap) return void resyncClient(peer, state);
      if (state.principal.kind === "user") {
        state.principal.organizationIds = (await identities.listMemberships(state.principal.userId)).map((membership) => membership.organizationId);
      }
      for (const { eventId, event } of history.rows) {
        const organizationId = event.workItem?.organizationId ?? event.capabilityVerification?.organizationId ?? event.run?.organizationId ?? event.session?.organizationId ?? event.machine?.organizationId;
        if (state.principal.kind === "legacy" || (organizationId && state.principal.organizationIds?.includes(organizationId))) {
          if (eventId <= state.lastSentEventId) continue;
          peer.send(encodeMessage({ ...event, eventId: cursorCodec.eventTag(eventId), cursor: cursorCodec.encode(eventId) }));
          state.lastSentEventId = eventId;
        }
      }
      peer.send(encodeMessage({ type: "realtime.cursor", cursor: cursorCodec.encode(history.cursor) }));
      state.lastSentEventId = Math.max(state.lastSentEventId ?? 0, history.cursor);
      const laterEvents = state.pendingEvents.filter((entry) => entry.eventId === null || entry.eventId > history.cursor);
      state.pendingEvents.length = 0;
      for (const entry of laterEvents) {
        if (entry.eventId !== null && state.lastSentEventId !== null && entry.eventId <= state.lastSentEventId) continue;
        peer.send(entry.encoded);
        if (entry.eventId !== null) state.lastSentEventId = entry.eventId;
      }
      state.resyncing = false;
    } catch (error) {
      console.warn("[api] websocket replay failed", error.message);
      if (clientSockets.get(peer) === state) {
        clientSockets.delete(peer);
        peer.close(1011, "event_replay_failed");
      }
    }
  };
  await eventFanout?.start();
  await commandRouter?.start();
  const broadcast = (event) => {
    if (eventFanout) {
      try { eventFanout.publish(event); }
      catch (error) { console.warn("[api] realtime event enqueue failed", error.message); }
    } else broadcastLocal(event);
  };
  for (const machine of staleMachinesAtStartup) broadcast({ type: "machine.updated", machine });
  const sendCommand = async (machineId, command) => {
    if (commandRouter) return commandRouter.enqueue(machineId, command);
    const peer = daemonSockets.get(machineId);
    if (!peer || peer.closed) throw new Error(`Machine ${machineId} is not connected`);
    peer.send(encodeMessage(command));
  };
  const machineStaleTimer = setInterval(() => {
    void store.markStaleMachines(machineStaleAfterMs).then((machines) => {
      for (const machine of machines) broadcast({ type: "machine.updated", machine });
    }).catch((error) => console.warn("[api] stale machine reconciliation failed", error.message));
  }, Math.max(1_000, Math.min(15_000, machineStaleAfterMs / 3)));
  machineStaleTimer.unref?.();

  const server = http.createServer(async (req, res) => {
    try {
      if (!addCors(req, res)) return json(res, 403, { error: "origin_not_allowed" });
      if (req.method === "OPTIONS") return end(res, 204);
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, product: "agent-work-os", protocolVersion: PROTOCOL_VERSION });
      if (req.method === "GET" && url.pathname === "/readyz") {
        if (store.pool) await store.pool.query("SELECT 1");
        const ready = !eventFanout || eventFanout.ready;
        return json(res, ready ? 200 : 503, { ok: ready, database: store.pool ? "ready" : "local", eventFanout: eventFanout ? (ready ? "ready" : "connecting") : "local" });
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
        for (const [peer, state] of clientSockets) if (state.principal.sessionId === principal.sessionId) peer.close(1008, "session_revoked");
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
        for (const state of clientSockets.values()) if (state.principal.userId === principal.userId) state.principal.organizationIds = organizationIds;
        return json(res, 200, { membership });
      }

      if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, { machines: await store.listMachines(), sessions: await store.listSessions(), shippingRuns: await store.listShippingRuns() });
      if (await handleCapabilityRegistryRequest({ req, res, url, principal, identities, registry: capabilityRegistry, readJson, json })) return;
      if (req.method === "GET" && url.pathname === "/api/capability-verifications" && principal.kind === "user") {
        const organizationId = url.searchParams.get("organizationId");
        if (!organizationId) return json(res, 400, { error: "organization_id_required" });
        if (!(await identities.getMembership(principal.userId, organizationId))) return json(res, 404, { error: "organization_not_found" });
        return json(res, 200, { runs: await capabilityVerifications.listByOrganization(organizationId) });
      }
      if (req.method === "POST" && url.pathname === "/api/capability-verifications" && principal.kind === "user") {
        const body = await readJson(req);
        if (!body.organizationId || !body.machineId || !body.cwd || (!body.spec && !body.capabilitySlug)) return json(res, 400, { error: "organizationId, machineId, cwd and spec or capabilitySlug are required" });
        if (body.approveWrite !== true) return json(res, 400, { error: "approveWrite_true_required" });
        const membership = await identities.getMembership(principal.userId, body.organizationId);
        if (!membership) return json(res, 404, { error: "organization_not_found" });
        if (membership.role === "viewer") return json(res, 403, { error: "organization_permission_denied" });
        const machine = await store.getMachine(body.machineId);
        if (!machine || machine.organizationId !== body.organizationId || machine.status !== "online") return json(res, 409, { error: "machine_not_available_in_organization" });
        if (!machine.capabilities?.some((capability) => capability.name === "capability-verify")) return json(res, 400, { error: "capability_verification_not_available" });
        const spec = await resolveVerificationCapabilitySpec(capabilityRegistry, body.organizationId, body);
        if (!spec) return json(res, 404, { error: "capability_not_found" });
        const harnessId = body.harnessId ?? "codex";
        const mode = body.mode ?? "artifact-context";
        if (harnessId !== "codex") return json(res, 400, { error: "capability_verification_harness_not_supported" });
        if (!["artifact-context", "native-discovery"].includes(mode)) return json(res, 400, { error: "capability_verification_mode_invalid" });
        const now = new Date().toISOString();
        const sessionId = crypto.randomUUID();
        const runId = `run_${crypto.randomUUID()}`;
        const prompt = JSON.stringify({
          mode,
          harnessId,
          approveWrite: true,
          spec,
          ...(body.targetRoot ? { targetRoot: body.targetRoot } : {}),
          ...(body.allowDegraded === true ? { allowDegraded: true } : {})
        });
        const session = {
          id: sessionId,
          organizationId: body.organizationId,
          createdBy: principal.userId,
          machineId: body.machineId,
          cwd: body.cwd,
          agent: "capability-verify",
          status: "queued",
          createdAt: now,
          updatedAt: now,
          messages: [{ id: crypto.randomUUID(), role: "user", text: `Verify ${spec.metadata.slug}@${spec.version} on ${harnessId} using ${mode}`, createdAt: now }],
          events: []
        };
        const run = {
          id: runId,
          organizationId: body.organizationId,
          machineId: body.machineId,
          sessionId,
          createdBy: principal.userId,
          capabilityId: spec.id,
          capabilityVersion: spec.version,
          capabilitySlug: spec.metadata.slug,
          harnessId,
          mode,
          cwd: body.cwd,
          status: "queued",
          receipt: null,
          createdAt: now,
          updatedAt: now
        };
        const command = { type: "server.command", commandId: crypto.randomUUID(), sessionId, action: "session.start", payload: { cwd: body.cwd, agent: "capability-verify", prompt } };
        const created = await capabilityVerifications.createWithSession(run, session, command);
        if (!commandRouter) {
          try { await sendCommand(body.machineId, command); }
          catch (error) {
            const failureEvent = { kind: "status", status: "failed", message: error.message, at: new Date().toISOString() };
            const failedSession = await store.addEvent(sessionId, failureEvent);
            const failedRun = await capabilityVerifications.updateFromSessionEvent(sessionId, failureEvent);
            if (failedSession) broadcast({ type: "session.updated", session: failedSession });
            if (failedRun) broadcast({ type: "capability.verification.updated", capabilityVerification: failedRun });
            return json(res, 409, { error: error.message, run: failedRun ?? created });
          }
        }
        broadcast({ type: "session.updated", session });
        broadcast({ type: "capability.verification.updated", capabilityVerification: created });
        return json(res, 202, created);
      }
      const capabilityVerificationInterruptMatch = url.pathname.match(/^\/api\/capability-verifications\/([^/]+)\/interrupt$/);
      if (req.method === "POST" && capabilityVerificationInterruptMatch && principal.kind === "user") {
        const body = await readJson(req);
        const organizationId = body.organizationId;
        if (!organizationId || !(await identities.getMembership(principal.userId, organizationId))) return json(res, 404, { error: "capability_verification_not_found" });
        const membership = await identities.getMembership(principal.userId, organizationId);
        if (membership.role === "viewer") return json(res, 403, { error: "organization_permission_denied" });
        const run = await capabilityVerifications.get(decodeURIComponent(capabilityVerificationInterruptMatch[1]), organizationId);
        if (!run) return json(res, 404, { error: "capability_verification_not_found" });
        try { await sendCommand(run.machineId, { type: "server.command", commandId: crypto.randomUUID(), sessionId: run.sessionId, action: "session.interrupt" }); }
        catch (error) { return json(res, 409, { error: error.message }); }
        return json(res, 202, { ok: true, runId: run.id, sessionId: run.sessionId });
      }
      const capabilityVerificationMatch = url.pathname.match(/^\/api\/capability-verifications\/([^/]+)$/);
      if (req.method === "GET" && capabilityVerificationMatch && principal.kind === "user") {
        const organizationId = url.searchParams.get("organizationId");
        if (!organizationId || !(await identities.getMembership(principal.userId, organizationId))) return json(res, 404, { error: "capability_verification_not_found" });
        const run = await capabilityVerifications.get(decodeURIComponent(capabilityVerificationMatch[1]), organizationId);
        return run ? json(res, 200, run) : json(res, 404, { error: "capability_verification_not_found" });
      }
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
      if (req.method === "GET" && url.pathname === "/api/shipping/runs" && principal.kind === "legacy") return json(res, 200, { runs: await store.listShippingRuns() });
      if (req.method === "GET" && url.pathname === "/api/shipping/runs" && principal.kind === "user") {
        const organizationId = url.searchParams.get("organizationId");
        if (!organizationId) return json(res, 400, { error: "organization_id_required" });
        if (!(await identities.getMembership(principal.userId, organizationId))) return json(res, 404, { error: "organization_not_found" });
        return json(res, 200, { runs: await store.listShippingRunsByOrganization(organizationId) });
      }
      const shippingRunMatch = url.pathname.match(/^\/api\/shipping\/runs\/([^/]+)$/);
      if (req.method === "GET" && shippingRunMatch) {
        const organizationId = principal.kind === "user" ? url.searchParams.get("organizationId") : null;
        if (principal.kind === "user" && (!organizationId || !(await identities.getMembership(principal.userId, organizationId)))) return json(res, 404, { error: "shipping_run_not_found" });
        const run = await store.getShippingRun(decodeURIComponent(shippingRunMatch[1]), organizationId);
        if (principal.kind === "user" && run?.organizationId !== organizationId) return json(res, 404, { error: "shipping_run_not_found" });
        return run ? json(res, 200, run) : json(res, 404, { error: "shipping_run_not_found" });
      }
      if (req.method === "POST" && url.pathname === "/api/shipping/contracts/validate") {
        const body = await readJson(req);
        const result = validateShippingContract(body.contract ?? body);
        return json(res, result.valid ? 200 : 400, result);
      }
      if (req.method === "POST" && url.pathname === "/api/shipping/runs" && ["legacy", "user"].includes(principal.kind)) {
        const body = await readJson(req);
        let organizationId = null;
        if (principal.kind === "user") {
          organizationId = body.organizationId;
          if (!organizationId) return json(res, 400, { error: "organization_id_required" });
          const membership = await identities.getMembership(principal.userId, organizationId);
          if (!membership) return json(res, 404, { error: "organization_not_found" });
          if (membership.role === "viewer") return json(res, 403, { error: "organization_permission_denied" });
        }
        const machine = await store.getMachine(body.machineId);
        if (organizationId && (!machine || machine.organizationId !== organizationId)) return json(res, 404, { error: "machine_not_found" });
        if (!machine || machine.status !== "online") return json(res, 409, { error: "machine_not_online" });
        if (!machine.shipping?.enabled) return json(res, 409, { error: "shipping_not_enabled_on_machine" });
        const validation = validateShippingContract(body.contract);
        if (!validation.valid) return json(res, 400, { error: "shipping_contract_invalid", details: validation.errors });
        const runId = body.runId?.trim() || `ship-${crypto.randomUUID()}`;
        if (await store.getShippingRun(runId)) return json(res, 409, { error: "shipping_run_exists" });
        const now = new Date().toISOString();
        let queued = {
          version: "shipping-run-remote/v1",
          runId,
          ...(organizationId ? { organizationId, createdBy: principal.userId } : {}),
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
        const command = { type: "server.command", commandId: crypto.randomUUID(), sessionId: `shipping:${runId}`, action: "shipping.start", payload: { runId, contract: body.contract } };
        if (commandRouter) queued = await store.upsertShippingRunWithCommand(queued, command);
        else {
          queued = await store.upsertShippingRun(queued);
          try { await sendCommand(machine.id, command); }
          catch (error) {
            queued = { ...queued, state: "FAILED", fatalError: error.message, updatedAt: new Date().toISOString() };
            queued = await store.upsertShippingRun(queued); broadcast({ type: "shipping.run.updated", run: queued });
            return json(res, 409, { error: error.message, run: queued });
          }
        }
        broadcast({ type: "shipping.run.updated", run: queued });
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
        const command = { type: "server.command", commandId: crypto.randomUUID(), sessionId: session.id, action: "session.start", payload: { cwd: body.cwd, agent: body.agent, model: body.model || undefined, prompt: body.prompt.trim() } };
        if (commandRouter) await store.createSessionWithCommand(session, command);
        else {
          await store.createSession(session);
          try { await sendCommand(body.machineId, command); }
          catch (error) { const failed = await store.setSessionStatus(session.id, "failed"); broadcast({ type: "session.updated", session: failed }); return json(res, 409, { error: error.message, session: failed }); }
        }
        broadcast({ type: "session.updated", session });
        return json(res, 201, session);
      }
      const messageMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
      if (req.method === "POST" && messageMatch && principal.kind === "legacy") {
        const session = await store.getSession(decodeURIComponent(messageMatch[1]));
        if (!session) return json(res, 404, { error: "session_not_found" });
        const body = await readJson(req); const text = body.text?.trim();
        if (!text) return json(res, 400, { error: "text is required" });
        const message = { id: crypto.randomUUID(), role: "user", text, createdAt: new Date().toISOString() };
        const command = { type: "server.command", commandId: crypto.randomUUID(), sessionId: session.id, action: "session.message", payload: { prompt: text } };
        const updated = commandRouter ? await store.addMessageWithCommand(session.id, message, command) : await store.addMessage(session.id, message);
        broadcast({ type: "session.updated", session: updated });
        if (!commandRouter) {
          try { await sendCommand(session.machineId, command); }
          catch (error) { return json(res, 409, { error: error.message }); }
        }
        return json(res, 202, updated);
      }
      const interruptMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/interrupt$/);
      if (req.method === "POST" && interruptMatch && principal.kind === "legacy") {
        const session = await store.getSession(decodeURIComponent(interruptMatch[1])); if (!session) return json(res, 404, { error: "session_not_found" });
        try { await sendCommand(session.machineId, { type: "server.command", commandId: crypto.randomUUID(), sessionId: session.id, action: "session.interrupt" }); }
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
        const command = { type: "server.command", commandId: crypto.randomUUID(), sessionId: session.id, action: "session.start", payload: { cwd: body.cwd, agent: body.agent, model: body.model || undefined, prompt: body.prompt.trim() } };
        if (commandRouter) await store.createSessionWithCommand(session, command);
        else {
          await store.createSession(session);
          try { await sendCommand(body.machineId, command); }
          catch (error) { const failed = await store.setSessionStatus(session.id, "failed"); broadcast({ type: "session.updated", session: failed }); return json(res, 409, { error: error.message, session: failed }); }
        }
        broadcast({ type: "session.updated", session });
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
        const userMessage = { id: crypto.randomUUID(), role: "user", text: message, createdAt: new Date().toISOString() };
        const command = { type: "server.command", commandId: crypto.randomUUID(), sessionId: session.id, action: "session.message", payload: { prompt: message } };
        const updated = commandRouter ? await store.addMessageWithCommand(session.id, userMessage, command) : await store.addMessage(session.id, userMessage);
        broadcast({ type: "session.updated", session: updated });
        if (!commandRouter) {
          try { await sendCommand(session.machineId, command); }
          catch (error) { return json(res, 409, { error: error.message }); }
        }
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
        try { await sendCommand(session.machineId, { type: "server.command", commandId: crypto.randomUUID(), sessionId: session.id, action: "session.interrupt" }); }
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
        const requestedCursor = url.searchParams.get("cursor");
        const clientCursor = requestedCursor === null ? null : cursorCodec?.decode(requestedCursor) ?? null;
        const clientState = { principal: clientPrincipal, resyncing: true, pendingEvents: [], lastSentEventId: clientCursor };
        clientSockets.set(peer, clientState);
        peer.on("error", (error) => {
          clientSockets.delete(peer);
          console.warn("[api] client websocket peer error", error.message);
        });
        if (clientPrincipal.kind === "user") {
          const remaining = Math.max(0, Date.parse(clientPrincipal.expiresAt) - Date.now());
          const expiry = setTimeout(() => peer.close(1008, "session_expired"), remaining);
          expiry.unref?.();
          peer.on("close", () => clearTimeout(expiry));
        }
        peer.on("close", () => clientSockets.delete(peer));
        if (eventFanout && Number.isSafeInteger(clientCursor)) void replayClient(peer, clientState, clientCursor);
        else void resyncClient(peer, clientState);
        return;
      }
      let machineId;
      peer.on("message", (raw) => {
        const messageTask = (async () => {
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
            const session = await store.addEvent(msg.sessionId, msg.event);
            broadcast({ type: "session.updated", session });
            const verification = await capabilityVerifications.updateFromSessionEvent(msg.sessionId, msg.event);
            if (verification) broadcast({ type: "capability.verification.updated", capabilityVerification: verification });
            return;
          }
          if (msg.type === "daemon.shipping.run") {
            const run = { ...msg.run, machineId, ...(daemonPrincipal.kind === "machine" ? { organizationId: daemonPrincipal.organizationId } : {}) };
            const persistedRun = daemonPrincipal.kind === "machine"
              ? await store.updateShippingRunFromMachine(run)
              : await store.upsertShippingRun(run);
            if (persistedRun) broadcast({ type: "shipping.run.updated", run: persistedRun }); return;
          }
          if (msg.type === "daemon.command.ack") {
            await commandRouter?.acknowledge(machineId, msg);
            return;
          }
        } catch (error) { console.warn("[api] invalid daemon message", error.message); }
        })();
        pendingDaemonMessageTasks.add(messageTask);
        void messageTask.finally(() => pendingDaemonMessageTasks.delete(messageTask));
      });
      peer.on("close", () => {
        const closeTask = (async () => {
          if (!machineId || daemonSockets.get(machineId) !== peer) return;
          daemonSockets.delete(machineId);
          const machine = await store.markMachineOffline(machineId);
          if (machine) broadcast({ type: "machine.updated", machine });
        })().catch((error) => console.warn("[api] machine disconnect update failed", error.message));
        pendingDaemonCloseTasks.add(closeTask);
        void closeTask.finally(() => pendingDaemonCloseTasks.delete(closeTask));
      });
      peer.on("error", (error) => console.warn("[api] websocket peer error", error.message));
    })().catch(() => socket.destroy());
  });

  return {
    server, store,
    listen: () => new Promise((resolve) => server.listen(port, host, resolve)),
    close: async () => {
      const serverClosed = new Promise((resolve) => server.close(resolve));
      clearInterval(machineStaleTimer);
      await commandRouter?.close();
      for (const peer of daemonSockets.values()) peer.close(1001, "server_shutdown");
      for (const peer of clientSockets.keys()) peer.close(1001, "server_shutdown");
      await serverClosed;
      while (pendingDaemonCloseTasks.size || pendingDaemonMessageTasks.size) {
        await Promise.all([...pendingDaemonCloseTasks, ...pendingDaemonMessageTasks]);
      }
      await eventFanout?.close();
    }
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
    || pathname === "/api/capabilities" || /^\/api\/capabilities\/[^/]+$/.test(pathname)
    || pathname === "/api/capability-verifications" || /^\/api\/capability-verifications\/[^/]+(?:\/interrupt)?$/.test(pathname)
    || pathname === "/api/shipping/example" || pathname === "/api/shipping/runs" || /^\/api\/shipping\/runs\/[^/]+$/.test(pathname)
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
