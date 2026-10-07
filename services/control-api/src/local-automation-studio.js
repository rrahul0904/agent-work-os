import { createHash } from 'node:crypto';

export const LOCAL_AUTOMATION_FLOW_VERSION = 'local-automation-flow/v1';

const ALLOWED_NODE_KINDS = new Set([
  'trigger.manual',
  'browser.navigate',
  'browser.click',
  'browser.type',
  'desktop.click',
  'desktop.type',
  'data.set',
  'wait.fixed',
]);

const SELECTOR_NODE_KINDS = new Set([
  'browser.click',
  'browser.type',
  'desktop.click',
  'desktop.type',
]);

const SELECTOR_PRIORITY = Object.freeze({
  accessibilityId: 100,
  automationId: 100,
  roleName: 90,
  css: 80,
  text: 70,
  relative: 60,
  ocr: 30,
  image: 20,
});

const SECRET_FIELD = /(?:password|passwd|secret|token|api[_-]?key|authorization|connection[_-]?string)/i;
const SECRET_REF = /^secret:\/\/[A-Za-z0-9._-]+$/;

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  throw error;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

function assertNoInlineSecrets(value, path = 'config') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoInlineSecrets(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (SECRET_FIELD.test(key)) {
      if (typeof child !== 'string' || !SECRET_REF.test(child)) {
        fail(
          'inline_secret_forbidden',
          `Secret-like field ${childPath} must contain an external secret:// reference.`,
          { path: childPath },
        );
      }
    }
    assertNoInlineSecrets(child, childPath);
  }
}

function validateSelectorCandidate(candidate, nodeId, index) {
  if (!isPlainObject(candidate)) {
    fail('invalid_selector_candidate', `Node ${nodeId} selectorCandidates[${index}] must be an object.`);
  }
  if (!Object.hasOwn(SELECTOR_PRIORITY, candidate.kind)) {
    fail('invalid_selector_kind', `Node ${nodeId} uses unsupported selector kind ${candidate.kind}.`);
  }
  if (typeof candidate.value !== 'string' || candidate.value.trim() === '') {
    fail('invalid_selector_value', `Node ${nodeId} selector candidate requires a non-empty value.`);
  }
  if (
    candidate.minConfidence !== undefined &&
    (typeof candidate.minConfidence !== 'number' || candidate.minConfidence < 0 || candidate.minConfidence > 1)
  ) {
    fail('invalid_selector_confidence', `Node ${nodeId} selector minConfidence must be between 0 and 1.`);
  }
}

function topologicalOrder(flow, nodeById) {
  const indegree = new Map(flow.nodes.map((node) => [node.id, 0]));
  const adjacency = new Map(flow.nodes.map((node) => [node.id, []]));

  for (const edge of flow.edges) {
    indegree.set(edge.to, indegree.get(edge.to) + 1);
    adjacency.get(edge.from).push(edge.to);
  }

  const ready = [...flow.nodes]
    .filter((node) => indegree.get(node.id) === 0)
    .map((node) => node.id)
    .sort();
  const ordered = [];

  while (ready.length > 0) {
    const current = ready.shift();
    ordered.push(current);
    for (const next of adjacency.get(current).slice().sort()) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) {
        ready.push(next);
        ready.sort();
      }
    }
  }

  if (ordered.length !== nodeById.size) {
    fail('flow_cycle_forbidden_phase_a', 'Phase A flow graph must be acyclic. Explicit loop nodes arrive in a later phase.');
  }
  return ordered;
}

