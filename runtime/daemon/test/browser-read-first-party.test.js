import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { BrowserReadAdapter } from '../src/browser-read-adapter.js';
import {
  BROWSER_READ_PROVIDER_REQUEST_VERSION,
  observeCanonicalRedditUrl,
  parseBrowserReadProviderRequest,
  runBrowserReadProvider,
} from '../src/browser-read-chromium-provider.js';

const shareUrl = 'https://www.reddit.com/r/BestGitHubRepos/s/EjKhT844dz';
const canonicalUrl = 'https://www.reddit.com/r/BestGitHubRepos/comments/1abc234/example_project/';
const now = '2026-10-17T04:45:00.000Z';

function providerRequest(overrides = {}) {
  return {
    contractVersion: BROWSER_READ_PROVIDER_REQUEST_VERSION,
    sourceId: 'rea-229',
    requestId: 'source-access-aaaaaaaaaaaaaaaaaaaaaaaa',
    requestedUrl: shareUrl,
    ...overrides,
  };
}

function fakeBrowserSpawn() {
  return (_executable, args) => {
    const child = new EventEmitter();
    child.exitCode = null;
    child.kill = () => {
      if (child.exitCode !== null) return true;
      child.exitCode = 0;
      queueMicrotask(() => child.emit('close', 0, null));
      return true;
    };
    const profileArg = args.find((arg) => arg.startsWith('--user-data-dir='));
    const profileDir = profileArg.slice('--user-data-dir='.length);
    queueMicrotask(() => {
      void writeFile(path.join(profileDir, 'DevToolsActivePort'), '9222\n/devtools/browser/test\n', 'utf8');
    });
    return child;
  };
}

function targetsFetch(urlValue) {
  assert.equal(urlValue, 'http://127.0.0.1:9222/json/list');
  return Promise.resolve(new Response(JSON.stringify([{ type: 'page', url: canonicalUrl }]), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }));
}

test('first-party browser-read remains unadvertised without explicit enablement', () => {
  const adapter = new BrowserReadAdapter({
    command: '',
    found: undefined,
    firstPartyEnabled: false,
    browserFound: { executable: '/fake/chrome', version: 'Chrome 1' },
  });
  assert.equal(adapter.capability(), null);
});

test('first-party browser-read advertises only when an enabled browser executable is resolved', () => {
  const missing = new BrowserReadAdapter({
    command: '', firstPartyEnabled: true, browserFound: null,
  });
  assert.equal(missing.capability(), null);

  const adapter = new BrowserReadAdapter({
    command: '',
    firstPartyEnabled: true,
    browserFound: { executable: '/fake/chrome', version: 'Chrome 1' },
  });
  const capability = adapter.capability();
  assert.equal(capability.name, 'browser-read');
  assert.equal(capability.access, 'read-only');
  assert.equal(capability.observerKind, 'agent-work-os-chromium');
  assert.equal(capability.browserExecutable, '/fake/chrome');
  assert.equal(capability.browserVersion, 'Chrome 1');
  assert.deepEqual(capability.observationContracts, ['source-access-observation/v1']);
});

test('first-party provider request rejects non-Reddit and malformed inputs', () => {
  assert.equal(parseBrowserReadProviderRequest(providerRequest()).requestedUrl, shareUrl);
  assert.throws(() => parseBrowserReadProviderRequest(providerRequest({ contractVersion: 'wrong' })), /must use/);
  assert.throws(() => parseBrowserReadProviderRequest(providerRequest({ requestedUrl: 'https://example.com/' })), /reddit share URL/);
});

test('chromium provider resolves the canonical Reddit post from the local DevTools target list', async () => {
  const observed = await observeCanonicalRedditUrl({
    browserExecutable: '/fake/chrome',
    requestedUrl: shareUrl,
    timeoutMs: 2_000,
    spawnImpl: fakeBrowserSpawn(),
    fetchImpl: targetsFetch,
  });
  assert.equal(observed, canonicalUrl);
});

test('chromium provider fails closed when browser navigation escapes Reddit', async () => {
  await assert.rejects(() => observeCanonicalRedditUrl({
    browserExecutable: '/fake/chrome',
    requestedUrl: shareUrl,
    timeoutMs: 2_000,
    spawnImpl: fakeBrowserSpawn(),
    fetchImpl: async () => new Response(JSON.stringify([{ type: 'page', url: 'https://example.com/redirected' }]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  }), /escaped the approved Reddit host boundary/);
});

test('first-party provider returns only canonical observation metadata with a deterministic evidence reference', async () => {
  const result = await runBrowserReadProvider(providerRequest(), {
    browserExecutable: '/fake/chrome',
    timeoutMs: 2_000,
    spawnImpl: fakeBrowserSpawn(),
    fetchImpl: targetsFetch,
    observedAt: () => now,
  });
  assert.equal(result.canonicalUrl, canonicalUrl);
  assert.equal(result.observedAt, now);
  assert.match(result.evidenceRef, /^chromium-cdp:source-access-aaaaaaaaaaaaaaaaaaaaaaaa:[0-9a-f]{24}$/);
  assert.deepEqual(Object.keys(result).sort(), ['canonicalUrl', 'evidenceRef', 'observedAt']);
});
