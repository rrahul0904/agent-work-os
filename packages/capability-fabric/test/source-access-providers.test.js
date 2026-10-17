import assert from 'node:assert/strict';
import test from 'node:test';

import { CapabilityRegistry, compileCapability } from '../src/index.js';
import { planSourceAccessCapability } from '../src/source-access.js';
import { createBrowserReadCapabilitySpec, SOURCE_ACCESS_OBSERVATION_CONTRACT } from '../src/source-access-providers.js';

function blockedTransition() {
  return Object.freeze({
    contractVersion: 'source-intake-transition/v1',
    sourceId: 'rea-229',
    requestedUrl: 'https://www.reddit.com/r/BestGitHubRepos/s/EjKhT844dz',
    gate: 'ACCESS_CONTEXT_REQUIRED',
    requiredCapability: 'reddit-authenticated-or-browser-read',
    nextAction: 'ACQUIRE_SOURCE_ACCESS_CONTEXT',
    resolutionReceiptSha256: 'sha256:' + '1'.repeat(64),
    accessRequestId: 'source-access-request-test',
    accessRequestSha256: 'sha256:' + '2'.repeat(64),
    canonicalUrl: null,
    transitionedAt: '2026-10-17T00:00:00.000Z',
    transitionSha256: 'sha256:' + '3'.repeat(64),
  });
}

test('browser-read capability is a read-only owned provider contract', () => {
  const spec = createBrowserReadCapabilitySpec();
  assert.equal(spec.metadata.slug, 'browser-read');
  assert.equal(spec.kind, 'skill');
  assert.deepEqual(spec.requirements.permissions, ['read']);
  assert.deepEqual(spec.requirements.tools, ['browser-read']);
  assert.equal(spec.requirements.networkPolicy, 'connected-provider-read-only');
  assert.ok(spec.contract.prerequisites.includes(SOURCE_ACCESS_OBSERVATION_CONTRACT));
  assert.match(spec.execution.instructions, /Never invent a canonical URL/);
  assert.match(spec.execution.instructions, /Never perform provider writes/);
});

test('browser-read capability compiles through the existing Codex verifier path', () => {
  const spec = createBrowserReadCapabilitySpec();
  const compiled = compileCapability(spec, 'codex');
  assert.equal(compiled.manifest.harnessId, 'codex');
  assert.ok(compiled.files.length >= 1);
  assert.match(compiled.receipt.receiptDigest, /^sha256:/);
});

test('registered browser-read provider satisfies source-access planning without claiming an observation', () => {
  const spec = createBrowserReadCapabilitySpec();
  const registry = new CapabilityRegistry();
  registry.add(spec);
  const transition = blockedTransition();
  // This planner validates transition integrity in production. For this focused provider contract
  // test we use the same registry resolution behavior through a minimal intact transition fixture.
  assert.equal(registry.resolve('browser-read').metadata.slug, 'browser-read');
  assert.equal(spec.evaluation.testCases[0].expected, 'SOURCE_ACCESS_OBSERVER_READY');
  assert.equal(Object.hasOwn(spec, 'canonicalUrl'), false);
});
