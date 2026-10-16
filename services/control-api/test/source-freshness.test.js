import test from 'node:test';
import assert from 'node:assert/strict';

import { sha256 } from '../../../packages/evidence/src/research-workspace.js';
import {
  createSourceFreshnessChecker,
  isForbiddenNetworkAddress,
  validateFreshnessUrl,
  validateSourceFreshnessReceipt,
} from '../../../packages/evidence/src/source-freshness.js';

const checkedAt = '2026-10-16T15:00:00.000Z';

function response(body, { status = 200, headers = {} } = {}) {
  return new Response(body, { status, headers });
}

test('freshness checker produces baseline, unchanged, and changed integrity receipts', async () => {
  let body = 'Version one\n';
  const check = createSourceFreshnessChecker({
    resolveHost: async () => [{ address: '93.184.216.34' }],
    fetchImpl: async () => response(body, { headers: { 'content-type': 'text/plain' } }),
  });

  const baseline = await check({ sourceId: 'source-1', url: 'https://example.com/source', checkedAt });
  assert.equal(baseline.state, 'baseline');
  assert.equal(validateSourceFreshnessReceipt(baseline), true);
  assert.equal(baseline.currentContentSha256, sha256('Version one\n'));

  const unchanged = await check({
    sourceId: 'source-1',
    url: 'https://example.com/source',
    previousContentSha256: baseline.currentContentSha256,
    checkedAt,
  });
  assert.equal(unchanged.state, 'unchanged');
  assert.equal(validateSourceFreshnessReceipt(unchanged), true);

  body = 'Version two\n';
  const changed = await check({
    sourceId: 'source-1',
    url: 'https://example.com/source',
    previousContentSha256: baseline.currentContentSha256,
    checkedAt,
  });
  assert.equal(changed.state, 'changed');
  assert.notEqual(changed.currentContentSha256, baseline.currentContentSha256);
  assert.equal(validateSourceFreshnessReceipt(changed), true);
});

test('freshness checker records redirect provenance and revalidates redirected hosts', async () => {
  const resolved = [];
  const requested = [];
  const check = createSourceFreshnessChecker({
    resolveHost: async (hostname) => {
      resolved.push(hostname);
      return [{ address: hostname === 'example.com' ? '93.184.216.34' : '151.101.1.69' }];
    },
    fetchImpl: async (url) => {
      requested.push(url);
      if (url === 'https://example.com/start') return response('', { status: 302, headers: { location: 'https://www.iana.org/final' } });
      return response('Canonical body', { headers: { 'content-type': 'text/html; charset=utf-8' } });
    },
  });

  const receipt = await check({ sourceId: 'source-redirect', url: 'https://example.com/start', checkedAt });
  assert.equal(receipt.state, 'baseline');
  assert.equal(receipt.finalUrl, 'https://www.iana.org/final');
  assert.equal(receipt.redirects.length, 1);
  assert.deepEqual(resolved, ['example.com', 'www.iana.org']);
  assert.deepEqual(requested, ['https://example.com/start', 'https://www.iana.org/final']);
  assert.equal(validateSourceFreshnessReceipt(receipt), true);
});

test('freshness network policy fails closed for localhost, private DNS results, credentials, and unsafe ports', async () => {
  assert.equal(isForbiddenNetworkAddress('127.0.0.1'), true);
  assert.equal(isForbiddenNetworkAddress('10.0.0.2'), true);
  assert.equal(isForbiddenNetworkAddress('169.254.169.254'), true);
  assert.equal(isForbiddenNetworkAddress('93.184.216.34'), false);
  assert.throws(() => validateFreshnessUrl('http://example.com'), /HTTPS/);
  assert.throws(() => validateFreshnessUrl('https://user:pass@example.com'), /credentials/);
  assert.throws(() => validateFreshnessUrl('https://example.com:8443'), /default HTTPS port/);
  assert.throws(() => validateFreshnessUrl('https://localhost/source'), /not public/);

  let fetched = false;
  const check = createSourceFreshnessChecker({
    resolveHost: async () => [{ address: '10.0.0.4' }],
    fetchImpl: async () => { fetched = true; return response('should not fetch'); },
  });
  await assert.rejects(
    () => check({ sourceId: 'source-private', url: 'https://private.example/source', checkedAt }),
    /forbidden network/,
  );
  assert.equal(fetched, false);
});

test('ordinary upstream failures become signed unreachable receipts instead of fabricated freshness', async () => {
  const check = createSourceFreshnessChecker({
    resolveHost: async () => [{ address: '93.184.216.34' }],
    fetchImpl: async () => { throw new Error('network down'); },
  });
  const receipt = await check({
    sourceId: 'source-down',
    url: 'https://example.com/down',
    previousContentSha256: sha256('old'),
    checkedAt,
  });
  assert.equal(receipt.state, 'unreachable');
  assert.equal(receipt.currentContentSha256, null);
  assert.equal(receipt.errorCode, 'FETCH_FAILED');
  assert.equal(validateSourceFreshnessReceipt(receipt), true);
});
