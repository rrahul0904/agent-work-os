import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCanonicalDocument,
  createClaim,
  createEvidenceSpan,
} from '../../../packages/evidence/src/research-workspace.js';
import {
  createClaimVerification,
  evaluateSemanticGate,
} from '../../../packages/evidence/src/claim-verification.js';

const workspaceId = 'workspace-verify';

function fixture() {
  const document = createCanonicalDocument({
    workspaceId,
    documentId: 'doc-1',
    sourceId: 'source-1',
    revision: 'rev-1',
    text: 'The measured value was 42 units in the verified source.',
  });
  const span = createEvidenceSpan({
    spanId: 'span-1',
    document,
    start: 0,
    end: document.text.length,
  });
  const claim = createClaim({
    workspaceId,
    claimId: 'claim-1',
    text: 'The measured value was 42 units.',
    evidenceSpanIds: ['span-1'],
  });
  return { document, span, claim };
}

test('claim verification receipt binds verifier identity, revision, evidence, and status', () => {
  const { span, claim } = fixture();
  const verification = createClaimVerification({
    workspaceId,
    claim,
    evidenceSpans: [span],
    verifierId: 'semantic-verifier',
    verifierRevision: 'model-or-policy-sha-1',
    method: 'hybrid',
    status: 'entailed',
    score: 0.97,
    reasonCodes: ['quote_match', 'numeric_match'],
  });

  assert.equal(verification.status, 'entailed');
  assert.equal(verification.verifierRevision, 'model-or-policy-sha-1');
  assert.deepEqual(verification.reasonCodes, ['numeric_match', 'quote_match']);
  assert.equal(verification.evidence[0].spanId, 'span-1');
  assert.equal(verification.receiptSha256.length, 64);
});

test('verification rejects evidence that is not linked to the claim', () => {
  const { document, claim } = fixture();
  const unrelated = createEvidenceSpan({
    spanId: 'span-unrelated',
    document,
    start: 4,
    end: 12,
  });

  assert.throws(
    () => createClaimVerification({
      workspaceId,
      claim,
      evidenceSpans: [unrelated],
      verifierId: 'semantic-verifier',
      verifierRevision: 'v1',
      method: 'rules',
      status: 'insufficient',
    }),
    /not linked to claim/,
  );
});

test('semantic gate only passes when every claim is independently entailed', () => {
  const { span, claim } = fixture();
  const entailed = createClaimVerification({
    workspaceId,
    claim,
    evidenceSpans: [span],
    verifierId: 'semantic-verifier',
    verifierRevision: 'v1',
    method: 'hybrid',
    status: 'entailed',
    score: 0.95,
  });

  const passing = evaluateSemanticGate({
    workspaceId,
    claims: [claim],
    verifications: [entailed],
  });
  assert.equal(passing.ok, true);
  assert.equal(passing.gate, 'SEMANTIC_EVIDENCE_VERIFIED');

  const contradicted = createClaimVerification({
    workspaceId,
    claim,
    evidenceSpans: [span],
    verifierId: 'semantic-verifier',
    verifierRevision: 'v1',
    method: 'hybrid',
    status: 'contradicted',
    score: 0.93,
    reasonCodes: ['contradiction_detected'],
  });
  const failing = evaluateSemanticGate({
    workspaceId,
    claims: [claim],
    verifications: [contradicted],
  });
  assert.equal(failing.ok, false);
  assert.equal(failing.gate, 'SEMANTIC_EVIDENCE_UNVERIFIED');
  assert.equal(failing.counts.contradicted, 1);
});

test('missing verification keeps the semantic gate closed', () => {
  const { claim } = fixture();
  const result = evaluateSemanticGate({
    workspaceId,
    claims: [claim],
    verifications: [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.counts.missing, 1);
});
