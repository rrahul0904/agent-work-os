// REA Forge: evidence-only graph from the existing Agent Work OS snapshot.
// Relationships are emitted only where persisted IDs establish a link.
const TYPES = [
  ["machine", "machines", "Machine", "name"],
  ["session", "sessions", "Agent session", "agent"],
  ["shipping", "shippingRuns", "Shipping run", "projectId"],
  ["work", "workItems", "Work item", "title"]
];
export const GRAPH_KINDS = ["plan", "task", "machine", "session", "activity", "subagent", "shipping", "work"];
const TERMINAL = new Set(["complete", "completed", "shipped", "verified", "success", "passed"]);
const FAILED = new Set(["failed", "error", "errored", "cancelled", "canceled", "interrupted"]);
const BLOCKED = new Set(["blocked", "waiting", "needs_input", "lost", "unknown", "reconciling", "notfound", "not_found", "awaiting_verification", "awaiting_release", "stopped"]);
const ACTIVE = new Set(["online", "queued", "running", "in_progress", "inprogress", "building", "verifying", "repairing", "pending", "pendinginit", "pending_init", "draft", "dispatching"]);

export function statusTone(value) {
  const status = String(value ?? "unknown").toLowerCase();
  if (TERMINAL.has(status)) return "success";
  if (FAILED.has(status)) return "failure";
  if (BLOCKED.has(status)) return "warning";
  if (ACTIVE.has(status)) return "active";
  return "neutral";
}
function identity(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).slice(0, 180).trim();
}
function label(value, fallback) { return identity(value) || fallback; }
function statusOf(entry) { return label(entry.status ?? entry.state, "unknown").toLowerCase(); }
function itemList(snapshot, key) {
  return Array.isArray(snapshot?.[key]) ? snapshot[key].filter(item => item && typeof item === "object" && !Array.isArray(item)) : [];
}
function node({ id, rawId, kind, humanKind, label: title, status, raw, ...meta }) {
  const value = status.toLowerCase();
  return { id, rawId, kind, humanKind, label: title, status: value, tone: statusTone(value), raw, ...meta };
}
function shortActivityLabel(event) {
  if (event.itemType === "collab_tool_call") return "Collaboration: " + label(event.tool, "unknown");
  if (event.itemType === "command_execution") return "Command execution" + (Number.isInteger(event.exitCode) ? " · exit " + event.exitCode : "");
  if (event.itemType === "file_change") return "File change" + (Number.isInteger(event.changedFileCount) ? " · " + event.changedFileCount + " files" : "");
  if (event.itemType === "todo_list") return "Plan" + (Number.isInteger(event.planStepCount) ? " · " + event.planStepCount + " steps" : "");
  return event.itemType.replaceAll("_", " ");
}

/**
 * Native trace facts are attached to real AWOS sessions. We project them as
 * children, NOT as new authoritative tasks or separate schedulers.
 * For CLI versions that omit a spawn event we never invent a subagent.
 */
