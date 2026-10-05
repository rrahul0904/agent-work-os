import crypto from "node:crypto";

export const FLOW_RUN_VERSION = "flow-run/v1";
export const FLOW_RUN_STATES = Object.freeze([
  "queued",
  "admitted",
  "running",
  "waiting_for_input",
  "waiting_for_approval",
  "blocked",
  "partial",
  "interrupted",
  "failed",
  "completed",
  "cancelled"
]);
export const FLOW_NODE_STATES = Object.freeze([
  "pending",
  "running",
  "waiting_for_input",
  "waiting_for_approval",
  "blocked",
  "partial",
  "interrupted",
  "failed",
  "completed",
  "skipped",
  "cancelled"
]);

const RUN_STATES = new Set(FLOW_RUN_STATES);
const NODE_STATES = new Set(FLOW_NODE_STATES);
const FLOW_DIGEST = /^sha256:[a-f0-9]{64}$/;

const RUN_TRANSITIONS = Object.freeze({
  queued: new Set(["admitted", "cancelled"]),
  admitted: new Set(["running", "cancelled", "interrupted"]),
  running: new Set([
    "waiting_for_input",
    "waiting_for_approval",
    "blocked",
    "partial",
    "interrupted",
    "failed",
    "completed",
    "cancelled"
  ]),
  waiting_for_input: new Set(["running", "cancelled", "interrupted"]),
  waiting_for_approval: new Set(["running", "cancelled", "interrupted"]),
  blocked: new Set(["running", "failed", "cancelled", "interrupted"]),
  partial: new Set(["running", "failed", "completed", "cancelled", "interrupted"]),
  interrupted: new Set(["admitted", "cancelled"]),
  failed: new Set(),
  completed: new Set(),
  cancelled: new Set()
});

const NODE_TRANSITIONS = Object.freeze({
  pending: new Set(["running", "skipped", "cancelled"]),
  running: new Set([
    "waiting_for_input",
    "waiting_for_approval",
    "blocked",
    "partial",
    "interrupted",
    "failed",
    "completed",
    "cancelled"
  ]),
  waiting_for_input: new Set(["running", "cancelled", "interrupted"]),
  waiting_for_approval: new Set(["running", "cancelled", "interrupted"]),
  blocked: new Set(["running", "skipped", "cancelled", "interrupted"]),
  partial: new Set(["running", "skipped", "cancelled", "interrupted"]),
  interrupted: new Set(["running", "skipped", "cancelled"]),
  failed: new Set(["running", "skipped", "cancelled"]),
  completed: new Set(),
  skipped: new Set(),
  cancelled: new Set()
});

const NEW_ATTEMPT_FROM = new Set(["pending", "blocked", "partial", "interrupted", "failed"]);

export function createFlowRun({ id, flowDigest, nodeIds, trigger = {}, at = new Date().toISOString() }) {
  if (typeof id !== "string" || !id.trim()) throw new Error("flow_run_id_required");
  if (!FLOW_DIGEST.test(flowDigest ?? "")) throw new Error("flow_digest_invalid");
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) throw new Error("flow_run_nodes_required");
  if (new Set(nodeIds).size !== nodeIds.length || nodeIds.some((nodeId) => typeof nodeId !== "string" || !nodeId)) {
    throw new Error("flow_run_node_ids_invalid");
  }
  if (!isPlainObject(trigger)) throw new Error("flow_run_trigger_invalid");
  assertTimestamp(at);

  return {
    version: FLOW_RUN_VERSION,
    id: id.trim(),
    flowDigest,
    status: "queued",
    trigger: sortObject(trigger),
    activeNodeId: null,
    createdAt: at,
    updatedAt: at,
    startedAt: null,
    completedAt: null,
    nodes: Object.fromEntries(nodeIds.map((nodeId) => [nodeId, {
      status: "pending",
      attempts: 0,
      updatedAt: at
    }])),
    receipts: []
  };
}

export function transitionFlowRun(run, { to, at = new Date().toISOString(), reason, evidenceRefs = [] }) {
  assertValidRun(run);
  assertTimestamp(at);
  assertEvidenceRefs(evidenceRefs);
  if (!RUN_STATES.has(to)) throw new Error(`flow_run_state_invalid:${String(to)}`);

  const from = run.status;
  if (!RUN_TRANSITIONS[from]?.has(to)) throw new Error(`flow_run_transition_refused:${from}->${to}`);

  const next = clone(run);
  next.status = to;
  next.updatedAt = at;
  if (to === "running" && !next.startedAt) next.startedAt = at;
  if (isTerminalRunState(to)) next.completedAt = at;
  if (to === "interrupted" || isTerminalRunState(to)) next.activeNodeId = null;
  appendReceipt(next, {
    event: "run.transition",
    from,
    to,
    at,
    reason: normalizeReason(reason),
    evidenceRefs
  });
  return next;
}

