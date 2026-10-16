import { createRetrievalReceipt } from './research-workspace.js';
import { validateRetrievalAgainstIndex } from './retrieval-index.js';

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

export function tokenizeForRetrieval(text) {
  requireString(text, 'text');
  return text
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

function binaryCosineScore(queryTokens, documentTokens) {
  const querySet = new Set(queryTokens);
  const documentSet = new Set(documentTokens);
  if (querySet.size === 0 || documentSet.size === 0) return 0;

  let overlap = 0;
  for (const token of querySet) {
    if (documentSet.has(token)) overlap += 1;
  }
  if (overlap === 0) return 0;
  return overlap / Math.sqrt(querySet.size * documentSet.size);
}

export function retrieveLocalLexical({
  manifest,
  spans,
  queryId,
  query,
  topK = 5,
}) {
  if (!manifest || !Array.isArray(manifest.records)) {
    throw new TypeError('manifest must be an index manifest');
  }
  if (!Array.isArray(spans)) {
    throw new TypeError('spans must be an array');
  }
  requireString(queryId, 'queryId');
  requireString(query, 'query');
  requirePositiveInteger(topK, 'topK');

  const byId = new Map();
  for (const span of spans) {
    if (!span || span.workspaceId !== manifest.workspaceId) {
      throw new Error('every retrieval span must belong to the index workspace');
    }
    if (byId.has(span.spanId)) throw new Error(`duplicate retrieval span: ${span.spanId}`);
    byId.set(span.spanId, span);
  }

  const queryTokens = tokenizeForRetrieval(query);
  const scored = [];

  for (const record of manifest.records) {
    const span = byId.get(record.spanId);
    if (!span) throw new Error(`indexed span is missing from retrieval corpus: ${record.spanId}`);
    if (span.quoteSha256 !== record.quoteSha256 || span.revision !== record.revision) {
      throw new Error(`indexed span drift detected: ${record.spanId}`);
    }

    const score = binaryCosineScore(queryTokens, tokenizeForRetrieval(span.quote));
    if (score > 0) scored.push({ spanId: span.spanId, score });
  }

  scored.sort((a, b) => b.score - a.score || a.spanId.localeCompare(b.spanId));
  const results = scored.slice(0, topK).map((result, index) => ({
    spanId: result.spanId,
    rank: index + 1,
    score: Number(result.score.toFixed(12)),
  }));

  const receipt = createRetrievalReceipt({
    workspaceId: manifest.workspaceId,
    queryId,
    query,
    indexRevision: manifest.indexRevision,
    retriever: manifest.retriever.retrieverId,
    parameters: {
      algorithm: 'binary-token-cosine',
      topK,
      tokenizer: 'unicode-alnum-nfkc-lower-en-US/v1',
    },
    results,
  });

  const validation = validateRetrievalAgainstIndex({ manifest, retrievalReceipt: receipt });
  if (!validation.ok) {
    throw new Error(`retrieval receipt failed index validation: ${validation.errors.map((error) => error.code).join(', ')}`);
  }

  return receipt;
}
