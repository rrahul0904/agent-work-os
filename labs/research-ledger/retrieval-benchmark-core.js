import { lexicalRank, reciprocalRankFusion } from './semantic-core.js';

export const RETRIEVAL_BENCHMARK_VERSION = 'research-ledger/retrieval-benchmark.v2';
export const RETRIEVAL_BENCHMARK_K = 5;

export const BENCHMARK_CHUNKS = [
  {
    id: 'PRIV.C1', docId: 'PRIV', title: 'Local privacy architecture',
    text: 'Research Ledger stores uploaded documents and research state in browser-local storage. Source passages stay on the user device unless a bounded retrieved passage is explicitly sent for optional generation.'
  },
  {
    id: 'RET.C1', docId: 'RET', title: 'Retention notes',
    text: 'Subscriber churn rises when customers stop receiving recurring value. Retention work should identify why people discontinue the service and which product behaviors predict cancellation.'
  },
  {
    id: 'REV.C1', docId: 'REV', title: 'Revenue definition',
    text: 'Annual recurring revenue measures the normalized yearly value of recurring subscription contracts. It excludes one-time professional services and other non-recurring fees.'
  },
  {
    id: 'RISK.C1', docId: 'RISK', title: 'Decision risk',
    text: 'A recommendation should expose uncertainty and seek evidence that could falsify the leading conclusion instead of collecting only confirming material.'
  },
  {
    id: 'PERF.C1', docId: 'PERF', title: 'Performance note',
    text: 'Large notebooks should cap expensive semantic embedding work and preserve source coverage so early documents do not crowd later sources out of the retrieval index.'
  },
  {
    id: 'SEC.C1', docId: 'SEC', title: 'Network boundary',
    text: 'Remote freshness checks reject private network destinations, validate DNS answers, pin the outbound connection to the vetted address, and revalidate every redirect.'
  },
  {
    id: 'POD.C1', docId: 'POD', title: 'Podcast output',
    text: 'The podcast studio produces a cited two-host transcript. Playback uses browser speech synthesis and does not claim a downloadable encoded audio file.'
  },
  {
    id: 'SNAP.C1', docId: 'SNAP', title: 'Snapshot and replay',
    text: 'A durable research snapshot binds the question, brief, and evidence hash. Replay restores an older conclusion for inspection without mutating the underlying evidence store.'
  },
  {
    id: 'PROV.C1', docId: 'PROV', title: 'Citation provenance',
    text: 'PDF-derived passages preserve page markers. Clicking a citation opens the exact local passage used by the brief so the wording and page provenance can be inspected.'
  },
  {
    id: 'CAP.C1', docId: 'CAP', title: 'Captured source persistence',
    text: 'Explicitly captured sources persist in IndexedDB and restore after reload. Imported AI chat is labeled context-only rather than treated as independent verification.'
  },
  {
    id: 'HYB.C1', docId: 'HYB', title: 'Retrieval mode policy',
    text: 'Grounded briefs use deterministic lexical retrieval by default. Hybrid reciprocal-rank fusion is experimental and automatically falls back to lexical retrieval if semantic inference is unavailable.'
  },
  {
    id: 'DIST.C1', docId: 'DIST', title: 'Distractor: browser history',
    text: 'A browser history feature can list recently visited pages and URLs. This distractor mentions browser storage terminology but does not describe the Research Ledger evidence store.'
  },
  {
    id: 'DIST.C2', docId: 'DIST', title: 'Distractor: recurring calendar',
    text: 'An annual calendar repeats events every year. The words annual and recurring appear here, but this passage is not about subscription revenue.'
  },
  {
    id: 'DIST.C3', docId: 'DIST', title: 'Distractor: network diagram',
    text: 'A network diagram can display private and public subnets. It does not define the URL freshness security controls used by the research workspace.'
  },
  {
    id: 'DIST.C4', docId: 'DIST', title: 'Distractor: snapshot image',
    text: 'A screenshot snapshot captures pixels from a page for visual comparison. It does not replay a prior research conclusion or preserve a research evidence hash.'
  }
];

