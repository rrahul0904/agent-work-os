import { createHash } from 'node:crypto';

export const HARNESS_POLICY_VERSION = 'harness-policy/v1';

const MODE_DEFAULTS = Object.freeze({
  economy: Object.freeze(['repo.read', 'repo.search', 'shell.readonly']),
  standard: Object.freeze(['repo.read', 'repo.search', 'shell.readonly', 'python', 'lsp']),
});

const MUTATING_CAPABILITIES = new Set(['repo.write', 'shell.mutate', 'github.write', 'browser.mutate', 'python']);

function assertNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${field} must be a non-empty string`);
  return value.trim();
}

function assertNonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${field} must be a non-negative integer`);
  return value;
}

function sortedUnique(values = []) {
  if (!Array.isArray(values)) throw new TypeError('capabilities must be an array');
  return [...new Set(values.map((value) => assertNonEmptyString(value, 'capability'))) ].sort();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function createProviderLane(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('provider lane must be an object');
  const id = assertNonEmptyString(input.id, 'id');
  const transport = assertNonEmptyString(input.transport, 'transport');
  const model = assertNonEmptyString(input.model, 'model');
  const contextWindowTokens = assertNonNegativeInteger(input.contextWindowTokens, 'contextWindowTokens');
  if (contextWindowTokens === 0) throw new TypeError('contextWindowTokens must be greater than zero');
  const capabilities = sortedUnique(input.capabilities);
  const cache = input.cache ?? { kind: 'unknown' };
  if (!cache || typeof cache !== 'object' || Array.isArray(cache)) throw new TypeError('cache must be an object');
  const cacheKind = assertNonEmptyString(cache.kind ?? 'unknown', 'cache.kind');
  return Object.freeze({
    version: HARNESS_POLICY_VERSION,
    id,
    transport,
    model,
    contextWindowTokens,
    capabilities,
    cache: Object.freeze({ kind: cacheKind }),
  });
}

export function createExecutionPolicy({ mode = 'economy', configuredCapabilities = [], approvals = {} } = {}) {
  if (!Object.hasOwn(MODE_DEFAULTS, mode)) throw new TypeError(`unsupported execution mode: ${mode}`);
  const configured = new Set(sortedUnique(configuredCapabilities));
  const defaults = MODE_DEFAULTS[mode];
  const allowed = defaults.filter((capability) => configured.has(capability));

  for (const capability of configured) {
    if (mode === 'standard' && !MUTATING_CAPABILITIES.has(capability)) allowed.push(capability);
    if (MUTATING_CAPABILITIES.has(capability) && approvals.mutations === true) allowed.push(capability);
  }

  const capabilities = [...new Set(allowed)].sort();
  return Object.freeze({
    version: HARNESS_POLICY_VERSION,
    mode,
    capabilities,
    mutationApprovalRequired: true,
    mutationsApproved: approvals.mutations === true,
  });
}

export function isCapabilityAllowed(policy, capability) {
  return Boolean(policy?.capabilities?.includes(capability));
}

export function buildPrefixReceipt({ lane, policy, staticInstructions = [], toolCatalog = [] }) {
  if (!lane?.id || !policy?.mode) throw new TypeError('lane and policy are required');
  if (!Array.isArray(staticInstructions) || !staticInstructions.every((value) => typeof value === 'string')) {
    throw new TypeError('staticInstructions must be an array of strings');
  }
  const tools = sortedUnique(toolCatalog);
  const canonical = stableJson({
    lane: { id: lane.id, transport: lane.transport, model: lane.model },
    policy: { mode: policy.mode, capabilities: policy.capabilities },
    staticInstructions,
    toolCatalog: tools,
  });
  return Object.freeze({
    version: HARNESS_POLICY_VERSION,
    fingerprint: createHash('sha256').update(canonical).digest('hex'),
    byteLength: Buffer.byteLength(canonical),
    laneId: lane.id,
    mode: policy.mode,
    toolCount: tools.length,
  });
}

export function comparePrefixReceipts(previous, current) {
  if (!previous?.fingerprint || !current?.fingerprint) throw new TypeError('two prefix receipts are required');
  return Object.freeze({
    stable: previous.fingerprint === current.fingerprint,
    previousFingerprint: previous.fingerprint,
    currentFingerprint: current.fingerprint,
  });
}

export function createUsageReceipt(input = {}) {
  const inputTokens = assertNonNegativeInteger(input.inputTokens ?? 0, 'inputTokens');
  const cachedInputTokens = assertNonNegativeInteger(input.cachedInputTokens ?? 0, 'cachedInputTokens');
  const outputTokens = assertNonNegativeInteger(input.outputTokens ?? 0, 'outputTokens');
  const reasoningOutputTokens = assertNonNegativeInteger(input.reasoningOutputTokens ?? 0, 'reasoningOutputTokens');
  const turnCount = assertNonNegativeInteger(input.turnCount ?? 0, 'turnCount');
  const toolCallCount = assertNonNegativeInteger(input.toolCallCount ?? 0, 'toolCallCount');
  if (cachedInputTokens > inputTokens) throw new RangeError('cachedInputTokens cannot exceed inputTokens');
  return Object.freeze({
    version: HARNESS_POLICY_VERSION,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    turnCount,
    toolCallCount,
    cacheShare: inputTokens === 0 ? null : cachedInputTokens / inputTokens,
  });
}

export function preflightProviderSwitch({ fromLane, toLane, requiredContextTokens = 0, requiredCapabilities = [] }) {
  if (!fromLane?.id || !toLane?.id) throw new TypeError('fromLane and toLane are required');
  assertNonNegativeInteger(requiredContextTokens, 'requiredContextTokens');
  const required = sortedUnique(requiredCapabilities);
  const missingCapabilities = required.filter((capability) => !toLane.capabilities.includes(capability));
  const contextDeficitTokens = Math.max(0, requiredContextTokens - toLane.contextWindowTokens);
  const reasons = [];
  if (contextDeficitTokens > 0) reasons.push('destination_context_window_too_small');
  if (missingCapabilities.length > 0) reasons.push('destination_missing_capabilities');
  return Object.freeze({
    version: HARNESS_POLICY_VERSION,
    allowed: reasons.length === 0,
    fromLaneId: fromLane.id,
    toLaneId: toLane.id,
    requiredContextTokens,
    contextDeficitTokens,
    missingCapabilities,
    reasons,
  });
}

export function createVerificationReceipt({ builderId, verifierId, outcome, checks = [] }) {
  const builder = assertNonEmptyString(builderId, 'builderId');
  const verifier = assertNonEmptyString(verifierId, 'verifierId');
  if (builder === verifier) throw new Error('builder cannot self-verify');
  if (!['accepted', 'rejected'].includes(outcome)) throw new TypeError('outcome must be accepted or rejected');
  if (!Array.isArray(checks) || !checks.every((check) => typeof check === 'string' && check.trim())) {
    throw new TypeError('checks must be an array of non-empty strings');
  }
  return Object.freeze({
    version: HARNESS_POLICY_VERSION,
    builderId: builder,
    verifierId: verifier,
    outcome,
    checks: [...checks],
  });
}
