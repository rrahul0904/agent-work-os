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
  validateClaimVerificationReceipt,
} from '../../../packages/evidence/src/claim-verification.js';

const workspaceId = 'workspace-integrity';

function fixture() {
  const document = createCanonicalDocument({
    workspaceId,
    documentId: 'doc-1',
    sourceId: 'source-1',
    revision: 'rev-1',
    text: 'The verified source supports the claim.',
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
    text: 'The source supports the claim.',
    evidenceSpanIds: ['span-1'],
  });
  return { span, claim };
}

test('semantic gate rejects a hand-constructed entailed object without a valid receipt', () => {
  const { claim } = fixture();
  assert.throws(
    () => evaluateSemanticGate({
      workspaceId,
      claims: [claim],
      verifications: [{
        workspaceId,
        claimId: claim.claimId,
        status: 'entailed',
      }],
    }),
    /invalid claim verification receipt/,
  );
});

test('semantic verification receipt fails integrity after nested evidence mutation', () => {
  const { span, claim } = fixture();
  const verification = createClaimVerification({
    workspaceId,
    claim,
    evidenceSpans: [span],
    verifierId: 'semantic-verifier',
    verifierRevision: 'v1',
    method: 'rules',
    status: 'entailed',
    score: 1,
  });

  assert.equal(validateClaimVerificationReceipt(verification), true);
  const mutated = {
    ...verification,
    evidence: [{ ...verification.evidence[0], revision: 'tampered-revision' }],
  };
  assert.equal(validateClaimVerificationReceipt(mutated), false);
  assert.throws(
    () => evaluateSemanticGate({ workspaceId, claims: [claim], verifications: [mutated] }),
    /invalid claim verification receipt/,
  );
});

test('verification is rejected when claim text changes after verification', () => {
  const { span, claim } = fixture();
  const verification = createClaimVerification({
    workspaceId,
    claim,
    evidenceSpans: [span],
    verifierId: 'semantic-verifier',
    verifierRevision: 'v1',
    method: 'rules',
    status: 'entailed',
  });
  const changedClaim = { ...claim, text: 'A materially changed claim.' };

  assert.throws(
    () => evaluateSemanticGate({
      workspaceId,
      claims: [changedClaim],
      verifications: [verification],
    }),
    /claim text drift detected/,
  );
});
