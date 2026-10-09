import crypto from "node:crypto";

const ACTIVE_SESSION_STATES = new Set(["queued", "starting", "running", "needs_input", "waiting", "interrupted"]);
const TERMINAL_SESSION_STATES = new Set(["completed", "failed", "cancelled"]);

export class CompanyCommandCenterError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "CompanyCommandCenterError";
    this.code = code;
    this.status = status;
  }
}

export class CompanyCommandCenter {
  constructor(store, desk, { now = () => new Date().toISOString() } = {}) {
    this.store = store;
    this.desk = desk;
    this.now = now;
  }

  getStructure() {
    return this.store.getOrganization() ?? defaultOrganization();
  }

  async configureStructure(input, actorInput) {
    const actor = requireHuman(actorInput);
    const organization = normalizeOrganization(input);
    const saved = {
      ...organization,
      revision: digest(organization),
      updatedAt: this.now(),
      updatedBy: actor,
    };
    await this.store.upsertOrganization(saved);
    await this.store.addActivity({
      id: crypto.randomUUID(),
      type: "organization.updated",
      actor,
      workItemId: null,
      details: { organizationId: saved.id, revision: saved.revision, memberCount: saved.members.length },
      at: saved.updatedAt,
    });
    return saved;
  }

  getDecisionDesk() {
    const items = new Map(this.desk.listWorkItems().map((item) => [item.id, item]));
    return this.desk.listDecisions().map((decision) => ({
      ...decision,
      workItem: items.has(decision.workItemId)
        ? { id: decision.workItemId, title: items.get(decision.workItemId).title, lane: items.get(decision.workItemId).lane }
        : null,
    }));
  }

  getOverview() {
    const structure = this.getStructure();
    const workItems = this.desk.listWorkItems();
    const decisions = this.getDecisionDesk();
    const sessions = this.store.listSessions();
    const machines = this.store.listMachines();
    const pendingDecisions = decisions.filter((decision) => decision.status === "pending");
    const humanLane = workItems.filter((item) => item.lane === "human_only");
    const reviewLane = workItems.filter((item) => item.lane === "review");
    const activeRuns = sessions.filter((session) => ACTIVE_SESSION_STATES.has(session.status));
    const today = this.now().slice(0, 10);
    const finishedToday = workItems.filter((item) => item.lane === "done" && item.updatedAt?.slice(0, 10) === today);
    const members = structure.members.map((member) => {
      const owned = workItems.filter((item) => item.owner?.id === member.id && item.lane !== "done");
      const memberRuns = sessions.filter((session) => session.agent === member.runtimeAgent || session.agent === member.id);
      const latestRun = memberRuns[0] ?? null;
      return {
        ...member,
        openWork: owned.length,
        runState: latestRun?.status ?? "idle",
        latestRunId: latestRun?.id ?? null,
      };
    });
    return {
      schema: "company-command-center-overview/v1",
      generatedAt: this.now(),
      organization: { id: structure.id, name: structure.name, revision: structure.revision ?? null, president: structure.president },
      metrics: {
        needsHuman: pendingDecisions.length + humanLane.length + reviewLane.length,
        pendingDecisions: pendingDecisions.length,
        reviewQueue: reviewLane.length,
        humanOnlyWork: humanLane.length,
        openWork: workItems.filter((item) => item.lane !== "done").length,
        finishedToday: finishedToday.length,
        activeRuns: activeRuns.length,
        onlineMachines: machines.filter((machine) => machine.status === "online").length,
      },
      attention: {
        decisions: pendingDecisions.slice(0, 20),
        review: reviewLane.slice(0, 20),
        humanOnly: humanLane.slice(0, 20),
      },
      members,
      recentOutcomes: workItems.filter((item) => item.lane === "done").slice(0, 20),
    };
  }