export function transitionFlowNode(run, nodeId, {
  to,
  at = new Date().toISOString(),
  reason,
  evidenceRefs = []
}) {
  assertValidRun(run);
  assertTimestamp(at);
  assertEvidenceRefs(evidenceRefs);
  const current = run.nodes[nodeId];
  if (!current) throw new Error(`flow_node_unknown:${nodeId}`);
  if (!NODE_STATES.has(to)) throw new Error(`flow_node_state_invalid:${String(to)}`);

  const from = current.status;
  if (!NODE_TRANSITIONS[from]?.has(to)) throw new Error(`flow_node_transition_refused:${from}->${to}`);

  const next = clone(run);
  const node = next.nodes[nodeId];
  node.status = to;
  node.updatedAt = at;
  if (to === "running" && NEW_ATTEMPT_FROM.has(from)) node.attempts += 1;
  next.updatedAt = at;
  next.activeNodeId = to === "running" ? nodeId : next.activeNodeId === nodeId ? null : next.activeNodeId;
  appendReceipt(next, {
    event: "node.transition",
    nodeId,
    from,
    to,
    at,
    reason: normalizeReason(reason),
    evidenceRefs
  });
  return next;
}

/**
 * Convert work that may have had a live executor at shutdown into an explicit
 * interrupted state. Parked human-attention states remain parked when no node
 * was actively running; restart must never fabricate completion or failure.
 */
export function reconcileFlowRunOnStartup(run, { at = new Date().toISOString() } = {}) {
  assertValidRun(run);
  assertTimestamp(at);
  if (isTerminalRunState(run.status)) return clone(run);

  let next = clone(run);
  let hadLiveNode = false;
  for (const [nodeId, node] of Object.entries(next.nodes)) {
    if (node.status !== "running") continue;
    hadLiveNode = true;
    next = transitionFlowNode(next, nodeId, {
      to: "interrupted",
      at,
      reason: "runtime_restart"
    });
  }

  const runWasLive = run.status === "admitted" || run.status === "running";
  if ((hadLiveNode || runWasLive) && next.status !== "interrupted") {
    next = transitionFlowRun(next, {
      to: "interrupted",
      at,
      reason: "runtime_restart"
    });
  }
  return next;
}

export function verifyFlowRunSnapshot(run) {
  const errors = [];
  if (!isPlainObject(run)) return { valid: false, errors: ["flow_run_invalid"] };
  if (run.version !== FLOW_RUN_VERSION) errors.push("flow_run_version_invalid");
  if (typeof run.id !== "string" || !run.id) errors.push("flow_run_id_invalid");
  if (!FLOW_DIGEST.test(run.flowDigest ?? "")) errors.push("flow_run_digest_invalid");
  if (!RUN_STATES.has(run.status)) errors.push("flow_run_status_invalid");
  if (!isPlainObject(run.trigger)) errors.push("flow_run_trigger_invalid");
  if (!isPlainObject(run.nodes) || Object.keys(run.nodes).length === 0) errors.push("flow_run_nodes_invalid");
  if (!Array.isArray(run.receipts)) errors.push("flow_run_receipts_invalid");

  if (isPlainObject(run.nodes)) {
    for (const [nodeId, node] of Object.entries(run.nodes)) {
      if (!isPlainObject(node) || !NODE_STATES.has(node.status) || !Number.isInteger(node.attempts) || node.attempts < 0) {
        errors.push(`flow_node_snapshot_invalid:${nodeId}`);
      }
    }
  }

  if (Array.isArray(run.receipts)) {
    let previousReceiptDigest = null;
    for (const [index, receipt] of run.receipts.entries()) {
      if (!isPlainObject(receipt)) {
        errors.push(`flow_receipt_invalid:${index + 1}`);
        continue;
      }
      if (receipt.sequence !== index + 1) errors.push(`flow_receipt_sequence_invalid:${index + 1}`);
      if (receipt.runId !== run.id || receipt.flowDigest !== run.flowDigest) {
        errors.push(`flow_receipt_identity_invalid:${index + 1}`);
      }
      if (receipt.previousReceiptDigest !== previousReceiptDigest) {
        errors.push(`flow_receipt_chain_invalid:${index + 1}`);
      }
      const expected = digestReceipt(receipt);
      if (receipt.receiptDigest !== expected) errors.push(`flow_receipt_digest_invalid:${index + 1}`);
      previousReceiptDigest = receipt.receiptDigest ?? null;
    }
  }

  return { valid: errors.length === 0, errors };
}

export function isTerminalRunState(status) {
  return status === "failed" || status === "completed" || status === "cancelled";
}

function appendReceipt(run, fields) {
  const previousReceiptDigest = run.receipts.at(-1)?.receiptDigest ?? null;
  const receipt = {
    version: "flow-receipt/v1",
    sequence: run.receipts.length + 1,
    event: fields.event,
    runId: run.id,
    flowDigest: run.flowDigest,
    nodeId: fields.nodeId ?? null,
    from: fields.from,
    to: fields.to,
    at: fields.at,
    reason: fields.reason,
    evidenceRefs: [...fields.evidenceRefs].sort(),
    previousReceiptDigest
  };
  receipt.receiptDigest = digestReceipt(receipt);
  run.receipts.push(receipt);
}

function digestReceipt(receipt) {
  const { receiptDigest: _ignored, ...unsigned } = receipt;
  const canonical = JSON.stringify(sortObject(unsigned));
  return `sha256:${crypto.createHash("sha256").update(canonical).digest("hex")}`;
}

function assertValidRun(run) {
  const result = verifyFlowRunSnapshot(run);
  if (!result.valid) throw new Error(`flow_run_snapshot_invalid:${result.errors.join(",")}`);
}

function assertTimestamp(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error("flow_timestamp_invalid");
}

function assertEvidenceRefs(refs) {
  if (!Array.isArray(refs) || refs.some((ref) => typeof ref !== "string" || !ref.trim())) {
    throw new Error("flow_evidence_refs_invalid");
  }
}

function normalizeReason(reason) {
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}
