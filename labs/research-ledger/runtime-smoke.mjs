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
  const csp = home.headers.get('content-security-policy') || '';
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /'wasm-unsafe-eval'/, 'semantic inference CSP must allow WebAssembly without enabling general JS eval');
  assert.doesNotMatch(csp, /'unsafe-eval'/, 'CSP must not enable general JavaScript eval');
  assert.match(csp, /https:\/\/huggingface\.co/);
  assert.match(csp, /https:\/\/\*\.hf\.co/);
  assert.ok(homeText.indexOf('src="/db-schema.js"') < homeText.indexOf('src="/app.js"'), 'schema guard must load before app');
  assert.ok(homeText.indexOf('src="/completion.js"') < homeText.indexOf('src="/semantic-search.js"'), 'semantic controller must load after completion layer');
  assert.ok(homeText.indexOf('src="/semantic-search.js"') < homeText.indexOf('src="/hybrid-brief.js"'), 'hybrid bridge must be declared after semantic controller');
  assert.match(homeText, /<script src="\/db-schema\.js"><\/script>/);
  assert.match(homeText, /<script src="\/app\.js"><\/script>/);
  assert.match(homeText, /<script src="\/hybrid-brief\.js"><\/script>/);

  const shippedAssets = [
    ['/styles.css', /text\/css/],
    ['/completion.css', /text\/css/],
    ['/db-schema.js', /javascript/],
    ['/app.js', /javascript/],
    ['/completion.js', /javascript/],
    ['/semantic-core.js', /javascript/],
    ['/semantic-worker.js', /javascript/],
    ['/semantic-search.js', /javascript/],
    ['/hybrid-brief.js', /javascript/],
    ['/retrieval-benchmark-core.js', /javascript/],
    ['/retrieval-benchmark.js', /javascript/]
  ];
  for (const [path, contentType] of shippedAssets) {
    const asset = await fetch(`${base}${path}`);
    assert.equal(asset.status, 200, `${path} must be served by the portable runtime`);
    assert.match(asset.headers.get('content-type') || '', contentType);
  }

  const benchmarkPage = await fetch(`${base}/retrieval-benchmark.html`);
  assert.equal(benchmarkPage.status, 200);
  const benchmarkHtml = await benchmarkPage.text();
  assert.match(benchmarkHtml, /Research Ledger Retrieval Benchmark/);
  assert.match(benchmarkHtml, /Quality claims require an executed receipt/);
  assert.match(benchmarkHtml, /Recall@5 and mean reciprocal rank/);
  assert.match(benchmarkHtml, /src="\/retrieval-benchmark\.js"/);

  const schema = await fetch(`${base}/db-schema.js`);
  assert.match(await schema.text(), /const DB_VERSION = 3/);

  const semanticCore = await fetch(`${base}/semantic-core.js`);
  const semanticCoreText = await semanticCore.text();
  assert.match(semanticCoreText, /Xenova\/multilingual-e5-small/);
  assert.match(semanticCoreText, /761b726dd34fb83930e26aab4e9ac3899aa1fa78/);
  assert.match(semanticCoreText, /reciprocalRankFusion/);

  const semanticWorker = await fetch(`${base}/semantic-worker.js`);
  const semanticWorkerText = await semanticWorker.text();
  assert.match(semanticWorkerText, /SEMANTIC_MODEL_ID/);
  assert.match(semanticWorkerText, /dtype: 'q8'/);
  assert.match(semanticWorkerText, /pooling: 'mean'/);
  assert.match(semanticWorkerText, /normalize: true/);

  const hybrid = await fetch(`${base}/hybrid-brief.js`);
  const hybridText = await hybrid.text();
  assert.match(hybridText, /hybridRetrieve/);
  assert.match(hybridText, /hybrid-rrf/);
  assert.match(hybridText, /lexical-fallback/);

  const benchmarkCore = await fetch(`${base}/retrieval-benchmark-core.js`);
  const benchmarkCoreText = await benchmarkCore.text();
  assert.match(benchmarkCoreText, /research-ledger\/retrieval-benchmark\.v1/);
  assert.match(benchmarkCoreText, /BENCHMARK_CASES/);

  const head = await fetch(`${base}/retrieval-benchmark.js`, { method: 'HEAD' });
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
