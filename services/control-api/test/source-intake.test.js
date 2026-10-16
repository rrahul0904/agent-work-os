import test from 'node:test';
import assert from 'node:assert/strict';

import { createSourceIdentityResolver } from '../../../packages/evidence/src/source-resolution.js';
import {
  createSourceAccessObservation,
  createSourceAccessRequest,
  validateSourceAccessObservation,
  validateSourceAccessRequest,
} from '../../../packages/evidence/src/source-access-context.js';
import {
  advanceSourceIntake,
  validateSourceIntakeTransition,
} from '../../../packages/evidence/src/source-intake.js';

const shareUrl = 'https://www.reddit.com/r/BestGitHubRepos/s/EjKhT844dz';
const canonicalUrl = 'https://www.reddit.com/r/BestGitHubRepos/comments/1abc234/example_project/';
const now = '2026-10-16T19:20:00.000Z';

function resolverFor(responseFactory) {
  return createSourceIdentityResolver({
    resolveHost: async () => [{ address: '151.101.73.140' }],
    fetchImpl: async () => responseFactory(),
  });
}

test('403 source identity blocker becomes a capability-gated intake transition', async () => {
  const resolve = resolverFor(() => new Response('blocked', { status: 403 }));
  const blocked = await resolve({ sourceId: 'rea-229', url: shareUrl, resolvedAt: now });
  assert.equal(blocked.errorCode, 'ACCESS_CONTEXT_REQUIRED');
  assert.equal(blocked.requiredCapability, 'reddit-authenticated-or-browser-read');

  const request = createSourceAccessRequest({ blockedResolution: blocked, requestedAt: now });
  assert.equal(validateSourceAccessRequest(request), true);
  assert.equal(request.blocker.receiptSha256, blocked.receiptSha256);
  assert.equal(request.requiredCapability, 'reddit-authenticated-or-browser-read');

  const transition = advanceSourceIntake({
    resolutionReceipt: blocked,
    accessRequest: request,
    transitionedAt: now,
  });
  assert.equal(transition.gate, 'ACCESS_CONTEXT_REQUIRED');
  assert.equal(transition.nextAction, 'ACQUIRE_SOURCE_ACCESS_CONTEXT');
  assert.equal(transition.requiredCapability, 'reddit-authenticated-or-browser-read');
  assert.equal(transition.accessRequestSha256, request.requestSha256);
  assert.equal(validateSourceIntakeTransition(transition), true);
});

test('authenticated or browser observation resumes directly to REA evidence discovery', async () => {
  const resolve = resolverFor(() => new Response('blocked', { status: 403 }));
  const blocked = await resolve({ sourceId: 'rea-229', url: shareUrl, resolvedAt: now });
  const request = createSourceAccessRequest({ blockedResolution: blocked, requestedAt: now });
  const observation = createSourceAccessObservation({
    request,
    provider: 'browser-read',
    canonicalUrl,
    observedAt: now,
    evidenceRef: 'browser-session:reddit-share-redirect:rea-229',
  });
  assert.equal(validateSourceAccessObservation(observation, { request }), true);

  const transition = advanceSourceIntake({
    resolutionReceipt: blocked,
    accessRequest: request,
    accessObservation: observation,
    transitionedAt: now,
  });
  assert.equal(transition.gate, 'TARGET_IDENTITY_RESOLVED');
  assert.equal(transition.target.postId, '1abc234');
  assert.equal(transition.target.canonicalUrl, canonicalUrl);
  assert.equal(transition.nextAction, 'REA_EVIDENCE_DISCOVERY');
  assert.equal(transition.accessObservationSha256, observation.observationSha256);
  assert.equal(validateSourceIntakeTransition(transition), true);
});

test('access observations cannot be replayed across blocker receipts', async () => {
  const firstResolve = resolverFor(() => new Response('blocked', { status: 403 }));
  const secondResolve = resolverFor(() => new Response('blocked', { status: 401 }));
  const first = await firstResolve({ sourceId: 'rea-229', url: shareUrl, resolvedAt: now });
  const second = await secondResolve({ sourceId: 'rea-229', url: shareUrl, resolvedAt: '2026-10-16T19:21:00.000Z' });
  const firstRequest = createSourceAccessRequest({ blockedResolution: first, requestedAt: now });
  const secondRequest = createSourceAccessRequest({ blockedResolution: second, requestedAt: '2026-10-16T19:21:00.000Z' });
  const observation = createSourceAccessObservation({
    request: firstRequest,
    provider: 'reddit-authenticated-read',
    canonicalUrl,
    observedAt: now,
    evidenceRef: 'reddit-oauth:rea-229',
  });

  assert.equal(validateSourceAccessObservation(observation, { request: secondRequest }), false);
  assert.throws(
    () => advanceSourceIntake({
      resolutionReceipt: second,
      accessRequest: secondRequest,
      accessObservation: observation,
      transitionedAt: now,
    }),
    /not an intact observation bound to this access request/,
  );
});

test('ordinary resolved identity bypasses access-context acquisition', async () => {
  const resolve = createSourceIdentityResolver({
    resolveHost: async () => [{ address: '151.101.73.140' }],
    fetchImpl: async () => new Response('', { status: 302, headers: { location: canonicalUrl } }),
  });
  const resolved = await resolve({ sourceId: 'rea-resolved', url: shareUrl, resolvedAt: now });
  const transition = advanceSourceIntake({ resolutionReceipt: resolved, transitionedAt: now });
  assert.equal(transition.gate, 'TARGET_IDENTITY_RESOLVED');
  assert.equal(transition.nextAction, 'REA_EVIDENCE_DISCOVERY');
  assert.equal(transition.accessRequestSha256, null);
  assert.equal(transition.accessObservationSha256, null);
});

test('access observation refuses unsupported providers and non-post URLs', async () => {
  const resolve = resolverFor(() => new Response('blocked', { status: 403 }));
  const blocked = await resolve({ sourceId: 'rea-229', url: shareUrl, resolvedAt: now });
  const request = createSourceAccessRequest({ blockedResolution: blocked, requestedAt: now });

  assert.throws(
    () => createSourceAccessObservation({
      request,
      provider: 'untrusted-proxy',
      canonicalUrl,
      observedAt: now,
      evidenceRef: 'proxy:unknown',
    }),
    /unsupported source access provider/,
  );
  assert.throws(
    () => createSourceAccessObservation({
      request,
      provider: 'browser-read',
      canonicalUrl: 'https://www.reddit.com/r/BestGitHubRepos/',
      observedAt: now,
      evidenceRef: 'browser-session:reddit',
    }),
    /canonical Reddit post URL/,
  );
});
