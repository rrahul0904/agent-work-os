import { createHash } from 'node:crypto';

export const BENCHMARK_HARNESS_VERSION = 'benchmark-harness/v1';

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${field} must be a non-empty string`);
  return value.trim();
}

function nonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${field} must be a non-negative integer`);
  return value;
}

function nonNegativeNumber(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative finite number`);
  }
  return value;
}

function sortedUnique(values = [], field = 'values') {
  if (!Array.isArray(values)) throw new TypeError(`${field} must be an array`);
  return [...new Set(values.map((value) => nonEmptyString(value, field)))].sort();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function validateUsage(usage) {
  if (!usage || typeof usage !== 'object') throw new TypeError('usage receipt is required');
  const inputTokens = nonNegativeInteger(usage.inputTokens ?? 0, 'inputTokens');
  const cachedInputTokens = nonNegativeInteger(usage.cachedInputTokens ?? 0, 'cachedInputTokens');
  const outputTokens = nonNegativeInteger(usage.outputTokens ?? 0, 'outputTokens');
  const reasoningOutputTokens = nonNegativeInteger(usage.reasoningOutputTokens ?? 0, 'reasoningOutputTokens');
  const turnCount = nonNegativeInteger(usage.turnCount ?? 0, 'turnCount');
  const toolCallCount = nonNegativeInteger(usage.toolCallCount ?? 0, 'toolCallCount');
  if (cachedInputTokens > inputTokens) throw new RangeError('cachedInputTokens cannot exceed inputTokens');
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    turnCount,
    toolCallCount,
    cacheShare: inputTokens === 0 ? null : cachedInputTokens / inputTokens,
  };
}

export function createBenchmarkCase({
  id,
  workloadDigest,
  contextDigest,
  requiredCapabilities = [],
  acceptanceCriteria = [],
}) {
  const spec = {
    version: BENCHMARK_HARNESS_VERSION,
    id: nonEmptyString(id, 'id'),
    workloadDigest: nonEmptyString(workloadDigest, 'workloadDigest'),
    contextDigest: nonEmptyString(contextDigest, 'contextDigest'),
    requiredCapabilities: sortedUnique(requiredCapabilities, 'requiredCapabilities'),
    acceptanceCriteria: sortedUnique(acceptanceCriteria, 'acceptanceCriteria'),
  };
  return Object.freeze({ ...spec, caseDigest: digest(spec) });
}

export function createPricingSchedule({
  source,
  effectiveDate,
  currency = 'USD',
  inputPerMillion,
  cachedInputPerMillion,
  outputPerMillion,
  reasoningOutputPerMillion = outputPerMillion,
}) {
  const schedule = {
    version: BENCHMARK_HARNESS_VERSION,
    source: nonEmptyString(source, 'source'),
    effectiveDate: nonEmptyString(effectiveDate, 'effectiveDate'),
    currency: nonEmptyString(currency, 'currency'),
    inputPerMillion: nonNegativeNumber(inputPerMillion, 'inputPerMillion'),
    cachedInputPerMillion: nonNegativeNumber(cachedInputPerMillion, 'cachedInputPerMillion'),
    outputPerMillion: nonNegativeNumber(outputPerMillion, 'outputPerMillion'),
    reasoningOutputPerMillion: nonNegativeNumber(reasoningOutputPerMillion, 'reasoningOutputPerMillion'),
  };
  return Object.freeze({ ...schedule, pricingDigest: digest(schedule) });
}

function measuredCost(usage, pricing) {
  if (!pricing) return null;
  const uncachedInput = usage.inputTokens - usage.cachedInputTokens;
  const amount = (
    uncachedInput * pricing.inputPerMillion
    + usage.cachedInputTokens * pricing.cachedInputPerMillion
    + usage.outputTokens * pricing.outputPerMillion
    + usage.reasoningOutputTokens * pricing.reasoningOutputPerMillion
  ) / 1_000_000;
  return {
    currency: pricing.currency,
    amount,
    pricingDigest: pricing.pricingDigest,
    pricingSource: pricing.source,
    pricingEffectiveDate: pricing.effectiveDate,
  };
}

export function createBenchmarkRun({
  benchmarkCase,
  laneId,
  revision,
  usage,
  verification,
  durationMs,
  pricing = null,
}) {
  if (!benchmarkCase?.caseDigest || benchmarkCase.version !== BENCHMARK_HARNESS_VERSION) {
    throw new TypeError('valid benchmarkCase is required');
  }
  if (!verification || !['accepted', 'rejected'].includes(verification.outcome)) {
    throw new TypeError('verification outcome must be accepted or rejected');
  }
  const normalizedUsage = validateUsage(usage);
  const runBase = {
    version: BENCHMARK_HARNESS_VERSION,
    caseId: benchmarkCase.id,
    caseDigest: benchmarkCase.caseDigest,
    workloadDigest: benchmarkCase.workloadDigest,
    contextDigest: benchmarkCase.contextDigest,
    laneId: nonEmptyString(laneId, 'laneId'),
    revision: nonEmptyString(revision, 'revision'),
    durationMs: nonNegativeNumber(durationMs, 'durationMs'),
    verificationOutcome: verification.outcome,
    usage: normalizedUsage,
    measuredCost: measuredCost(normalizedUsage, pricing),
  };
  return Object.freeze({ ...runBase, runId: digest(runBase) });
}

export function compareBenchmarkRuns(left, right) {
  if (!left?.runId || !right?.runId) throw new TypeError('two benchmark runs are required');
  if (left.caseDigest !== right.caseDigest
    || left.workloadDigest !== right.workloadDigest
    || left.contextDigest !== right.contextDigest) {
    throw new Error('benchmark runs are not comparable: workload/context differs');
  }

  const leftCost = left.measuredCost;
  const rightCost = right.measuredCost;
  const costComparable = Boolean(
    leftCost
      && rightCost
      && leftCost.currency === rightCost.currency
      && leftCost.pricingDigest === rightCost.pricingDigest,
  );

  return Object.freeze({
    version: BENCHMARK_HARNESS_VERSION,
    caseId: left.caseId,
    leftRunId: left.runId,
    rightRunId: right.runId,
    verification: Object.freeze({
      left: left.verificationOutcome,
      right: right.verificationOutcome,
    }),
    deltaRightMinusLeft: Object.freeze({
      inputTokens: right.usage.inputTokens - left.usage.inputTokens,
      cachedInputTokens: right.usage.cachedInputTokens - left.usage.cachedInputTokens,
      outputTokens: right.usage.outputTokens - left.usage.outputTokens,
      reasoningOutputTokens: right.usage.reasoningOutputTokens - left.usage.reasoningOutputTokens,
      turnCount: right.usage.turnCount - left.usage.turnCount,
      toolCallCount: right.usage.toolCallCount - left.usage.toolCallCount,
      durationMs: right.durationMs - left.durationMs,
      measuredCost: costComparable ? rightCost.amount - leftCost.amount : null,
    }),
    costComparable,
    pricingDigest: costComparable ? leftCost.pricingDigest : null,
    note: 'Descriptive comparison only; verification outcome and resource deltas are reported without selecting a winner.',
  });
}

export function summarizeBenchmarkRuns(runs) {
  if (!Array.isArray(runs)) throw new TypeError('runs must be an array');
  const groups = new Map();
  for (const run of runs) {
    if (!run?.runId) throw new TypeError('all runs must be benchmark receipts');
    const current = groups.get(run.laneId) ?? {
      laneId: run.laneId,
      runs: 0,
      accepted: 0,
      rejected: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      turnCount: 0,
      toolCallCount: 0,
      durationMs: 0,
    };
    current.runs += 1;
    current[run.verificationOutcome] += 1;
    current.inputTokens += run.usage.inputTokens;
    current.cachedInputTokens += run.usage.cachedInputTokens;
    current.outputTokens += run.usage.outputTokens;
    current.reasoningOutputTokens += run.usage.reasoningOutputTokens;
    current.turnCount += run.usage.turnCount;
    current.toolCallCount += run.usage.toolCallCount;
    current.durationMs += run.durationMs;
    groups.set(run.laneId, current);
  }

  return Object.freeze(
    [...groups.values()]
      .sort((a, b) => a.laneId.localeCompare(b.laneId))
      .map((group) => Object.freeze({
        ...group,
        acceptanceRate: group.runs === 0 ? null : group.accepted / group.runs,
        cacheShare: group.inputTokens === 0 ? null : group.cachedInputTokens / group.inputTokens,
        averageDurationMs: group.runs === 0 ? null : group.durationMs / group.runs,
      })),
  );
}
