import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const PROFILE_NAME_MAX = 120;
const DESCRIPTION_MAX = 2_000;
const DOC_BODY_MAX = 200_000;
const DOC_TITLE_MAX = 160;
const DECISION_BODY_MAX = 20_000;
const ALLOWED_PROJECT_ROLES = new Set(["owner", "maintainer", "member"]);
const INVITABLE_ROLES = new Set(["maintainer", "member"]);
const VISIBILITIES = new Set(["private", "public"]);
const DOC_VISIBILITIES = new Set(["team", "public"]);

export class FederationStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = freshState();
    this.writeChain = Promise.resolve();
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8"));
      this.state = normalizeState(parsed);
      validateStateDigests(this.state);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return this.snapshot();
  }

  snapshot() {
    return structuredClone(this.state);
  }

  listPublicProfiles() {
    return Object.values(this.state.agents)
      .map(publicAgent)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  getAgent(agentId) {
    const agent = this.state.agents[agentId];
    return agent ? publicAgent(agent) : undefined;
  }

  async registerAgent(input = {}) {
    const operatorId = cleanRequired(input.operatorId, 120, "operator_id_required");
    const displayName = cleanRequired(input.displayName, PROFILE_NAME_MAX, "display_name_required");
    const agentId = cleanOptional(input.agentId, 160) || crypto.randomUUID();
    if (this.state.agents[agentId]) throw new Error("agent_id_exists");
    const now = nowIso();
    const agent = {
      id: agentId,
      operatorId,
      displayName,
      description: cleanOptional(input.description, DESCRIPTION_MAX),
      model: cleanOptional(input.model, 160),
      capabilities: normalizeStringList(input.capabilities, 64, 120),
      links: normalizeStringList(input.links, 16, 500),
      verificationStatus: "unverified",
      verification: undefined,
      revision: 1,
      createdAt: now,
      updatedAt: now
    };
    agent.digest = profileDigest(agent);
    this.state.agents[agentId] = agent;
    await this.#persist();
    return publicAgent(agent);
  }

  async updateAgent(agentId, actor, patch = {}) {
    const agent = this.#agent(agentId);
    assertOperatorMatch(agent, actor);
    const next = structuredClone(agent);
    if (patch.displayName !== undefined) next.displayName = cleanRequired(patch.displayName, PROFILE_NAME_MAX, "display_name_required");
    if (patch.description !== undefined) next.description = cleanOptional(patch.description, DESCRIPTION_MAX);
    if (patch.model !== undefined) next.model = cleanOptional(patch.model, 160);
    if (patch.capabilities !== undefined) next.capabilities = normalizeStringList(patch.capabilities, 64, 120);
    if (patch.links !== undefined) next.links = normalizeStringList(patch.links, 16, 500);
    next.revision += 1;
    next.updatedAt = nowIso();
    next.verificationStatus = "unverified";
    next.verification = undefined;
    next.digest = profileDigest(next);
    this.state.agents[agentId] = next;
    await this.#persist();
    return publicAgent(next);
  }

  async verifyAgent(agentId, input = {}) {
    const agent = this.#agent(agentId);
    const verifierOperatorId = cleanRequired(input.verifierOperatorId, 120, "verifier_operator_id_required");
    if (verifierOperatorId === agent.operatorId) throw new Error("self_verification_forbidden");
    const evidenceRefs = normalizeStringList(input.evidenceRefs, 32, 500);
    if (!evidenceRefs.length) throw new Error("verification_evidence_required");
    const verifiedAt = nowIso();
    agent.verificationStatus = "verified";
    agent.verification = {
      verifierOperatorId,
      evidenceRefs,
      profileDigest: agent.digest,
      verifiedAt,
      receiptDigest: digest(canonicalJson({ agentId, verifierOperatorId, evidenceRefs, profileDigest: agent.digest, verifiedAt }))
    };
    await this.#persist();
    return publicAgent(agent);
  }

  async createProject(actor, input = {}) {
    const actorAgent = this.#actor(actor);
    const title = cleanRequired(input.title, 160, "project_title_required");
    const slug = normalizeSlug(input.slug || title);
    if (!slug) throw new Error("project_slug_invalid");
    if (Object.values(this.state.projects).some((project) => project.slug === slug)) throw new Error("project_slug_exists");
    const visibility = String(input.visibility ?? "private").toLowerCase();
    if (!VISIBILITIES.has(visibility)) throw new Error("project_visibility_invalid");
    const now = nowIso();
    const project = {
      id: crypto.randomUUID(),
      slug,
      title,
      description: cleanOptional(input.description, DESCRIPTION_MAX),
      visibility,
      ownerAgentId: actorAgent.id,
      revision: 1,
      members: { [actorAgent.id]: membership(actorAgent, "owner", now) },
      createdAt: now,
      updatedAt: now
    };
    this.state.projects[project.id] = project;
    await this.#persist();
    return publicProject(project, actorAgent.id);
  }

  listPublicProjects() {
    return Object.values(this.state.projects)
      .filter((project) => project.visibility === "public")
      .map((project) => publicProject(project))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getProject(projectId, actor) {
    const project = this.#project(projectId);
    const actorAgent = actor ? this.#actor(actor) : undefined;
    if (project.visibility !== "public" && !actorAgent?.id) throw new Error("project_access_denied");
    if (project.visibility !== "public" && !project.members[actorAgent.id]) throw new Error("project_access_denied");
    return publicProject(project, actorAgent?.id);
  }

  async inviteMember(projectId, actor, targetAgentId, role = "member") {
    const project = this.#project(projectId);
    const actorAgent = this.#actor(actor);
    const target = this.#agent(targetAgentId);
    const actorRole = this.#projectRole(project, actorAgent.id);
    const normalizedRole = String(role).toLowerCase();
    if (!INVITABLE_ROLES.has(normalizedRole)) throw new Error("project_role_invalid");
    if (actorRole !== "owner" && !(actorRole === "maintainer" && normalizedRole === "member")) throw new Error("project_invite_forbidden");
    if (project.members[target.id]) throw new Error("project_member_exists");
    const pending = Object.values(this.state.invitations).find((invite) => invite.projectId === projectId && invite.targetAgentId === target.id && invite.status === "pending");
    if (pending) throw new Error("project_invitation_pending");
    const now = nowIso();
    const invitation = {
      id: crypto.randomUUID(), projectId, targetAgentId: target.id, role: normalizedRole,
      invitedByAgentId: actorAgent.id, status: "pending", createdAt: now, updatedAt: now
    };
    invitation.digest = inviteDigest(invitation);
    this.state.invitations[invitation.id] = invitation;
    await this.#persist();
    return structuredClone(invitation);
  }

  async acceptInvitation(invitationId, actor) {
    const invitation = this.#invitation(invitationId);
    const actorAgent = this.#actor(actor);
    if (invitation.targetAgentId !== actorAgent.id) throw new Error("project_invitation_actor_mismatch");
    if (invitation.status !== "pending") throw new Error("project_invitation_not_pending");
    if (inviteDigest(invitation) !== invitation.digest) throw new Error("project_invitation_digest_mismatch");
    const project = this.#project(invitation.projectId);
    if (project.members[actorAgent.id]) throw new Error("project_member_exists");
    const now = nowIso();
    invitation.status = "accepted";
    invitation.acceptedAt = now;
    invitation.updatedAt = now;
    project.members[actorAgent.id] = membership(actorAgent, invitation.role, now);
    bumpProject(project, now);
    await this.#persist();
    return publicProject(project, actorAgent.id);
  }

  async removeMember(projectId, actor, targetAgentId) {
    const project = this.#project(projectId);
    const actorAgent = this.#actor(actor);
    if (this.#projectRole(project, actorAgent.id) !== "owner") throw new Error("project_owner_required");
    if (targetAgentId === project.ownerAgentId) throw new Error("project_owner_removal_forbidden");
    if (!project.members[targetAgentId]) throw new Error("project_member_not_found");
    delete project.members[targetAgentId];
    bumpProject(project);
    await this.#persist();
    return publicProject(project, actorAgent.id);
  }

  async changeRole(projectId, actor, targetAgentId, role) {
    const project = this.#project(projectId);
    const actorAgent = this.#actor(actor);
    if (this.#projectRole(project, actorAgent.id) !== "owner") throw new Error("project_owner_required");
    if (targetAgentId === project.ownerAgentId) throw new Error("project_owner_role_fixed");
    const targetMembership = project.members[targetAgentId];
    if (!targetMembership) throw new Error("project_member_not_found");
    const normalizedRole = String(role).toLowerCase();
    if (!["maintainer", "member"].includes(normalizedRole)) throw new Error("project_role_invalid");
    targetMembership.role = normalizedRole;
    targetMembership.updatedAt = nowIso();
    bumpProject(project, targetMembership.updatedAt);
    await this.#persist();
    return publicProject(project, actorAgent.id);
  }

  listDocuments(projectId, actor) {
    const project = this.#project(projectId);
    const actorAgent = actor ? this.#actor(actor) : undefined;
    const member = actorAgent ? project.members[actorAgent.id] : undefined;
    return Object.values(this.state.documents)
      .filter((doc) => doc.projectId === projectId)
      .filter((doc) => doc.visibility === "public" || Boolean(member))
      .map((doc) => publicDocument(doc, { includeBody: false }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  getDocument(documentId, actor, { version } = {}) {
    const doc = this.#document(documentId);
    const project = this.#project(doc.projectId);
    const actorAgent = actor ? this.#actor(actor) : undefined;
    if (doc.visibility !== "public" && !actorAgent) throw new Error("document_access_denied");
    if (doc.visibility !== "public" && !project.members[actorAgent.id]) throw new Error("document_access_denied");
    if (version === undefined) return publicDocument(doc, { includeBody: true });
    const revision = doc.versions.find((candidate) => candidate.version === Number(version));
    if (!revision) throw new Error("document_version_not_found");
    return structuredClone({ ...revision, documentId: doc.id, projectId: doc.projectId, title: doc.title, visibility: doc.visibility });
  }

  async putDocument(projectId, actor, input = {}) {
    const project = this.#project(projectId);
    const actorAgent = this.#actor(actor);
    assertProjectWriter(project, actorAgent.id);
    const documentId = cleanOptional(input.documentId, 160) || crypto.randomUUID();
    const title = cleanRequired(input.title, DOC_TITLE_MAX, "document_title_required");
    const body = String(input.body ?? "");
    if (!body.trim()) throw new Error("document_body_required");
    if (body.length > DOC_BODY_MAX) throw new Error("document_body_too_large");
    const visibility = String(input.visibility ?? "team").toLowerCase();
    if (!DOC_VISIBILITIES.has(visibility)) throw new Error("document_visibility_invalid");
    const existing = this.state.documents[documentId];
    if (existing && existing.projectId !== projectId) throw new Error("document_project_mismatch");
    const baseVersion = Number(input.baseVersion ?? 0);
    const currentVersion = existing?.currentVersion ?? 0;
    if (!Number.isInteger(baseVersion) || baseVersion < 0) throw new Error("document_base_version_invalid");
    if (baseVersion !== currentVersion) throw new Error("document_version_conflict");
    const now = nowIso();
    const version = currentVersion + 1;
    const summary = cleanOptional(input.summary, 2_000);
    const revisionBody = {
      documentId, projectId, version, baseVersion, title, visibility,
      bodyHash: digest(body), summary, authorAgentId: actorAgent.id,
      authorOperatorId: actorAgent.operatorId, createdAt: now
    };
    const revision = { ...revisionBody, body, digest: digest(canonicalJson(revisionBody)) };
    const doc = existing ?? { id: documentId, projectId, versions: [], createdAt: now };
    doc.title = title;
    doc.visibility = visibility;
    doc.currentVersion = version;
    doc.versions.push(revision);
    doc.updatedAt = now;
    this.state.documents[documentId] = doc;
    bumpProject(project, now);
    await this.#persist();
    return publicDocument(doc, { includeBody: true });
  }

  async recordDecision(projectId, actor, input = {}) {
    const project = this.#project(projectId);
    const actorAgent = this.#actor(actor);
    const role = this.#projectRole(project, actorAgent.id);
    if (!["owner", "maintainer"].includes(role)) throw new Error("project_decision_forbidden");
    const title = cleanRequired(input.title, 200, "decision_title_required");
    const body = cleanRequired(input.body, DECISION_BODY_MAX, "decision_body_required");
    const documentRefs = normalizeDocumentRefs(input.documentRefs, this.state.documents, projectId);
    const evidenceRefs = normalizeStringList(input.evidenceRefs, 64, 500);
    const now = nowIso();
    const receiptBody = {
      projectId, projectRevision: project.revision, actorAgentId: actorAgent.id,
      actorOperatorId: actorAgent.operatorId, title, body, documentRefs, evidenceRefs, createdAt: now
    };
    const decision = { id: crypto.randomUUID(), ...receiptBody, digest: digest(canonicalJson(receiptBody)) };
    this.state.decisions[decision.id] = decision;
    bumpProject(project, now);
    await this.#persist();
    return structuredClone(decision);
  }

  listDecisions(projectId, actor) {
    const project = this.#project(projectId);
    const actorAgent = actor ? this.#actor(actor) : undefined;
    if (project.visibility !== "public" && !actorAgent) throw new Error("project_access_denied");
    if (project.visibility !== "public" && !project.members[actorAgent.id]) throw new Error("project_access_denied");
    return Object.values(this.state.decisions)
      .filter((decision) => decision.projectId === projectId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((decision) => structuredClone(decision));
  }

  #actor(actor) {
    const agentId = cleanRequired(actor?.agentId, 160, "actor_agent_id_required");
    const agent = this.#agent(agentId);
    assertOperatorMatch(agent, actor);
    return agent;
  }

  #agent(agentId) {
    const agent = this.state.agents[agentId];
    if (!agent) throw new Error("agent_not_found");
    return agent;
  }

  #project(projectId) {
    const project = this.state.projects[projectId];
    if (!project) throw new Error("project_not_found");
    return project;
  }

  #invitation(invitationId) {
    const invitation = this.state.invitations[invitationId];
    if (!invitation) throw new Error("project_invitation_not_found");
    return invitation;
  }

  #document(documentId) {
    const doc = this.state.documents[documentId];
    if (!doc) throw new Error("document_not_found");
    return doc;
  }

  #projectRole(project, agentId) {
    const role = project.members[agentId]?.role;
    if (!role || !ALLOWED_PROJECT_ROLES.has(role)) throw new Error("project_member_required");
    return role;
  }

  async #persist() {
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
      await writeFile(tmp, `${JSON.stringify(this.state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(tmp, this.filePath);
    });
    return this.writeChain;
  }
}

function freshState() {
  return { agents: {}, projects: {}, invitations: {}, documents: {}, decisions: {} };
}

function normalizeState(parsed = {}) {
  return {
    agents: parsed.agents ?? {}, projects: parsed.projects ?? {}, invitations: parsed.invitations ?? {},
    documents: parsed.documents ?? {}, decisions: parsed.decisions ?? {}
  };
}

function validateStateDigests(state) {
  for (const agent of Object.values(state.agents)) {
    if (profileDigest(agent) !== agent.digest) throw new Error("federation_profile_digest_mismatch");
    if (agent.verification) {
      if (agent.verification.profileDigest !== agent.digest) throw new Error("federation_verification_profile_mismatch");
      const expected = digest(canonicalJson({
        agentId: agent.id, verifierOperatorId: agent.verification.verifierOperatorId,
        evidenceRefs: agent.verification.evidenceRefs, profileDigest: agent.verification.profileDigest,
        verifiedAt: agent.verification.verifiedAt
      }));
      if (expected !== agent.verification.receiptDigest) throw new Error("federation_verification_digest_mismatch");
    }
  }
  for (const invitation of Object.values(state.invitations)) {
    if (inviteDigest(invitation) !== invitation.digest) throw new Error("federation_invitation_digest_mismatch");
  }
  for (const doc of Object.values(state.documents)) {
    if (!Array.isArray(doc.versions) || doc.currentVersion !== doc.versions.length) throw new Error("federation_document_history_invalid");
    for (const revision of doc.versions) {
      if (digest(revision.body) !== revision.bodyHash) throw new Error("federation_document_body_digest_mismatch");
      const receiptBody = {
        documentId: revision.documentId, projectId: revision.projectId, version: revision.version,
        baseVersion: revision.baseVersion, title: revision.title, visibility: revision.visibility,
        bodyHash: revision.bodyHash, summary: revision.summary, authorAgentId: revision.authorAgentId,
        authorOperatorId: revision.authorOperatorId, createdAt: revision.createdAt
      };
      if (digest(canonicalJson(receiptBody)) !== revision.digest) throw new Error("federation_document_receipt_digest_mismatch");
    }
  }
  for (const decision of Object.values(state.decisions)) {
    const receiptBody = {
      projectId: decision.projectId, projectRevision: decision.projectRevision,
      actorAgentId: decision.actorAgentId, actorOperatorId: decision.actorOperatorId,
      title: decision.title, body: decision.body, documentRefs: decision.documentRefs,
      evidenceRefs: decision.evidenceRefs, createdAt: decision.createdAt
    };
    if (digest(canonicalJson(receiptBody)) !== decision.digest) throw new Error("federation_decision_digest_mismatch");
  }
}

function publicAgent(agent) {
  return structuredClone({
    id: agent.id, operatorId: agent.operatorId, displayName: agent.displayName,
    description: agent.description, model: agent.model, capabilities: agent.capabilities,
    links: agent.links, verificationStatus: agent.verificationStatus, verification: agent.verification,
    revision: agent.revision, digest: agent.digest, createdAt: agent.createdAt, updatedAt: agent.updatedAt
  });
}

function publicProject(project, viewerAgentId) {
  const viewerIsMember = Boolean(viewerAgentId && project.members[viewerAgentId]);
  return structuredClone({
    id: project.id, slug: project.slug, title: project.title, description: project.description,
    visibility: project.visibility, ownerAgentId: project.ownerAgentId, revision: project.revision,
    members: viewerIsMember ? Object.values(project.members) : undefined,
    memberCount: Object.keys(project.members).length, createdAt: project.createdAt, updatedAt: project.updatedAt
  });
}

function publicDocument(doc, { includeBody }) {
  const current = doc.versions.at(-1);
  return structuredClone({
    id: doc.id, projectId: doc.projectId, title: doc.title, visibility: doc.visibility,
    currentVersion: doc.currentVersion, currentDigest: current?.digest,
    body: includeBody ? current?.body : undefined, bodyHash: current?.bodyHash,
    summary: current?.summary, authorAgentId: current?.authorAgentId,
    authorOperatorId: current?.authorOperatorId, createdAt: doc.createdAt, updatedAt: doc.updatedAt
  });
}

function membership(agent, role, now) {
  return { agentId: agent.id, operatorId: agent.operatorId, role, joinedAt: now, updatedAt: now };
}

function assertOperatorMatch(agent, actor) {
  const operatorId = cleanRequired(actor?.operatorId, 120, "actor_operator_id_required");
  if (operatorId !== agent.operatorId) throw new Error("actor_operator_mismatch");
}

function assertProjectWriter(project, agentId) {
  const role = project.members[agentId]?.role;
  if (!["owner", "maintainer", "member"].includes(role)) throw new Error("project_write_forbidden");
}

function bumpProject(project, when = nowIso()) {
  project.revision += 1;
  project.updatedAt = when;
}

function normalizeDocumentRefs(refs, documents, projectId) {
  if (refs === undefined) return [];
  if (!Array.isArray(refs)) throw new Error("decision_document_refs_invalid");
  const out = [];
  for (const raw of refs.slice(0, 64)) {
    const documentId = cleanRequired(raw?.documentId, 160, "decision_document_ref_invalid");
    const version = Number(raw?.version);
    const doc = documents[documentId];
    if (!doc || doc.projectId !== projectId || !Number.isInteger(version) || version < 1) throw new Error("decision_document_ref_invalid");
    const revision = doc.versions.find((item) => item.version === version);
    if (!revision) throw new Error("decision_document_ref_invalid");
    out.push({ documentId, version, digest: revision.digest });
  }
  return out.sort((a, b) => `${a.documentId}:${a.version}`.localeCompare(`${b.documentId}:${b.version}`));
}

function cleanRequired(value, max, errorCode) {
  const clean = String(value ?? "").trim().slice(0, max);
  if (!clean) throw new Error(errorCode);
  return clean;
}

function cleanOptional(value, max) {
  const clean = String(value ?? "").trim().slice(0, max);
  return clean || undefined;
}

function normalizeStringList(value, maxItems, maxChars) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("string_list_invalid");
  return [...new Set(value.map((item) => String(item ?? "").trim().slice(0, maxChars)).filter(Boolean))]
    .sort()
    .slice(0, maxItems);
}

function normalizeSlug(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function profileDigest(agent) {
  return digest(canonicalJson({
    id: agent.id, operatorId: agent.operatorId, displayName: agent.displayName,
    description: agent.description, model: agent.model, capabilities: agent.capabilities,
    links: agent.links, revision: agent.revision, createdAt: agent.createdAt, updatedAt: agent.updatedAt
  }));
}

function inviteDigest(invitation) {
  return digest(canonicalJson({
    id: invitation.id, projectId: invitation.projectId, targetAgentId: invitation.targetAgentId,
    role: invitation.role, invitedByAgentId: invitation.invitedByAgentId, createdAt: invitation.createdAt
  }));
}

function canonicalJson(value) {
  return JSON.stringify(sortJson(value));
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
  }
  return value;
}

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}
