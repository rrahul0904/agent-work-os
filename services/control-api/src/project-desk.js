import crypto from "node:crypto";

const LANES = new Set(["backlog", "ready", "in_progress", "review", "human_only", "done"]);
const DECISION_STATUSES = new Set(["approved", "changes_requested", "discarded"]);

export class ProjectDeskError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = "ProjectDeskError";
    this.code = code;
    this.status = status;
  }
}

export class ProjectDesk {
  constructor(store, { now = () => new Date().toISOString(), id = () => crypto.randomUUID() } = {}) {
    this.store = store;
    this.now = now;
    this.id = id;
  }

  listWorkItems() { return this.store.listWorkItems(); }
  listDecisions() { return this.store.listDecisions(); }
  listActivity() { return this.store.listActivity(); }

  async createWorkItem(input) {
    const actor = requireActor(input.createdBy);
    const title = input.title?.trim();
    if (!title) throw new ProjectDeskError("title_required", "title is required", 400);
    const lane = input.lane ?? "backlog";
    requireLane(lane);
    const at = this.now();
    const item = {
      id: input.id ?? this.id(),
      projectId: input.projectId?.trim() || "default",
      title,
      description: input.description?.trim() || "",
      lane,
      humanOnly: Boolean(input.humanOnly || lane === "human_only"),
      owner: null,
      completionReport: null,
      createdAt: at,
      updatedAt: at,
    };
    await this.store.upsertWorkItem(item);
    await this.#activity("work_item.created", actor, item.id, { lane: item.lane, humanOnly: item.humanOnly });
    return item;
  }

  async claimWorkItem(workItemId, actorInput) {
    const actor = requireActor(actorInput);
    const item = this.#workItem(workItemId);
    if (item.humanOnly && actor.kind === "agent") {
      throw new ProjectDeskError("human_only_work", "agents cannot claim human-only work");
    }
    if (item.lane === "done") throw new ProjectDeskError("work_item_done", "completed work cannot be claimed");
    if (item.owner && item.owner.id !== actor.id) {
      throw new ProjectDeskError("work_item_already_owned", `work item is already owned by ${item.owner.id}`);
    }
    item.owner = actor;
    if (item.lane === "backlog" || item.lane === "ready") item.lane = "in_progress";
    item.updatedAt = this.now();
    await this.store.upsertWorkItem(item);
    await this.#activity("work_item.claimed", actor, item.id, { lane: item.lane });
    return item;
  }

  async moveWorkItem(workItemId, lane, actorInput) {
    const actor = requireActor(actorInput);
    requireLane(lane);
    const item = this.#workItem(workItemId);
    if (lane === "human_only" && actor.kind === "agent") {
      throw new ProjectDeskError("human_only_lane_requires_human", "only a human can move work into the human-only lane");
    }
    if (lane === "done") return this.completeWorkItem(workItemId, actor);
    item.lane = lane;
    if (lane === "human_only") { item.humanOnly = true; item.owner = actor; }
    item.updatedAt = this.now();
    await this.store.upsertWorkItem(item);
    await this.#activity("work_item.moved", actor, item.id, { lane });
    return item;
  }

