import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const labDir = dirname(fileURLToPath(import.meta.url));
const serverFile = resolve(labDir, 'railway-server.mjs');
const receiptFile = resolve(labDir, 'retrieval-benchmark-receipt.json');
const port = 41000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
let serverErr = '';

const server = spawn(process.execPath, [serverFile], {
  cwd: labDir,
  env: { ...process.env, PORT: String(port), OPENAI_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe']
});
server.stderr.on('data', chunk => { serverErr += chunk.toString(); });

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`server exited early (${server.exitCode})\n${serverErr}`);
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
  }
  throw new Error(`benchmark server did not become ready\n${serverErr}`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });

  const response = await page.goto(`${base}/retrieval-benchmark.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200);
  await page.getByRole('button', { name: 'Run browser benchmark' }).click();
  await page.waitForFunction(() => Boolean(window.__researchLedgerBenchmarkReport), null, { timeout: 300_000 });

  const report = await page.evaluate(() => window.__researchLedgerBenchmarkReport);
  assert.equal(report.schema, 'research-ledger/retrieval-benchmark.v1');
  assert.equal(report.k, 5);
  assert.equal(report.corpus.cases, 9);
  for (const mode of ['lexical', 'semantic', 'hybrid']) {
    assert.equal(report.metrics[mode].cases, report.corpus.cases);
    assert.ok(report.metrics[mode].recallAtK >= 0 && report.metrics[mode].recallAtK <= 1);
    assert.ok(report.metrics[mode].mrr >= 0 && report.metrics[mode].mrr <= 1);
  }
  report.execution = {
    runner: 'playwright-chromium',
    browserVersion: browser.version(),
    source: 'research-ledger-benchmark-ci',
    browserErrors
  };
  report.decision = {
    promoteHybridDefault: report.metrics.hybrid.recallAtK > report.metrics.lexical.recallAtK && report.metrics.hybrid.mrr >= report.metrics.lexical.mrr,
    rule: 'promote only when hybrid Recall@5 strictly exceeds lexical and hybrid MRR is not worse on this fixture; broader representative evaluation is still required before product-default promotion'
  };
  await writeFile(receiptFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    receipt: receiptFile,
    lexical: report.metrics.lexical,
    semantic: report.metrics.semantic,
    hybrid: report.metrics.hybrid,
    decision: report.decision
  }, null, 2));
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) server.kill('SIGTERM');
}
