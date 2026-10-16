import { sha256, stableJson } from './research-workspace.js';
import {
  RESEARCH_VERSION_GRAPH_VERSION,
  validateResearchSnapshot,
  validateResearchVersionGraph,
  validateReplayReceipt,
} from './research-version-graph.js';

export const RESEARCH_HANDOFF_VERSION = 'agent-work-os/research-handoff/v1';

const DEFAULT_APPROVAL_GATES = Object.freeze([
  'external_write',
  'merge',
  'production_deploy',
  'credential_change',
  'billing_change',
]);

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function requireArray(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return value;
}

function uniqueStrings(values, name) {
  return [...new Set(requireArray(values, name).map((value) => requireString(value, name)))].sort();
}

function payloadFromHandoff(handoff) {
  const { handoffSha256: _handoffSha256, ...payload } = handoff;
  return payload;
}

export function createResearchHandoff({
  workspaceId,
  handoffId,
  snapshot,
  graph,
  replayReceipt = null,
  acceptedConclusion,
  openGaps = [],
  nextMoves = [],
  requestedOutcome = 'plan',
  constraints = [],
  evidencePolicy = 'verified-or-explicitly-unverified',
  approvalGates = DEFAULT_APPROVAL_GATES,
  networkPolicy = 'bounded',
}) {
  workspaceId = requireString(workspaceId, 'workspaceId');
  handoffId = requireString(handoffId, 'handoffId');
  acceptedConclusion = requireString(acceptedConclusion, 'acceptedConclusion');
  requestedOutcome = requireString(requestedOutcome, 'requestedOutcome');
  evidencePolicy = requireString(evidencePolicy, 'evidencePolicy');
  networkPolicy = requireString(networkPolicy, 'networkPolicy');

  if (!validateResearchSnapshot(snapshot)) throw new TypeError('snapshot must be an intact research snapshot');
  if (!validateResearchVersionGraph(graph)) throw new TypeError('graph must be an intact research version graph');
  if (snapshot.workspaceId !== workspaceId || graph.workspaceId !== workspaceId) {
    throw new Error('handoff workspace must match the snapshot and graph');
  }
  const graphSnapshot = graph.snapshots.find((record) => record.snapshotId === snapshot.snapshotId);
  if (!graphSnapshot || graphSnapshot.snapshotSha256 !== snapshot.snapshotSha256) {
    throw new Error('handoff snapshot is not bound to the supplied version graph');
  }
  if (replayReceipt !== null) {
    if (!validateReplayReceipt(replayReceipt)) throw new TypeError('replayReceipt must be intact when supplied');
    if (replayReceipt.workspaceId !== workspaceId || replayReceipt.toSnapshotId !== snapshot.snapshotId) {
      throw new Error('replayReceipt must terminate at the handoff snapshot in the same workspace');
    }
  }

  const payload = {
    contractVersion: RESEARCH_HANDOFF_VERSION,
    researchVersionGraphContract: RESEARCH_VERSION_GRAPH_VERSION,
    workspaceId,
    handoffId,
    source: Object.freeze({
      snapshotId: snapshot.snapshotId,
      snapshotSha256: snapshot.snapshotSha256,
      graphSha256: graph.graphSha256,
      replaySha256: replayReceipt?.replaySha256 ?? null,
      evidenceSetSha256: snapshot.evidenceSetSha256,
      semanticGate: snapshot.semanticGate,
    }),
    research: Object.freeze({
      question: snapshot.question,
      mode: snapshot.mode,
      acceptedConclusion,
      status: snapshot.decision.status,
      confidence: snapshot.decision.confidence,
      claimIds: snapshot.claims.map((claim) => claim.claimId),
      openGaps: uniqueStrings(openGaps, 'openGaps'),
      nextMoves: uniqueStrings(nextMoves, 'nextMoves'),
    }),
    requestedOutcome,
    constraints: uniqueStrings(constraints, 'constraints'),
    executionPolicy: Object.freeze({
      evidencePolicy,
      networkPolicy,
      approvalGates: uniqueStrings(approvalGates, 'approvalGates'),
      autoAdvanceAllowed: true,
      irreversibleActionsRequireApproval: true,
    }),
  };

  return Object.freeze({ ...payload, handoffSha256: sha256(stableJson(payload)) });
}

export function validateResearchHandoff(handoff) {
  if (!handoff || handoff.contractVersion !== RESEARCH_HANDOFF_VERSION) return false;
  if (handoff.researchVersionGraphContract !== RESEARCH_VERSION_GRAPH_VERSION) return false;
  if (typeof handoff.handoffSha256 !== 'string' || handoff.handoffSha256.length !== 64) return false;
  try {
    requireString(handoff.workspaceId, 'handoff.workspaceId');
    requireString(handoff.handoffId, 'handoff.handoffId');
    requireString(handoff.source?.snapshotId, 'handoff.source.snapshotId');
    requireString(handoff.source?.snapshotSha256, 'handoff.source.snapshotSha256');
    requireString(handoff.source?.graphSha256, 'handoff.source.graphSha256');
    requireString(handoff.source?.evidenceSetSha256, 'handoff.source.evidenceSetSha256');
    requireString(handoff.research?.question, 'handoff.research.question');
    requireString(handoff.research?.acceptedConclusion, 'handoff.research.acceptedConclusion');
    requireString(handoff.requestedOutcome, 'handoff.requestedOutcome');
    requireArray(handoff.executionPolicy?.approvalGates, 'handoff.executionPolicy.approvalGates');
  } catch {
    return false;
  }
  return handoff.handoffSha256 === sha256(stableJson(payloadFromHandoff(handoff)));
}
