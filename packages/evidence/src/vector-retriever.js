import { createRetrievalReceipt, sha256, stableJson } from './research-workspace.js';
import { validateIndexManifestIntegrity, validateRetrievalAgainstIndex } from './retrieval-index.js';

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

function validateVector(vector, dimensions, name) {
  if (!Array.isArray(vector) || vector.length !== dimensions) {
    throw new TypeError(`${name} must contain exactly ${dimensions} dimensions`);
  }
  for (const value of vector) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`${name} must contain only finite numbers`);
    }
  }
  return vector;
}

function cosineSimilarity(left, right) {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

export function createEmbeddingRecord({ span, retriever, vector }) {
  if (!span || !span.workspaceId || !span.spanId) {
    throw new TypeError('span must be a research evidence span');
  }
  if (!retriever || !retriever.embeddingProvider || !retriever.embeddingModel || !retriever.dimensions) {
    throw new TypeError('retriever must declare embedding provider, model, and dimensions');
  }
  validateVector(vector, retriever.dimensions, 'vector');

  const payload = {
    workspaceId: span.workspaceId,
    spanId: span.spanId,
    sourceId: span.sourceId,
    revision: span.revision,
    quoteSha256: span.quoteSha256,
    embeddingProvider: retriever.embeddingProvider,
    embeddingModel: retriever.embeddingModel,
    dimensions: retriever.dimensions,
    vector: [...vector],
  };

  return Object.freeze({
    ...payload,
    vectorSha256: sha256(stableJson(payload.vector)),
  });
}

export function retrieveVectorCosine({
  manifest,
  embeddings,
  queryId,
  query,
  queryVector,
  topK = 5,
}) {
  if (!validateIndexManifestIntegrity(manifest)) {
    throw new TypeError('manifest must be an intact research index manifest');
  }
  const retriever = manifest.retriever;
  if (!retriever.embeddingProvider || !retriever.embeddingModel || !retriever.dimensions) {
    throw new Error('vector retrieval requires an embedding-backed retriever descriptor');
  }
  if (retriever.distanceMetric !== 'cosine') {
    throw new Error('exact vector retriever currently supports cosine distance only');
  }
  if (!Array.isArray(embeddings)) throw new TypeError('embeddings must be an array');
  requireString(queryId, 'queryId');
  requireString(query, 'query');
  requirePositiveInteger(topK, 'topK');
  validateVector(queryVector, retriever.dimensions, 'queryVector');

  const embeddingBySpan = new Map();
  for (const embedding of embeddings) {
    if (!embedding || embedding.workspaceId !== manifest.workspaceId) {
      throw new Error('every embedding must belong to the index workspace');
    }
    if (embeddingBySpan.has(embedding.spanId)) {
      throw new Error(`duplicate embedding for span: ${embedding.spanId}`);
    }
    if (
      embedding.embeddingProvider !== retriever.embeddingProvider
      || embedding.embeddingModel !== retriever.embeddingModel
      || embedding.dimensions !== retriever.dimensions
    ) {
      throw new Error(`embedding identity mismatch for span: ${embedding.spanId}`);
    }
    validateVector(embedding.vector, retriever.dimensions, `embedding ${embedding.spanId}`);
    if (embedding.vectorSha256 !== sha256(stableJson(embedding.vector))) {
      throw new Error(`embedding vector integrity failure: ${embedding.spanId}`);
    }
    embeddingBySpan.set(embedding.spanId, embedding);
  }

  const scored = [];
  for (const record of manifest.records) {
    const embedding = embeddingBySpan.get(record.spanId);
    if (!embedding) throw new Error(`indexed span is missing an embedding: ${record.spanId}`);
    if (embedding.revision !== record.revision || embedding.quoteSha256 !== record.quoteSha256) {
      throw new Error(`embedding source drift detected: ${record.spanId}`);
    }
    scored.push({
      spanId: record.spanId,
      score: cosineSimilarity(queryVector, embedding.vector),
    });
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
    retriever: retriever.retrieverId,
    parameters: {
      algorithm: 'exact-cosine',
      topK,
      embeddingProvider: retriever.embeddingProvider,
      embeddingModel: retriever.embeddingModel,
      dimensions: retriever.dimensions,
      queryVectorSha256: sha256(stableJson(queryVector)),
    },
    results,
  });

  const validation = validateRetrievalAgainstIndex({ manifest, retrievalReceipt: receipt });
  if (!validation.ok) {
    throw new Error(`vector retrieval receipt failed index validation: ${validation.errors.map((error) => error.code).join(', ')}`);
  }
  return receipt;
}
