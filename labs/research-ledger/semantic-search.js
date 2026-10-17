import {
  SEMANTIC_MODEL_ID,
  SEMANTIC_MODEL_REVISION,
  SEMANTIC_MAX_CHUNKS,
  buildSemanticChunks,
  selectCoverageChunks,
  lexicalRank,
  rankOverlap,
  reciprocalRankFusion
} from './semantic-core.js';

const DB_NAME = 'research-ledger';
const DB_VERSION = 3;
let worker = null;
let workerSequence = 0;
let indexedKey = '';
let indexedChunks = [];
let allChunkCount = 0;
const pending = new Map();

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStore(name) {
  const db = await openDb();
  try {
    if (!db.objectStoreNames.contains(name)) return [];
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(name, 'readonly');
      const request = tx.objectStore(name).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function semanticFingerprint(chunks) {
  const canonical = chunks.map(chunk => `${chunk.id}\n${chunk.title}\n${chunk.text}`).join('\n---\n');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function setSemanticStatus(message, state = 'idle') {
  const status = document.querySelector('#semanticStatus');
  if (!status) return;
  status.dataset.state = state;
  status.textContent = message;
}

function ensureWorker() {
  if (worker) return worker;
  if (!('Worker' in window)) throw new Error('This browser does not support Web Workers');
  worker = new Worker('/semantic-worker.js', { type: 'module', name: 'research-ledger-semantic' });
  worker.onmessage = event => {
    const message = event.data || {};
    if (message.type === 'model-status') {
      setSemanticStatus(message.state === 'ready' ? 'Local embedding model ready.' : 'Loading pinned multilingual embedding model…', message.state);
      return;
    }
    if (message.type === 'model-progress') {
      const p = message.progress || {};
      const percent = Number.isFinite(p.progress) ? ` ${Math.round(p.progress)}%` : '';
      const file = p.file ? ` · ${p.file}` : '';
      setSemanticStatus(`Downloading/caching local model${percent}${file}`, 'loading');
      return;
    }
    if (message.type === 'index-progress') {
      setSemanticStatus(`Embedding passages locally… ${message.indexed}/${message.total}`, 'indexing');
      return;
    }
    if (message.type === 'error') {
      const request = pending.get(message.requestId);
      if (request) {
        pending.delete(message.requestId);
        request.reject(new Error(message.message || 'Semantic worker failed'));
      }
      return;
    }
    const request = pending.get(message.requestId);
    if (request) {
      pending.delete(message.requestId);
      request.resolve(message);
    }
  };
  worker.onerror = event => {
    for (const request of pending.values()) request.reject(new Error(event.message || 'Semantic worker crashed'));
    pending.clear();
    worker.terminate();
    worker = null;
    indexedKey = '';
  };
  return worker;
}

function requestWorker(type, payload = {}) {
  const semanticWorker = ensureWorker();
  const requestId = `sem_${Date.now().toString(36)}_${++workerSequence}`;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    semanticWorker.postMessage({ type, requestId, ...payload });
  });
}

async function loadEvidenceChunks() {
  const [documents, captures] = await Promise.all([readStore('documents'), readStore('captures')]);
  const all = buildSemanticChunks(documents, captures);
  allChunkCount = all.length;
  return selectCoverageChunks(all, SEMANTIC_MAX_CHUNKS);
}

async function ensureSemanticIndex() {
  const chunks = await loadEvidenceChunks();
  if (!chunks.length) throw new Error('Add a local document or captured source before semantic search');
  const key = await semanticFingerprint(chunks);
  if (key === indexedKey && indexedChunks.length) return chunks;
  const indexed = await requestWorker('index', {
    indexKey: key,
    chunks: chunks.map(chunk => ({ id: chunk.id, title: chunk.title, text: chunk.text }))
  });
  indexedKey = indexed.indexKey || key;
  indexedChunks = chunks;
  return chunks;
}

async function hybridRetrieve(query, lexicalResults = [], limit = 7) {
  const chunks = await ensureSemanticIndex();
  const breadth = Math.max(limit * 2, 12);
  const response = await requestWorker('search', { query, limit: breadth });
  const semanticResults = response.results || [];
  const lexicalResultsNormalized = lexicalResults.length
    ? lexicalResults.slice(0, breadth).map(item => ({ id: item.id, score: Number(item.score) || 0 }))
    : lexicalRank(query, chunks, breadth);
  const results = reciprocalRankFusion([
    { name: 'lexical', results: lexicalResultsNormalized },
    { name: 'semantic', results: semanticResults }
  ], limit);
  return {
    results,
    overlap: rankOverlap(semanticResults, lexicalResultsNormalized, Math.min(8, breadth)),
    coverage: { indexed: chunks.length, total: allChunkCount, complete: chunks.length === allChunkCount },
    model: SEMANTIC_MODEL_ID,
    revision: SEMANTIC_MODEL_REVISION,
    fusion: 'rrf',
    rrfK: 60
  };
}

function openSemanticPassage(id) {
  const chunk = indexedChunks.find(item => item.id === id);
  if (!chunk) return;
  const dialog = document.querySelector('#passageDialog');
  document.querySelector('#passageId').textContent = chunk.id;
  document.querySelector('#passageTitle').textContent = chunk.title;
  document.querySelector('#passageText').textContent = chunk.text;
  dialog?.showModal?.();
}

function renderSemanticResults(query, semanticResults, chunks) {
  const root = document.querySelector('#localResults');
  if (!root) return;
  const chunkMap = new Map(chunks.map(chunk => [chunk.id, chunk]));
  const lexical = lexicalRank(query, chunks, 8);
  const overlap = rankOverlap(semanticResults, lexical, 8);
  root.innerHTML = semanticResults.length ? semanticResults.map((result, index) => {
    const chunk = chunkMap.get(result.id);
    if (!chunk) return '';
    const excerpt = String(chunk.text || '').replace(/\s+/g, ' ').trim();
    const clipped = excerpt.length > 340 ? `${excerpt.slice(0, 339)}…` : excerpt;
    return `<div class="passage-result semantic-result"><button data-semantic-passage="${escapeHtml(result.id)}">${escapeHtml(result.id)} · ${escapeHtml(chunk.title)}</button><p>${escapeHtml(clipped)}</p><small>semantic rank ${index + 1} · cosine ${Number(result.score).toFixed(4)}</small></div>`;
  }).join('') : '<div class="empty-state small">No semantic results.</div>';
  root.querySelectorAll('[data-semantic-passage]').forEach(button => {
    button.onclick = () => openSemanticPassage(button.dataset.semanticPassage);
  });
  const coverage = allChunkCount > chunks.length ? ` · coverage ${chunks.length}/${allChunkCount} chunks` : ` · ${chunks.length} chunks`;
  setSemanticStatus(`Semantic search ready · top-${semanticResults.length} overlap with lexical ${overlap.overlap}/${overlap.limit || 0}${coverage}`, 'ready');
}

async function runSemanticSearch() {
  const button = document.querySelector('#runSemanticSearch');
  const query = (document.querySelector('#localSearch')?.value || document.querySelector('#question')?.value || '').trim();
  if (!query) {
    setSemanticStatus('Enter a search query first.', 'error');
    return;
  }
  button.disabled = true;
  button.textContent = 'Semantic…';
  try {
    setSemanticStatus('Preparing local semantic index…', 'indexing');
    const chunks = await ensureSemanticIndex();
    const response = await requestWorker('search', { query, limit: 8 });
    renderSemanticResults(query, response.results || [], chunks);
  } catch (error) {
    setSemanticStatus(`Semantic search unavailable: ${error.message}. Lexical search remains available.`, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Semantic search';
  }
}

function injectBriefRetrievalUi() {
  if (document.querySelector('#briefRetrieval')) return;
  const modeRow = document.querySelector('.mode-row');
  if (!modeRow) return;
  const label = document.createElement('label');
  label.className = 'brief-retrieval-control';
  label.innerHTML = `<span>Brief retrieval</span><select id="briefRetrieval" aria-label="Brief retrieval mode"><option value="lexical">Lexical · default</option><option value="hybrid">Hybrid RRF · experimental</option></select>`;
  modeRow.appendChild(label);
  const select = label.querySelector('select');
  select.value = localStorage.getItem('research-ledger:brief-retrieval') === 'hybrid' ? 'hybrid' : 'lexical';
  select.onchange = () => {
    localStorage.setItem('research-ledger:brief-retrieval', select.value);
    setSemanticStatus(select.value === 'hybrid' ? 'Hybrid briefs will load the local embedding model when needed.' : 'Grounded briefs use deterministic lexical retrieval.', 'idle');
  };
}

function injectSemanticUi() {
  if (document.querySelector('#runSemanticSearch')) return;
  const row = document.querySelector('.local-search-row');
  const results = document.querySelector('#localResults');
  if (!row || !results) return;
  const button = document.createElement('button');
  button.id = 'runSemanticSearch';
  button.type = 'button';
  button.textContent = 'Semantic search';
  button.title = 'Opt-in multilingual semantic retrieval. First use downloads and caches a pinned quantized model; source text stays in this browser.';
  row.appendChild(button);
  const note = document.createElement('div');
  note.className = 'semantic-note';
  note.innerHTML = `<strong>Optional local embeddings.</strong> First use downloads a pinned quantized ${escapeHtml(SEMANTIC_MODEL_ID)} model. Your passages are embedded inside a Web Worker and are not sent to the model host. <span id="semanticStatus" data-state="idle">Not loaded.</span>`;
  results.insertAdjacentElement('beforebegin', note);
  button.onclick = runSemanticSearch;
  injectBriefRetrievalUi();

  const style = document.createElement('style');
  style.textContent = `.semantic-note{margin:10px 0 12px;padding:10px 12px;border:1px solid rgba(32,37,31,.12);border-radius:10px;font-size:12px;line-height:1.45;color:#687066;background:rgba(255,255,255,.45)}.semantic-note strong{color:#20251f}.semantic-note #semanticStatus{display:block;margin-top:4px}.semantic-note #semanticStatus[data-state="error"]{color:#8a3427}.semantic-result small{display:block;margin-top:5px;color:#687066;font-size:11px}.local-search-row #runSemanticSearch{white-space:nowrap}.brief-retrieval-control{display:flex;align-items:center;gap:7px;margin-left:auto;font-size:12px;color:#687066}.brief-retrieval-control select{border:1px solid rgba(32,37,31,.15);border-radius:8px;padding:6px 8px;background:rgba(255,255,255,.75);color:#20251f}`;
  document.head.appendChild(style);
}

window.ResearchLedgerSemantic = Object.freeze({ hybridRetrieve });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectSemanticUi, { once: true });
else injectSemanticUi();

window.addEventListener('beforeunload', () => worker?.terminate?.(), { once: true });
