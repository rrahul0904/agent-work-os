import crypto from "node:crypto";

export class WorkMemoryProjectionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "WorkMemoryProjectionError";
    this.code = code;
  }
}

export function projectWorkMemory({ workItem, decisions = [], activity = [] } = {}) {
  if (!workItem?.id || !workItem.title) {
    throw new WorkMemoryProjectionError("work_item_required", "An authoritative work item is required");
  }
  for (const decision of decisions) {
    if (decision.workItemId !== workItem.id) {
      throw new WorkMemoryProjectionError("cross_work_decision", `Decision ${decision.id} belongs to another work item`);
    }
  }
  for (const event of activity) {
    if (event.workItemId !== workItem.id) {
      throw new WorkMemoryProjectionError("cross_work_activity", `Activity ${event.id} belongs to another work item`);
    }
  }

  const entries = [];
  entries.push(entry("goal", "observation", workItem.createdAt, {
    actor: actor(workItem.createdBy ?? { id: "system", kind: "human" }),
    body: workItem.description || workItem.title,
    sourceRefs: [`work-item:${workItem.id}`],
    authoritative: true,
  }));

  if (workItem.owner) {
    entries.push(entry("owner", "observation", workItem.updatedAt, {
      actor: actor(workItem.owner),
      body: `Current owner: ${workItem.owner.id}`,
      sourceRefs: [`work-item:${workItem.id}`],
      authoritative: true,
    }));
  }

  if (workItem.completionReport) {
    const report = workItem.completionReport;
    entries.push(entry("completion-report", "attempt", report.submittedAt ?? workItem.updatedAt, {
      actor: actor(report.submittedBy ?? workItem.owner ?? { id: "unknown-agent", kind: "agent" }),
      body: report.summary,
      evidenceRefs: [
        `claim:commit:${report.commitSha}`,
        `claim:ci:${report.ciStatus}`,
        ...(report.prUrl ? [`claim:pr:${report.prUrl}`] : []),
      ],
      sourceRefs: [`work-item:${workItem.id}:completion-report`],
      authoritative: true,
      verified: false,
    }));
  }

  for (const decision of [...decisions].sort(byTimeThenId("requestedAt"))) {
    if (decision.status === "pending") {
      entries.push(entry(`decision:${decision.id}`, "question", decision.requestedAt, {
        actor: actor(decision.requestedBy),
        body: decision.question,
        sourceRefs: [`decision:${decision.id}`],
        authoritative: true,
        resolved: false,
      }));
      continue;
    }
    entries.push(entry(`decision:${decision.id}`, "approval", decision.resolvedAt ?? decision.requestedAt, {
      actor: actor(decision.resolvedBy),
      body: `${decision.status}: ${decision.question}${decision.comment ? ` — ${decision.comment}` : ""}`,
      sourceRefs: [`decision:${decision.id}`],
      authoritative: true,
      resolution: decision.status,
      resolved: true,
    }));
  }

  for (const event of [...activity].sort(byTimeThenId("at"))) {
    entries.push(entry(`activity:${event.id}`, "observation", event.at, {
      actor: actor(event.actor),
      body: event.type,
      details: clone(event.details ?? {}),
      sourceRefs: [`activity:${event.id}`],
      authoritative: true,
    }));
  }

  const projection = {
    schema: "work-memory-projection/v1",
    workId: workItem.id,
    projectId: workItem.projectId,
    title: workItem.title,
    workState: {
      lane: workItem.lane,
      humanOnly: Boolean(workItem.humanOnly),
      owner: workItem.owner ? clone(workItem.owner) : null,
      done: workItem.lane === "done",
    },
    pendingDecisionIds: decisions.filter((d) => d.status === "pending").map((d) => d.id).sort(),
    entries,
    authority: {
      source: "project-desk",
      mutableThroughProjection: false,
      statusAuthority: "project-desk",
      approvalAuthority: "project-desk",
    },
  };
  projection.digest = digest(projection);
  return projection;
}

function entry(id, kind, at, fields) {
  const value = { id, kind, at, ...fields };
  value.digest = digest(value);
  return value;
}

function actor(value) {
  if (!value?.id) return { type: "system", id: "unknown" };
  return { type: value.kind === "agent" ? "agent" : "human", id: value.id, ...(value.provider ? { provider: value.provider } : {}) };
}

function byTimeThenId(field) {
  return (a, b) => String(a[field] ?? "").localeCompare(String(b[field] ?? "")) || String(a.id).localeCompare(String(b.id));
}

function clone(value) { return structuredClone(value); }
function digest(value) { return crypto.createHash("sha256").update(stable(value)).digest("hex"); }
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
