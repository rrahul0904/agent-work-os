import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalizeText,
  createCanonicalDocument,
  createClaim,
  createEvidenceSpan,
  createResearchReceipt,
  validateResearchBundle,
} from '../../../packages/evidence/src/research-workspace.js';

test('canonical text normalizes line endings deterministically', () => {
  assert.equal(canonicalizeText('alpha\r\nbeta\rgamma'), 'alpha\nbeta\ngamma');

  const first = createCanonicalDocument({
    documentId: 'doc-1',
    sourceId: 'source-1',
    revision: 'sha-1',
    text: 'alpha\r\nbeta',
  });
  const second = createCanonicalDocument({
    documentId: 'doc-1',
    sourceId: 'source-1',
    revision: 'sha-1',
    text: 'alpha\nbeta',
  });

  assert.equal(first.contentSha256, second.contentSha256);
  assert.equal(first.text, 'alpha\nbeta');
});

test('evidence spans are exact revision-bound character ranges', () => {
  const document = createCanonicalDocument({
    documentId: 'doc-1',
    sourceId: 'source-1',
    revision: 'sha-1',
    text: 'ResearchBench keeps document processing local.',
  });
  const start = document.text.indexOf('document');
  const end = start + 'document processing'.length;
  const span = createEvidenceSpan({ spanId: 'span-1', document, start, end });

  assert.equal(span.quote, 'document processing');
  assert.equal(span.revision, 'sha-1');
  assert.throws(
    () => createEvidenceSpan({ spanId: 'bad-span', document, start: 0, end: document.text.length + 1 }),
    /outside the canonical document/,
  );
});

test('bundle validation rejects missing evidence and revision drift', () => {
  const document = createCanonicalDocument({
    documentId: 'doc-1',
    sourceId: 'source-1',
    revision: 'sha-1',
    text: 'Exact evidence is bound to one source revision.',
  });
  const span = createEvidenceSpan({ spanId: 'span-1', document, start: 0, end: 14 });
  const claim = createClaim({ claimId: 'claim-1', text: 'The evidence is exact.', evidenceSpanIds: ['span-1'] });

  const valid = validateResearchBundle({ documents: [document], spans: [span], claims: [claim] });
  assert.equal(valid.ok, true);
  assert.equal(valid.semanticVerificationRequired, true);

  const missing = validateResearchBundle({
    documents: [document],
    spans: [span],
    claims: [{ ...claim, evidenceSpanIds: ['span-missing'] }],
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.errors[0].code, 'UNKNOWN_EVIDENCE_SPAN');

  const drifted = validateResearchBundle({
    documents: [document],
    spans: [{ ...span, revision: 'sha-2' }],
    claims: [claim],
  });
  assert.equal(drifted.ok, false);
  assert.equal(drifted.errors[0].code, 'REVISION_MISMATCH');
});

test('structural citations never masquerade as semantic verification', () => {
  const document = createCanonicalDocument({
    documentId: 'doc-1',
    sourceId: 'source-1',
    revision: 'sha-1',
    text: 'A valid citation span can still fail to entail a generated claim.',
  });
  const span = createEvidenceSpan({ spanId: 'span-1', document, start: 0, end: document.text.length });
  const claim = createClaim({
    claimId: 'claim-1',
    text: 'This statement still needs semantic verification.',
    evidenceSpanIds: ['span-1'],
  });

  const result = validateResearchBundle({ documents: [document], spans: [span], claims: [claim] });
  assert.equal(result.gate, 'STRUCTURAL_EVIDENCE_VALID');
  assert.equal(result.semanticVerificationRequired, true);
});

test('research receipts are deterministic regardless of input ordering', () => {
  const docA = createCanonicalDocument({ documentId: 'doc-a', sourceId: 'source-a', revision: 'sha-a', text: 'Alpha evidence.' });
  const docB = createCanonicalDocument({ documentId: 'doc-b', sourceId: 'source-b', revision: 'sha-b', text: 'Beta evidence.' });
  const spanA = createEvidenceSpan({ spanId: 'span-a', document: docA, start: 0, end: docA.text.length });
  const spanB = createEvidenceSpan({ spanId: 'span-b', document: docB, start: 0, end: docB.text.length });
  const claimA = createClaim({ claimId: 'claim-a', text: 'Alpha claim.', evidenceSpanIds: ['span-a'] });
  const claimB = createClaim({ claimId: 'claim-b', text: 'Beta claim.', evidenceSpanIds: ['span-b'] });

  const first = createResearchReceipt({
    workspaceId: 'workspace-1',
    documents: [docA, docB],
    spans: [spanA, spanB],
    claims: [claimA, claimB],
    verifier: 'structural-v0',
  });
  const second = createResearchReceipt({
    workspaceId: 'workspace-1',
    documents: [docB, docA],
    spans: [spanB, spanA],
    claims: [claimB, claimA],
    verifier: 'structural-v0',
  });

  assert.equal(first.receiptSha256, second.receiptSha256);
});
