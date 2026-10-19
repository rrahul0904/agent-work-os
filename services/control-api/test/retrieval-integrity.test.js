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
  validateIndexManifestIntegrity,
  validateRetrievalAgainstIndex,
} from '../../../packages/evidence/src/retrieval-index.js';

const workspaceId = 'workspace-index-integrity';

function fixture() {
  const document = createCanonicalDocument({
    workspaceId,
    documentId: 'doc-1',
    sourceId: 'source-1',
    revision: 'rev-1',
    text: 'Integrity protected evidence.',
  });
  const span = createEvidenceSpan({
    spanId: 'span-1',
    document,
    start: 0,
    end: document.text.length,
  });
  const retriever = createRetrieverDescriptor({
    retrieverId: 'local-lexical-v1',
    version: '1.0.0',
    mode: 'local',
    distanceMetric: 'cosine',
  });
  const manifest = createIndexManifest({
    workspaceId,
    indexId: 'index-1',
    indexRevision: 'index-rev-1',
    retriever,
    spans: [span],
    chunking: { strategy: 'fixture' },
  });
  return { manifest };
}

test('index manifest integrity fails after nested record mutation', () => {
  const { manifest } = fixture();
  assert.equal(validateIndexManifestIntegrity(manifest), true);

  const tampered = {
    ...manifest,
    records: [{ ...manifest.records[0], revision: 'tampered-revision' }],
  };
  assert.equal(validateIndexManifestIntegrity(tampered), false);
  assert.throws(
    () => validateRetrievalAgainstIndex({
      manifest: tampered,
      retrievalReceipt: createRetrievalReceipt({
        workspaceId,
        queryId: 'query-1',
        query: 'integrity',
        indexRevision: manifest.indexRevision,
        retriever: manifest.retriever.retrieverId,
        results: [{ spanId: 'span-1', rank: 1, score: 1 }],
      }),
    }),
    /intact research index manifest/,
  );
});

test('embedding configuration must identify provider, model, and dimensions together', () => {
  assert.throws(
    () => createRetrieverDescriptor({
      retrieverId: 'embedding-v1',
      version: '1.0.0',
      mode: 'local',
      distanceMetric: 'cosine',
      embeddingProvider: 'local-browser',
      embeddingModel: 'model-with-missing-dimensions',
    }),
    /must be supplied together/,
  );

  const valid = createRetrieverDescriptor({
    retrieverId: 'embedding-v1',
    version: '1.0.0',
    mode: 'local',
    distanceMetric: 'cosine',
    embeddingProvider: 'local-browser',
    embeddingModel: 'model-384',
    dimensions: 384,
  });
  assert.equal(valid.dimensions, 384);
});