function codexTraceNodes(session, maxActivities = 20) {
  if (!Array.isArray(session.raw.events) || session.raw.events.length === 0) return { nodes: [], edges: [] };
  const byActivity = new Map();
  const childAgents = new Map();
  for (const event of session.raw.events) {
    if (!event || event.kind !== "codex.activity" || event.source !== "codex-exec-json/v1") continue;
    const itemId = identity(event.itemId);
    const traceId = identity(event.traceId);
    if (!itemId || !traceId) continue;
    const key = session.rawId + ":" + traceId + ":" + itemId;
    const prior = byActivity.get(key);
    // Keep the last observed phase for each item; no terminal inference.
    byActivity.set(key, { ...event, key, at: event.at ?? prior?.at ?? null });
    if (event.itemType === "collab_tool_call") {
      const receivers = Array.isArray(event.receiverThreadIds) ? event.receiverThreadIds : [];
      const states = new Map(Array.isArray(event.agentStates)
        ? event.agentStates.filter(s => s && typeof s.threadId === "string").map(s => [s.threadId, s.status]) : []);
      for (const receiver of receivers.slice(0, 12)) {
        const id = identity(receiver);
        if (!id) continue;
        const agentKey = session.rawId + ":" + id;
        childAgents.set(agentKey, {
          id, agentKey, status: states.get(id) ?? childAgents.get(agentKey)?.status ?? "unknown",
          parentItemKey: key, traceId, source: event.source
        });
      }
    }
  }
  // Activity count is bounded for readability; older trace facts are retained
  // in the underlying session store and omitted only from this projection.
  const activityEvents = [...byActivity.values()].slice(-maxActivities);
  const activityKeys = new Set(activityEvents.map(event => event.key));
  const nodes = [], edges = [];
  for (const event of activityEvents) {
    const id = "activity:" + event.key;
    nodes.push(node({
      id, rawId: event.itemId, kind: "activity", humanKind: "Codex item",
      label: shortActivityLabel(event), status: label(event.status, "unknown"),
      raw: event, sessionId: session.rawId, traceId: event.traceId,
      eventCount: 1, itemType: event.itemType, updatedAt: event.at ?? null
    }));
    edges.push({ id: session.id + "->" + id, from: session.id, to: id, kind: "observed-codex-item" });
  }
  for (const child of childAgents.values()) {
    if (!activityKeys.has(child.parentItemKey)) continue;
    const id = "subagent:" + child.agentKey;
    nodes.push(node({
      id, rawId: child.id, kind: "subagent", humanKind: "Codex subagent",
      label: "Delegated thread " + child.id.slice(0, 12), status: child.status,
      raw: { threadId: child.id, parentSessionId: session.rawId, source: child.source },
      sessionId: session.rawId, traceId: child.traceId,
      eventCount: 0, updatedAt: null
    }));
    edges.push({ id: "activity:" + child.parentItemKey + "->" + id,
      from: "activity:" + child.parentItemKey, to: id, kind: "observed-codex-delegation" });
  }
  return { nodes, edges };
}


// Project trusted-local-hook transport as *observations*, not AWOS Runs.
function nativeHookNodes(records) {
  const grouped = new Map();
  for (const item of records) {
    if (!item || item.source !== "codex-hook/v1") continue;
    const sessionId = identity(item.sessionId);
    const eventName = identity(item.eventName);
    if (!sessionId || !eventName) continue;
    if (!grouped.has(sessionId)) grouped.set(sessionId, []);
    grouped.get(sessionId).push(item);
  }
  const nodes = [], edges = [];
  for (const [sessionId, recordsForSession] of grouped) {
    const rootId = "session:hook:" + sessionId;
    let state = "observed";
    const terminalState = recordsForSession.findLast(e => e.eventName === "SessionEnd" || e.eventName === "Interrupt");
    if (terminalState) state = terminalState.eventName === "Interrupt" ? "interrupted" : "ended";
    else if (recordsForSession.some(e => e.eventName === "Stop")) state = "turn-ended";
    else if (recordsForSession.some(e => e.eventName === "SessionStart" || e.eventName === "UserPromptSubmit")) state = "running";
    nodes.push(node({
      id: rootId, rawId: sessionId, kind: "session", humanKind: "Codex native session",
      label: "Codex desktop · " + sessionId.slice(0, 14), status: state,
      source: "codex-hook/v1", raw: { agent: "codex-native-hook", source: "codex-hook/v1" },
      eventCount: recordsForSession.length, updatedAt: recordsForSession.at(-1)?.receivedAt ?? null,
      machineId: "", projectId: "", organizationId: ""
    }));
    const activity = new Map(), child = new Map();
    for (const observed of recordsForSession) {
      const name = observed.eventName;
      if (name === "SubagentStart" || name === "SubagentStop") {
        if (!observed.agentId) continue;
        const old = child.get(observed.agentId);
        child.set(observed.agentId, {
          ...observed,
          status: name === "SubagentStop" ? "stopped" : old?.status ?? "running"
        });
      }
      const key = observed.toolUseId
        ? "tool:" + (observed.turnId ?? "unknown") + ":" + observed.toolUseId
        : "event:" + observed.id;
      const old = activity.get(key);
      // Terminal post-hook beats a delayed asynchronous pre-hook.
      if (!old || observed.eventName === "PostToolUse" || old.eventName !== "PostToolUse") activity.set(key, observed);
    }
    for (const observed of [...activity.values()].slice(-20)) {
      const id = "activity:hook:" + sessionId + ":" + (observed.toolUseId
        ? (observed.turnId ?? "unknown") + ":" + observed.toolUseId
        : observed.id);
      const labelText = observed.toolName
        ? "Codex tool · " + observed.toolName
        : "Codex hook · " + observed.eventName;
      const status = observed.eventName === "PreToolUse" ? "running"
        : observed.eventName === "PostToolUse" ? "observed"
          : observed.eventName === "Interrupt" ? "interrupted"
            : observed.eventName === "Stop" ? "turn-ended" : "observed";
      nodes.push(node({
        id, rawId: observed.toolUseId || observed.id, kind: "activity", humanKind: "Codex hook event",
        label: labelText, status, raw: observed, sessionId, traceId: observed.turnId,
        updatedAt: observed.receivedAt ?? null, eventCount: 1, source: "codex-hook/v1"
      }));
      edges.push({ id: rootId + "->" + id, from: rootId, to: id, kind: "observed-native-hook" });
    }
    for (const observed of child.values()) {
      const id = "subagent:hook:" + sessionId + ":" + observed.agentId;
      nodes.push(node({
        id, rawId: observed.agentId, kind: "subagent", humanKind: "Codex native subagent",
        label: observed.agentType ? "Subagent · " + observed.agentType : "Subagent · " + observed.agentId.slice(0, 12),
        status: observed.status, raw: observed, sessionId,
        eventCount: 1, source: "codex-hook/v1", updatedAt: observed.receivedAt ?? null
      }));
      edges.push({ id: rootId + "->" + id, from: rootId, to: id, kind: "observed-native-subagent" });
    }
  }
  return { nodes, edges };
}