export function validateLocalAutomationFlow(flow) {
  if (!isPlainObject(flow)) fail('invalid_flow', 'Flow must be an object.');
  if (flow.version !== LOCAL_AUTOMATION_FLOW_VERSION) {
    fail('unsupported_flow_version', `Expected ${LOCAL_AUTOMATION_FLOW_VERSION}.`);
  }
  if (typeof flow.id !== 'string' || flow.id.trim() === '') fail('invalid_flow_id', 'Flow requires a non-empty id.');
  if (!Array.isArray(flow.nodes) || flow.nodes.length < 2 || flow.nodes.length > 200) {
    fail('invalid_flow_nodes', 'Flow must contain between 2 and 200 nodes.');
  }
  if (!Array.isArray(flow.edges) || flow.edges.length > 400) {
    fail('invalid_flow_edges', 'Flow edges must be an array with at most 400 entries.');
  }

  const nodeById = new Map();
  let triggerCount = 0;
  for (const node of flow.nodes) {
    if (!isPlainObject(node) || typeof node.id !== 'string' || node.id.trim() === '') {
      fail('invalid_node', 'Every node requires a non-empty string id.');
    }
    if (nodeById.has(node.id)) fail('duplicate_node_id', `Duplicate node id ${node.id}.`);
    if (!ALLOWED_NODE_KINDS.has(node.kind)) fail('unsupported_node_kind', `Unsupported node kind ${node.kind}.`);
    if (!isPlainObject(node.config)) fail('invalid_node_config', `Node ${node.id} requires an object config.`);
    if (node.kind === 'trigger.manual') triggerCount += 1;
    assertNoInlineSecrets(node.config, `nodes.${node.id}.config`);

    if (SELECTOR_NODE_KINDS.has(node.kind)) {
      if (!Array.isArray(node.config.selectorCandidates) || node.config.selectorCandidates.length === 0) {
        fail('selector_candidates_required', `Node ${node.id} requires selectorCandidates.`);
      }
      node.config.selectorCandidates.forEach((candidate, index) => validateSelectorCandidate(candidate, node.id, index));
    }
    nodeById.set(node.id, node);
  }
  if (triggerCount !== 1) fail('exactly_one_trigger_required', 'Phase A flow requires exactly one trigger.manual node.');

  const edgeIds = new Set();
  const incoming = new Map(flow.nodes.map((node) => [node.id, 0]));
  for (const edge of flow.edges) {
    if (!isPlainObject(edge) || typeof edge.from !== 'string' || typeof edge.to !== 'string') {
      fail('invalid_edge', 'Every edge requires string from/to endpoints.');
    }
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to)) {
      fail('edge_endpoint_missing', `Edge ${edge.from} -> ${edge.to} references a missing node.`);
    }
    if (edge.from === edge.to) fail('self_edge_forbidden', `Self edge on ${edge.from} is not allowed.`);
    const edgeId = `${edge.from}->${edge.to}`;
    if (edgeIds.has(edgeId)) fail('duplicate_edge', `Duplicate edge ${edgeId}.`);
    edgeIds.add(edgeId);
    incoming.set(edge.to, incoming.get(edge.to) + 1);
  }

  const trigger = flow.nodes.find((node) => node.kind === 'trigger.manual');
  if (incoming.get(trigger.id) !== 0) fail('trigger_must_be_root', 'trigger.manual cannot have incoming edges.');
  for (const node of flow.nodes) {
    if (node.id !== trigger.id && incoming.get(node.id) === 0) {
      fail('unreachable_node', `Node ${node.id} is disconnected from the trigger.`);
    }
  }

  const order = topologicalOrder(flow, nodeById);
  if (order[0] !== trigger.id) fail('trigger_must_be_first', 'The trigger must be the root of the flow.');

  const reachable = new Set([trigger.id]);
  const outgoing = new Map(flow.nodes.map((node) => [node.id, []]));
  for (const edge of flow.edges) outgoing.get(edge.from).push(edge.to);
  const queue = [trigger.id];
  while (queue.length) {
    const current = queue.shift();
    for (const next of outgoing.get(current)) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }
  if (reachable.size !== flow.nodes.length) fail('unreachable_node', 'Every node must be reachable from the trigger.');

  return { valid: true, order, triggerId: trigger.id };
}

export function localAutomationFlowDigest(flow) {
  validateLocalAutomationFlow(flow);
  return sha256(flow);
}

export function resolveAutomationTarget(selectorCandidates, observedTargets) {
  if (!Array.isArray(selectorCandidates) || selectorCandidates.length === 0) {
    fail('selector_candidates_required', 'At least one selector candidate is required.');
  }
  if (!Array.isArray(observedTargets)) fail('invalid_observed_targets', 'Observed targets must be an array.');

  const ranked = selectorCandidates
    .map((candidate, sourceIndex) => ({ ...candidate, sourceIndex }))
    .sort((a, b) => SELECTOR_PRIORITY[b.kind] - SELECTOR_PRIORITY[a.kind] || a.sourceIndex - b.sourceIndex);
  const attempts = [];

  for (const candidate of ranked) {
    const minConfidence = candidate.minConfidence ?? (candidate.kind === 'ocr' || candidate.kind === 'image' ? 0.9 : 1);
    const matches = observedTargets.filter(
      (target) =>
        target &&
        target.kind === candidate.kind &&
        target.value === candidate.value &&
        (target.confidence ?? 1) >= minConfidence,
    );
    attempts.push({ kind: candidate.kind, value: candidate.value, matches: matches.length });

    if (matches.length > 1) {
      fail('target_ambiguous', `Selector ${candidate.kind}:${candidate.value} matched multiple targets.`, {
        candidate,
        targetIds: matches.map((match) => match.targetId ?? null),
        attempts,
      });
    }
    if (matches.length === 1) {
      const match = matches[0];
      return {
        targetId: match.targetId ?? null,
        selectorKind: candidate.kind,
        selectorValue: candidate.value,
        confidence: match.confidence ?? 1,
        fallbackUsed: candidate.sourceIndex !== 0,
        sourceIndex: candidate.sourceIndex,
        attempts,
      };
    }
  }

  fail('target_not_found', 'No selector candidate resolved to an eligible target.', { attempts });
}