export const BENCHMARK_CASES = [
  { id: 'exact-arr', language: 'en', kind: 'exact', query: 'annual recurring revenue', expected: ['REV.C1'] },
  { id: 'paraphrase-churn', language: 'en', kind: 'paraphrase', query: 'Why do customers stop using the product?', expected: ['RET.C1'] },
  { id: 'paraphrase-falsify', language: 'en', kind: 'paraphrase', query: 'How should I challenge a conclusion instead of just confirming it?', expected: ['RISK.C1'] },
  { id: 'spanish-local', language: 'es', kind: 'multilingual', query: '¿Dónde se guardan localmente los documentos y la investigación?', expected: ['PRIV.C1'] },
  { id: 'german-security', language: 'de', kind: 'multilingual', query: 'Wie verhindert die URL-Prüfung Zugriffe auf private Netzwerke?', expected: ['SEC.C1'] },
  { id: 'french-podcast', language: 'fr', kind: 'multilingual', query: 'Comment la sortie podcast est-elle lue sans fichier audio téléchargeable ?', expected: ['POD.C1'] },
  { id: 'coverage-large', language: 'en', kind: 'paraphrase', query: 'How do we keep later sources represented when embedding a large notebook?', expected: ['PERF.C1'] },
  { id: 'privacy-noise', language: 'en', kind: 'noise', query: 'browser storage documents evidence device privacy', expected: ['PRIV.C1'] },
  { id: 'security-noise', language: 'en', kind: 'noise', query: 'private public network DNS redirect address safety', expected: ['SEC.C1'] },
  { id: 'portuguese-arr', language: 'pt', kind: 'multilingual', query: 'Qual métrica representa o valor anual normalizado dos contratos de assinatura recorrente?', expected: ['REV.C1'] },
  { id: 'hindi-local', language: 'hi', kind: 'multilingual', query: 'अपलोड किए गए दस्तावेज़ और रिसर्च की स्थिति स्थानीय रूप से कहाँ रखी जाती है?', expected: ['PRIV.C1'] },
  { id: 'japanese-replay', language: 'ja', kind: 'multilingual', query: '証拠そのものを変更せずに、以前の調査結論を再生して確認するにはどうしますか？', expected: ['SNAP.C1'] },
  { id: 'italian-citation', language: 'it', kind: 'multilingual', query: 'Come posso aprire il passaggio esatto e vedere la pagina PDF collegata a una citazione?', expected: ['PROV.C1'] },
  { id: 'snapshot-paraphrase', language: 'en', kind: 'paraphrase', query: 'Can I inspect an older answer without rewriting the evidence underneath it?', expected: ['SNAP.C1'] },
  { id: 'page-marker-exact', language: 'en', kind: 'exact', query: 'PDF page markers exact local passage citation', expected: ['PROV.C1'] },
  { id: 'history-adversarial', language: 'en', kind: 'adversarial', query: 'Where does Research Ledger keep evidence locally, not the list of websites in browser history?', expected: ['PRIV.C1'] },
  { id: 'podcast-negative', language: 'en', kind: 'adversarial', query: 'Does the podcast feature create a downloadable encoded audio file, or only local browser playback?', expected: ['POD.C1'] },
  { id: 'capture-persistence', language: 'en', kind: 'paraphrase', query: 'What survives a reload when I explicitly add a pasted source or AI conversation?', expected: ['CAP.C1'] },
  { id: 'hybrid-fallback', language: 'en', kind: 'exact', query: 'hybrid retrieval fallback lexical semantic unavailable', expected: ['HYB.C1'] },
  { id: 'spanish-falsify', language: 'es', kind: 'multilingual', query: '¿Cómo busco evidencia que pueda refutar la conclusión principal en vez de solo confirmarla?', expected: ['RISK.C1'] }
];

export function rankOfExpected(results = [], expected = []) {
  const expectedSet = new Set(expected);
  const index = results.findIndex(item => expectedSet.has(item.id));
  return index < 0 ? null : index + 1;
}

export function evaluateRanking(results = [], expected = [], k = RETRIEVAL_BENCHMARK_K) {
  const rank = rankOfExpected(results, expected);
  return {
    rank,
    hitAtK: rank !== null && rank <= k ? 1 : 0,
    reciprocalRank: rank === null ? 0 : 1 / rank
  };
}

export function aggregateMetrics(rows = [], mode, k = RETRIEVAL_BENCHMARK_K) {
  const selected = rows.map(row => row[mode]).filter(Boolean);
  if (!selected.length) return { cases: 0, recallAtK: 0, mrr: 0 };
  return {
    cases: selected.length,
    recallAtK: selected.reduce((sum, item) => sum + item.hitAtK, 0) / selected.length,
    mrr: selected.reduce((sum, item) => sum + item.reciprocalRank, 0) / selected.length
  };
}

export function aggregateGroupedMetrics(rows = [], groupField, modes = ['lexical', 'semantic', 'hybrid']) {
  const groups = {};
  for (const row of rows) {
    const key = String(row[groupField] || 'unknown');
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }
  return Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([key, groupRows]) => [
    key,
    Object.fromEntries(modes.map(mode => [mode, aggregateMetrics(groupRows, mode)]))
  ]));
}

export function lexicalBenchmarkResults(query, limit = RETRIEVAL_BENCHMARK_K) {
  return lexicalRank(query, BENCHMARK_CHUNKS, limit);
}

export function hybridBenchmarkResults(lexicalResults, semanticResults, limit = RETRIEVAL_BENCHMARK_K) {
  return reciprocalRankFusion([
    { name: 'lexical', results: lexicalResults },
    { name: 'semantic', results: semanticResults }
  ], limit);
}
