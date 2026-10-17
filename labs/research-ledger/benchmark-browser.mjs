import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { RETRIEVAL_BENCHMARK_VERSION, BENCHMARK_CASES } from './retrieval-benchmark-core.js';

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

function compareModes(a, b) {
  const recallDelta = a.recallAtK - b.recallAtK;
  if (Math.abs(recallDelta) > 1e-12) return recallDelta;
  return a.mrr - b.mrr;
}

function buildDecision(report) {
  const lexical = report.metrics.lexical;
  const semantic = report.metrics.semantic;
  const hybrid = report.metrics.hybrid;
  const ordered = [
    ['lexical', lexical],
    ['semantic', semantic],
    ['hybrid', hybrid]
  ].sort(([, a], [, b]) => compareModes(b, a));
  const fixtureLeader = ordered[0][0];
  const hybridStrictlyBeatsLexical = hybrid.recallAtK > lexical.recallAtK && hybrid.mrr > lexical.mrr;
  const hybridNotWorseThanSemantic = hybrid.recallAtK >= semantic.recallAtK && hybrid.mrr >= semantic.mrr;
  const promotionEligibleOnFixture = report.corpus.cases >= 20 && hybridStrictlyBeatsLexical && hybridNotWorseThanSemantic;

  let fixtureSignal = `${fixtureLeader}-leading`;
  let rationale = `On this ${report.corpus.cases}-case fixture, ${fixtureLeader} leads when Recall@${report.k} is compared first and MRR breaks ties.`;
  if (hybrid.recallAtK > lexical.recallAtK && hybrid.mrr <= lexical.mrr) {
    fixtureSignal = 'hybrid-improves-recall-not-rank-quality';
    rationale = `Hybrid improves Recall@${report.k} over lexical but does not improve MRR, so it remains experimental.`;
  } else if (semantic.recallAtK >= hybrid.recallAtK && semantic.mrr > hybrid.mrr) {
    fixtureSignal = 'semantic-ranks-better-than-hybrid';
    rationale = `Semantic matches or exceeds hybrid Recall@${report.k} and has higher MRR, so the current equal-weight RRF is not a default candidate.`;
  }

  return {
    promoteHybridDefault: false,
    promotionEligibleOnFixture,
    fixtureLeader,
    fixtureSignal,
    rationale,
    rule: 'Never auto-promote a retrieval mode from this benchmark alone. Hybrid can become a default candidate only if it strictly improves both Recall@k and MRR over lexical, is not worse than semantic on either metric, and broader representative notebook evaluation also passes.'
  };
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
  assert.equal(report.schema, RETRIEVAL_BENCHMARK_VERSION);
  assert.equal(report.k, 5);
  assert.equal(report.corpus.cases, BENCHMARK_CASES.length);
  assert.ok(report.corpus.cases >= 20);
  for (const mode of ['lexical', 'semantic', 'hybrid']) {
    assert.equal(report.metrics[mode].cases, report.corpus.cases);
    assert.ok(report.metrics[mode].recallAtK >= 0 && report.metrics[mode].recallAtK <= 1);
    assert.ok(report.metrics[mode].mrr >= 0 && report.metrics[mode].mrr <= 1);
  }
  assert.ok(report.breakdown?.byKind?.multilingual, 'benchmark receipt must include by-kind metrics');
  assert.ok(report.breakdown?.byLanguage?.en, 'benchmark receipt must include by-language metrics');
  assert.equal(report.performance?.environment, 'browser-observed; runner/device dependent');
  assert.ok(Number.isFinite(report.performance?.indexReadyElapsedMs) && report.performance.indexReadyElapsedMs > 0);
  assert.ok(Number.isFinite(report.performance?.totalRunMs) && report.performance.totalRunMs >= report.performance.indexReadyElapsedMs);
  assert.equal(report.performance?.semanticQuery?.samples, report.corpus.cases);
  assert.equal(report.performance?.lexicalQuery?.samples, report.corpus.cases);
  assert.equal(report.performance?.hybridFusion?.samples, report.corpus.cases);
  assert.ok(report.performance.semanticQuery.p95Ms >= report.performance.semanticQuery.p50Ms);

  report.execution = {
    runner: 'playwright-chromium',
    browserVersion: browser.version(),
    source: 'research-ledger-benchmark-ci',
    browserErrors
  };
  report.decision = buildDecision(report);
  await writeFile(receiptFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    receipt: receiptFile,
    lexical: report.metrics.lexical,
    semantic: report.metrics.semantic,
    hybrid: report.metrics.hybrid,
    performance: report.performance,
    decision: report.decision
  }, null, 2));
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) server.kill('SIGTERM');
}