  async submitCompletionReport(workItemId, reportInput, actorInput) {
    const actor = requireActor(actorInput);
    const item = this.#workItem(workItemId);
    requireOwner(item, actor);
    const report = normalizeReport(reportInput);
    item.completionReport = { ...report, submittedBy: actor, submittedAt: this.now() };
    item.lane = "review";
    item.updatedAt = this.now();
    await this.store.upsertWorkItem(item);
    await this.#activity("work_item.completion_reported", actor, item.id, {
      commitSha: report.commitSha,
      ciStatus: report.ciStatus,
      prUrl: report.prUrl || null,
    });
    return item;
  }

  async requestDecision(workItemId, input, actorInput) {
    const actor = requireActor(actorInput);
    const item = this.#workItem(workItemId);
    if (item.owner) requireOwner(item, actor);
    const question = input.question?.trim();
    if (!question) throw new ProjectDeskError("question_required", "question is required", 400);
    const at = this.now();
    const decision = {
      id: input.id ?? this.id(),
      workItemId: item.id,
      kind: input.kind?.trim() || "approval",
      question,
      status: "pending",
      requestedBy: actor,
      requestedAt: at,
      resolvedBy: null,
      resolvedAt: null,
      comment: null,
    };
    await this.store.upsertDecision(decision);
    await this.#activity("decision.requested", actor, item.id, { decisionId: decision.id, kind: decision.kind });
    return decision;
  }

  async resolveDecision(decisionId, input, actorInput) {
    const actor = requireActor(actorInput);
    if (actor.kind !== "human") throw new ProjectDeskError("human_approval_required", "only a human can resolve a decision request");
    const decision = this.store.getDecision(decisionId);
    if (!decision) throw new ProjectDeskError("decision_not_found", `unknown decision: ${decisionId}`, 404);
    if (!DECISION_STATUSES.has(input.status)) {
      throw new ProjectDeskError("invalid_decision_status", "status must be approved, changes_requested, or discarded", 400);
    }
    decision.status = input.status;
    decision.resolvedBy = actor;
    decision.resolvedAt = this.now();
    decision.comment = input.comment?.trim() || null;
    await this.store.upsertDecision(decision);
    await this.#activity("decision.resolved", actor, decision.workItemId, { decisionId, status: decision.status });
    return decision;
  }

  async completeWorkItem(workItemId, actorInput) {
    const actor = requireActor(actorInput);
    const item = this.#workItem(workItemId);
    if (actor.kind !== "human") {
      throw new ProjectDeskError("human_completion_required", "only a human can mark work done");
    }
    if (item.owner?.kind === "agent" && !item.completionReport) {
      throw new ProjectDeskError("completion_report_required", "agent-owned work requires a completion report before completion");
    }
    const related = this.store.listDecisions().filter((d) => d.workItemId === item.id);
    if (related.some((d) => d.status === "pending")) {
      throw new ProjectDeskError("pending_decision", "resolve pending decision requests before completion");
    }
    if (related.some((d) => d.status !== "approved")) {
      throw new ProjectDeskError("decision_not_approved", "all decision requests must be approved before completion");
    }
    item.lane = "done";
    item.updatedAt = this.now();
    await this.store.upsertWorkItem(item);
    await this.#activity("work_item.completed", actor, item.id, {});
    return item;
  }

  #workItem(id) {
    const item = this.store.getWorkItem(id);
    if (!item) throw new ProjectDeskError("work_item_not_found", `unknown work item: ${id}`, 404);
    return item;
  }

  async #activity(type, actor, workItemId, details) {
    return this.store.addActivity({ id: this.id(), type, actor, workItemId, details, at: this.now() });
  }
}

function requireActor(actor) {
  if (!actor?.id?.trim() || !["human", "agent"].includes(actor.kind)) {
    throw new ProjectDeskError("actor_required", "actor requires a non-empty id and kind human|agent", 400);
  }
  return { id: actor.id.trim(), kind: actor.kind, provider: actor.provider?.trim() || undefined };
}
function requireLane(lane) {
  if (!LANES.has(lane)) throw new ProjectDeskError("invalid_lane", `unsupported lane: ${lane}`, 400);
}
function requireOwner(item, actor) {
  if (!item.owner || item.owner.id !== actor.id) throw new ProjectDeskError("owner_required", "only the current owner can perform this action");
}
function normalizeReport(report) {
  const summary = report?.summary?.trim();
  const commitSha = report?.commitSha?.trim();
  const ciStatus = report?.ciStatus?.trim();
  const testInstructions = report?.testInstructions?.trim();
  if (!summary || !commitSha || !ciStatus || !testInstructions) {
    throw new ProjectDeskError("completion_report_incomplete", "summary, commitSha, ciStatus and testInstructions are required", 400);
  }
  return { summary, commitSha, ciStatus, testInstructions, prUrl: report.prUrl?.trim() || undefined };
}
