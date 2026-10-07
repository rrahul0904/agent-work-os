import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareBenchmarkRuns,
  createBenchmarkCase,
  createBenchmarkRun,
  createPricingSchedule,
  summarizeBenchmarkRuns,
} from '../src/benchmark-harness.js';

function benchmarkCase(overrides = {}) {
  return createBenchmarkCase({
    id: 'case-1',
    workloadDigest: 'workload-sha',
    contextDigest: 'context-sha',
    requiredCapabilities: ['repo.read'],
    acceptanceCriteria: ['tests-pass'],
    ...overrides,
  });
}

function run({ laneId, usage, outcome = 'accepted', pricing = null, revision = 'rev-1', testCase = benchmarkCase() }) {
  return createBenchmarkRun({
    benchmarkCase: testCase,
    laneId,
    revision,
    usage,
    verification: { outcome },
    durationMs: 100,
    pricing,
  });
}

test('benchmark cases are deterministic and do not contain raw workload text', () => {
  const first = benchmarkCase();
  const second = benchmarkCase();
  assert.equal(first.caseDigest, second.caseDigest);
  assert.equal('prompt' in first, false);
  assert.equal('source' in first, false);
});

test('benchmark run keeps verification outcome separate from resource usage', () => {
  const receipt = run({
    laneId: 'lane-a',
    outcome: 'rejected',
    usage: {
      inputTokens: 100,
      cachedInputTokens: 25,
      outputTokens: 20,
      reasoningOutputTokens: 5,
      turnCount: 2,
      toolCallCount: 3,
    },
  });
  assert.equal(receipt.verificationOutcome, 'rejected');
  assert.equal(receipt.usage.cacheShare, 0.25);
  assert.equal(receipt.measuredCost, null);
});

test('pricing is only calculated from an explicit provenance-bearing schedule', () => {
  const pricing = createPricingSchedule({
    source: 'configured-test-pricing',
    effectiveDate: '2026-10-01',
    inputPerMillion: 10,
    cachedInputPerMillion: 2,
    outputPerMillion: 20,
    reasoningOutputPerMillion: 30,
  });
  const receipt = run({
    laneId: 'lane-a',
    pricing,
    usage: {
      inputTokens: 1_000_000,
      cachedInputTokens: 500_000,
      outputTokens: 100_000,
      reasoningOutputTokens: 10_000,
      turnCount: 1,
      toolCallCount: 1,
    },
  });
  assert.equal(receipt.measuredCost.currency, 'USD');
  assert.equal(receipt.measuredCost.pricingSource, 'configured-test-pricing');
  assert.equal(receipt.measuredCost.amount, 8.3);
});

test('comparisons fail closed when workload or context differs', () => {
  const left = run({
    laneId: 'lane-a',
    usage: { inputTokens: 100, cachedInputTokens: 20, outputTokens: 10, turnCount: 1, toolCallCount: 1 },
  });
  const rightCase = benchmarkCase({ contextDigest: 'different-context' });
  const right = run({
    laneId: 'lane-b',
    testCase: rightCase,
    usage: { inputTokens: 90, cachedInputTokens: 30, outputTokens: 10, turnCount: 1, toolCallCount: 1 },
  });
  assert.throws(
    () => compareBenchmarkRuns(left, right),
    /not comparable/,
  );
});

test('comparison reports deltas without selecting a winner', () => {
  const pricing = createPricingSchedule({
    source: 'configured-test-pricing',
    effectiveDate: '2026-10-01',
    inputPerMillion: 10,
    cachedInputPerMillion: 2,
    outputPerMillion: 20,
  });
  const sharedCase = benchmarkCase();
  const left = run({
    laneId: 'lane-a',
    testCase: sharedCase,
    pricing,
    usage: {
      inputTokens: 1000,
      cachedInputTokens: 100,
      outputTokens: 100,
      reasoningOutputTokens: 0,
      turnCount: 3,
      toolCallCount: 4,
    },
  });
  const right = run({
    laneId: 'lane-b',
    testCase: sharedCase,
    pricing,
    outcome: 'rejected',
    usage: {
      inputTokens: 800,
      cachedInputTokens: 200,
      outputTokens: 120,
      reasoningOutputTokens: 0,
      turnCount: 2,
      toolCallCount: 3,
    },
  });
  const comparison = compareBenchmarkRuns(left, right);
  assert.equal(comparison.deltaRightMinusLeft.inputTokens, -200);
  assert.equal(comparison.verification.right, 'rejected');
  assert.equal(comparison.costComparable, true);
  assert.equal('winner' in comparison, false);
  assert.match(comparison.note, /without selecting a winner/);
});

test('cost delta is withheld when pricing provenance differs', () => {
  const sharedCase = benchmarkCase();
  const a = createPricingSchedule({
    source: 'pricing-a',
    effectiveDate: '2026-10-01',
    inputPerMillion: 1,
    cachedInputPerMillion: 1,
    outputPerMillion: 1,
  });
  const b = createPricingSchedule({
    source: 'pricing-b',
    effectiveDate: '2026-10-01',
    inputPerMillion: 1,
    cachedInputPerMillion: 1,
    outputPerMillion: 1,
  });
  const left = run({
    laneId: 'lane-a',
    testCase: sharedCase,
    pricing: a,
    usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 10, turnCount: 1, toolCallCount: 1 },
  });
  const right = run({
    laneId: 'lane-b',
    testCase: sharedCase,
    pricing: b,
    usage: { inputTokens: 90, cachedInputTokens: 0, outputTokens: 10, turnCount: 1, toolCallCount: 1 },
  });
  const comparison = compareBenchmarkRuns(left, right);
  assert.equal(comparison.costComparable, false);
  assert.equal(comparison.deltaRightMinusLeft.measuredCost, null);
});

test('summary groups metrics by lane without converting resource use into a quality score', () => {
  const sharedCase = benchmarkCase();
  const runs = [
    run({
      laneId: 'lane-b',
      testCase: sharedCase,
      outcome: 'rejected',
      usage: { inputTokens: 100, cachedInputTokens: 20, outputTokens: 10, turnCount: 2, toolCallCount: 2 },
    }),
    run({
      laneId: 'lane-a',
      testCase: sharedCase,
      outcome: 'accepted',
      usage: { inputTokens: 200, cachedInputTokens: 100, outputTokens: 20, turnCount: 3, toolCallCount: 4 },
    }),
    run({
      laneId: 'lane-a',
      testCase: sharedCase,
      outcome: 'rejected',
      usage: { inputTokens: 100, cachedInputTokens: 50, outputTokens: 10, turnCount: 1, toolCallCount: 1 },
    }),
  ];
  const summary = summarizeBenchmarkRuns(runs);
  assert.deepEqual(summary.map((row) => row.laneId), ['lane-a', 'lane-b']);
  assert.equal(summary[0].runs, 2);
  assert.equal(summary[0].accepted, 1);
  assert.equal(summary[0].rejected, 1);
  assert.equal(summary[0].acceptanceRate, 0.5);
  assert.equal(summary[0].cacheShare, 0.5);
  assert.equal('score' in summary[0], false);
});
