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
  let lastStatus = '';
  page.on('pageerror', error => {
    const line = `pageerror: ${error.message}`;
    browserErrors.push(line);
    console.error(line);
  });
  page.on('console', message => {
    const line = `${message.type()}: ${message.text()}`;
    if (message.type() === 'error' || message.type() === 'warning') browserErrors.push(line);
    if (message.type() === 'error' || message.type() === 'warning') console.error(line);
  });
  page.on('requestfailed', request => {
    const line = `requestfailed: ${request.url()} · ${request.failure()?.errorText || 'unknown'}`;
    browserErrors.push(line);
    console.error(line);
  });

  const response = await page.goto(`${base}/retrieval-benchmark.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200);
  await page.getByRole('button', { name: 'Run browser benchmark' }).click();

  const statusPoll = setInterval(async () => {
    try {
      const current = await page.locator('#benchmarkStatus').textContent();
      if (current && current !== lastStatus) {
        lastStatus = current;
        console.log(`benchmark-status: ${current}`);
      }
    } catch {}
  }, 5000);

  try {
    await page.waitForFunction(() => Boolean(window.__researchLedgerBenchmarkReport || window.__researchLedgerBenchmarkFailure), null, { timeout: 240_000 });
  } finally {
    clearInterval(statusPoll);
  }

  const outcome = await page.evaluate(() => ({
    report: window.__researchLedgerBenchmarkReport || null,
    failure: window.__researchLedgerBenchmarkFailure || null,
    status: document.querySelector('#benchmarkStatus')?.textContent || ''
  }));
  if (outcome.failure) {
    throw new Error(`browser benchmark failed: ${outcome.failure.message}\nstatus: ${outcome.status}\nbrowser diagnostics:\n${browserErrors.join('\n') || 'none'}`);
  }

  const report = outcome.report;
  assert.ok(report, `benchmark produced no report; status=${outcome.status}; diagnostics=${browserErrors.join(' | ')}`);
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
