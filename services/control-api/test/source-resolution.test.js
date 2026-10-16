import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSourceIdentityResolver,
  parseCanonicalRedditPostUrl,
  parseRedditShareUrl,
  validateSourceIdentityResolutionReceipt,
} from '../../../packages/evidence/src/source-resolution.js';

const resolvedAt = '2026-10-16T18:00:00.000Z';
const shareUrl = 'https://www.reddit.com/r/BestGitHubRepos/s/EjKhT844dz';
const canonicalUrl = 'https://www.reddit.com/r/BestGitHubRepos/comments/1abc234/example_project/';

function redirect(location, status = 302) {
  return new Response('', { status, headers: { location } });
}

function ok(body = '<html></html>') {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
}

test('Reddit share resolver emits an integrity-bound canonical post identity without fetching the final post', async () => {
  const requests = [];
  const resolvedHosts = [];
  const resolve = createSourceIdentityResolver({
    resolveHost: async (hostname) => {
      resolvedHosts.push(hostname);
      return [{ address: '151.101.1.140' }];
    },
    fetchImpl: async (url) => {
      requests.push(url);
      if (url === shareUrl) return redirect(`${canonicalUrl}?share_id=abc&utm_source=share`);
      throw new Error('canonical target must not be fetched during identity resolution');
    },
  });

  const receipt = await resolve({ sourceId: 'rea-229', url: shareUrl, resolvedAt });
  assert.equal(receipt.state, 'resolved');
  assert.equal(receipt.target.kind, 'reddit-post');
  assert.equal(receipt.target.postId, '1abc234');
  assert.equal(receipt.target.subreddit, 'BestGitHubRepos');
  assert.equal(receipt.target.canonicalUrl, canonicalUrl);
  assert.equal(receipt.requiredCapability, null);
  assert.equal(receipt.redirects.length, 1);
  assert.deepEqual(requests, [shareUrl]);
  assert.deepEqual(resolvedHosts, ['www.reddit.com']);
  assert.equal(validateSourceIdentityResolutionReceipt(receipt), true);
});

test('Reddit share and canonical URL parsers reject ambiguous targets', () => {
  const parsed = parseRedditShareUrl(shareUrl);
  assert.equal(parsed.subreddit, 'BestGitHubRepos');
  assert.equal(parsed.shareToken, 'EjKhT844dz');
  assert.throws(
    () => parseRedditShareUrl('https://www.reddit.com/r/BestGitHubRepos/comments/1abc234/title/'),
    /supported Reddit share URL/,
  );
  assert.throws(
    () => parseRedditShareUrl('https://old.reddit.com/r/BestGitHubRepos/s/EjKhT844dz'),
    /reddit.com/,
  );
  assert.equal(parseCanonicalRedditPostUrl('https://www.reddit.com/r/BestGitHubRepos/'), null);
});

test('resolver fails closed before network access for private DNS and HTTPS policy violations', async () => {
  let fetched = false;
  const privateResolver = createSourceIdentityResolver({
    resolveHost: async () => [{ address: '10.0.0.5' }],
    fetchImpl: async () => { fetched = true; return ok(); },
  });
  await assert.rejects(
    () => privateResolver({ sourceId: 'rea-229', url: shareUrl, resolvedAt }),
    /forbidden network/,
  );
  assert.equal(fetched, false);

  const publicResolver = createSourceIdentityResolver({
    resolveHost: async () => [{ address: '151.101.1.140' }],
    fetchImpl: async () => ok(),
  });
  await assert.rejects(
    () => publicResolver({ sourceId: 'rea-229', url: shareUrl.replace('https:', 'http:'), resolvedAt }),
    /HTTPS/,
  );
});

test('resolver rejects redirects that escape Reddit or downgrade transport', async () => {
  const hostEscape = createSourceIdentityResolver({
    resolveHost: async () => [{ address: '151.101.1.140' }],
    fetchImpl: async () => redirect('https://example.com/r/BestGitHubRepos/comments/1abc234/title/'),
  });
  await assert.rejects(
    () => hostEscape({ sourceId: 'rea-229', url: shareUrl, resolvedAt }),
    /escaped the trusted Reddit host boundary/,
  );

  const downgrade = createSourceIdentityResolver({
    resolveHost: async () => [{ address: '151.101.1.140' }],
    fetchImpl: async () => redirect('http://www.reddit.com/r/BestGitHubRepos/comments/1abc234/title/'),
  });
  await assert.rejects(
    () => downgrade({ sourceId: 'rea-229', url: shareUrl, resolvedAt }),
    /HTTPS/,
  );
});

test('Reddit 401/403 becomes a signed access-context blocker instead of a retry loop', async () => {
  for (const status of [401, 403]) {
    const resolver = createSourceIdentityResolver({
      resolveHost: async () => [{ address: '151.101.1.140' }],
      fetchImpl: async () => new Response('denied', { status }),
    });
    const receipt = await resolver({ sourceId: `rea-${status}`, url: shareUrl, resolvedAt });
    assert.equal(receipt.state, 'unresolved');
    assert.equal(receipt.errorCode, 'ACCESS_CONTEXT_REQUIRED');
    assert.equal(receipt.requiredCapability, 'reddit-authenticated-or-browser-read');
    assert.equal(validateSourceIdentityResolutionReceipt(receipt), true);
  }
});

test('non-canonical final URLs and redirect exhaustion produce signed unresolved receipts', async () => {
  const nonCanonical = createSourceIdentityResolver({
    resolveHost: async () => [{ address: '151.101.1.140' }],
    fetchImpl: async () => ok(),
  });
  const unresolved = await nonCanonical({ sourceId: 'rea-229', url: shareUrl, resolvedAt });
  assert.equal(unresolved.state, 'unresolved');
  assert.equal(unresolved.errorCode, 'NON_CANONICAL_FINAL_URL');
  assert.equal(unresolved.requiredCapability, null);
  assert.equal(validateSourceIdentityResolutionReceipt(unresolved), true);

  let hop = 0;
  const exhausted = createSourceIdentityResolver({
    maxRedirects: 2,
    resolveHost: async () => [{ address: '151.101.1.140' }],
    fetchImpl: async () => {
      hop += 1;
      return redirect(`https://www.reddit.com/r/BestGitHubRepos/s/Token${hop}abc`);
    },
  });
  const receipt = await exhausted({ sourceId: 'rea-229', url: shareUrl, resolvedAt });
  assert.equal(receipt.state, 'unresolved');
  assert.equal(receipt.errorCode, 'REDIRECT_LIMIT_EXCEEDED');
  assert.equal(receipt.requiredCapability, null);
  assert.equal(receipt.redirects.length, 2);
  assert.equal(validateSourceIdentityResolutionReceipt(receipt), true);
});
