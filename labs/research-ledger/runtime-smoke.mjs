import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const labDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(labDir, '../..');
const serverFile = resolve(labDir, 'railway-server.mjs');
const port = 39000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
let stderr = '';

const child = spawn(process.execPath, [serverFile], {
  cwd: repoRoot,
  env: { ...process.env, PORT: String(port), OPENAI_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe']
});
child.stderr.on('data', chunk => { stderr += chunk.toString(); });

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error(`server exited early (${child.exitCode})\n${stderr}`);
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
  }
  throw new Error(`server did not become ready\n${stderr}`);
}

try {
  await waitForServer();

  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, service: 'research-ledger', version: '0.3.0' });

  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  const homeText = await home.text();
  assert.match(homeText, /Research Ledger/);
  assert.match(home.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.ok(homeText.indexOf('src="/db-schema.js"') < homeText.indexOf('src="/app.js"'), 'schema guard must load before app');

  const shippedAssets = [
    ['/styles.css', /text\/css/],
    ['/completion.css', /text\/css/],
    ['/db-schema.js', /javascript/],
    ['/app.js', /javascript/],
    ['/completion.js', /javascript/]
  ];
  for (const [path, contentType] of shippedAssets) {
    const asset = await fetch(`${base}${path}`);
    assert.equal(asset.status, 200, `${path} must be served by the portable runtime`);
    assert.match(asset.headers.get('content-type') || '', contentType);
  }

  const schema = await fetch(`${base}/db-schema.js`);
  assert.match(await schema.text(), /const DB_VERSION = 3/);

  const head = await fetch(`${base}/completion.css`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');

  const packageLeak = await fetch(`${base}/package.json`);
  assert.equal(packageLeak.status, 404);

  const research = await fetch(`${base}/api/research`);
  assert.equal(research.status, 200);
  const researchStatus = await research.json();
  assert.equal(researchStatus.live, false);
  assert.equal(researchStatus.model, 'local-extractive');

  const sourceStatus = await fetch(`${base}/api/source-status`);
  assert.equal(sourceStatus.status, 200);
  const sourceMeta = await sourceStatus.json();
  assert.equal(sourceMeta.maxUrls, 8);
  assert.equal(sourceMeta.maxSampleBytes, 65536);

  const badSourceRequest = await fetch(`${base}/api/source-status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ urls: [] })
  });
  assert.equal(badSourceRequest.status, 400);

  const localOnlyResearch = await fetch(`${base}/api/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task: 'research', question: 'test', evidence: [{ id: 'E1', title: 'Test', text: 'Evidence.' }] })
  });
  assert.equal(localOnlyResearch.status, 503);

  console.log('research-ledger portable runtime smoke tests passed');
} finally {
  if (child.exitCode === null) child.kill('SIGTERM');
}
