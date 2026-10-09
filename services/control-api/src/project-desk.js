import crypto from "node:crypto";

const LANES = new Set(["backlog", "ready", "in_progress", "review", "human_only", "done"]);
const DECISION_STATUSES = new Set(["approved", "changes_requested", "discarded"]);
const RISK_LEVELS = new Set(["low", "medium", "high", "critical"]);

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
    const governance = normalizeGovernance(input);
    const at = this.now();
    const proposal = {
      workItemId: item.id,
      kind: input.kind?.trim() || "approval",
      question,
      ...governance,
      requestedBy: actor,
      requestedAt: at,
    };
    const decision = {
      id: input.id ?? this.id(),
      ...proposal,
      status: "pending",
      proposalDigest: digest(proposal),
      resolvedBy: null,
      resolvedAt: null,
      comment: null,
      selectedOptionId: null,
      rationale: null,
      resolutionDigest: null,
    };
    await this.store.upsertDecision(decision);
    await this.#activity("decision.requested", actor, item.id, {
      decisionId: decision.id,
      kind: decision.kind,
      proposalDigest: decision.proposalDigest,
      riskLevel: decision.riskLevel,
      policyRef: decision.policyRef,
    });
    return decision;
  }

  async resolveDecision(decisionId, input, actorInput) {
    const actor = requireActor(actorInput);
    if (actor.kind !== "human") throw new ProjectDeskError("human_approval_required", "only a human can resolve a decision request");
    const decision = this.store.getDecision(decisionId);
    if (!decision) throw new ProjectDeskError("decision_not_found", `unknown decision: ${decisionId}`, 404);
    if (decision.status !== "pending") {
      throw new ProjectDeskError("decision_already_resolved", "a decision request may be resolved exactly once");
    }
    if (!DECISION_STATUSES.has(input.status)) {
      throw new ProjectDeskError("invalid_decision_status", "status must be approved, changes_requested, or discarded", 400);
    }
    const selectedOptionId = input.selectedOptionId?.trim() || null;
    if (selectedOptionId && !decision.options.some((option) => option.id === selectedOptionId)) {
      throw new ProjectDeskError("invalid_decision_option", "selectedOptionId must reference one of the decision options", 400);
    }
    if (input.status === "approved" && decision.options.length > 0 && !selectedOptionId) {
      throw new ProjectDeskError("decision_option_required", "approved decisions with options require selectedOptionId", 400);
    }
    const resolvedAt = this.now();
    const resolution = {
      decisionId: decision.id,
      proposalDigest: decision.proposalDigest,
      status: input.status,
      selectedOptionId,
      rationale: input.rationale?.trim() || input.comment?.trim() || null,
      comment: input.comment?.trim() || null,
      resolvedBy: actor,
      resolvedAt,
    };
    decision.status = input.status;
    decision.resolvedBy = actor;
    decision.resolvedAt = resolvedAt;
    decision.comment = resolution.comment;
    decision.selectedOptionId = selectedOptionId;
    decision.rationale = resolution.rationale;
    decision.resolutionDigest = digest(resolution);
    await this.store.upsertDecision(decision);
    await this.#activity("decision.resolved", actor, decision.workItemId, {
      decisionId,
      status: decision.status,
      selectedOptionId,
      proposalDigest: decision.proposalDigest,
      resolutionDigest: decision.resolutionDigest,
      policyRef: decision.policyRef,
    });
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
function normalizeGovernance(input) {
  const options = Array.isArray(input.options) ? input.options.map((option, index) => {
    const label = typeof option === "string" ? option.trim() : option?.label?.trim();
    if (!label) throw new ProjectDeskError("decision_option_invalid", `decision option ${index + 1} requires a label`, 400);
    return {
      id: (typeof option === "object" && option.id?.trim()) || `option-${index + 1}`,
      label,
      description: typeof option === "object" ? option.description?.trim() || null : null,
    };
  }) : [];
  if (options.length > 10) throw new ProjectDeskError("too_many_decision_options", "a decision may contain at most 10 options", 400);
  if (new Set(options.map((option) => option.id)).size !== options.length) {
    throw new ProjectDeskError("duplicate_decision_option", "decision option ids must be unique", 400);
  }
  const recommendedOptionId = input.recommendedOptionId?.trim() || null;
  if (recommendedOptionId && !options.some((option) => option.id === recommendedOptionId)) {
    throw new ProjectDeskError("invalid_recommended_option", "recommendedOptionId must reference one of the decision options", 400);
  }
  const riskLevel = input.riskLevel?.trim() || "medium";
  if (!RISK_LEVELS.has(riskLevel)) throw new ProjectDeskError("invalid_risk_level", "riskLevel must be low, medium, high, or critical", 400);
  const evidenceRefs = Array.isArray(input.evidenceRefs)
    ? input.evidenceRefs.map((value) => String(value).trim()).filter(Boolean)
    : [];
  if (evidenceRefs.length > 25) throw new ProjectDeskError("too_many_evidence_refs", "a decision may contain at most 25 evidence references", 400);
  return {
    reason: input.reason?.trim() || null,
    options,
    recommendedOptionId,
    riskLevel,
    policyRef: input.policyRef?.trim() || null,
    budgetImpact: input.budgetImpact?.trim() || null,
    timeImpact: input.timeImpact?.trim() || null,
    evidenceRefs,
    expiresAt: input.expiresAt?.trim() || null,
  };
}
function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
