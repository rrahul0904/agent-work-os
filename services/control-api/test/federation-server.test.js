import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createFederationApi } from "../src/federation-server.js";

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-federation-api-"));
  const app = await createFederationApi({
    statePath: path.join(dir, "federation.json"),
    host: "127.0.0.1",
    port: 0,
    token: "test-control-token"
  });
  const address = await app.listen();
  t.after(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  return { app, baseUrl: `http://127.0.0.1:${address.port}` };
}

const auth = {
  authorization: "Bearer test-control-token",
  "content-type": "application/json"
};

const actorHeaders = (agentId, operatorId) => ({
  ...auth,
  "x-agent-id": agentId,
  "x-operator-id": operatorId
});

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined };
}

async function register(baseUrl, agentId, operatorId, displayName) {
  const result = await request(baseUrl, "/api/federation/agents", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ agentId, operatorId, displayName })
  });
  assert.equal(result.status, 201);
  return result.body;
}

test("federation HTTP API keeps writes behind control token and private-project reads behind authenticated actor context", async (t) => {
  const { baseUrl } = await fixture(t);

  const unauthorized = await request(baseUrl, "/api/federation/agents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId: "owner", operatorId: "op-owner", displayName: "Owner" })
  });
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.body.error, "control_token_required");

  const owner = await register(baseUrl, "owner", "op-owner", "Owner");
  const member = await register(baseUrl, "member", "op-member", "Member");

  const discovery = await request(baseUrl, "/api/federation/agents");
  assert.equal(discovery.status, 200);
  assert.deepEqual(discovery.body.agents.map((agent) => agent.id).sort(), ["member", "owner"]);

  const created = await request(baseUrl, "/api/federation/projects", {
    method: "POST",
    headers: actorHeaders(owner.id, owner.operatorId),
    body: JSON.stringify({ title: "Private federation", visibility: "private" })
  });
  assert.equal(created.status, 201);
  const projectId = created.body.id;

  const anonymousProject = await request(baseUrl, `/api/federation/projects/${projectId}`);
  assert.equal(anonymousProject.status, 403);
  assert.equal(anonymousProject.body.error, "project_access_denied");

  const doc = await request(baseUrl, `/api/federation/projects/${projectId}/documents/architecture`, {
    method: "PUT",
    headers: actorHeaders(owner.id, owner.operatorId),
    body: JSON.stringify({
      title: "Architecture",
      body: "v1",
      baseVersion: 0,
      visibility: "public"
    })
  });
  assert.equal(doc.status, 200);
  assert.equal(doc.body.currentVersion, 1);

  // A document cannot make its private parent project public.
  const anonymousDoc = await request(baseUrl, "/api/federation/documents/architecture");
  assert.equal(anonymousDoc.status, 403);
  assert.equal(anonymousDoc.body.error, "project_access_denied");

  const spoofedActorWithoutToken = await request(baseUrl, `/api/federation/projects/${projectId}`, {
    headers: { "x-agent-id": owner.id, "x-operator-id": owner.operatorId }
  });
  assert.equal(spoofedActorWithoutToken.status, 401);
  assert.equal(spoofedActorWithoutToken.body.error, "control_token_required");

  const invitation = await request(baseUrl, `/api/federation/projects/${projectId}/invitations`, {
    method: "POST",
    headers: actorHeaders(owner.id, owner.operatorId),
    body: JSON.stringify({ targetAgentId: member.id, role: "member" })
  });
  assert.equal(invitation.status, 201);

  const accepted = await request(baseUrl, `/api/federation/invitations/${invitation.body.id}/accept`, {
    method: "POST",
    headers: actorHeaders(member.id, member.operatorId),
    body: JSON.stringify({})
  });
  assert.equal(accepted.status, 200);

  const memberRead = await request(baseUrl, "/api/federation/documents/architecture", {
    headers: actorHeaders(member.id, member.operatorId)
  });
  assert.equal(memberRead.status, 200);
  assert.equal(memberRead.body.body, "v1");

  const v2 = await request(baseUrl, `/api/federation/projects/${projectId}/documents/architecture`, {
    method: "PUT",
    headers: actorHeaders(member.id, member.operatorId),
    body: JSON.stringify({ title: "Architecture", body: "v2", baseVersion: 1, visibility: "team" })
  });
  assert.equal(v2.status, 200);
  assert.equal(v2.body.currentVersion, 2);

  const stale = await request(baseUrl, `/api/federation/projects/${projectId}/documents/architecture`, {
    method: "PUT",
    headers: actorHeaders(owner.id, owner.operatorId),
    body: JSON.stringify({ title: "Architecture", body: "stale", baseVersion: 1, visibility: "team" })
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, "document_version_conflict");
});

test("public project discovery stays read-only while decision writes remain actor and token gated", async (t) => {
  const { baseUrl } = await fixture(t);
  const owner = await register(baseUrl, "owner-public", "op-owner-public", "Public Owner");

  const created = await request(baseUrl, "/api/federation/projects", {
    method: "POST",
    headers: actorHeaders(owner.id, owner.operatorId),
    body: JSON.stringify({ title: "Public federation", visibility: "public" })
  });
  assert.equal(created.status, 201);

  const publicList = await request(baseUrl, "/api/federation/projects");
  assert.equal(publicList.status, 200);
  assert.equal(publicList.body.projects.length, 1);
  assert.equal(publicList.body.projects[0].members, undefined);

  const anonymousProject = await request(baseUrl, `/api/federation/projects/${created.body.id}`);
  assert.equal(anonymousProject.status, 200);
  assert.equal(anonymousProject.body.members, undefined);

  const deniedDecision = await request(baseUrl, `/api/federation/projects/${created.body.id}/decisions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "No", body: "Anonymous writes are forbidden" })
  });
  assert.equal(deniedDecision.status, 401);

  const decision = await request(baseUrl, `/api/federation/projects/${created.body.id}/decisions`, {
    method: "POST",
    headers: actorHeaders(owner.id, owner.operatorId),
    body: JSON.stringify({ title: "Use receipt-bound decisions", body: "Yes", evidenceRefs: ["receipt://test"] })
  });
  assert.equal(decision.status, 201);
  assert.match(decision.body.digest, /^[a-f0-9]{64}$/);

  const publicDecisions = await request(baseUrl, `/api/federation/projects/${created.body.id}/decisions`);
  assert.equal(publicDecisions.status, 200);
  assert.equal(publicDecisions.body.decisions[0].digest, decision.body.digest);
});
