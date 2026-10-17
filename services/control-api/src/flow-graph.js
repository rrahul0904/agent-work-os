import crypto from "node:crypto";

export const FLOW_GRAPH_VERSION = "flow-graph/v1";
export const MAX_FLOW_NODES = 50;
export const SUPPORTED_FLOW_NODE_TYPES = Object.freeze([
  "trigger.manual",
  "trigger.schedule",
  "trigger.webhook",
  "trigger.after-task",
  "start-task",
  "agent",
  "command",
  "condition",
  "approval",
  "fan-out",
  "end"
]);

const NODE_TYPES = new Set(SUPPORTED_FLOW_NODE_TYPES);
const NODE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const GRAPH_FIELDS = new Set(["version", "id", "name", "nodes", "edges"]);

/**
 * Validate an independently authored Agent Work OS flow graph.
 *
 * This contract is intentionally side-effect free. It does not dispatch an
 * agent, mutate Git, create a worktree, make a network request, or decide an
 * approval. Runtime execution consumes only graphs accepted by this gate.
 */
export function validateFlowGraph(input) {
  const errors = [];

  if (!isPlainObject(input)) {
    return invalid([problem("graph.invalid", "Flow graph must be an object.")]);
  }

  for (const field of Object.keys(input)) {
    if (!GRAPH_FIELDS.has(field)) {
      errors.push(problem("graph.field", `Flow graph field '${field}' is not defined by ${FLOW_GRAPH_VERSION}.`, field));
    }
  }

  if (input.version !== FLOW_GRAPH_VERSION) {
    errors.push(problem("graph.version", `Flow graph version must be ${FLOW_GRAPH_VERSION}.`));
  }

  const nodes = Array.isArray(input.nodes) ? input.nodes : [];
  const edges = Array.isArray(input.edges) ? input.edges : [];

  if (!Array.isArray(input.nodes)) errors.push(problem("nodes.invalid", "Flow graph nodes must be an array."));
  if (!Array.isArray(input.edges)) errors.push(problem("edges.invalid", "Flow graph edges must be an array."));
  if (nodes.length === 0) errors.push(problem("nodes.empty", "Flow graph must contain at least one node."));
  if (nodes.length > MAX_FLOW_NODES) {
    errors.push(problem("nodes.limit", `Flow graph may contain at most ${MAX_FLOW_NODES} nodes.`));
  }

  const nodeIds = new Set();
  const validNodes = [];
  for (const [index, node] of nodes.entries()) {
    if (!isPlainObject(node)) {
      errors.push(problem("node.invalid", `Node at index ${index} must be an object.`));
      continue;
    }
    if (typeof node.id !== "string" || !NODE_ID.test(node.id)) {
      errors.push(problem("node.id", `Node at index ${index} has an invalid id.`));
      continue;
    }
    if (nodeIds.has(node.id)) {
      errors.push(problem("node.duplicate", `Node id '${node.id}' is duplicated.`, node.id));
      continue;
    }
    nodeIds.add(node.id);
    validNodes.push(node);
    if (!NODE_TYPES.has(node.type)) {
      errors.push(problem("node.type", `Node '${node.id}' has unsupported type '${String(node.type)}'.`, node.id));
    }
  }

  const triggers = validNodes.filter((node) => node.type?.startsWith("trigger."));
  if (triggers.length !== 1) {
    errors.push(problem("trigger.count", `Flow graph must contain exactly one trigger; found ${triggers.length}.`));
  }

  const edgeIds = new Set();
  const usableEdges = [];
  for (const [index, edge] of edges.entries()) {
    if (!isPlainObject(edge)) {
      errors.push(problem("edge.invalid", `Edge at index ${index} must be an object.`));
      continue;
    }
    if (typeof edge.id !== "string" || !NODE_ID.test(edge.id)) {
      errors.push(problem("edge.id", `Edge at index ${index} has an invalid id.`));
      continue;
    }
    if (edgeIds.has(edge.id)) {
      errors.push(problem("edge.duplicate", `Edge id '${edge.id}' is duplicated.`, edge.id));
      continue;
    }
    edgeIds.add(edge.id);

    const sourceExists = nodeIds.has(edge.source);
    const targetExists = nodeIds.has(edge.target);
    if (!sourceExists || !targetExists) {
      errors.push(problem(
        "edge.endpoint",
        `Edge '${edge.id}' must reference existing source and target nodes.`,
        edge.id
      ));
      continue;
    }
    if (edge.source === edge.target) {
      errors.push(problem("edge.self", `Edge '${edge.id}' may not point a node to itself.`, edge.id));
      continue;
    }
    usableEdges.push(edge);
  }

  const incoming = new Map(validNodes.map((node) => [node.id, []]));
  const outgoing = new Map(validNodes.map((node) => [node.id, []]));
  for (const edge of usableEdges) {
    incoming.get(edge.target)?.push(edge);
    outgoing.get(edge.source)?.push(edge);
  }

  for (const trigger of triggers) {
    if ((incoming.get(trigger.id)?.length ?? 0) > 0) {
      errors.push(problem("trigger.incoming", `Trigger '${trigger.id}' may not have incoming edges.`, trigger.id));
    }
  }

  for (const node of validNodes.filter((candidate) => candidate.type === "end")) {
    if ((outgoing.get(node.id)?.length ?? 0) > 0) {
      errors.push(problem("end.outgoing", `End node '${node.id}' may not have outgoing edges.`, node.id));
    }
  }

  for (const node of validNodes.filter((candidate) => candidate.type === "condition")) {
    const branches = outgoing.get(node.id) ?? [];
    const handles = branches.map((edge) => edge.sourceHandle).sort();
    if (branches.length !== 2 || handles[0] !== "false" || handles[1] !== "true") {
      errors.push(problem(
        "condition.branches",
        `Condition '${node.id}' must have exactly one 'true' and one 'false' outgoing branch.`,
        node.id
      ));
    }
  }

  if (triggers.length === 1) {
    const reachable = collectReachable(triggers[0].id, outgoing);
    for (const node of validNodes) {
      if (!reachable.has(node.id)) {
        errors.push(problem("node.unreachable", `Node '${node.id}' is unreachable from the trigger.`, node.id));
      }
    }
  }

  if (containsCycle(validNodes, outgoing)) {
    errors.push(problem("graph.cycle", "Flow graph must be acyclic."));
  }

  if (errors.length > 0) return invalid(errors);

  const canonical = canonicalizeFlowGraph(input);
  return {
    valid: true,
    errors: [],
    canonical,
    digest: `sha256:${crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex")}`
  };
}

export function canonicalizeFlowGraph(input) {
  return sortObject({
    version: input.version,
    id: input.id ?? null,
    name: input.name ?? null,
    nodes: [...input.nodes]
      .map((node) => sortObject(node))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...input.edges]
      .map((edge) => sortObject(edge))
      .sort((a, b) => a.id.localeCompare(b.id))
  });
}

function collectReachable(start, outgoing) {
  const seen = new Set();
  const pending = [start];
  while (pending.length > 0) {
    const current = pending.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    for (const edge of outgoing.get(current) ?? []) pending.push(edge.target);
  }
  return seen;
}

function containsCycle(nodes, outgoing) {
  const visiting = new Set();
  const visited = new Set();

  const visit = (id) => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const edge of outgoing.get(id) ?? []) {
      if (visit(edge.target)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  return nodes.some((node) => visit(node.id));
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function problem(code, message, subject) {
  return subject ? { code, subject, message } : { code, message };
}

function invalid(errors) {
  return {
    valid: false,
    errors: [...errors].sort((a, b) => `${a.code}:${a.subject ?? ""}`.localeCompare(`${b.code}:${b.subject ?? ""}`)),
    canonical: null,
    digest: null
  };
}
