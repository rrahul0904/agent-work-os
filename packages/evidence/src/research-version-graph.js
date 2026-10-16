import { RESEARCH_CONTRACT_VERSION, sha256, stableJson } from './research-workspace.js';

export const RESEARCH_VERSION_GRAPH_VERSION = 'research-version-graph/v1';

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function requireSha(value, name, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new TypeError(`${name} must be a SHA-256 hex digest`);
  }
  return value.toLowerCase();
}

function uniqueStrings(values, name) {
  if (!Array.isArray(values)) throw new TypeError(`${name} must be an array`);
  return [...new Set(values.map((value) => requireString(value, name)))].sort();
}

function normalizeDocumentRevision(record, index) {
  if (!record || typeof record !== 'object') throw new TypeError(`documents[${index}] must be an object`);
  return Object.freeze({
    documentId: requireString(record.documentId, `documents[${index}].documentId`),
    sourceId: requireString(record.sourceId, `documents[${index}].sourceId`),
    revision: requireString(record.revision, `documents[${index}].revision`),
    contentSha256: requireSha(record.contentSha256, `documents[${index}].contentSha256`),
  });
}

function normalizeClaim(record, index) {
  if (!record || typeof record !== 'object') throw new TypeError(`claims[${index}] must be an object`);
  const claimId = requireString(record.claimId ?? record.id, `claims[${index}].claimId`);
  const text = requireString(record.text, `claims[${index}].text`);
  return Object.freeze({
    claimId,
    textSha256: requireSha(record.textSha256 ?? sha256(text), `claims[${index}].textSha256`),
    evidenceSpanIds: uniqueStrings(record.evidenceSpanIds ?? record.evidence ?? [], `claims[${index}].evidenceSpanIds`),
  });
}

function snapshotPayload(snapshot) {
  const { snapshotSha256: _snapshotSha256, ...payload } = snapshot;
  return payload;
}

function diffPayload(diff) {
  const { diffSha256: _diffSha256, ...payload } = diff;
  return payload;
}

function graphPayload(graph) {
  const { graphSha256: _graphSha256, ...payload } = graph;
  return payload;
}

function replayPayload(replay) {
  const { replaySha256: _replaySha256, ...payload } = replay;
  return payload;
}

export function createResearchSnapshot({
  workspaceId,
  snapshotId,
  parentSnapshotIds = [],
  question,
  mode = 'answer',
  createdAt,
  evidenceSetSha256,
  documents,
  claims,
  status,
  confidence,
  conclusion,
  gaps = [],
  semanticGate = 'SEMANTIC_EVIDENCE_UNVERIFIED',
  researchReceiptSha256 = null,
  retrievalReceiptSha256 = null,
}) {
  workspaceId = requireString(workspaceId, 'workspaceId');
  snapshotId = requireString(snapshotId, 'snapshotId');
  question = requireString(question, 'question');
  mode = requireString(mode, 'mode');
  status = requireString(status, 'status');
  conclusion = requireString(conclusion, 'conclusion');
  semanticGate = requireString(semanticGate, 'semanticGate');
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new TypeError('confidence must be a finite number between 0 and 1');
  }
  if (!Array.isArray(documents) || !Array.isArray(claims) || !Array.isArray(gaps)) {
    throw new TypeError('documents, claims, and gaps must be arrays');
  }

  const normalizedDocuments = documents.map(normalizeDocumentRevision).sort((a, b) => a.documentId.localeCompare(b.documentId));
  const normalizedClaims = claims.map(normalizeClaim).sort((a, b) => a.claimId.localeCompare(b.claimId));
  const documentIds = new Set();
  for (const document of normalizedDocuments) {
    if (documentIds.has(document.documentId)) throw new Error(`duplicate document id: ${document.documentId}`);
    documentIds.add(document.documentId);
  }
  const claimIds = new Set();
  for (const claim of normalizedClaims) {
    if (claimIds.has(claim.claimId)) throw new Error(`duplicate claim id: ${claim.claimId}`);
    claimIds.add(claim.claimId);
  }

  const timestamp = createdAt ? new Date(createdAt) : new Date();
  if (Number.isNaN(timestamp.getTime())) throw new TypeError('createdAt must be a valid timestamp');

  const payload = {
    contractVersion: RESEARCH_VERSION_GRAPH_VERSION,
    researchContractVersion: RESEARCH_CONTRACT_VERSION,
    workspaceId,
    snapshotId,
    parentSnapshotIds: uniqueStrings(parentSnapshotIds, 'parentSnapshotIds'),
    createdAt: timestamp.toISOString(),
    question,
    mode,
    evidenceSetSha256: requireSha(evidenceSetSha256, 'evidenceSetSha256'),
    documents: normalizedDocuments,
    claims: normalizedClaims,
    decision: Object.freeze({
      status,
      confidence,
      conclusionSha256: sha256(conclusion),
    }),
    gaps: [...new Set(gaps.map((gap) => requireString(gap, 'gap')))].sort(),
    semanticGate,
    researchReceiptSha256: requireSha(researchReceiptSha256, 'researchReceiptSha256', { nullable: true }),
    retrievalReceiptSha256: requireSha(retrievalReceiptSha256, 'retrievalReceiptSha256', { nullable: true }),
  };

  return Object.freeze({ ...payload, snapshotSha256: sha256(stableJson(payload)) });
}

