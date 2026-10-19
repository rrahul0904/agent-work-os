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

function requireInteger(value, name) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${name} must be an integer`);
  }
  return value;
}

function payloadFromManifest(manifest) {
  const { manifestSha256: _manifestSha256, ...payload } = manifest;
  return payload;
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

  const embeddingValues = [embeddingProvider, embeddingModel, dimensions];
  const hasEmbedding = embeddingValues.some((value) => value !== null);
  const hasCompleteEmbedding = embeddingValues.every((value) => value !== null);
  if (hasEmbedding && !hasCompleteEmbedding) {
    throw new Error('embeddingProvider, embeddingModel, and dimensions must be supplied together');
  }
  if (hasCompleteEmbedding) {
    requireString(embeddingProvider, 'embeddingProvider');
    requireString(embeddingModel, 'embeddingModel');
    requirePositiveInteger(dimensions, 'dimensions');
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
    if (!span || span.contractVersion !== RESEARCH_CONTRACT_VERSION || span.workspaceId !== workspaceId) {
      throw new Error('every indexed span must be a research evidence span in the index workspace');
    }
    requireString(span.spanId, 'span.spanId');
    requireString(span.documentId, 'span.documentId');
    requireString(span.sourceId, 'span.sourceId');
    requireString(span.revision, 'span.revision');
    requireString(span.quoteSha256, 'span.quoteSha256');
    requireInteger(span.start, 'span.start');
    requireInteger(span.end, 'span.end');
    if (span.start < 0 || span.end <= span.start) {
      throw new RangeError('indexed span offsets are invalid');
    }
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

export function validateIndexManifestIntegrity(manifest) {
  if (!manifest || manifest.contractVersion !== RESEARCH_CONTRACT_VERSION) return false;
  if (typeof manifest.manifestSha256 !== 'string' || manifest.manifestSha256.length !== 64) return false;
  if (!manifest.retriever || !Array.isArray(manifest.records) || manifest.records.length === 0) return false;
  try {
    requireString(manifest.workspaceId, 'manifest.workspaceId');
    requireString(manifest.indexId, 'manifest.indexId');
    requireString(manifest.indexRevision, 'manifest.indexRevision');
    for (const record of manifest.records) {
      requireString(record?.spanId, 'manifest.record.spanId');
      requireString(record?.documentId, 'manifest.record.documentId');
      requireString(record?.sourceId, 'manifest.record.sourceId');
      requireString(record?.revision, 'manifest.record.revision');
      requireString(record?.quoteSha256, 'manifest.record.quoteSha256');
      requireInteger(record?.start, 'manifest.record.start');
      requireInteger(record?.end, 'manifest.record.end');
    }
  } catch {
    return false;
  }
  return manifest.manifestSha256 === sha256(stableJson(payloadFromManifest(manifest)));
}

export function validateRetrievalAgainstIndex({ manifest, retrievalReceipt }) {
  if (!validateIndexManifestIntegrity(manifest)) {
    throw new TypeError('manifest must be an intact research index manifest');
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
