import { RESEARCH_CONTRACT_VERSION, sha256, stableJson } from './research-workspace.js';

const DISTANCE_METRICS = Object.freeze(['cosine', 'dot_product', 'euclidean', 'hybrid']);

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

export function createRetrieverDescriptor({
  retrieverId,
  version,
  mode,
  distanceMetric,
  embeddingProvider = null,
  embeddingModel = null,
  dimensions = null,
}) {
  requireString(retrieverId, 'retrieverId');
  requireString(version, 'version');
  requireString(mode, 'mode');
  if (!DISTANCE_METRICS.includes(distanceMetric)) {
    throw new TypeError(`distanceMetric must be one of: ${DISTANCE_METRICS.join(', ')}`);
  }

  if (embeddingProvider !== null) requireString(embeddingProvider, 'embeddingProvider');
  if (embeddingModel !== null) requireString(embeddingModel, 'embeddingModel');
  if (dimensions !== null) requirePositiveInteger(dimensions, 'dimensions');

  if ((embeddingProvider === null) !== (embeddingModel === null)) {
    throw new Error('embeddingProvider and embeddingModel must be supplied together');
  }

  return Object.freeze({
    contractVersion: RESEARCH_CONTRACT_VERSION,
    retrieverId,
    version,
    mode,
    distanceMetric,
    embeddingProvider,
    embeddingModel,
    dimensions,
  });
}

export function createIndexManifest({
  workspaceId,
  indexId,
  indexRevision,
  retriever,
  spans,
  chunking = {},
}) {
  requireString(workspaceId, 'workspaceId');
  requireString(indexId, 'indexId');
  requireString(indexRevision, 'indexRevision');
  if (!retriever || retriever.contractVersion !== RESEARCH_CONTRACT_VERSION) {
    throw new TypeError('retriever must be a research retriever descriptor');
  }
  if (!Array.isArray(spans) || spans.length === 0) {
    throw new TypeError('spans must contain at least one evidence span');
  }
  if (!chunking || typeof chunking !== 'object' || Array.isArray(chunking)) {
    throw new TypeError('chunking must be an object');
  }

  const seen = new Set();
  const records = spans.map((span) => {
    if (!span || span.workspaceId !== workspaceId) {
      throw new Error('every indexed span must belong to the index workspace');
    }
    requireString(span.spanId, 'span.spanId');
    requireString(span.documentId, 'span.documentId');
    requireString(span.sourceId, 'span.sourceId');
    requireString(span.revision, 'span.revision');
    requireString(span.quoteSha256, 'span.quoteSha256');
    if (seen.has(span.spanId)) throw new Error(`duplicate indexed span: ${span.spanId}`);
    seen.add(span.spanId);

    return {
      spanId: span.spanId,
      documentId: span.documentId,
      sourceId: span.sourceId,
      revision: span.revision,
      start: span.start,
      end: span.end,
      quoteSha256: span.quoteSha256,
    };
  }).sort((a, b) => a.spanId.localeCompare(b.spanId));

  const payload = {
    contractVersion: RESEARCH_CONTRACT_VERSION,
    workspaceId,
    indexId,
    indexRevision,
    retriever,
    chunking,
    records,
  };

  return Object.freeze({
    ...payload,
    manifestSha256: sha256(stableJson(payload)),
  });
}

export function validateRetrievalAgainstIndex({ manifest, retrievalReceipt }) {
  if (!manifest || manifest.contractVersion !== RESEARCH_CONTRACT_VERSION) {
    throw new TypeError('manifest must be a research index manifest');
  }
  if (!retrievalReceipt || retrievalReceipt.contractVersion !== RESEARCH_CONTRACT_VERSION) {
    throw new TypeError('retrievalReceipt must be a research retrieval receipt');
  }

  const errors = [];
  if (retrievalReceipt.workspaceId !== manifest.workspaceId) {
    errors.push({ code: 'WORKSPACE_MISMATCH' });
  }
  if (retrievalReceipt.indexRevision !== manifest.indexRevision) {
    errors.push({ code: 'INDEX_REVISION_MISMATCH' });
  }
  if (retrievalReceipt.retriever !== manifest.retriever.retrieverId) {
    errors.push({ code: 'RETRIEVER_MISMATCH' });
  }

  const indexedSpanIds = new Set(manifest.records.map((record) => record.spanId));
  const seenRanks = new Set();
  for (const result of retrievalReceipt.results) {
    if (!indexedSpanIds.has(result.spanId)) {
      errors.push({ code: 'UNKNOWN_INDEX_SPAN', spanId: result.spanId });
    }
    if (seenRanks.has(result.rank)) {
      errors.push({ code: 'DUPLICATE_RESULT_RANK', rank: result.rank });
    }
    seenRanks.add(result.rank);
  }

  return Object.freeze({
    ok: errors.length === 0,
    gate: errors.length === 0 ? 'RETRIEVAL_RECEIPT_VALID' : 'RETRIEVAL_RECEIPT_INVALID',
    errors,
  });
}
