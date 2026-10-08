import crypto from "node:crypto";
import { DecisionMemory } from "../../../packages/decision-memory/src/index.js";

export class WorkMemoryHandoffError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = "WorkMemoryHandoffError";
    this.code = code;
    this.status = status;
  }
}

export class WorkMemoryHandoffService {
  constructor(store, workMemoryService) {
    this.store = store;
    this.workMemoryService = workMemoryService;
  }

  async create(workItemId, { fromSessionId, nextAction } = {}) {
    if (typeof fromSessionId !== "string" || !fromSessionId.trim()) {
      throw new WorkMemoryHandoffError("from_session_required", "fromSessionId is required", 400);
    }
    const session = this.store.getSession(fromSessionId);
    if (!session) {
      throw new WorkMemoryHandoffError("source_session_not_found", `Unknown source session: ${fromSessionId}`, 404);
    }
    if (!session.cwd || !session.machineId) {
      throw new WorkMemoryHandoffError("source_session_incomplete", "Source session must retain cwd and machineId");
    }

    const projection = this.workMemoryService.getProjection(workItemId);
    let memory;
    try {
      memory = await DecisionMemory.open(session.cwd);
    } catch (error) {
      throw new WorkMemoryHandoffError(
        "decision_memory_unavailable",
        `Verified decision memory is unavailable for the source session workspace: ${error.message}`,
      );
    }

    const pending = projection.pendingDecisionIds.map((id) => `Resolve pending decision ${id}`);
    const openTasks = [
      ...pending,
      ...(projection.workState.done ? [] : [`Advance authoritative work from lane ${projection.workState.lane}`]),
    ].slice(0, 8);
    const risks = [
      ...(projection.workState.humanOnly ? ["Work item is marked human-only"] : []),
      ...projection.pendingDecisionIds.map((id) => `Pending human decision ${id}`),
    ].slice(0, 8);
    const lastActions = projection.entries
      .filter((entry) => String(entry.id).startsWith("activity:"))
      .slice(-8)
      .map((entry) => clip(entry.body || entry.id, 220));
    const resolvedNextAction = clip(
      nextAction || (projection.workState.done
        ? "Preserve completion evidence; do not reopen work without a new authoritative change."
        : projection.pendingDecisionIds.length
          ? "Resolve pending human decisions before authoritative completion."
          : `Continue the work item from ${projection.workState.lane}.`),
      280,
    );
    const projectionCheck = `work-memory-sha256:${projection.digest}`;

    const snapshot = await memory.handoff({
      fromSessionId: session.id,
      nativeThreadId: session.nativeSessionId || "",
      machineId: session.machineId,
      goal: clip(`Work item ${projection.workId}: ${projection.title}`, 480),
      lastActions,
      openTasks,
      risks,
      nextAction: resolvedNextAction,
      checks: [projectionCheck, `project-desk-lane:${projection.workState.lane}`],
    });

    const receipt = {
      schema: "work-memory-handoff-receipt/v1",
      workId: projection.workId,
      projectId: projection.projectId,
      projectionDigest: projection.digest,
      handoffId: snapshot.id,
      snapshotHash: snapshot.contentHash,
      fromSessionId: session.id,
      machineId: session.machineId,
      capturedAt: snapshot.capturedAt,
      nextAction: snapshot.nextAction,
      authority: {
        workState: "project-desk",
        approvals: "project-desk",
        verifiedDecisionMemory: "RE-297",
        mutableThroughReceipt: false,
      },
    };
    receipt.digest = digest(receipt);
    return { receipt, handoff: snapshot };
  }
}

function clip(value, max) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function digest(value) {
  return crypto.createHash("sha256").update(stable(value)).digest("hex");
}

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}
