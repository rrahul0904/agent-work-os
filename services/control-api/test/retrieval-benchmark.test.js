import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareRetrievalBenchmarks,
  evaluateRetrievalBenchmark,
} from '../../../packages/evidence/src/retrieval-benchmark.js';

function receipt(results, receiptSha256 = 'a'.repeat(64)) {
  return { results, receiptSha256 };
}

const cases = [
  { caseId: 'case-1', query: 'alpha evidence', expectedSpanIds: ['span-alpha'] },
  { caseId: 'case-2', query: 'beta evidence', expectedSpanIds: ['span-beta'] },
  { caseId: 'case-3', query: 'shared evidence', expectedSpanIds: ['span-shared', 'span-secondary'] },
];

test('retrieval benchmark computes recall, hit rate, and reciprocal rank', () => {
  const benchmark = evaluateRetrievalBenchmark({
    cases,
    k: 2,
    retrieve: ({ caseId }) => {
      if (caseId === 'case-1') return receipt([{ spanId: 'span-alpha' }, { spanId: 'span-other' }]);
      if (caseId === 'case-2') return receipt([{ spanId: 'span-other' }, { spanId: 'span-beta' }]);
      return receipt([{ spanId: 'span-shared' }, { spanId: 'span-other' }]);
    },
  });

  assert.equal(benchmark.caseCount, 3);
  assert.equal(benchmark.hitRateAtK, 1);
  assert.equal(benchmark.recallAtK, (1 + 1 + 0.5) / 3);
  assert.equal(benchmark.meanReciprocalRank, (1 + 0.5 + 1) / 3);
  assert.deepEqual(benchmark.cases[1].retrievedSpanIds, ['span-other', 'span-beta']);
});

test('benchmark comparison reports candidate deltas against the same corpus', () => {
  const baseline = evaluateRetrievalBenchmark({
    cases,
    k: 1,
    retrieve: ({ caseId }) => {
      if (caseId === 'case-1') return receipt([{ spanId: 'span-alpha' }]);
      return receipt([{ spanId: 'span-other' }]);
    },
  });
  const candidate = evaluateRetrievalBenchmark({
    cases,
    k: 1,
    retrieve: ({ caseId }) => {
      if (caseId === 'case-1') return receipt([{ spanId: 'span-alpha' }]);
      if (caseId === 'case-2') return receipt([{ spanId: 'span-beta' }]);
      return receipt([{ spanId: 'span-shared' }]);
    },
  });

  const comparison = compareRetrievalBenchmarks({ baseline, candidate });
  assert.equal(comparison.hitRateAtKDelta > 0, true);
  assert.equal(comparison.meanReciprocalRankDelta > 0, true);
  assert.equal(comparison.recallAtKDelta > 0, true);
});

test('benchmark rejects duplicate case identities and empty expected evidence', () => {
  assert.throws(
    () => evaluateRetrievalBenchmark({
      cases: [cases[0], cases[0]],
      retrieve: () => receipt([]),
    }),
    /duplicate benchmark case id/,
  );

  assert.throws(
    () => evaluateRetrievalBenchmark({
      cases: [{ caseId: 'bad', query: 'bad', expectedSpanIds: [] }],
      retrieve: () => receipt([]),
    }),
    /must contain expectedSpanIds/,
  );
});
