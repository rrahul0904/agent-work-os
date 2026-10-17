import {
  SEMANTIC_MODEL_ID,
  SEMANTIC_MODEL_REVISION,
  TRANSFORMERS_JS_VERSION,
  SEMANTIC_MAX_CHUNKS
} from './semantic-core.js';

const TRANSFORMERS_URL = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_JS_VERSION}/+esm`;
const BATCH_SIZE = 8;
let extractorPromise = null;
let indexedChunks = [];
let vectors = [];
let activeIndexKey = '';

function safeProgress(value) {
  if (!value || typeof value !== 'object') return null;
  const out = {};
  for (const key of ['status', 'file', 'name', 'loaded', 'total', 'progress']) {
    if (value[key] !== undefined && ['string', 'number', 'boolean'].includes(typeof value[key])) out[key] = value[key];
  }
  return out;
}

function post(type, payload = {}) {
  self.postMessage({ type, ...payload });
}

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      post('model-status', { state: 'loading', model: SEMANTIC_MODEL_ID, revision: SEMANTIC_MODEL_REVISION });
      const { pipeline, env } = await import(TRANSFORMERS_URL);
      env.allowRemoteModels = true;
      env.allowLocalModels = false;
      const extractor = await pipeline('feature-extraction', SEMANTIC_MODEL_ID, {
        revision: SEMANTIC_MODEL_REVISION,
        dtype: 'q8',
        progress_callback: data => {
          const progress = safeProgress(data);
          if (progress) post('model-progress', { progress });
        }
      });
      post('model-status', { state: 'ready', model: SEMANTIC_MODEL_ID, revision: SEMANTIC_MODEL_REVISION, dtype: 'q8' });
      return extractor;
    })().catch(error => {
      extractorPromise = null;
      throw error;
    });
  }
  return extractorPromise;
}

function dot(a, b) {
  let total = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) total += a[i] * b[i];
  return total;
}

async function embedPassages(chunks, requestId) {
  const extractor = await getExtractor();
  const nextVectors = [];
  for (let start = 0; start < chunks.length; start += BATCH_SIZE) {
    const batch = chunks.slice(start, start + BATCH_SIZE);
    const output = await extractor(batch.map(chunk => `passage: ${String(chunk.text || '').slice(0, 2200)}`), {
      pooling: 'mean',
      normalize: true
    });
    const rows = output.tolist();
    for (const row of rows) nextVectors.push(Float32Array.from(row));
    post('index-progress', { requestId, indexed: Math.min(start + batch.length, chunks.length), total: chunks.length });
  }
  return nextVectors;
}

async function embedQuery(query) {
  const extractor = await getExtractor();
  const output = await extractor(`query: ${String(query || '').slice(0, 2200)}`, {
    pooling: 'mean',
    normalize: true
  });
  const rows = output.tolist();
  return Float32Array.from(Array.isArray(rows[0]) ? rows[0] : rows);
}

self.onmessage = async event => {
  const message = event.data || {};
  const requestId = message.requestId || '';
  try {
    if (message.type === 'ping') {
      post('pong', {
        requestId,
        model: SEMANTIC_MODEL_ID,
        revision: SEMANTIC_MODEL_REVISION,
        transformers: TRANSFORMERS_JS_VERSION,
        maxChunks: SEMANTIC_MAX_CHUNKS,
        indexed: indexedChunks.length
      });
      return;
    }

    if (message.type === 'index') {
      const chunks = Array.isArray(message.chunks) ? message.chunks.slice(0, SEMANTIC_MAX_CHUNKS) : [];
      if (!chunks.length) throw new Error('No chunks supplied for semantic indexing');
      if (chunks.some(chunk => !chunk?.id || typeof chunk.text !== 'string')) throw new Error('Invalid semantic chunk payload');
      const safeChunks = chunks.map(chunk => ({ id: String(chunk.id), title: String(chunk.title || chunk.id), text: chunk.text }));
      const nextVectors = await embedPassages(safeChunks, requestId);
      indexedChunks = safeChunks;
      vectors = nextVectors;
      activeIndexKey = String(message.indexKey || '');
      post('indexed', { requestId, indexKey: activeIndexKey, count: indexedChunks.length, dimensions: vectors[0]?.length || 0 });
      return;
    }

    if (message.type === 'search') {
      if (!indexedChunks.length || !vectors.length) throw new Error('Semantic index is not ready');
      const query = String(message.query || '').trim();
      if (!query) throw new Error('Semantic query is required');
      const queryVector = await embedQuery(query);
      const limit = Math.max(1, Math.min(Number(message.limit) || 8, 20));
      const results = indexedChunks
        .map((chunk, index) => ({ id: chunk.id, score: dot(queryVector, vectors[index]) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      post('results', { requestId, indexKey: activeIndexKey, query, results });
      return;
    }

    if (message.type === 'dispose') {
      indexedChunks = [];
      vectors = [];
      activeIndexKey = '';
      post('disposed', { requestId });
      return;
    }

    throw new Error(`Unsupported semantic worker message: ${message.type || 'missing'}`);
  } catch (error) {
    post('error', { requestId, message: error?.message || 'Semantic worker failed' });
  }
};