/** Projection never assumes dependency edges between unrelated work items. */
export function buildForgeGraph(snapshot = {}, options = {}) {
  const cap = options.maxNodes ?? 100;
  if (!Number.isSafeInteger(cap) || cap < 1 || cap > 500) throw new Error("invalid_graph_capacity");
  const allNodes = [], allEdges = [], allIds = new Set();
  for (const [kind, collection, humanKind, labelKey] of TYPES) {
    const rows = itemList(snapshot, collection);
    rows.forEach((row, index) => {
      const rawId = identity(kind === "shipping" ? row.runId ?? row.id : row.id);
      if (!rawId) return;
      const id = kind + ":" + rawId;
      if (allIds.has(id)) return;
      allIds.add(id);
      allNodes.push(node({
        id, rawId, kind, humanKind, label: label(row[labelKey], humanKind + " " + (index + 1)),
        status: statusOf(row), machineId: identity(row.machineId), projectId: identity(row.projectId),
        organizationId: identity(row.organizationId),
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
        eventCount: Array.isArray(row.events) ? row.events.length : 0,
        evidence: Boolean(kind === "shipping" && row.releaseReceipt), raw: row
      }));
    });
  }
  // Versioned Forge plan DAG edges come from the actual durable supervisor,
  // never an LLM guess. Plans are orchestration attempts, not shipped receipts.
  for (const plan of itemList(snapshot, "forgePlans")) {
    const planId = identity(plan.id);
    if (!planId || !Array.isArray(plan.tasks)) continue;
    const id = "plan:" + planId;
    if (allIds.has(id)) continue;
    allIds.add(id);
    allNodes.push(node({
      id, rawId: planId, kind: "plan", humanKind: "REA Forge plan",
      label: label(plan.title, "Forge plan"), status: statusOf(plan),
      raw: plan, machineId: identity(plan.machineId), projectId: "",
      eventCount: Array.isArray(plan.events) ? plan.events.length : 0,
      updatedAt: plan.updatedAt ?? null
    }));
    for (const task of plan.tasks) {
      const taskId = identity(task.id);
      if (!taskId) continue;
      const childId = "task:" + planId + ":" + taskId;
      if (allIds.has(childId)) continue;
      allIds.add(childId);
      allNodes.push(node({
        id: childId, rawId: taskId, kind: "task", humanKind: "Forge task",
        label: label(task.title, "Task"), status: statusOf(task),
        raw: task, machineId: "", projectId: "",
        planId, sessionId: identity(task.sessionId),
        updatedAt: task.updatedAt ?? null, verification: task.verification ?? null
      }));
      allEdges.push({ id: id + "->" + childId, from: id, to: childId, kind: "canonical-plan-task" });
      if (task.sessionId) allEdges.push({
        id: childId + "->session:" + task.sessionId, from: childId,
        to: "session:" + task.sessionId, kind: "observed-task-dispatch"
      });
      for (const dependency of Array.isArray(task.dependsOn) ? task.dependsOn : []) {
        allEdges.push({
          id: "task:" + planId + ":" + dependency + "->" + childId,
          from: "task:" + planId + ":" + dependency, to: childId,
          kind: "versioned-task-dependency"
        });
      }
    }
  }
  // Prioritize real session roots before activity nodes when the display cap
  // is reached, so recent native Codex sessions remain inspectable.
  const observedHooks = nativeHookNodes(itemList(snapshot, "forgeObservations"));
  for (const candidate of observedHooks.nodes.filter(n => n.kind === "session")) {
    if (allIds.has(candidate.id)) continue;
    allIds.add(candidate.id);
    allNodes.push(candidate);
  }
  // Bound each AWOS Codex session trace before adding into global node cap.
  for (const session of allNodes.filter(n => n.kind === "session" && n.raw.agent === "codex")) {
    const projected = codexTraceNodes(session);
    for (const candidate of projected.nodes) {
      if (allIds.has(candidate.id)) continue;
      allIds.add(candidate.id);
      allNodes.push(candidate);
    }
    allEdges.push(...projected.edges);
  }
  for (const candidate of observedHooks.nodes.filter(n => n.kind !== "session")) {
    if (allIds.has(candidate.id)) continue;
    allIds.add(candidate.id);
    allNodes.push(candidate);
  }
  allEdges.push(...observedHooks.edges);
  const nodes = allNodes.slice(0, cap);
  const included = new Set(nodes.map(n => n.id));
  for (const entry of nodes) {
    if ((entry.kind === "session" || entry.kind === "shipping") && entry.machineId) {
      allEdges.push({ id: "machine:" + entry.machineId + "->" + entry.id,
        from: "machine:" + entry.machineId, to: entry.id, kind: "observed-machine-binding" });
    }
  }
  const edges = allEdges.filter(e => included.has(e.from) && included.has(e.to));
  const counts = Object.fromEntries(GRAPH_KINDS.map(kind => [kind, allNodes.filter(n => n.kind === kind).length]));
  return {
    schemaVersion: "rea-forge-graph/v0.2",
    source: "agent-work-os-authoritative-snapshot",
    nodes, edges, counts, totalNodes: allNodes.length,
    truncated: allNodes.length - nodes.length,
    taskDependencyGraphAvailable: itemList(snapshot, "forgePlans").some(p => Array.isArray(p.tasks) && p.tasks.length > 0)
  };
}
export function layoutForgeGraph(graph) {
  const boxWidth = 292, boxHeight = 78, gapY = 110, topY = 70;
  const positions = new Map(), seen = new Map();
  const placed = graph.nodes.map(entry => {
    const idx = seen.get(entry.kind) ?? 0;
    seen.set(entry.kind, idx + 1);
    const x = 24 + GRAPH_KINDS.indexOf(entry.kind) * 326, y = topY + idx * gapY;
    positions.set(entry.id, { x, y });
    return { ...entry, x, y, width: boxWidth, height: boxHeight };
  });
  const maxInColumn = Math.max(1, ...[...seen.values()]);
  return {
    nodes: placed,
    edges: graph.edges.map(edge => {
      const from = positions.get(edge.from), to = positions.get(edge.to);
      if (!from || !to) return null;
      return { ...edge, x1: from.x + boxWidth, y1: from.y + boxHeight / 2,
        x2: to.x, y2: to.y + boxHeight / 2 };
    }).filter(Boolean),
    width: 326 * GRAPH_KINDS.length + 20,
    height: Math.max(330, topY + maxInColumn * gapY + 18)
  };
}
