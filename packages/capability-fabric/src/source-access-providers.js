import { createCapabilitySpec } from './index.js';

export const SOURCE_ACCESS_OBSERVATION_CONTRACT = 'source-access-observation/v1';
export const BROWSER_READ_CAPABILITY_ID = 'capability_7f8f0be8-9716-4f37-aed3-9b0d8867cb67';

export function createBrowserReadCapabilitySpec({
  sourceCommit = 'local:source-access/browser-read-v1',
  createdAt = '2026-10-17T00:00:00.000Z',
} = {}) {
  return createCapabilitySpec({
    id: BROWSER_READ_CAPABILITY_ID,
    version: '1.0.0',
    kind: 'skill',
    createdAt,
    metadata: {
      name: 'Browser Read',
      slug: 'browser-read',
      description: 'Governed read-only source observer contract for browser-backed source identity resolution.',
      triggers: ['resolve opaque source', 'observe canonical source url'],
      tags: ['source-access', 'browser', 'read-only', 'rea'],
    },
    contract: {
      prerequisites: ['machine-advertises:browser-read', SOURCE_ACCESS_OBSERVATION_CONTRACT],
    },
    execution: {
      instructions: [
        'Act only as a contract validator for a connected read-only browser source observer.',
        'Never claim that a URL was visited, redirected, authenticated, or observed unless the connected browser-read provider supplies that observation.',
        'Never invent a canonical URL. Never turn a search result, guessed repository, or neighboring post into an observation.',
        'Never perform provider writes, form submissions, votes, comments, follows, purchases, deployments, or credential changes.',
        `Only accept observations compatible with ${SOURCE_ACCESS_OBSERVATION_CONTRACT} and preserve their evidence reference.`,
        'When asked for the verification probe, return SOURCE_ACCESS_OBSERVER_READY.',
      ].join('\n'),
    },
    requirements: {
      tools: ['browser-read'],
      permissions: ['read'],
      networkPolicy: 'connected-provider-read-only',
    },
    provenance: {
      sourceUrl: 'https://github.com/rrahul0904/agent-work-os',
      sourceCommit,
      sourceLicense: 'MIT',
      sourcePath: 'packages/capability-fabric/src/source-access-providers.js',
      evidence: ['docs/SOURCE_ACCESS_FABRIC.md', 'contracts/source-access-context-v1.schema.json'],
    },
    evaluation: {
      testCases: [{
        id: 'contract-probe',
        input: 'Return the source access observer verification probe only.',
        expected: 'SOURCE_ACCESS_OBSERVER_READY',
      }],
      qualityThreshold: 1,
    },
  });
}