  exportAudit() {
    const payload = {
      schema: "company-audit-export/v1",
      generatedAt: this.now(),
      organization: this.getStructure(),
      workItems: this.desk.listWorkItems(),
      decisions: this.desk.listDecisions(),
      activity: this.desk.listActivity(),
      sessionReceipts: this.store.listSessions().map((session) => ({
        id: session.id,
        machineId: session.machineId,
        agent: session.agent,
        model: session.model ?? null,
        status: TERMINAL_SESSION_STATES.has(session.status) || ACTIVE_SESSION_STATES.has(session.status) ? session.status : "unknown",
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        handoffId: session.handoffId ?? null,
        nativeSessionId: session.nativeSessionId ?? null,
      })),
    };
    return { ...payload, digest: digest(payload) };
  }
}

function defaultOrganization() {
  const organization = {
    id: "default",
    name: "My AI Company",
    president: { id: "owner", name: "Owner" },
    members: [],
    securityFloors: ["human_approval_for_high_impact_actions", "no_permission_escalation_via_handoff"],
  };
  return { ...organization, revision: digest(organization), updatedAt: null, updatedBy: null };
}

function normalizeOrganization(input) {
  const id = input.id?.trim() || "default";
  const name = input.name?.trim();
  if (!name) throw new CompanyCommandCenterError("organization_name_required", "organization name is required");
  const presidentId = input.president?.id?.trim();
  const presidentName = input.president?.name?.trim();
  if (!presidentId || !presidentName) throw new CompanyCommandCenterError("president_required", "president requires id and name");
  const rawMembers = Array.isArray(input.members) ? input.members : [];
  const members = rawMembers.map((member, index) => {
    const memberId = member.id?.trim();
    const role = member.role?.trim();
    if (!memberId || !role) throw new CompanyCommandCenterError("organization_member_invalid", `member ${index + 1} requires id and role`);
    if (memberId === presidentId) throw new CompanyCommandCenterError("organization_member_conflict", "president id cannot also be a member id");
    return {
      id: memberId,
      name: member.name?.trim() || memberId,
      role,
      department: member.department?.trim() || "General",
      managerId: member.managerId?.trim() || presidentId,
      provider: member.provider?.trim() || null,
      model: member.model?.trim() || null,
      runtimeAgent: member.runtimeAgent?.trim() || memberId,
      authority: Array.isArray(member.authority) ? [...new Set(member.authority.map((value) => String(value).trim()).filter(Boolean))] : [],
      paused: Boolean(member.paused),
    };
  });
  if (new Set(members.map((member) => member.id)).size !== members.length) {
    throw new CompanyCommandCenterError("duplicate_organization_member", "organization member ids must be unique");
  }
  validateManagementGraph(presidentId, members);
  const securityFloors = Array.isArray(input.securityFloors)
    ? [...new Set(input.securityFloors.map((value) => String(value).trim()).filter(Boolean))]
    : ["human_approval_for_high_impact_actions", "no_permission_escalation_via_handoff"];
  return { id, name, president: { id: presidentId, name: presidentName }, members, securityFloors };
}

function validateManagementGraph(presidentId, members) {
  const ids = new Set([presidentId, ...members.map((member) => member.id)]);
  const byId = new Map(members.map((member) => [member.id, member]));
  for (const member of members) {
    if (!ids.has(member.managerId)) throw new CompanyCommandCenterError("manager_not_found", `manager ${member.managerId} for ${member.id} is not in the organization`);
    if (member.managerId === member.id) throw new CompanyCommandCenterError("self_management_forbidden", `${member.id} cannot manage itself`);
    const seen = new Set([member.id]);
    let cursor = member;
    while (cursor.managerId !== presidentId) {
      if (seen.has(cursor.managerId)) throw new CompanyCommandCenterError("management_cycle", "organization management graph cannot contain cycles");
      seen.add(cursor.managerId);
      cursor = byId.get(cursor.managerId);
      if (!cursor) throw new CompanyCommandCenterError("manager_not_found", "organization manager chain must terminate at the president");
    }
  }
}

function requireHuman(actor) {
  if (!actor?.id?.trim() || actor.kind !== "human") throw new CompanyCommandCenterError("human_authority_required", "only a human can change company structure", 403);
  return { id: actor.id.trim(), kind: "human" };
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
