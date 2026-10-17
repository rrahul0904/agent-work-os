import assert from 'node:assert/strict';
import test from 'node:test';

import { CapabilityRegistry, compileCapability } from '../src/index.js';
import { sourceAccessCandidateSlugs } from '../src/source-access.js';
import { createBrowserReadCapabilitySpec, SOURCE_ACCESS_OBSERVATION_CONTRACT } from '../src/source-access-providers.js';

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

test('registered browser-read provider matches the source-access candidate set without claiming an observation', () => {
  const spec = createBrowserReadCapabilitySpec();
  const registry = new CapabilityRegistry();
  registry.add(spec);
  assert.ok(sourceAccessCandidateSlugs('reddit-authenticated-or-browser-read').includes('browser-read'));
  assert.equal(registry.resolve('browser-read').metadata.slug, 'browser-read');
  assert.equal(spec.evaluation.testCases[0].expected, 'SOURCE_ACCESS_OBSERVER_READY');
  assert.equal(Object.hasOwn(spec, 'canonicalUrl'), false);
});
