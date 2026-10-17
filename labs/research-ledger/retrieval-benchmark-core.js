import { lexicalRank, reciprocalRankFusion } from './semantic-core.js';

export const RETRIEVAL_BENCHMARK_VERSION = 'research-ledger/retrieval-benchmark.v1';
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
  { id: 'security-noise', language: 'en', kind: 'noise', query: 'private public network DNS redirect address safety', expected: ['SEC.C1'] }
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

export function lexicalBenchmarkResults(query, limit = RETRIEVAL_BENCHMARK_K) {
  return lexicalRank(query, BENCHMARK_CHUNKS, limit);
}

export function hybridBenchmarkResults(lexicalResults, semanticResults, limit = RETRIEVAL_BENCHMARK_K) {
  return reciprocalRankFusion([
    { name: 'lexical', results: lexicalResults },
    { name: 'semantic', results: semanticResults }
  ], limit);
}
