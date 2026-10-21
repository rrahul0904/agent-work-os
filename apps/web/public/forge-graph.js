// REA Forge v0.1: read-only projection of authoritative Agent Work OS snapshots.
// This module neither invents task dependencies nor grants execution permissions.
const TYPES = [
  ["machine", "machines", "Machine", "name"],
  ["session", "sessions", "Agent session", "agent"],
  ["shipping", "shippingRuns", "Shipping run", "projectId"],
  ["work", "workItems", "Work item", "title"]
];
const TERMINAL = new Set(["complete", "completed", "shipped", "verified", "success", "passed"]);
const FAILED = new Set(["failed", "error", "cancelled", "canceled", "interrupted"]);
const BLOCKED = new Set(["blocked", "waiting", "needs_input", "lost", "unknown", "reconciling"]);
const ACTIVE = new Set(["online", "queued", "running", "building", "verifying", "repairing", "in_progress"]);

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
function label(value, fallback) {
  const v = identity(value);
  return v || fallback;
}
function statusOf(entry, kind) {
  const raw = kind === "work" ? entry.status ?? entry.state : entry.status ?? entry.state;
  return label(raw, "unknown").toLowerCase();
}
function itemList(snapshot, key) {
  return Array.isArray(snapshot?.[key]) ? snapshot[key].filter(item => item && typeof item === "object" && !Array.isArray(item)) : [];
}

/**
 * Project known machines/sessions/runs/work items into a graph without guessing
 * that unlinked records depend on each other. No supervisor node is fabricated.
 */
export function buildForgeGraph(snapshot = {}, options = {}) {
  const cap = options.maxNodes ?? 80;
  if (!Number.isSafeInteger(cap) || cap < 1 || cap > 500) throw new Error("invalid_graph_capacity");
  const allNodes = [];
  const allIds = new Set();
  for (const [kind, collection, humanKind, labelKey] of TYPES) {
    const rows = itemList(snapshot, collection);
    rows.forEach((row, index) => {
      const rawId = identity(kind === "shipping" ? row.runId ?? row.id : row.id);
      if (!rawId) return;
      const id = kind + ":" + rawId;
      if (allIds.has(id)) return;
      allIds.add(id);
      const status = statusOf(row, kind);
      allNodes.push({
        id, rawId, kind, humanKind,
        label: label(row[labelKey], humanKind + " " + String(index + 1)),
        status, tone: statusTone(status),
        machineId: identity(row.machineId),
        projectId: identity(row.projectId),
        organizationId: identity(row.organizationId),
        updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
        eventCount: Array.isArray(row.events) ? row.events.length : 0,
        evidence: Boolean(kind === "shipping" && row.releaseReceipt),
        raw: row
      });
    });
  }
  const nodes = allNodes.slice(0, cap);
  const included = new Set(nodes.map(node => node.id));
  const edges = nodes
    .filter(node => (node.kind === "session" || node.kind === "shipping") && node.machineId)
    .map(node => ({ id: "machine:" + node.machineId + "->" + node.id,
      from: "machine:" + node.machineId, to: node.id, kind: "observed-machine-binding" }))
    .filter(edge => included.has(edge.from) && included.has(edge.to));
  const counts = Object.fromEntries(TYPES.map(([kind]) => [kind, allNodes.filter(n => n.kind === kind).length]));
  return {
    schemaVersion: "rea-forge-graph/v0.1",
    source: "agent-work-os-authoritative-snapshot",
    nodes, edges, counts,
    totalNodes: allNodes.length,
    truncated: allNodes.length - nodes.length,
    // A dependency graph does not exist in current API snapshots. Keep this
    // false until actual versioned task-dependency records are available.
    taskDependencyGraphAvailable: false
  };
}

export function layoutForgeGraph(graph) {
  const kinds = TYPES.map(([kind]) => kind);
  const xPositions = { machine: 24, session: 350, shipping: 676, work: 1002 };
  const gapY = 110, topY = 70, boxWidth = 292, boxHeight = 78;
  const position = new Map();
  const placed = graph.nodes.map(node => {
    const index = graph.nodes.filter(n => n.kind === node.kind).findIndex(n => n.id === node.id);
    const x = xPositions[node.kind];
    const y = topY + index * gapY;
    position.set(node.id, { x, y });
    return { ...node, x, y, width: boxWidth, height: boxHeight };
  });
  const maxInColumn = Math.max(1, ...kinds.map(k => graph.nodes.filter(n => n.kind === k).length));
  return {
    nodes: placed,
    edges: graph.edges.map(edge => {
      const from = position.get(edge.from), to = position.get(edge.to);
      if (!from || !to) return null;
      return { ...edge, x1: from.x + boxWidth, y1: from.y + boxHeight / 2, x2: to.x, y2: to.y + boxHeight / 2 };
    }).filter(Boolean),
    width: 1320, height: Math.max(330, topY + maxInColumn * gapY + 18)
  };
}
