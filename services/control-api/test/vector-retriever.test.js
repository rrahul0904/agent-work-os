import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCanonicalDocument,
  createEvidenceSpan,
} from '../../../packages/evidence/src/research-workspace.js';
import {
  createIndexManifest,
  createRetrieverDescriptor,
} from '../../../packages/evidence/src/retrieval-index.js';
import {
  createEmbeddingRecord,
  retrieveVectorCosine,
} from '../../../packages/evidence/src/vector-retriever.js';

const workspaceId = 'workspace-vector';

function fixture() {
  const document = createCanonicalDocument({
    workspaceId,
    documentId: 'doc-1',
    sourceId: 'source-1',
    revision: 'rev-1',
    text: 'Cats purr. Dogs bark. Retrieval receipts preserve provenance.',
  });
  const cat = createEvidenceSpan({ spanId: 'span-cat', document, start: 0, end: 10 });
  const dogStart = document.text.indexOf('Dogs');
  const dogEnd = dogStart + 'Dogs bark.'.length;
  const dog = createEvidenceSpan({ spanId: 'span-dog', document, start: dogStart, end: dogEnd });
  const provenanceStart = document.text.indexOf('Retrieval');
  const provenance = createEvidenceSpan({ spanId: 'span-provenance', document, start: provenanceStart, end: document.text.length });

  const retriever = createRetrieverDescriptor({
    retrieverId: 'vector-cosine-v1',
    version: '1.0.0',
    mode: 'local',
    distanceMetric: 'cosine',
    embeddingProvider: 'fixture-provider',
    embeddingModel: 'fixture-3d',
    dimensions: 3,
  });
  const spans = [cat, dog, provenance];
  const manifest = createIndexManifest({
    workspaceId,
    indexId: 'index-vector',
    indexRevision: 'index-vector-rev-1',
    retriever,
    spans,
    chunking: { strategy: 'fixture' },
  });
  const embeddings = [
    createEmbeddingRecord({ span: cat, retriever, vector: [1, 0, 0] }),
    createEmbeddingRecord({ span: dog, retriever, vector: [0, 1, 0] }),
    createEmbeddingRecord({ span: provenance, retriever, vector: [0, 0, 1] }),
  ];
  return { retriever, spans, manifest, embeddings };
}

test('exact vector retrieval ranks the nearest indexed evidence and produces a receipt', () => {
  const { manifest, embeddings } = fixture();
  const receipt = retrieveVectorCosine({
    manifest,
    embeddings,
    queryId: 'query-cat',
    query: 'feline sound',
    queryVector: [0.95, 0.05, 0],
    topK: 2,
  });

  assert.equal(receipt.results[0].spanId, 'span-cat');
  assert.equal(receipt.results[0].rank, 1);
  assert.equal(receipt.parameters.algorithm, 'exact-cosine');
  assert.equal(receipt.parameters.embeddingModel, 'fixture-3d');
  assert.equal(receipt.parameters.queryVectorSha256.length, 64);
});

test('vector retrieval is deterministic regardless of embedding record ordering', () => {
  const { manifest, embeddings } = fixture();
  const first = retrieveVectorCosine({
    manifest,
    embeddings,
    queryId: 'query-provenance',
    query: 'provenance receipts',
    queryVector: [0, 0.1, 0.9],
    topK: 3,
  });
  const second = retrieveVectorCosine({
    manifest,
    embeddings: [...embeddings].reverse(),
    queryId: 'query-provenance',
    query: 'provenance receipts',
    queryVector: [0, 0.1, 0.9],
    topK: 3,
  });

  assert.equal(first.receiptSha256, second.receiptSha256);
  assert.deepEqual(first.results, second.results);
});

test('tampered embedding vectors and source revisions hard-fail', () => {
  const { manifest, embeddings } = fixture();
  const tamperedVector = {
    ...embeddings[0],
    vector: [0, 1, 0],
  };
  assert.throws(
    () => retrieveVectorCosine({
      manifest,
      embeddings: [tamperedVector, ...embeddings.slice(1)],
      queryId: 'query-1',
      query: 'cats',
      queryVector: [1, 0, 0],
    }),
    /vector integrity failure/,
  );

  const driftedSource = {
    ...embeddings[0],
    revision: 'other-revision',
  };
  assert.throws(
    () => retrieveVectorCosine({
      manifest,
      embeddings: [driftedSource, ...embeddings.slice(1)],
      queryId: 'query-2',
      query: 'cats',
      queryVector: [1, 0, 0],
    }),
    /source drift detected/,
  );
});

test('vector retrieval rejects wrong query dimensions', () => {
  const { manifest, embeddings } = fixture();
  assert.throws(
    () => retrieveVectorCosine({
      manifest,
      embeddings,
      queryId: 'query-bad',
      query: 'bad dimensions',
      queryVector: [1, 0],
    }),
    /exactly 3 dimensions/,
  );
});
