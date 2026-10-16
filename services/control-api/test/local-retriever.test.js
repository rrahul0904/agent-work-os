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
  retrieveLocalLexical,
  tokenizeForRetrieval,
} from '../../../packages/evidence/src/local-retriever.js';

const workspaceId = 'workspace-local-retrieval';

function fixture() {
  const document = createCanonicalDocument({
    workspaceId,
    documentId: 'doc-1',
    sourceId: 'source-1',
    revision: 'rev-1',
    text: 'Local document processing protects private source material. Exact citations make research replayable.',
  });
  const firstEnd = document.text.indexOf(' Exact');
  const privateSpan = createEvidenceSpan({
    spanId: 'span-private',
    document,
    start: 0,
    end: firstEnd,
  });
  const citationSpan = createEvidenceSpan({
    spanId: 'span-citation',
    document,
    start: firstEnd + 1,
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
    indexId: 'index-local',
    indexRevision: 'index-local-rev-1',
    retriever,
    spans: [privateSpan, citationSpan],
    chunking: { strategy: 'fixture-sentences' },
  });
  return { privateSpan, citationSpan, manifest };
}

test('tokenizer is deterministic across case and Unicode normalization', () => {
  assert.deepEqual(tokenizeForRetrieval('Café LOCAL 42'), ['café', 'local', '42']);
  assert.deepEqual(tokenizeForRetrieval('Cafe\u0301 local 42'), ['café', 'local', '42']);
});

test('local lexical retriever returns ranked indexed evidence with a valid receipt', () => {
  const { privateSpan, citationSpan, manifest } = fixture();
  const receipt = retrieveLocalLexical({
    manifest,
    spans: [citationSpan, privateSpan],
    queryId: 'query-1',
    query: 'private local source',
    topK: 2,
  });

  assert.equal(receipt.results[0].spanId, 'span-private');
  assert.equal(receipt.results[0].rank, 1);
  assert.equal(receipt.retriever, 'local-lexical-v1');
  assert.equal(receipt.parameters.algorithm, 'binary-token-cosine');
  assert.equal(receipt.receiptSha256.length, 64);
});

test('local lexical retrieval is deterministic regardless of corpus ordering', () => {
  const { privateSpan, citationSpan, manifest } = fixture();
  const first = retrieveLocalLexical({
    manifest,
    spans: [privateSpan, citationSpan],
    queryId: 'query-2',
    query: 'research citations replayable',
    topK: 2,
  });
  const second = retrieveLocalLexical({
    manifest,
    spans: [citationSpan, privateSpan],
    queryId: 'query-2',
    query: 'research citations replayable',
    topK: 2,
  });

  assert.equal(first.receiptSha256, second.receiptSha256);
  assert.deepEqual(first.results, second.results);
});

test('indexed source drift hard-fails before retrieval receipt creation', () => {
  const { privateSpan, citationSpan, manifest } = fixture();
  const drifted = { ...privateSpan, quoteSha256: '0'.repeat(64) };

  assert.throws(
    () => retrieveLocalLexical({
      manifest,
      spans: [drifted, citationSpan],
      queryId: 'query-3',
      query: 'private source',
    }),
    /drift detected/,
  );
});

test('no token overlap returns a valid empty retrieval receipt', () => {
  const { privateSpan, citationSpan, manifest } = fixture();
  const receipt = retrieveLocalLexical({
    manifest,
    spans: [privateSpan, citationSpan],
    queryId: 'query-4',
    query: 'zebra quasar',
  });

  assert.deepEqual(receipt.results, []);
});
