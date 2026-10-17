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
  validateRetrievalAgainstIndex,
} from '../../../packages/evidence/src/retrieval-index.js';

const workspaceId = 'workspace-index';

function buildFixture() {
  const document = createCanonicalDocument({
    workspaceId,
    documentId: 'doc-1',
    sourceId: 'source-1',
    revision: 'source-rev-1',
    text: 'Alpha evidence. Beta evidence.',
  });
  const alpha = createEvidenceSpan({
    spanId: 'span-alpha',
    document,
    start: 0,
    end: 'Alpha evidence.'.length,
  });
  const betaStart = document.text.indexOf('Beta');
  const beta = createEvidenceSpan({
    spanId: 'span-beta',
    document,
    start: betaStart,
    end: document.text.length,
  });
  const retriever = createRetrieverDescriptor({
    retrieverId: 'local-hybrid-v0',
    version: '0.1.0',
    mode: 'local',
    distanceMetric: 'hybrid',
    embeddingProvider: 'local-browser',
    embeddingModel: 'fixture-embedding-model',
    dimensions: 384,
  });
  const manifest = createIndexManifest({
    workspaceId,
    indexId: 'index-1',
    indexRevision: 'index-rev-1',
    retriever,
    spans: [beta, alpha],
    chunking: { strategy: 'evidence-span', maxCharacters: 1200, overlapCharacters: 120 },
  });
  return { document, alpha, beta, retriever, manifest };
}

test('index manifest is deterministic and strips raw quote text', () => {
  const { alpha, beta, retriever, manifest } = buildFixture();
  const reordered = createIndexManifest({
    workspaceId,
    indexId: 'index-1',
    indexRevision: 'index-rev-1',
    retriever,
    spans: [alpha, beta],
    chunking: { strategy: 'evidence-span', maxCharacters: 1200, overlapCharacters: 120 },
  });

  assert.equal(manifest.manifestSha256, reordered.manifestSha256);
  assert.deepEqual(manifest.records.map((record) => record.spanId), ['span-alpha', 'span-beta']);
  assert.equal('quote' in manifest.records[0], false);
  assert.equal(manifest.records[0].quoteSha256.length, 64);
});

test('retriever descriptor requires an explicit reproducible embedding identity', () => {
  assert.throws(
    () => createRetrieverDescriptor({
      retrieverId: 'broken',
      version: '0.1.0',
      mode: 'local',
      distanceMetric: 'cosine',
      embeddingProvider: 'local-browser',
    }),
    /supplied together/,
  );

  assert.throws(
    () => createRetrieverDescriptor({
      retrieverId: 'broken',
      version: '0.1.0',
      mode: 'local',
      distanceMetric: 'cosine',
      embeddingProvider: 'local-browser',
      embeddingModel: 'model',
      dimensions: 0,
    }),
    /positive integer/,
  );
});

test('retrieval receipt validates against exact index revision and retriever identity', () => {
  const { manifest } = buildFixture();
  const receipt = createRetrievalReceipt({
    workspaceId,
    queryId: 'query-1',
    query: 'alpha',
    indexRevision: manifest.indexRevision,
    retriever: manifest.retriever.retrieverId,
    parameters: { topK: 2 },
    results: [
      { spanId: 'span-alpha', rank: 1, score: 0.91 },
      { spanId: 'span-beta', rank: 2, score: 0.53 },
    ],
  });

  const valid = validateRetrievalAgainstIndex({ manifest, retrievalReceipt: receipt });
  assert.equal(valid.ok, true);
  assert.equal(valid.gate, 'RETRIEVAL_RECEIPT_VALID');

  const stale = validateRetrievalAgainstIndex({
    manifest,
    retrievalReceipt: { ...receipt, indexRevision: 'stale-index' },
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.errors.some((error) => error.code === 'INDEX_REVISION_MISMATCH'), true);
});

test('retrieval cannot cite a span that was not indexed', () => {
  const { manifest } = buildFixture();
  const receipt = createRetrievalReceipt({
    workspaceId,
    queryId: 'query-2',
    query: 'unknown',
    indexRevision: manifest.indexRevision,
    retriever: manifest.retriever.retrieverId,
    results: [{ spanId: 'span-not-indexed', rank: 1, score: 0.88 }],
  });

  const result = validateRetrievalAgainstIndex({ manifest, retrievalReceipt: receipt });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'UNKNOWN_INDEX_SPAN');
});
