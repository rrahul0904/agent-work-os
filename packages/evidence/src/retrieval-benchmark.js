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

export function evaluateRetrievalBenchmark({ cases, retrieve, k = 5 }) {
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new TypeError('cases must contain at least one benchmark case');
  }
  if (typeof retrieve !== 'function') throw new TypeError('retrieve must be a function');
  requirePositiveInteger(k, 'k');

  const caseIds = new Set();
  const results = [];

  for (const benchmarkCase of cases) {
    const caseId = requireString(benchmarkCase?.caseId, 'case.caseId');
    if (caseIds.has(caseId)) throw new Error(`duplicate benchmark case id: ${caseId}`);
    caseIds.add(caseId);
    const query = requireString(benchmarkCase?.query, 'case.query');
    if (!Array.isArray(benchmarkCase.expectedSpanIds) || benchmarkCase.expectedSpanIds.length === 0) {
      throw new TypeError(`benchmark case ${caseId} must contain expectedSpanIds`);
    }
    const expectedSpanIds = [...new Set(benchmarkCase.expectedSpanIds.map((id) => requireString(id, 'expectedSpanId')))];

    const receipt = retrieve({ ...benchmarkCase, caseId, query });
    if (!receipt || !Array.isArray(receipt.results)) {
      throw new TypeError(`benchmark retriever returned no retrieval receipt for case ${caseId}`);
    }

    const retrieved = receipt.results.slice(0, k).map((result) => result.spanId);
    const expected = new Set(expectedSpanIds);
    const relevantRetrieved = retrieved.filter((spanId) => expected.has(spanId));
    const firstRelevantIndex = retrieved.findIndex((spanId) => expected.has(spanId));
    const recallAtK = relevantRetrieved.length / expected.size;
    const hitAtK = relevantRetrieved.length > 0 ? 1 : 0;
    const reciprocalRank = firstRelevantIndex >= 0 ? 1 / (firstRelevantIndex + 1) : 0;

    results.push(Object.freeze({
      caseId,
      query,
      expectedSpanIds: Object.freeze(expectedSpanIds),
      retrievedSpanIds: Object.freeze(retrieved),
      recallAtK,
      hitAtK,
      reciprocalRank,
      receiptSha256: receipt.receiptSha256 ?? null,
    }));
  }

  const average = (selector) => results.reduce((sum, result) => sum + selector(result), 0) / results.length;
  return Object.freeze({
    k,
    caseCount: results.length,
    recallAtK: average((result) => result.recallAtK),
    hitRateAtK: average((result) => result.hitAtK),
    meanReciprocalRank: average((result) => result.reciprocalRank),
    cases: Object.freeze(results),
  });
}

export function compareRetrievalBenchmarks({ baseline, candidate }) {
  if (!baseline || !candidate) throw new TypeError('baseline and candidate benchmark results are required');
  if (baseline.k !== candidate.k || baseline.caseCount !== candidate.caseCount) {
    throw new Error('baseline and candidate benchmarks must use the same k and case count');
  }
  return Object.freeze({
    k: baseline.k,
    caseCount: baseline.caseCount,
    recallAtKDelta: candidate.recallAtK - baseline.recallAtK,
    hitRateAtKDelta: candidate.hitRateAtK - baseline.hitRateAtK,
    meanReciprocalRankDelta: candidate.meanReciprocalRank - baseline.meanReciprocalRank,
  });
}
