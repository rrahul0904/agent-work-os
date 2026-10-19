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
import {
  createEmbeddingRecord,
  retrieveVectorCosine,
} from '../../../packages/evidence/src/vector-retriever.js';
import { fuseHybridRetrieval } from '../../../packages/evidence/src/hybrid-retriever.js';

const workspaceId = 'workspace-adversarial-retrieval';

function evidenceFixture() {
  const document = createCanonicalDocument({
    workspaceId,
    documentId: 'doc-1',
    sourceId: 'source-1',
    revision: 'rev-1',
    text: 'Alpha evidence.',
  });
  const span = createEvidenceSpan({ spanId: 'span-alpha', document, start: 0, end: document.text.length });
  return { document, span };
}

test('zero embedding and zero query vectors are rejected instead of ranking arbitrary evidence', () => {
  const { span } = evidenceFixture();
  const retriever = createRetrieverDescriptor({
    retrieverId: 'vector-v1',
    version: '1.0.0',
    mode: 'local',
    distanceMetric: 'cosine',
    embeddingProvider: 'fixture',
    embeddingModel: 'fixture-2d',
    dimensions: 2,
  });
  const manifest = createIndexManifest({
    workspaceId,
    indexId: 'index-vector',
    indexRevision: 'index-rev-1',
    retriever,
    spans: [span],
  });

  assert.throws(
    () => createEmbeddingRecord({ span, retriever, vector: [0, 0] }),
    /zero vector/,
  );

  const embedding = createEmbeddingRecord({ span, retriever, vector: [1, 0] });
  assert.throws(
    () => retrieveVectorCosine({
      manifest,
      embeddings: [embedding],
      queryId: 'query-zero',
      query: 'zero query',
      queryVector: [0, 0],
    }),
    /zero vector/,
  );
});

test('vector minScore can safely return no evidence', () => {
  const { span } = evidenceFixture();
  const retriever = createRetrieverDescriptor({
    retrieverId: 'vector-v1',
    version: '1.0.0',
    mode: 'local',
    distanceMetric: 'cosine',
    embeddingProvider: 'fixture',
    embeddingModel: 'fixture-2d',
    dimensions: 2,
  });
  const manifest = createIndexManifest({
    workspaceId,
    indexId: 'index-vector',
    indexRevision: 'index-rev-1',
    retriever,
    spans: [span],
  });
  const embedding = createEmbeddingRecord({ span, retriever, vector: [1, 0] });
  const receipt = retrieveVectorCosine({
    manifest,
    embeddings: [embedding],
    queryId: 'query-threshold',
    query: 'orthogonal query',
    queryVector: [0, 1],
    minScore: 0,
  });

  assert.deepEqual(receipt.results, []);
});

test('hybrid fusion rejects an integrity-valid component receipt with a non-positive rank', () => {
  const { span } = evidenceFixture();
  const retriever = createRetrieverDescriptor({
    retrieverId: 'hybrid-v1',
    version: '1.0.0',
    mode: 'local',
    distanceMetric: 'hybrid',
  });
  const manifest = createIndexManifest({
    workspaceId,
    indexId: 'index-hybrid',
    indexRevision: 'index-rev-1',
    retriever,
    spans: [span],
  });
  const malformed = createRetrievalReceipt({
    workspaceId,
    queryId: 'lexical',
    query: 'alpha',
    indexRevision: manifest.indexRevision,
    retriever: 'local-lexical-v1',
    results: [{ spanId: span.spanId, rank: -1, score: 1 }],
  });
  const valid = createRetrievalReceipt({
    workspaceId,
    queryId: 'vector',
    query: 'alpha',
    indexRevision: manifest.indexRevision,
    retriever: 'vector-v1',
    results: [{ spanId: span.spanId, rank: 1, score: 1 }],
  });

  assert.throws(
    () => fuseHybridRetrieval({
      manifest,
      queryId: 'hybrid',
      query: 'alpha',
      lexicalReceipt: malformed,
      vectorReceipt: valid,
    }),
    /non-positive rank/,
  );
});
