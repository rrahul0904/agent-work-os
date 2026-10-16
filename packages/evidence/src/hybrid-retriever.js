import { createRetrievalReceipt, sha256, stableJson } from './research-workspace.js';
import { validateIndexManifestIntegrity, validateRetrievalAgainstIndex } from './retrieval-index.js';

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function requireWeight(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(`${name} must be a finite number between 0 and 1`);
  }
  return value;
}

function validateReceiptIntegrity(receipt) {
  if (!receipt || typeof receipt !== 'object' || typeof receipt.receiptSha256 !== 'string') return false;
  const { receiptSha256, ...payload } = receipt;
  return receiptSha256 === sha256(stableJson(payload));
}

function validateComponentReceipt({ receipt, workspaceId, indexRevision, query }) {
  if (!validateReceiptIntegrity(receipt)) {
    throw new Error('component retrieval receipt integrity failure');
  }
  if (receipt.workspaceId !== workspaceId) {
    throw new Error('component retrieval receipt workspace mismatch');
  }
  if (receipt.indexRevision !== indexRevision) {
    throw new Error('component retrieval receipt index revision mismatch');
  }
  if (receipt.query !== query.trim()) {
    throw new Error('component retrieval receipt query mismatch');
  }
}

export function fuseHybridRetrieval({
  manifest,
  queryId,
  query,
  lexicalReceipt,
  vectorReceipt,
  lexicalWeight = 0.35,
  vectorWeight = 0.65,
  rrfK = 60,
  topK = 5,
}) {
  if (!validateIndexManifestIntegrity(manifest)) {
    throw new TypeError('manifest must be an intact research index manifest');
  }
  if (manifest.retriever.distanceMetric !== 'hybrid') {
    throw new Error('hybrid fusion requires a hybrid retriever descriptor');
  }
  requireString(queryId, 'queryId');
  requireString(query, 'query');
  requireWeight(lexicalWeight, 'lexicalWeight');
  requireWeight(vectorWeight, 'vectorWeight');
  if (lexicalWeight + vectorWeight === 0) {
    throw new RangeError('at least one hybrid retrieval weight must be greater than zero');
  }
  if (!Number.isInteger(rrfK) || rrfK < 0) throw new TypeError('rrfK must be a non-negative integer');
  if (!Number.isInteger(topK) || topK <= 0) throw new TypeError('topK must be a positive integer');

  validateComponentReceipt({
    receipt: lexicalReceipt,
    workspaceId: manifest.workspaceId,
    indexRevision: manifest.indexRevision,
    query,
  });
  validateComponentReceipt({
    receipt: vectorReceipt,
    workspaceId: manifest.workspaceId,
    indexRevision: manifest.indexRevision,
    query,
  });

  const scores = new Map();
  const addReceipt = (receipt, weight) => {
    for (const result of receipt.results) {
      const previous = scores.get(result.spanId) ?? 0;
      scores.set(result.spanId, previous + (weight / (rrfK + result.rank)));
    }
  };
  addReceipt(lexicalReceipt, lexicalWeight);
  addReceipt(vectorReceipt, vectorWeight);

  const results = [...scores.entries()]
    .map(([spanId, score]) => ({ spanId, score }))
    .sort((a, b) => b.score - a.score || a.spanId.localeCompare(b.spanId))
    .slice(0, topK)
    .map((result, index) => ({
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
      algorithm: 'weighted-rrf',
      topK,
      rrfK,
      lexicalWeight,
      vectorWeight,
      lexicalRetriever: lexicalReceipt.retriever,
      vectorRetriever: vectorReceipt.retriever,
      lexicalReceiptSha256: lexicalReceipt.receiptSha256,
      vectorReceiptSha256: vectorReceipt.receiptSha256,
    },
    results,
  });

  const validation = validateRetrievalAgainstIndex({ manifest, retrievalReceipt: receipt });
  if (!validation.ok) {
    throw new Error(`hybrid retrieval receipt failed index validation: ${validation.errors.map((error) => error.code).join(', ')}`);
  }
  return receipt;
}
