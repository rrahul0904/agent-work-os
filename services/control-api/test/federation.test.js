import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { FederationStore } from "../src/federation.js";

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-federation-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "federation.json");
  const store = new FederationStore(file);
  await store.load();
  return { store, file };
}

const actor = (agent) => ({ agentId: agent.id, operatorId: agent.operatorId });

async function seed(t) {
  const { store, file } = await fixture(t);
  const owner = await store.registerAgent({
    agentId: "agent-owner",
    operatorId: "operator-owner",
    displayName: "Owner Agent",
    model: "codex",
    capabilities: ["code", "review"]
  });
  const remote = await store.registerAgent({
    agentId: "agent-remote",
    operatorId: "operator-remote",
    displayName: "Remote Agent",
    model: "claude",
    capabilities: ["research"]
  });
  const maintainer = await store.registerAgent({
    agentId: "agent-maintainer",
    operatorId: "operator-maintainer",
    displayName: "Maintainer Agent"
  });
  await store.verifyAgent(owner.id, {
    verifierOperatorId: "operator-verifier",
    evidenceRefs: ["receipt://local-runtime/owner"]
  });
  return { store, file, owner: store.getAgent(owner.id), remote, maintainer };
}

test("federated project flow enforces explicit membership and optimistic document concurrency", async (t) => {
  const { store, file, owner, remote, maintainer } = await seed(t);
  assert.equal(owner.verificationStatus, "verified");
  assert.equal(remote.verificationStatus, "unverified");

  const project = await store.createProject(actor(owner), {
    title: "Agent Federation Research",
    visibility: "private"
  });

  assert.throws(() => store.getProject(project.id), /project_access_denied/);
  assert.deepEqual(store.listPublicProjects(), []);
  assert.deepEqual(store.listDocuments(project.id), []);

  const remoteInvite = await store.inviteMember(project.id, actor(owner), remote.id, "member");
  await assert.rejects(
    store.putDocument(project.id, actor(remote), { title: "Before membership", body: "no", baseVersion: 0 }),
    /project_write_forbidden/
  );
  await assert.rejects(store.acceptInvitation(remoteInvite.id, actor(owner)), /project_invitation_actor_mismatch/);
  await store.acceptInvitation(remoteInvite.id, actor(remote));

  const maintainerInvite = await store.inviteMember(project.id, actor(owner), maintainer.id, "maintainer");
  await store.acceptInvitation(maintainerInvite.id, actor(maintainer));

  const v1 = await store.putDocument(project.id, actor(owner), {
    documentId: "doc-architecture",
    title: "Architecture",
    body: "v1 owner draft",
    summary: "initial draft",
    baseVersion: 0,
    visibility: "team"
  });
  assert.equal(v1.currentVersion, 1);

  const v2 = await store.putDocument(project.id, actor(remote), {
    documentId: v1.id,
    title: "Architecture",
    body: "v2 member contribution",
    summary: "member refinement",
    baseVersion: 1,
    visibility: "team"
  });
  assert.equal(v2.currentVersion, 2);

  const v3 = await store.putDocument(project.id, actor(owner), {
    documentId: v1.id,
    title: "Architecture",
    body: "v3 owner parallel edit",
    summary: "owner edit",
    baseVersion: 2,
    visibility: "team"
  });
  assert.equal(v3.currentVersion, 3);

  await assert.rejects(
    store.putDocument(project.id, actor(remote), {
      documentId: v1.id,
      title: "Architecture",
      body: "stale edit",
      baseVersion: 2,
      visibility: "team"
    }),
    /document_version_conflict/
  );

  const latest = store.getDocument(v1.id, actor(remote));
  assert.equal(latest.currentVersion, 3);
  assert.equal(latest.body, "v3 owner parallel edit");

  const v4 = await store.putDocument(project.id, actor(remote), {
    documentId: v1.id,
    title: "Architecture",
    body: "v4 merged result",
    summary: "reread and merged",
    baseVersion: 3,
    visibility: "team"
  });
  assert.equal(v4.currentVersion, 4);

  const decision = await store.recordDecision(project.id, actor(maintainer), {
    title: "Adopt federated project receipts",
    body: "Use optimistic document versions and evidence-bound decisions.",
    documentRefs: [{ documentId: v1.id, version: 4 }],
    evidenceRefs: ["receipt://ci/planned"]
  });
  assert.equal(decision.documentRefs[0].version, 4);
  assert.equal(decision.documentRefs[0].digest, v4.currentDigest);
  assert.match(decision.digest, /^[a-f0-9]{64}$/);

  await store.removeMember(project.id, actor(owner), remote.id);
  await assert.rejects(
    store.putDocument(project.id, actor(remote), {
      documentId: v1.id,
      title: "Architecture",
      body: "should be blocked",
      baseVersion: 4,
      visibility: "team"
    }),
    /project_write_forbidden/
  );
  assert.throws(() => store.getDocument(v1.id, actor(remote)), /document_access_denied/);

  const beforeReload = store.snapshot();
  const reloaded = new FederationStore(file);
  await reloaded.load();
  const afterReload = reloaded.snapshot();
  assert.equal(afterReload.agents[owner.id].digest, beforeReload.agents[owner.id].digest);
  assert.equal(afterReload.projects[project.id].revision, beforeReload.projects[project.id].revision);
  assert.equal(afterReload.documents[v1.id].currentVersion, beforeReload.documents[v1.id].currentVersion);
  assert.equal(reloaded.getDocument(v1.id, actor(owner), { version: 4 }).digest, v4.currentDigest);
  assert.equal(reloaded.listDecisions(project.id, actor(owner))[0].digest, decision.digest);
});

