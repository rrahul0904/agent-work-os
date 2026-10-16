import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalizeText,
  createCanonicalDocument,
  createClaim,
  createEvidenceSpan,
  createResearchReceipt,
  createRetrievalReceipt,
  validateResearchBundle,
} from '../../../packages/evidence/src/research-workspace.js';

const WORKSPACE_ID = 'workspace-1';

test('canonical text normalizes line endings deterministically', () => {
  assert.equal(canonicalizeText('alpha\r\nbeta\rgamma'), 'alpha\nbeta\ngamma');

  const first = createCanonicalDocument({
    workspaceId: WORKSPACE_ID,
    documentId: 'doc-1',
    sourceId: 'source-1',
    revision: 'sha-1',
    text: 'alpha\r\nbeta',
  });
  const second = createCanonicalDocument({
    workspaceId: WORKSPACE_ID,
    documentId: 'doc-1',
    sourceId: 'source-1',
    revision: 'sha-1',
    text: 'alpha\nbeta',
  });

  assert.equal(first.contentSha256, second.contentSha256);
  assert.equal(first.text, 'alpha\nbeta');
  assert.equal(first.workspaceId, WORKSPACE_ID);
});

test('evidence spans are exact revision-bound character ranges', () => {
  const document = createCanonicalDocument({
    workspaceId: WORKSPACE_ID,
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
  assert.equal(span.workspaceId, WORKSPACE_ID);
  assert.throws(
    () => createEvidenceSpan({ spanId: 'bad-span', document, start: 0, end: document.text.length + 1 }),
    /outside the canonical document/,
  );
});

test('bundle validation rejects missing evidence and revision drift', () => {
  const document = createCanonicalDocument({
    workspaceId: WORKSPACE_ID,
    documentId: 'doc-1',
    sourceId: 'source-1',
    revision: 'sha-1',
    text: 'Exact evidence is bound to one source revision.',
  });
  const span = createEvidenceSpan({ spanId: 'span-1', document, start: 0, end: 14 });
  const claim = createClaim({ workspaceId: WORKSPACE_ID, claimId: 'claim-1', text: 'The evidence is exact.', evidenceSpanIds: ['span-1'] });

  const valid = validateResearchBundle({ workspaceId: WORKSPACE_ID, documents: [document], spans: [span], claims: [claim] });
  assert.equal(valid.ok, true);
  assert.equal(valid.semanticVerificationRequired, true);

  const missing = validateResearchBundle({
    workspaceId: WORKSPACE_ID,
    documents: [document],
    spans: [span],
    claims: [{ ...claim, evidenceSpanIds: ['span-missing'] }],
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.errors[0].code, 'UNKNOWN_EVIDENCE_SPAN');

  const drifted = validateResearchBundle({
    workspaceId: WORKSPACE_ID,
    documents: [document],
    spans: [{ ...span, revision: 'sha-2' }],
    claims: [claim],
  });
  assert.equal(drifted.ok, false);
  assert.equal(drifted.errors[0].code, 'REVISION_MISMATCH');
});

test('cross-workspace evidence is rejected before claim acceptance', () => {
  const documentA = createCanonicalDocument({
    workspaceId: 'workspace-a',
    documentId: 'doc-a',
    sourceId: 'source-a',
    revision: 'sha-a',
    text: 'Workspace A evidence.',
  });
  const spanA = createEvidenceSpan({ spanId: 'span-a', document: documentA, start: 0, end: documentA.text.length });
  const claimB = createClaim({
    workspaceId: 'workspace-b',
    claimId: 'claim-b',
    text: 'This claim must not borrow evidence from workspace A.',
    evidenceSpanIds: ['span-a'],
  });

  const result = validateResearchBundle({
    workspaceId: 'workspace-b',
    documents: [documentA],
    spans: [spanA],
    claims: [claimB],
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.code === 'WORKSPACE_MISMATCH'), true);
  assert.equal(result.errors.some((error) => error.code === 'CROSS_WORKSPACE_EVIDENCE'), true);
});

test('structural citations never masquerade as semantic verification', () => {
  const document = createCanonicalDocument({
    workspaceId: WORKSPACE_ID,
    documentId: 'doc-1',
    sourceId: 'source-1',
    revision: 'sha-1',
    text: 'A valid citation span can still fail to entail a generated claim.',
  });
  const span = createEvidenceSpan({ spanId: 'span-1', document, start: 0, end: document.text.length });
  const claim = createClaim({
    workspaceId: WORKSPACE_ID,
    claimId: 'claim-1',
    text: 'This statement still needs semantic verification.',
    evidenceSpanIds: ['span-1'],
  });

  const result = validateResearchBundle({ workspaceId: WORKSPACE_ID, documents: [document], spans: [span], claims: [claim] });
  assert.equal(result.gate, 'STRUCTURAL_EVIDENCE_VALID');
  assert.equal(result.semanticVerificationRequired, true);
});

test('retrieval receipts bind query, index revision, retriever, parameters, ranks, and scores', () => {
  const first = createRetrievalReceipt({
    workspaceId: WORKSPACE_ID,
    queryId: 'query-1',
    query: ' local evidence ',
    indexRevision: 'index-sha-1',
    retriever: 'hybrid-v0',
    parameters: { topK: 2, alpha: 0.5 },
    results: [
      { spanId: 'span-b', rank: 2, score: 0.71 },
      { spanId: 'span-a', rank: 1, score: 0.88 },
    ],
  });
  const second = createRetrievalReceipt({
    workspaceId: WORKSPACE_ID,
    queryId: 'query-1',
    query: 'local evidence',
    indexRevision: 'index-sha-1',
    retriever: 'hybrid-v0',
    parameters: { alpha: 0.5, topK: 2 },
    results: [
      { spanId: 'span-a', rank: 1, score: 0.88 },
      { spanId: 'span-b', rank: 2, score: 0.71 },
    ],
  });

  assert.deepEqual(first.results.map((result) => result.spanId), ['span-a', 'span-b']);
  assert.equal(first.receiptSha256, second.receiptSha256);
  assert.throws(
    () => createRetrievalReceipt({
      workspaceId: WORKSPACE_ID,
      queryId: 'query-2',
      query: 'bad score',
      indexRevision: 'index-sha-1',
      retriever: 'hybrid-v0',
      results: [{ spanId: 'span-a', score: Number.NaN }],
    }),
    /finite number/,
  );
});

test('research receipts are deterministic regardless of input ordering', () => {
  const docA = createCanonicalDocument({ workspaceId: WORKSPACE_ID, documentId: 'doc-a', sourceId: 'source-a', revision: 'sha-a', text: 'Alpha evidence.' });
  const docB = createCanonicalDocument({ workspaceId: WORKSPACE_ID, documentId: 'doc-b', sourceId: 'source-b', revision: 'sha-b', text: 'Beta evidence.' });
  const spanA = createEvidenceSpan({ spanId: 'span-a', document: docA, start: 0, end: docA.text.length });
  const spanB = createEvidenceSpan({ spanId: 'span-b', document: docB, start: 0, end: docB.text.length });
  const claimA = createClaim({ workspaceId: WORKSPACE_ID, claimId: 'claim-a', text: 'Alpha claim.', evidenceSpanIds: ['span-a'] });
  const claimB = createClaim({ workspaceId: WORKSPACE_ID, claimId: 'claim-b', text: 'Beta claim.', evidenceSpanIds: ['span-b'] });

  const first = createResearchReceipt({
    workspaceId: WORKSPACE_ID,
    documents: [docA, docB],
    spans: [spanA, spanB],
    claims: [claimA, claimB],
    verifier: 'structural-v0',
  });
  const second = createResearchReceipt({
    workspaceId: WORKSPACE_ID,
    documents: [docB, docA],
    spans: [spanB, spanA],
    claims: [claimB, claimA],
    verifier: 'structural-v0',
  });

  assert.equal(first.receiptSha256, second.receiptSha256);
});
