import { createHash } from "node:crypto";
import { assertCanonicalId } from "./index.js";

/**
 * Independent, read-only presentation contract for canonical Agent Work OS runs.
 * This module MUST NOT evaluate scripts, schedule tasks, grant permissions, or
 * convert source-controlled graphs into an alternative execution authority.
 */
export class VisualGraphValidationError extends Error {
  constructor(code) {
    super(code);
    this.name = "VisualGraphValidationError";
    this.code = code;
  }
}

const TYPES = new Set(["task", "agent", "verification", "gate"]);
const STATES = new Set(["pending", "running", "blocked", "complete", "failed"]);
const EDGE_TYPES = new Set(["depends_on", "handoff", "verifies"]);
const ID = /^[a-z][a-z0-9._:-]{0,95}$/;
const NODE_FIELDS = new Set(["id", "type", "status", "organizationId", "runId", "receiptId", "workItemId"]);
const EDGE_FIELDS = new Set(["id", "from", "to", "type"]);

function object(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new VisualGraphValidationError(code);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new VisualGraphValidationError(code);
  }
  return value;
}

function fieldsOnly(value, allowed, code) {
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) throw new VisualGraphValidationError(code);
  }
}

function id(value, code) {
  if (typeof value !== "string" || !ID.test(value)) throw new VisualGraphValidationError(code);
  return value;
}

function canonical(kind, value, code) {
  try { return assertCanonicalId(kind, value); }
  catch { throw new VisualGraphValidationError(code); }
}

/**
 * Takes already-authorized, already-scoped run summaries and returns a stable,
 * immutable graph read model. Receipt IDs are references, not proof validation.
 * Callers MUST verify receipt ownership and authenticity before invocation.
 */
export function compileVisualExecutionReadModel(input) {
  object(input, "graph_invalid");
  fieldsOnly(input, new Set(["scope", "nodes", "edges"]), "graph_field_unknown");
  const scope = object(input.scope, "scope_invalid");
  fieldsOnly(scope, new Set(["organizationId", "runId"]), "scope_field_unknown");
  const organizationId = canonical("org", scope.organizationId, "scope_organization_invalid");
  const runId = canonical("run", scope.runId, "scope_run_invalid");

  if (!Array.isArray(input.nodes) || input.nodes.length < 1 || input.nodes.length > 500) {
    throw new VisualGraphValidationError("nodes_limit_invalid");
  }
  if (!Array.isArray(input.edges) || input.edges.length > 1000) {
    throw new VisualGraphValidationError("edges_limit_invalid");
  }

  const nodeIds = new Set();
  const nodes = input.nodes.map((raw) => {
    const n = object(raw, "node_invalid");
    fieldsOnly(n, NODE_FIELDS, "node_field_unknown");
    const nodeId = id(n.id, "node_id_invalid");
    if (nodeIds.has(nodeId)) throw new VisualGraphValidationError("node_id_duplicate");
    nodeIds.add(nodeId);
    if (!TYPES.has(n.type)) throw new VisualGraphValidationError("node_type_invalid");
    if (!STATES.has(n.status)) throw new VisualGraphValidationError("node_status_invalid");
    if (n.organizationId !== organizationId || n.runId !== runId) {
      throw new VisualGraphValidationError("node_scope_mismatch");
    }
    if (n.receiptId !== undefined) canonical("receipt", n.receiptId, "node_receipt_invalid");
    if (n.workItemId !== undefined) canonical("work", n.workItemId, "node_work_item_invalid");
    if (["complete", "failed"].includes(n.status) && !n.receiptId) {
      throw new VisualGraphValidationError("terminal_state_requires_receipt_reference");
    }
    return Object.freeze({
      id: nodeId, type: n.type, status: n.status,
      organizationId, runId,
      ...(n.workItemId ? { workItemId: n.workItemId } : {}),
      ...(n.receiptId ? { receiptId: n.receiptId } : {})
    });
  }).sort((a, b) => a.id.localeCompare(b.id, "en"));

  const edgeIds = new Set();
  const edgeRelations = new Set();
  const edges = input.edges.map((raw) => {
    const e = object(raw, "edge_invalid");
    fieldsOnly(e, EDGE_FIELDS, "edge_field_unknown");
    const edgeId = id(e.id, "edge_id_invalid");
    if (edgeIds.has(edgeId)) throw new VisualGraphValidationError("edge_id_duplicate");
    edgeIds.add(edgeId);
    const from = id(e.from, "edge_from_invalid");
    const to = id(e.to, "edge_to_invalid");
    if (!nodeIds.has(from) || !nodeIds.has(to)) throw new VisualGraphValidationError("edge_dangling");
    if (from === to) throw new VisualGraphValidationError("edge_self_loop");
    if (!EDGE_TYPES.has(e.type)) throw new VisualGraphValidationError("edge_type_invalid");
    const relation = JSON.stringify([from, to, e.type]);
    if (edgeRelations.has(relation)) throw new VisualGraphValidationError("edge_relation_duplicate");
    edgeRelations.add(relation);
    return Object.freeze({ id: edgeId, from, to, type: e.type });
  }).sort((a, b) => a.id.localeCompare(b.id, "en"));

  // A graph in this initial read-model contract must be a connected DAG.
  const indegree = new Map(nodes.map((n) => [n.id, 0]));
  const downstream = new Map(nodes.map((n) => [n.id, []]));
  const undirected = new Map(nodes.map((n) => [n.id, new Set()]));
  for (const edge of edges) {
    indegree.set(edge.to, indegree.get(edge.to) + 1);
    downstream.get(edge.from).push(edge.to);
    undirected.get(edge.from).add(edge.to);
    undirected.get(edge.to).add(edge.from);
  }
  const queue = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  let visited = 0;
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    visited++;
    for (const next of downstream.get(current)) {
      const degree = indegree.get(next) - 1;
      indegree.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }
  if (visited !== nodes.length) throw new VisualGraphValidationError("graph_cycle");
  const connected = new Set([nodes[0].id]);
  const pending = [nodes[0].id];
  for (let i = 0; i < pending.length; i++) {
    for (const neighbor of undirected.get(pending[i])) {
      if (!connected.has(neighbor)) { connected.add(neighbor); pending.push(neighbor); }
    }
  }
  if (connected.size !== nodes.length) throw new VisualGraphValidationError("graph_disconnected");

  const payload = { schema: "awos.visual-execution-read-model/v1",
    scope: { organizationId, runId }, nodes, edges };
  const digest = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return Object.freeze({
    schema: payload.schema,
    scope: Object.freeze(payload.scope),
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    digest
  });
}