export function validateResearchSnapshot(snapshot) {
  if (!snapshot || snapshot.contractVersion !== RESEARCH_VERSION_GRAPH_VERSION) return false;
  if (snapshot.researchContractVersion !== RESEARCH_CONTRACT_VERSION) return false;
  if (typeof snapshot.snapshotSha256 !== 'string') return false;
  try {
    requireString(snapshot.workspaceId, 'snapshot.workspaceId');
    requireString(snapshot.snapshotId, 'snapshot.snapshotId');
    requireString(snapshot.question, 'snapshot.question');
    requireString(snapshot.mode, 'snapshot.mode');
    requireString(snapshot.decision?.status, 'snapshot.decision.status');
    requireSha(snapshot.decision?.conclusionSha256, 'snapshot.decision.conclusionSha256');
    requireSha(snapshot.evidenceSetSha256, 'snapshot.evidenceSetSha256');
    if (!Array.isArray(snapshot.documents) || !Array.isArray(snapshot.claims) || !Array.isArray(snapshot.parentSnapshotIds)) return false;
  } catch {
    return false;
  }
  return snapshot.snapshotSha256 === sha256(stableJson(snapshotPayload(snapshot)));
}

function classifyById(beforeItems, afterItems, idKey, equal) {
  const before = new Map(beforeItems.map((item) => [item[idKey], item]));
  const after = new Map(afterItems.map((item) => [item[idKey], item]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [id, value] of after) {
    if (!before.has(id)) added.push(id);
    else if (!equal(before.get(id), value)) changed.push(id);
  }
  for (const id of before.keys()) if (!after.has(id)) removed.push(id);
  return Object.freeze({ added: added.sort(), removed: removed.sort(), changed: changed.sort() });
}

export function compareResearchSnapshots({ before, after }) {
  if (!validateResearchSnapshot(before) || !validateResearchSnapshot(after)) {
    throw new TypeError('before and after must be intact research snapshots');
  }
  if (before.workspaceId !== after.workspaceId) throw new Error('cannot compare snapshots from different workspaces');

  const documents = classifyById(before.documents, after.documents, 'documentId', (a, b) =>
    a.sourceId === b.sourceId && a.revision === b.revision && a.contentSha256 === b.contentSha256);
  const claims = classifyById(before.claims, after.claims, 'claimId', (a, b) =>
    a.textSha256 === b.textSha256 && stableJson(a.evidenceSpanIds) === stableJson(b.evidenceSpanIds));

  const payload = {
    contractVersion: RESEARCH_VERSION_GRAPH_VERSION,
    workspaceId: before.workspaceId,
    beforeSnapshotId: before.snapshotId,
    beforeSnapshotSha256: before.snapshotSha256,
    afterSnapshotId: after.snapshotId,
    afterSnapshotSha256: after.snapshotSha256,
    evidenceSetChanged: before.evidenceSetSha256 !== after.evidenceSetSha256,
    documents,
    claims,
    decisionChanged: stableJson(before.decision) !== stableJson(after.decision),
    semanticGateChanged: before.semanticGate !== after.semanticGate,
    gapsAdded: after.gaps.filter((gap) => !before.gaps.includes(gap)).sort(),
    gapsResolved: before.gaps.filter((gap) => !after.gaps.includes(gap)).sort(),
  };
  return Object.freeze({ ...payload, diffSha256: sha256(stableJson(payload)) });
}

export function createResearchVersionGraph({ workspaceId, snapshots }) {
  workspaceId = requireString(workspaceId, 'workspaceId');
  if (!Array.isArray(snapshots) || snapshots.length === 0) throw new TypeError('snapshots must contain at least one snapshot');
  const byId = new Map();
  for (const snapshot of snapshots) {
    if (!validateResearchSnapshot(snapshot)) throw new Error(`invalid research snapshot: ${snapshot?.snapshotId ?? 'unknown'}`);
    if (snapshot.workspaceId !== workspaceId) throw new Error(`snapshot workspace mismatch: ${snapshot.snapshotId}`);
    if (byId.has(snapshot.snapshotId)) throw new Error(`duplicate snapshot id: ${snapshot.snapshotId}`);
    byId.set(snapshot.snapshotId, snapshot);
  }
  for (const snapshot of snapshots) {
    for (const parentId of snapshot.parentSnapshotIds) {
      if (parentId === snapshot.snapshotId) throw new Error(`snapshot cannot parent itself: ${snapshot.snapshotId}`);
      if (!byId.has(parentId)) throw new Error(`unknown parent snapshot: ${parentId}`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error(`research version graph cycle detected at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const parentId of byId.get(id).parentSnapshotIds) visit(parentId);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id);

  const parentIds = new Set(snapshots.flatMap((snapshot) => snapshot.parentSnapshotIds));
  const roots = snapshots.filter((snapshot) => snapshot.parentSnapshotIds.length === 0).map((snapshot) => snapshot.snapshotId).sort();
  const heads = snapshots.filter((snapshot) => !parentIds.has(snapshot.snapshotId)).map((snapshot) => snapshot.snapshotId).sort();
  const records = [...snapshots]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.snapshotId.localeCompare(b.snapshotId))
    .map((snapshot) => ({ snapshotId: snapshot.snapshotId, snapshotSha256: snapshot.snapshotSha256, parentSnapshotIds: snapshot.parentSnapshotIds }));

  const payload = {
    contractVersion: RESEARCH_VERSION_GRAPH_VERSION,
    workspaceId,
    roots,
    heads,
    snapshots: records,
  };
  return Object.freeze({ ...payload, graphSha256: sha256(stableJson(payload)) });
}

export function validateResearchVersionGraph(graph) {
  if (!graph || graph.contractVersion !== RESEARCH_VERSION_GRAPH_VERSION) return false;
  if (typeof graph.graphSha256 !== 'string' || !Array.isArray(graph.snapshots)) return false;
  return graph.graphSha256 === sha256(stableJson(graphPayload(graph)));
}

function findReplayPath(graph, fromSnapshotId, toSnapshotId) {
  const parents = new Map(graph.snapshots.map((snapshot) => [snapshot.snapshotId, snapshot.parentSnapshotIds]));
  if (!parents.has(fromSnapshotId) || !parents.has(toSnapshotId)) throw new Error('replay endpoints must exist in the version graph');
  const queue = [[toSnapshotId]];
  const seen = new Set();
  while (queue.length) {
    const reversePath = queue.shift();
    const current = reversePath[reversePath.length - 1];
    if (current === fromSnapshotId) return reversePath.reverse();
    if (seen.has(current)) continue;
    seen.add(current);
    for (const parent of parents.get(current) ?? []) queue.push([...reversePath, parent]);
  }
  throw new Error(`${fromSnapshotId} is not an ancestor of ${toSnapshotId}`);
}

export function createReplayReceipt({ graph, snapshots, fromSnapshotId, toSnapshotId }) {
  if (!validateResearchVersionGraph(graph)) throw new TypeError('graph must be an intact research version graph');
  if (!Array.isArray(snapshots)) throw new TypeError('snapshots must be an array');
  const byId = new Map(snapshots.map((snapshot) => [snapshot.snapshotId, snapshot]));
  const from = byId.get(fromSnapshotId);
  const to = byId.get(toSnapshotId);
  if (!from || !to || !validateResearchSnapshot(from) || !validateResearchSnapshot(to)) {
    throw new Error('replay endpoints require intact snapshot objects');
  }
  if (from.workspaceId !== graph.workspaceId || to.workspaceId !== graph.workspaceId) throw new Error('replay workspace mismatch');
  const path = findReplayPath(graph, fromSnapshotId, toSnapshotId);
  const diff = compareResearchSnapshots({ before: from, after: to });
  const payload = {
    contractVersion: RESEARCH_VERSION_GRAPH_VERSION,
    workspaceId: graph.workspaceId,
    graphSha256: graph.graphSha256,
    fromSnapshotId,
    toSnapshotId,
    path,
    pathSnapshotSha256: path.map((id) => requireSha(byId.get(id)?.snapshotSha256, `snapshot ${id} digest`)),
    diffSha256: diff.diffSha256,
  };
  return Object.freeze({ ...payload, diff, replaySha256: sha256(stableJson(payload)) });
}

export function validateReplayReceipt(replay) {
  if (!replay || replay.contractVersion !== RESEARCH_VERSION_GRAPH_VERSION) return false;
  if (typeof replay.replaySha256 !== 'string' || !Array.isArray(replay.path)) return false;
  return replay.replaySha256 === sha256(stableJson(replayPayload(replay)));
}
