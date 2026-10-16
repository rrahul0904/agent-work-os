import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCanonicalDocument,
  createEvidenceSpan,
  createRetrievalReceipt,
} from '../../../packages/evidence/src/research-workspace.js';
import {
  createIndexManifest,
  createRetrieverDescriptor,
} from '../../../packages/evidence/src/retrieval-index.js';
import { fuseHybridRetrieval } from '../../../packages/evidence/src/hybrid-retriever.js';

const workspaceId = 'workspace-hybrid';

function fixture() {
  const document = createCanonicalDocument({
    workspaceId,
    documentId: 'doc-1',
    sourceId: 'source-1',
    revision: 'rev-1',
    text: 'Lexical evidence. Semantic evidence. Shared evidence.',
  });
  const lexical = createEvidenceSpan({ spanId: 'span-lexical', document, start: 0, end: 17 });
  const semanticStart = document.text.indexOf('Semantic');
  const semantic = createEvidenceSpan({ spanId: 'span-semantic', document, start: semanticStart, end: semanticStart + 18 });
  const sharedStart = document.text.indexOf('Shared');
  const shared = createEvidenceSpan({ spanId: 'span-shared', document, start: sharedStart, end: document.text.length });
  const spans = [lexical, semantic, shared];

  const hybridRetriever = createRetrieverDescriptor({
    retrieverId: 'hybrid-rrf-v1',
    version: '1.0.0',
    mode: 'local',
    distanceMetric: 'hybrid',
  });
  const manifest = createIndexManifest({
    workspaceId,
    indexId: 'index-hybrid',
    indexRevision: 'index-rev-1',
    retriever: hybridRetriever,
    spans,
    chunking: { strategy: 'fixture' },
  });

  const query = 'evidence retrieval';
  const lexicalReceipt = createRetrievalReceipt({
    workspaceId,
    queryId: 'query-lexical',
    query,
    indexRevision: manifest.indexRevision,
    retriever: 'local-lexical-v1',
    parameters: { algorithm: 'binary-token-cosine' },
    results: [
      { spanId: 'span-lexical', rank: 1, score: 0.95 },
      { spanId: 'span-shared', rank: 2, score: 0.7 },
    ],
  });
  const vectorReceipt = createRetrievalReceipt({
    workspaceId,
    queryId: 'query-vector',
    query,
    indexRevision: manifest.indexRevision,
    retriever: 'vector-cosine-v1',
    parameters: { algorithm: 'exact-cosine' },
    results: [
      { spanId: 'span-semantic', rank: 1, score: 0.98 },
      { spanId: 'span-shared', rank: 2, score: 0.8 },
    ],
  });
  return { manifest, query, lexicalReceipt, vectorReceipt };
}

test('hybrid retrieval fuses component rankings and binds their receipt hashes', () => {
  const { manifest, query, lexicalReceipt, vectorReceipt } = fixture();
  const receipt = fuseHybridRetrieval({
    manifest,
    queryId: 'query-hybrid',
    query,
    lexicalReceipt,
    vectorReceipt,
    lexicalWeight: 0.3,
    vectorWeight: 0.7,
    rrfK: 60,
    topK: 3,
  });

  assert.equal(receipt.results[0].spanId, 'span-semantic');
  assert.equal(receipt.parameters.algorithm, 'weighted-rrf');
  assert.equal(receipt.parameters.lexicalReceiptSha256, lexicalReceipt.receiptSha256);
  assert.equal(receipt.parameters.vectorReceiptSha256, vectorReceipt.receiptSha256);
  assert.equal(receipt.receiptSha256.length, 64);
});

test('hybrid retrieval rejects a tampered component receipt', () => {
  const { manifest, query, lexicalReceipt, vectorReceipt } = fixture();
  const tampered = {
    ...vectorReceipt,
    results: [{ spanId: 'span-lexical', rank: 1, score: 1 }],
  };

  assert.throws(
    () => fuseHybridRetrieval({
      manifest,
      queryId: 'query-hybrid',
      query,
      lexicalReceipt,
      vectorReceipt: tampered,
    }),
    /integrity failure/,
  );
});

test('hybrid retrieval rejects component receipts from another index revision', () => {
  const { manifest, query, lexicalReceipt, vectorReceipt } = fixture();
  const stale = createRetrievalReceipt({
    workspaceId,
    queryId: vectorReceipt.queryId,
    query,
    indexRevision: 'stale-index-revision',
    retriever: vectorReceipt.retriever,
    parameters: vectorReceipt.parameters,
    results: vectorReceipt.results,
  });

  assert.throws(
    () => fuseHybridRetrieval({
      manifest,
      queryId: 'query-hybrid',
      query,
      lexicalReceipt,
      vectorReceipt: stale,
    }),
    /index revision mismatch/,
  );
});

test('hybrid receipt is deterministic for identical component receipts and weights', () => {
  const { manifest, query, lexicalReceipt, vectorReceipt } = fixture();
  const first = fuseHybridRetrieval({
    manifest,
    queryId: 'query-hybrid',
    query,
    lexicalReceipt,
    vectorReceipt,
    lexicalWeight: 0.4,
    vectorWeight: 0.6,
  });
  const second = fuseHybridRetrieval({
    manifest,
    queryId: 'query-hybrid',
    query,
    lexicalReceipt,
    vectorReceipt,
    lexicalWeight: 0.4,
    vectorWeight: 0.6,
  });

  assert.equal(first.receiptSha256, second.receiptSha256);
  assert.deepEqual(first.results, second.results);
});