test("public discovery and profiles never grant project authority", async (t) => {
  const { store, owner, remote } = await seed(t);
  const project = await store.createProject(actor(owner), { title: "Public Research", visibility: "public" });
  const doc = await store.putDocument(project.id, actor(owner), {
    documentId: "doc-public",
    title: "Public note",
    body: "readable by discovery",
    baseVersion: 0,
    visibility: "public"
  });

  assert.equal(store.listPublicProjects()[0].id, project.id);
  assert.equal(store.getProject(project.id).members, undefined);
  assert.equal(store.getDocument(doc.id).body, "readable by discovery");
  await assert.rejects(
    store.putDocument(project.id, actor(remote), {
      documentId: doc.id,
      title: "Public note",
      body: "discovery must not write",
      baseVersion: 1,
      visibility: "public"
    }),
    /project_write_forbidden/
  );
});

test("operator mismatch, self verification, role escalation and team data leakage fail closed", async (t) => {
  const { store, owner, remote, maintainer } = await seed(t);
  await assert.rejects(
    store.updateAgent(remote.id, { agentId: remote.id, operatorId: "operator-attacker" }, { description: "hijack" }),
    /actor_operator_mismatch/
  );
  await assert.rejects(
    store.verifyAgent(remote.id, { verifierOperatorId: remote.operatorId, evidenceRefs: ["self"] }),
    /self_verification_forbidden/
  );

  const project = await store.createProject(actor(owner), { title: "Private Work", visibility: "private" });
  const memberInvite = await store.inviteMember(project.id, actor(owner), remote.id, "member");
  await store.acceptInvitation(memberInvite.id, actor(remote));
  const maintainerInvite = await store.inviteMember(project.id, actor(owner), maintainer.id, "maintainer");
  await store.acceptInvitation(maintainerInvite.id, actor(maintainer));

  await assert.rejects(
    store.inviteMember(project.id, actor(remote), "missing", "member"),
    /agent_not_found|project_invite_forbidden/
  );
  await assert.rejects(store.changeRole(project.id, actor(remote), remote.id, "maintainer"), /project_owner_required/);
  await assert.rejects(store.changeRole(project.id, actor(owner), remote.id, "owner"), /project_role_invalid/);

  const teamDoc = await store.putDocument(project.id, actor(owner), {
    documentId: "doc-team",
    title: "Team only",
    body: "secret-ish project context",
    baseVersion: 0,
    visibility: "team"
  });
  assert.throws(() => store.getDocument(teamDoc.id), /document_access_denied/);
  assert.throws(() => store.getProject(project.id), /project_access_denied/);
});

test("digest validation detects persisted artifact tampering", async (t) => {
  const { store, file, owner } = await seed(t);
  const project = await store.createProject(actor(owner), { title: "Integrity", visibility: "private" });
  await store.putDocument(project.id, actor(owner), {
    documentId: "doc-integrity",
    title: "Integrity",
    body: "original",
    baseVersion: 0,
    visibility: "team"
  });

  const parsed = JSON.parse(await readFile(file, "utf8"));
  parsed.documents["doc-integrity"].versions[0].body = "tampered";
  await writeFile(file, JSON.stringify(parsed));
  const reloaded = new FederationStore(file);
  await assert.rejects(reloaded.load(), /federation_document_body_digest_mismatch/);
});
