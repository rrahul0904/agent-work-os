import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCanonicalDocument,
  createClaim,
  createEvidenceSpan,
  sha256,
} from '../../../packages/evidence/src/research-workspace.js';
import {
  compareResearchSnapshots,
  createReplayReceipt,
  createResearchSnapshot,
  createResearchVersionGraph,
  validateReplayReceipt,
  validateResearchSnapshot,
  validateResearchVersionGraph,
} from '../../../packages/evidence/src/research-version-graph.js';
import {
  createResearchHandoff,
  validateResearchHandoff,
} from '../../../packages/evidence/src/research-handoff.js';

const workspaceId = 'workspace-research-v03';

function fixture({ revision, text, snapshotId, parentSnapshotIds = [], claimText, status = 'SUPPORTED_WITH_GAPS' }) {
  const document = createCanonicalDocument({
    workspaceId,
    documentId: 'doc-1',
    sourceId: 'source-1',
    revision,
    text,
  });
  const span = createEvidenceSpan({ spanId: `span-${revision}`, document, start: 0, end: document.text.length });
  const claim = createClaim({
    workspaceId,
    claimId: 'claim-1',
    text: claimText,
    evidenceSpanIds: [span.spanId],
  });
  const snapshot = createResearchSnapshot({
    workspaceId,
    snapshotId,
    parentSnapshotIds,
    createdAt: revision === 'r1' ? '2026-10-16T12:00:00.000Z' : '2026-10-16T13:00:00.000Z',
    question: 'Which architecture should we ship?',
    mode: 'recommend',
    evidenceSetSha256: sha256(`${revision}:${document.contentSha256}`),
    documents: [{
      documentId: document.documentId,
      sourceId: document.sourceId,
      revision: document.revision,
      contentSha256: document.contentSha256,
    }],
    claims: [{ claimId: claim.claimId, text: claim.text, evidenceSpanIds: claim.evidenceSpanIds }],
    status,
    confidence: revision === 'r1' ? 0.62 : 0.81,
    conclusion: claim.text,
    gaps: revision === 'r1' ? ['Need an independent source'] : [],
    semanticGate: revision === 'r1' ? 'SEMANTIC_EVIDENCE_UNVERIFIED' : 'SEMANTIC_EVIDENCE_VERIFIED',
  });
  return { document, span, claim, snapshot };
}

test('research snapshots form an integrity-bound graph with deterministic replay diff', () => {
  const first = fixture({
    revision: 'r1',
    text: 'The browser workspace uses a local lexical retrieval baseline.',
    snapshotId: 'snap-1',
    claimText: 'Use the lexical baseline while collecting benchmark evidence.',
  });
  const second = fixture({
    revision: 'r2',
    text: 'The browser workspace uses lexical plus verified hybrid retrieval.',
    snapshotId: 'snap-2',
    parentSnapshotIds: ['snap-1'],
    claimText: 'Use hybrid retrieval because the verified benchmark improved.',
    status: 'SUPPORTED',
  });

  assert.equal(validateResearchSnapshot(first.snapshot), true);
  assert.equal(validateResearchSnapshot(second.snapshot), true);

  const graph = createResearchVersionGraph({ workspaceId, snapshots: [second.snapshot, first.snapshot] });
  assert.equal(validateResearchVersionGraph(graph), true);
  assert.deepEqual(graph.roots, ['snap-1']);
  assert.deepEqual(graph.heads, ['snap-2']);

  const diff = compareResearchSnapshots({ before: first.snapshot, after: second.snapshot });
  assert.equal(diff.evidenceSetChanged, true);
  assert.deepEqual(diff.documents.changed, ['doc-1']);
  assert.deepEqual(diff.claims.changed, ['claim-1']);
  assert.equal(diff.decisionChanged, true);
  assert.equal(diff.semanticGateChanged, true);
  assert.deepEqual(diff.gapsResolved, ['Need an independent source']);

  const replay = createReplayReceipt({
    graph,
    snapshots: [first.snapshot, second.snapshot],
    fromSnapshotId: 'snap-1',
    toSnapshotId: 'snap-2',
  });
  assert.equal(validateReplayReceipt(replay), true);
  assert.deepEqual(replay.path, ['snap-1', 'snap-2']);
  assert.equal(replay.diff.diffSha256, diff.diffSha256);
});

test('research handoff binds execution intent to the exact accepted snapshot and graph', () => {
  const first = fixture({
    revision: 'r1',
    text: 'Initial evidence supports a local-first research workspace.',
    snapshotId: 'snap-1',
    claimText: 'Keep the workspace local-first.',
  });
  const second = fixture({
    revision: 'r2',
    text: 'Updated evidence supports local-first capture plus governed Agent Work OS handoff.',
    snapshotId: 'snap-2',
    parentSnapshotIds: ['snap-1'],
    claimText: 'Keep capture local-first and hand accepted research to Agent Work OS.',
    status: 'SUPPORTED',
  });
  const graph = createResearchVersionGraph({ workspaceId, snapshots: [first.snapshot, second.snapshot] });
  const replay = createReplayReceipt({ graph, snapshots: [first.snapshot, second.snapshot], fromSnapshotId: 'snap-1', toSnapshotId: 'snap-2' });
  const handoff = createResearchHandoff({
    workspaceId,
    handoffId: 'handoff-1',
    snapshot: second.snapshot,
    graph,
    replayReceipt: replay,
    acceptedConclusion: 'Keep capture local-first and hand accepted research to Agent Work OS.',
    nextMoves: ['Create bounded implementation work items', 'Run verification before deployment'],
    requestedOutcome: 'implementation-plan',
    constraints: ['No production deploy without approval'],
  });

  assert.equal(validateResearchHandoff(handoff), true);
  assert.equal(handoff.source.snapshotId, 'snap-2');
  assert.equal(handoff.source.replaySha256, replay.replaySha256);
  assert.equal(handoff.executionPolicy.irreversibleActionsRequireApproval, true);
  assert.ok(handoff.executionPolicy.approvalGates.includes('production_deploy'));

  const tampered = { ...handoff, requestedOutcome: 'deploy-now' };
  assert.equal(validateResearchHandoff(tampered), false);
});

test('version graph rejects cycles even when individual snapshots are internally intact', () => {
  const a = createResearchSnapshot({
    workspaceId,
    snapshotId: 'cycle-a',
    parentSnapshotIds: ['cycle-b'],
    createdAt: '2026-10-16T12:00:00.000Z',
    question: 'Cycle test',
    evidenceSetSha256: sha256('cycle-a'),
    documents: [],
    claims: [],
    status: 'WORKING',
    confidence: 0,
    conclusion: 'No conclusion yet',
  });
  const b = createResearchSnapshot({
    workspaceId,
    snapshotId: 'cycle-b',
    parentSnapshotIds: ['cycle-a'],
    createdAt: '2026-10-16T12:01:00.000Z',
    question: 'Cycle test',
    evidenceSetSha256: sha256('cycle-b'),
    documents: [],
    claims: [],
    status: 'WORKING',
    confidence: 0,
    conclusion: 'No conclusion yet',
  });
  assert.throws(() => createResearchVersionGraph({ workspaceId, snapshots: [a, b] }), /cycle detected/i);
});
