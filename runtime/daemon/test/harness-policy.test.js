import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPrefixReceipt,
  comparePrefixReceipts,
  createExecutionPolicy,
  createProviderLane,
  createUsageReceipt,
  createVerificationReceipt,
  isCapabilityAllowed,
  preflightProviderSwitch,
} from '../src/harness-policy.js';

function lane(overrides = {}) {
  return createProviderLane({
    id: 'provider-a/model-a',
    transport: 'native-test',
    model: 'model-a',
    contextWindowTokens: 100_000,
    capabilities: ['repo.read', 'repo.search', 'python', 'lsp'],
    cache: { kind: 'prefix' },
    ...overrides,
  });
}

test('economy mode stays bounded to deterministic low-cost capabilities', () => {
  const policy = createExecutionPolicy({
    mode: 'economy',
    configuredCapabilities: ['repo.read', 'repo.search', 'shell.readonly', 'python', 'browser', 'repo.write'],
  });
  assert.deepEqual(policy.capabilities, ['repo.read', 'repo.search', 'shell.readonly']);
  assert.equal(isCapabilityAllowed(policy, 'python'), false);
  assert.equal(isCapabilityAllowed(policy, 'repo.write'), false);
});

test('mutating capabilities require explicit mutation approval', () => {
  const withoutApproval = createExecutionPolicy({ mode: 'standard', configuredCapabilities: ['repo.read', 'repo.write', 'python'] });
  const withApproval = createExecutionPolicy({
    mode: 'standard',
    configuredCapabilities: ['repo.read', 'repo.write', 'python'],
    approvals: { mutations: true },
  });
  assert.equal(isCapabilityAllowed(withoutApproval, 'repo.write'), false);
  assert.equal(isCapabilityAllowed(withoutApproval, 'python'), false);
  assert.equal(isCapabilityAllowed(withApproval, 'repo.write'), true);
  assert.equal(isCapabilityAllowed(withApproval, 'python'), true);
});

test('prefix receipt is stable across volatile turns and changes when static tool contract changes', () => {
  const provider = lane();
  const policy = createExecutionPolicy({ mode: 'standard', configuredCapabilities: provider.capabilities });
  const first = buildPrefixReceipt({ lane: provider, policy, staticInstructions: ['safe local coding'], toolCatalog: ['repo.read'] });
  const second = buildPrefixReceipt({ lane: provider, policy, staticInstructions: ['safe local coding'], toolCatalog: ['repo.read'] });
  const changed = buildPrefixReceipt({ lane: provider, policy, staticInstructions: ['safe local coding'], toolCatalog: ['repo.read', 'repo.search'] });
  assert.equal(comparePrefixReceipts(first, second).stable, true);
  assert.equal(comparePrefixReceipts(first, changed).stable, false);
});

test('provider switch preflight fails closed on context or capability mismatch', () => {
  const fromLane = lane();
  const toLane = lane({ id: 'provider-b/model-b', model: 'model-b', contextWindowTokens: 32_000, capabilities: ['repo.read'] });
  const result = preflightProviderSwitch({
    fromLane,
    toLane,
    requiredContextTokens: 40_000,
    requiredCapabilities: ['repo.read', 'python'],
  });
  assert.equal(result.allowed, false);
  assert.equal(result.contextDeficitTokens, 8_000);
  assert.deepEqual(result.missingCapabilities, ['python']);
});

test('usage receipt reports measured cache share without inventing money savings', () => {
  const receipt = createUsageReceipt({ inputTokens: 1000, cachedInputTokens: 750, outputTokens: 100, turnCount: 2, toolCallCount: 3 });
  assert.equal(receipt.cacheShare, 0.75);
  assert.equal('costSavings' in receipt, false);
  assert.throws(() => createUsageReceipt({ inputTokens: 10, cachedInputTokens: 11 }), /cannot exceed/);
});

test('independent verification contract forbids builder self-certification', () => {
  assert.throws(() => createVerificationReceipt({ builderId: 'worker-1', verifierId: 'worker-1', outcome: 'accepted' }), /cannot self-verify/);
  const receipt = createVerificationReceipt({ builderId: 'worker-1', verifierId: 'reviewer-1', outcome: 'accepted', checks: ['unit-tests'] });
  assert.equal(receipt.outcome, 'accepted');
});
