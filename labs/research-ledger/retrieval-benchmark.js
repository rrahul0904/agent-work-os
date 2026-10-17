import {
  RETRIEVAL_BENCHMARK_VERSION,
  RETRIEVAL_BENCHMARK_K,
  BENCHMARK_CHUNKS,
  BENCHMARK_CASES,
  evaluateRanking,
  aggregateMetrics,
  lexicalBenchmarkResults,
  hybridBenchmarkResults
} from './retrieval-benchmark-core.js';
import { SEMANTIC_MODEL_ID, SEMANTIC_MODEL_REVISION, TRANSFORMERS_JS_VERSION } from './semantic-core.js';

const $ = selector => document.querySelector(selector);
const REQUEST_TIMEOUT_MS = 180_000;
let worker = null;
let sequence = 0;
const pending = new Map();

function setStatus(message, state = 'idle') {
  const el = $('#benchmarkStatus');
  el.textContent = message;
  el.dataset.state = state;
}

function settlePending(requestId, kind, value) {
  const request = pending.get(requestId);
  if (!request) return;
  pending.delete(requestId);
  clearTimeout(request.timer);
  request[kind](value);
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker('/semantic-worker.js', { type: 'module', name: 'research-ledger-benchmark' });
  worker.onmessage = event => {
    const message = event.data || {};
    if (message.type === 'model-status') {
      setStatus(message.state === 'ready' ? 'Pinned semantic model ready.' : 'Loading pinned semantic model…', message.state);
      return;
    }
    if (message.type === 'model-progress') {
      const p = message.progress || {};
      const percent = Number.isFinite(p.progress) ? ` ${Math.round(p.progress)}%` : '';
      setStatus(`Downloading/caching benchmark model${percent}${p.file ? ` · ${p.file}` : ''}`, 'loading');
      return;
    }
    if (message.type === 'index-progress') {
      setStatus(`Embedding benchmark corpus… ${message.indexed}/${message.total}`, 'indexing');
      return;
    }
    if (message.type === 'error') {
      settlePending(message.requestId, 'reject', new Error(message.message || 'Benchmark worker failed'));
      return;
    }
    settlePending(message.requestId, 'resolve', message);
  };
  worker.onerror = event => {
    for (const [requestId, request] of pending) {
      clearTimeout(request.timer);
      request.reject(new Error(event.message || 'Benchmark worker crashed'));
      pending.delete(requestId);
    }
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function requestWorker(type, payload = {}) {
  const semanticWorker = ensureWorker();
  const requestId = `bench_${Date.now().toString(36)}_${++sequence}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`${type} request exceeded ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s`));
    }, REQUEST_TIMEOUT_MS);
    pending.set(requestId, { resolve, reject, timer });
    semanticWorker.postMessage({ type, requestId, ...payload });
  });
}

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function renderSummary(report) {
  const root = $('#benchmarkSummary');
  root.innerHTML = ['lexical', 'semantic', 'hybrid'].map(mode => {
    const metric = report.metrics[mode];
    return `<article><span>${mode.toUpperCase()}</span><strong>Recall@${report.k}: ${pct(metric.recallAtK)}</strong><em>MRR ${metric.mrr.toFixed(3)}</em></article>`;
  }).join('');
}

function renderRows(rows) {
  const body = $('#benchmarkRows');
  body.innerHTML = rows.map(row => `
    <tr>
      <td><strong>${row.id}</strong><small>${row.language} · ${row.kind}</small></td>
      <td>${row.query}</td>
      <td>${row.expected.join(', ')}</td>
      <td>${row.lexical.rank ?? '—'}</td>
      <td>${row.semantic.rank ?? '—'}</td>
      <td>${row.hybrid.rank ?? '—'}</td>
    </tr>`).join('');
}

function downloadReport(report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `research-ledger-retrieval-benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function runBenchmark() {
  const run = $('#runBenchmark');
  const download = $('#downloadBenchmark');
  window.__researchLedgerBenchmarkReport = null;
  window.__researchLedgerBenchmarkFailure = null;
  run.disabled = true;
  download.disabled = true;
  $('#benchmarkRows').innerHTML = '';
  $('#benchmarkSummary').innerHTML = '';
  try {
    setStatus('Preparing benchmark corpus…', 'indexing');
    const indexKey = `${RETRIEVAL_BENCHMARK_VERSION}:${SEMANTIC_MODEL_REVISION}`;
    await requestWorker('index', {
      indexKey,
      chunks: BENCHMARK_CHUNKS.map(chunk => ({ id: chunk.id, title: chunk.title, text: chunk.text }))
    });

    const rows = [];
    for (let index = 0; index < BENCHMARK_CASES.length; index += 1) {
      const testCase = BENCHMARK_CASES[index];
      setStatus(`Running case ${index + 1}/${BENCHMARK_CASES.length}: ${testCase.id}`, 'running');
      const lexicalResults = lexicalBenchmarkResults(testCase.query, RETRIEVAL_BENCHMARK_K);
      const semanticResponse = await requestWorker('search', { query: testCase.query, limit: RETRIEVAL_BENCHMARK_K });
      const semanticResults = semanticResponse.results || [];
      const hybridResults = hybridBenchmarkResults(lexicalResults, semanticResults, RETRIEVAL_BENCHMARK_K);
      rows.push({
        ...testCase,
        lexical: evaluateRanking(lexicalResults, testCase.expected),
        semantic: evaluateRanking(semanticResults, testCase.expected),
        hybrid: evaluateRanking(hybridResults, testCase.expected),
        rankings: {
          lexical: lexicalResults.map(item => item.id),
          semantic: semanticResults.map(item => item.id),
          hybrid: hybridResults.map(item => item.id)
        }
      });
    }

    const report = {
      schema: RETRIEVAL_BENCHMARK_VERSION,
      generatedAt: new Date().toISOString(),
      k: RETRIEVAL_BENCHMARK_K,
      model: { id: SEMANTIC_MODEL_ID, revision: SEMANTIC_MODEL_REVISION, transformers: TRANSFORMERS_JS_VERSION, dtype: 'q8' },
      corpus: { chunks: BENCHMARK_CHUNKS.length, cases: BENCHMARK_CASES.length },
      metrics: {
        lexical: aggregateMetrics(rows, 'lexical'),
        semantic: aggregateMetrics(rows, 'semantic'),
        hybrid: aggregateMetrics(rows, 'hybrid')
      },
      rows
    };
    window.__researchLedgerBenchmarkReport = report;
    renderSummary(report);
    renderRows(rows);
    setStatus('Benchmark complete. Review metrics and download the JSON receipt before making retrieval-default decisions.', 'ready');
    download.disabled = false;
    download.onclick = () => downloadReport(report);
  } catch (error) {
    const failure = { message: error?.message || 'Benchmark failed', at: new Date().toISOString(), status: $('#benchmarkStatus')?.textContent || '' };
    window.__researchLedgerBenchmarkFailure = failure;
    setStatus(`Benchmark failed: ${failure.message}`, 'error');
  } finally {
    run.disabled = false;
  }
}

$('#runBenchmark').onclick = runBenchmark;
window.addEventListener('beforeunload', () => worker?.terminate?.(), { once: true });
