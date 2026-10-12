import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalGitHubIdentity, digest, evaluateComponent, recommendComponents } from '../src/index.js';

const NOW = new Date('2026-10-12T15:00:00Z');
const base = {
  sourceUrl: 'https://github.com/acme/agent-kit',
  revision: '0123456789abcdef',
  pushedAt: '2026-10-01T00:00:00Z',
  stars: 12000,
  archived: false,
  fork: false,
  license: 'MIT',
  capabilities: ['mcp', 'memory'],
  evidenceRefs: ['evidence://github/acme/agent-kit/0123456789abcdef'],
};

test('canonicalizes owner/repo and GitHub URLs deterministically', () => {
  assert.deepEqual(canonicalGitHubIdentity('Acme/Agent-Kit'), {
    key: 'acme/agent-kit',
    url: 'https://github.com/acme/agent-kit',
  });
  assert.equal(canonicalGitHubIdentity('https://github.com/ACME/Agent-Kit.git').key, 'acme/agent-kit');
});

test('refuses archived, stale, unknown-license and unpinned candidates', () => {
  assert.equal(evaluateComponent({ ...base, archived: true }, { now: NOW }).eligible, false);
  assert.ok(evaluateComponent({ ...base, pushedAt: '2024-01-01T00:00:00Z' }, { now: NOW }).reasons.includes('stale'));
  assert.ok(evaluateComponent({ ...base, license: null }, { now: NOW }).reasons.includes('unknown-license'));
  assert.ok(evaluateComponent({ ...base, revision: null }, { now: NOW }).reasons.includes('unpinned-revision'));
});

test('required capability mismatch fails closed', () => {
  const result = evaluateComponent(base, { now: NOW, profile: { requiredCapabilities: ['mcp', 'sandbox'] } });
  assert.equal(result.eligible, false);
  assert.deepEqual(result.missingCapabilities, ['sandbox']);
});

test('unknown evidence remains explicit instead of receiving a fake positive dimension', () => {
  const result = evaluateComponent({ ...base, stars: undefined }, { now: NOW });
  assert.equal(result.dimensions.popularity, null);
  assert.ok(result.unknownDimensions.includes('popularity'));
});

test('recommendation deduplicates and binds the result to policy and catalog snapshot digests', () => {
  const result = recommendComponents([
    base,
    { ...base, sourceUrl: 'ACME/AGENT-KIT' },
    { ...base, sourceUrl: 'https://github.com/acme/other', revision: 'fedcba9876543210', stars: 2000 },
  ], {
    now: NOW,
    profile: { requiredCapabilities: ['mcp'] },
    catalogSnapshot: { source: 'fixture', revision: 'catalog-sha' },
  });
  assert.deepEqual(result.duplicates, ['acme/agent-kit']);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.noInstallAuthority, true);
  assert.equal(result.noExecutionAuthority, true);
  assert.equal(result.policyDigest.length, 64);
  assert.equal(result.catalogSnapshotDigest.length, 64);
  assert.equal(result.receiptDigest.length, 64);
});

test('digest is independent of object key insertion order', () => {
  assert.equal(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
});
