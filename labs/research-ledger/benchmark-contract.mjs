import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const root = dirname(fileURLToPath(import.meta.url));
const [html, runner, runtime] = await Promise.all([
  readFile(resolve(root, 'retrieval-benchmark.html'), 'utf8'),
  readFile(resolve(root, 'retrieval-benchmark.js'), 'utf8'),
  readFile(resolve(root, 'railway-server.mjs'), 'utf8')
]);

assert.equal(RETRIEVAL_BENCHMARK_VERSION, 'research-ledger/retrieval-benchmark.v1');
assert.equal(RETRIEVAL_BENCHMARK_K, 5);
assert.ok(BENCHMARK_CHUNKS.length >= 8);
assert.ok(BENCHMARK_CASES.length >= 8);
assert.equal(new Set(BENCHMARK_CHUNKS.map(chunk => chunk.id)).size, BENCHMARK_CHUNKS.length, 'benchmark chunk IDs must be unique');
assert.equal(new Set(BENCHMARK_CASES.map(testCase => testCase.id)).size, BENCHMARK_CASES.length, 'benchmark case IDs must be unique');

const chunkIds = new Set(BENCHMARK_CHUNKS.map(chunk => chunk.id));
for (const testCase of BENCHMARK_CASES) {
  assert.ok(testCase.query.length > 4);
  assert.ok(Array.isArray(testCase.expected) && testCase.expected.length > 0);
  for (const id of testCase.expected) assert.ok(chunkIds.has(id), `expected benchmark passage ${id} must exist`);
}
assert.ok(BENCHMARK_CASES.some(testCase => testCase.kind === 'exact'));
assert.ok(BENCHMARK_CASES.some(testCase => testCase.kind === 'paraphrase'));
assert.ok(BENCHMARK_CASES.some(testCase => testCase.kind === 'multilingual'));
assert.ok(BENCHMARK_CASES.some(testCase => testCase.kind === 'noise'));
assert.ok(new Set(BENCHMARK_CASES.map(testCase => testCase.language)).size >= 4, 'benchmark must cover multiple languages');

assert.deepEqual(evaluateRanking([{ id: 'X' }, { id: 'Y' }], ['Y'], 5), { rank: 2, hitAtK: 1, reciprocalRank: 0.5 });
assert.deepEqual(evaluateRanking([{ id: 'X' }], ['Y'], 5), { rank: null, hitAtK: 0, reciprocalRank: 0 });
const aggregate = aggregateMetrics([
  { test: { hitAtK: 1, reciprocalRank: 1 } },
  { test: { hitAtK: 0, reciprocalRank: 0 } },
  { test: { hitAtK: 1, reciprocalRank: 0.5 } }
], 'test', 5);
assert.equal(aggregate.cases, 3);
assert.equal(aggregate.recallAtK, 2 / 3);
assert.equal(aggregate.mrr, 0.5);

const exact = BENCHMARK_CASES.find(testCase => testCase.id === 'exact-arr');
const lexical = lexicalBenchmarkResults(exact.query, 5);
assert.equal(lexical[0]?.id, 'REV.C1', 'exact lexical fixture should provide a deterministic positive control');
const hybrid = hybridBenchmarkResults([{ id: 'A' }, { id: 'B' }], [{ id: 'B' }, { id: 'C' }], 3);
assert.equal(hybrid[0].id, 'B');

assert.match(html, /Quality claims require an executed receipt/);
assert.match(html, /Recall@5 and mean reciprocal rank/);
assert.match(html, /Download JSON receipt/);
assert.match(html, /retrieval-benchmark\.js/);
assert.match(runner, /new Worker\('\/semantic-worker\.js'/);
assert.match(runner, /window\.__researchLedgerBenchmarkReport = report/);
assert.match(runner, /aggregateMetrics\(rows, 'lexical'\)/);
assert.match(runner, /aggregateMetrics\(rows, 'semantic'\)/);
assert.match(runner, /aggregateMetrics\(rows, 'hybrid'\)/);
assert.doesNotMatch(runner, /\/api\/research/, 'benchmark must not send corpus passages to the application generation API');
assert.match(runtime, /retrieval-benchmark\.html/);
assert.match(runtime, /retrieval-benchmark-core\.js/);
assert.match(runtime, /retrieval-benchmark\.js/);

console.log('research-ledger retrieval benchmark contract passed');
