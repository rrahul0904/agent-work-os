import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createSourceAccessRequest, validateSourceAccessObservation } from '../../../packages/evidence/src/source-access-context.js';
import { createSourceIdentityResolver } from '../../../packages/evidence/src/source-resolution.js';
import { BrowserReadAdapter } from '../src/browser-read-adapter.js';

const shareUrl = 'https://www.reddit.com/r/BestGitHubRepos/s/EjKhT844dz';
const canonicalUrl = 'https://www.reddit.com/r/BestGitHubRepos/comments/1abc234/example_project/';
const now = '2026-10-17T02:45:00.000Z';

async function accessRequest() {
  const resolve = createSourceIdentityResolver({
    resolveHost: async () => [{ address: '151.101.73.140' }],
    fetchImpl: async () => new Response('blocked', { status: 403 }),
  });
  const blocked = await resolve({ sourceId: 'rea-229', url: shareUrl, resolvedAt: now });
  return createSourceAccessRequest({ blockedResolution: blocked, requestedAt: now });
}

async function fakeProvider(source) {
  const root = await mkdtemp(path.join(tmpdir(), 'awos-browser-read-'));
  const script = path.join(root, 'provider.mjs');
  await writeFile(script, source, 'utf8');
  return script;
}

function configuredAdapter(script, overrides = {}) {
  return new BrowserReadAdapter({
    found: { executable: process.execPath, version: process.version },
    args: [script],
    timeoutMs: 5_000,
    ...overrides,
  });
}

test('browser-read is not advertised when no external observer is configured', () => {
  const adapter = new BrowserReadAdapter({ command: '', found: null });
  assert.equal(adapter.capability(), null);
});

test('configured browser-read advertises only read-only source observation capability', async () => {
  const script = await fakeProvider('process.exit(0);');
  const capability = configuredAdapter(script).capability();
  assert.equal(capability.name, 'browser-read');
  assert.equal(capability.access, 'read-only');
  assert.deepEqual(capability.observationContracts, ['source-access-observation/v1']);
  assert.equal(capability.executable, process.execPath);
});

test('external observer can return canonical URL while Agent Work OS binds the trusted observation', async () => {
  const request = await accessRequest();
  const script = await fakeProvider(`
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const providerRequest = JSON.parse(input);
  const minimal = !Object.hasOwn(providerRequest, 'requestSha256') && !Object.hasOwn(providerRequest, 'blockerReceiptSha256');
  console.log(JSON.stringify({
    canonicalUrl: ${JSON.stringify(canonicalUrl)},
    evidenceRef: minimal ? 'fake-browser:minimal-request' : 'fake-browser:overexposed-request',
    observedAt: ${JSON.stringify(now)}
  }));
});
`);
  const adapter = configuredAdapter(script);
  const events = [];
  const result = await adapter.run({
    sessionId: 'browser-session-1',
    cwd: path.dirname(script),
    prompt: JSON.stringify({ sourceAccessRequest: request }),
  }, (event) => events.push(event));

  assert.equal(result.observation.provider, 'browser-read');
  assert.equal(result.observation.evidenceRef, 'fake-browser:minimal-request');
  assert.equal(result.observation.requestSha256, request.requestSha256);
  assert.equal(result.observation.blockerReceiptSha256, request.blocker.receiptSha256);
  assert.equal(validateSourceAccessObservation(result.observation, { request }), true);
  const observationEvent = events.find((event) => event.kind === 'tool' && event.name === 'source-access-observation');
  assert.equal(observationEvent.payload.observationSha256, result.observation.observationSha256);
  assert.equal(events.at(-1).status, 'completed');
});

test('browser-read provider environment does not inherit arbitrary parent secrets', async () => {
  const request = await accessRequest();
  const secretName = 'AGENT_WORK_OS_BROWSER_READ_TEST_SECRET';
  const previous = process.env[secretName];
  process.env[secretName] = 'must-not-leak';
  try {
    const script = await fakeProvider(`
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  JSON.parse(input);
  console.log(JSON.stringify({
    canonicalUrl: ${JSON.stringify(canonicalUrl)},
    evidenceRef: process.env.${secretName} ? 'secret-leaked' : 'secret-not-forwarded',
    observedAt: ${JSON.stringify(now)}
  }));
});
`);
    const result = await configuredAdapter(script).run({
      sessionId: 'browser-session-env',
      cwd: path.dirname(script),
      prompt: JSON.stringify({ sourceAccessRequest: request }),
    }, () => {});
    assert.equal(result.observation.evidenceRef, 'secret-not-forwarded');
  } finally {
    if (previous === undefined) delete process.env[secretName];
    else process.env[secretName] = previous;
  }
});

test('invalid canonical URL from external observer fails closed', async () => {
  const request = await accessRequest();
  const script = await fakeProvider(`
process.stdin.resume();
process.stdin.on('end', () => console.log(JSON.stringify({
  canonicalUrl: 'https://www.reddit.com/r/BestGitHubRepos/',
  evidenceRef: 'fake-browser:invalid',
  observedAt: ${JSON.stringify(now)}
})));
`);
  const adapter = configuredAdapter(script);
  await assert.rejects(() => adapter.run({
    sessionId: 'browser-session-invalid',
    cwd: path.dirname(script),
    prompt: JSON.stringify({ sourceAccessRequest: request }),
  }, () => {}), /canonical Reddit post URL/);
});
