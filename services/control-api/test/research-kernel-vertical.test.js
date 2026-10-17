import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createIndexManifest,
  createRetrieverDescriptor,
  validateRetrievalAgainstIndex,
} from '../../../packages/evidence/src/retrieval-index.js';
import { retrieveLocalLexical } from '../../../packages/evidence/src/local-retriever.js';
import {
  chunkCanonicalDocument,
  ingestTextSource,
} from '../../../packages/evidence/src/source-ingestion.js';

const workspaceId = 'workspace-vertical';

function runVerticalSlice() {
  const document = ingestTextSource({
    workspaceId,
    sourceId: 'source-private-notes',
    sourceRevision: 'source-rev-2026-10-16',
    documentId: 'doc-private-notes',
    text: [
      'Local-first research keeps private documents on the user controlled execution boundary.',
      'Exact evidence spans bind claims to immutable source revisions.',
      'Retrieval receipts make query execution replayable and auditable.',
    ].join(' '),
  });

  const spans = chunkCanonicalDocument({
    document,
    maxCharacters: 90,
    overlapCharacters: 15,
  });

  const retriever = createRetrieverDescriptor({
    retrieverId: 'local-lexical-v1',
    version: '1.0.0',
    mode: 'local',
    distanceMetric: 'cosine',
  });

  const manifest = createIndexManifest({
    workspaceId,
    indexId: 'index-private-notes',
    indexRevision: 'index-rev-1',
    retriever,
    spans,
    chunking: {
      strategy: 'fixed-character-window',
      maxCharacters: 90,
      overlapCharacters: 15,
    },
  });

  const retrieval = retrieveLocalLexical({
    manifest,
    spans,
    queryId: 'query-replay',
    query: 'replayable auditable retrieval receipts',
    topK: 3,
  });

  return { document, spans, manifest, retrieval };
}

test('local research kernel runs source to canonical evidence to retrieval receipt', () => {
  const { document, spans, manifest, retrieval } = runVerticalSlice();

  assert.equal(document.workspaceId, workspaceId);
  assert.equal(spans.length >= 2, true);
  assert.equal(manifest.records.length, spans.length);
  assert.equal(retrieval.results.length > 0, true);
  assert.equal(retrieval.results[0].spanId.startsWith('chunk-doc-private-notes-'), true);

  const validation = validateRetrievalAgainstIndex({
    manifest,
    retrievalReceipt: retrieval,
  });
  assert.equal(validation.ok, true);
});

test('local research kernel is replay-deterministic for identical source and configuration', () => {
  const first = runVerticalSlice();
  const second = runVerticalSlice();

  assert.equal(first.document.contentSha256, second.document.contentSha256);
  assert.deepEqual(first.spans, second.spans);
  assert.equal(first.manifest.manifestSha256, second.manifest.manifestSha256);
  assert.equal(first.retrieval.receiptSha256, second.retrieval.receiptSha256);
});

test('source revision is carried from ingestion through every indexed span', () => {
  const { document, spans, manifest } = runVerticalSlice();

  assert.equal(document.revision, 'source-rev-2026-10-16');
  assert.equal(spans.every((span) => span.revision === document.revision), true);
  assert.equal(manifest.records.every((record) => record.revision === document.revision), true);
});

test('chunk overlap must stay smaller than the chunk window', () => {
  const document = ingestTextSource({
    workspaceId,
    sourceId: 'source-1',
    sourceRevision: 'rev-1',
    documentId: 'doc-1',
    text: 'A deterministic source document used to prove chunk policy validation.',
  });

  assert.throws(
    () => chunkCanonicalDocument({ document, maxCharacters: 20, overlapCharacters: 20 }),
    /smaller than maxCharacters/,
  );
});
