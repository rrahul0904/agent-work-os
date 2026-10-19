import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CapabilityRegistry,
  createCapabilitySpec,
} from '../src/index.js';
import {
  planSourceAccessCapability,
  selectSourceAccessCapability,
  sourceAccessCandidateSlugs,
} from '../src/source-access.js';
import { createSourceIdentityResolver } from '../../evidence/src/source-resolution.js';
import { advanceSourceIntake } from '../../evidence/src/source-intake.js';

const shareUrl = 'https://www.reddit.com/r/BestGitHubRepos/s/EjKhT844dz';
const now = '2026-10-16T19:35:00.000Z';

async function accessTransition() {
  const resolve = createSourceIdentityResolver({
    resolveHost: async () => [{ address: '151.101.73.140' }],
    fetchImpl: async () => new Response('blocked', { status: 403 }),
  });
  const receipt = await resolve({ sourceId: 'rea-229', url: shareUrl, resolvedAt: now });
  return advanceSourceIntake({ resolutionReceipt: receipt, transitionedAt: now });
}

function capability(slug) {
  return createCapabilitySpec({
    kind: 'workflow',
    metadata: {
      name: slug === 'browser-read' ? 'Browser Read' : 'Reddit Authenticated Read',
      slug,
      description: 'Read-only source access capability used to resolve governed source identity blockers.',
      tags: ['source-access', 'read-only'],
    },
    contract: {
      inputs: [{ name: 'url', description: 'Source URL to read' }],
      outputs: [{ name: 'canonicalUrl', description: 'Observed canonical source URL' }],
    },
    execution: {
      instructions: 'Read the supplied source URL without external writes and return the observed canonical URL with provenance.',
    },
    requirements: {
      permissions: ['read'],
      networkPolicy: 'bounded',
    },
    provenance: {
      sourceUrl: 'https://github.com/rrahul0904/agent-work-os',
      sourceCommit: 'local:agent-work-os/source-access',
      sourceLicense: 'MIT',
      evidence: ['source-access-context/v1'],
    },
    evaluation: {
      testCases: [{ input: shareUrl, expected: 'canonical Reddit post URL or explicit access blocker' }],
      qualityThreshold: 1,
    },
  });
}

test('source access alias expands into authenticated Reddit and browser candidates', () => {
  assert.deepEqual(
    sourceAccessCandidateSlugs('reddit-authenticated-or-browser-read'),
    ['reddit-authenticated-read', 'browser-read'],
  );
});

test('capability planner reports missing provider instead of pretending the blocker is resolved', async () => {
  const registry = new CapabilityRegistry();
  const plan = planSourceAccessCapability({ transition: await accessTransition(), registry });
  assert.equal(plan.state, 'missing');
  assert.equal(plan.nextAction, 'INSTALL_OR_CONNECT_SOURCE_ACCESS_CAPABILITY');
  assert.deepEqual(plan.available, []);
});

test('capability planner resolves an installed read-only browser provider and binds it to the exact transition', async () => {
  const registry = new CapabilityRegistry();
  const browser = registry.add(capability('browser-read'));
  const transition = await accessTransition();
  const plan = planSourceAccessCapability({ transition, registry });
  assert.equal(plan.state, 'available');
  assert.equal(plan.nextAction, 'VERIFY_SOURCE_ACCESS_CAPABILITY');
  assert.equal(plan.available.length, 1);
  assert.equal(plan.available[0].slug, 'browser-read');

  const binding = selectSourceAccessCapability({ plan, capability: browser });
  assert.equal(binding.contractVersion, 'source-access-capability-binding/v1');
  assert.equal(binding.transitionSha256, transition.transitionSha256);
  assert.equal(binding.capabilitySlug, 'browser-read');
});

test('binding refuses an unrelated capability even when a source-access plan is available', async () => {
  const registry = new CapabilityRegistry();
  registry.add(capability('browser-read'));
  const unrelated = capability('reddit-authenticated-read');
  const plan = planSourceAccessCapability({ transition: await accessTransition(), registry });
  assert.throws(
    () => selectSourceAccessCapability({ plan, capability: unrelated }),
    /not present in the planned available set/,
  );
});