function adapterKeyFor(kind) {
  if (kind.startsWith('browser.')) return 'browser';
  if (kind.startsWith('desktop.')) return 'desktop';
  if (kind.startsWith('data.')) return 'data';
  if (kind.startsWith('wait.')) return 'wait';
  return null;
}

function receiptDigest(receipt) {
  const { digest, ...unsigned } = receipt;
  return sha256(unsigned);
}

export function verifyAutomationReceiptChain(receipts, expectedFlowDigest) {
  if (!Array.isArray(receipts)) return false;
  let previous = null;
  for (let index = 0; index < receipts.length; index += 1) {
    const receipt = receipts[index];
    if (!isPlainObject(receipt)) return false;
    if (receipt.sequence !== index + 1) return false;
    if (receipt.flowDigest !== expectedFlowDigest) return false;
    if (receipt.previousDigest !== previous) return false;
    if (receipt.digest !== receiptDigest(receipt)) return false;
    previous = receipt.digest;
  }
  return true;
}

export async function executeLocalAutomationFlow(flow, { adapters, clock = () => new Date().toISOString() } = {}) {
  const { order } = validateLocalAutomationFlow(flow);
  if (!isPlainObject(adapters)) fail('adapters_required', 'Execution requires adapter implementations.');

  const flowDigest = localAutomationFlowDigest(flow);
  const nodeById = new Map(flow.nodes.map((node) => [node.id, node]));
  const receipts = [];
  let previousDigest = null;

  for (const nodeId of order) {
    const node = nodeById.get(nodeId);
    if (node.kind === 'trigger.manual') continue;

    const adapterKey = adapterKeyFor(node.kind);
    const adapter = adapters[adapterKey];
    const sequence = receipts.length + 1;
    let selectorResolution = null;
    let status = 'succeeded';
    let outcome = null;
    let errorCode = null;

    try {
      if (!adapter || typeof adapter.execute !== 'function') {
        fail('adapter_unavailable', `No ${adapterKey} adapter is available for ${node.kind}.`, { nodeId });
      }
      if (SELECTOR_NODE_KINDS.has(node.kind)) {
        if (typeof adapter.observe !== 'function') {
          fail('adapter_observe_required', `${adapterKey} adapter must implement observe() for selector actions.`, { nodeId });
        }
        const observedTargets = await adapter.observe(node);
        selectorResolution = resolveAutomationTarget(node.config.selectorCandidates, observedTargets);
      }
      outcome = await adapter.execute(node, selectorResolution);
    } catch (error) {
      status = 'failed';
      errorCode = error?.code ?? 'adapter_execution_failed';
      outcome = { error: errorCode };
    }

    const unsignedReceipt = {
      version: 'local-automation-receipt/v1',
      sequence,
      flowId: flow.id,
      flowDigest,
      nodeId,
      nodeKind: node.kind,
      capability: adapterKey,
      status,
      selectorResolution,
      outcomeDigest: sha256(outcome),
      errorCode,
      observedAt: clock(),
      previousDigest,
    };
    const receipt = { ...unsignedReceipt, digest: sha256(unsignedReceipt) };
    receipts.push(receipt);
    previousDigest = receipt.digest;

    if (status === 'failed') {
      return {
        version: 'local-automation-run/v1',
        flowId: flow.id,
        flowDigest,
        status: 'failed',
        failedNodeId: nodeId,
        errorCode,
        receipts,
      };
    }
  }

  return {
    version: 'local-automation-run/v1',
    flowId: flow.id,
    flowDigest,
    status: 'completed',
    receipts,
  };
}

export function reconcileLocalAutomationRun(snapshot) {
  if (!isPlainObject(snapshot) || snapshot.version !== 'local-automation-run/v1') {
    fail('invalid_run_snapshot', 'Expected local-automation-run/v1 snapshot.');
  }
  if (snapshot.status !== 'running') return { ...snapshot };
  return {
    ...snapshot,
    status: 'interrupted',
    interruptionReason: 'restart_without_live_execution_proof',
  };
}
