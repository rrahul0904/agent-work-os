#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCanonicalRedditPostUrl, parseRedditShareUrl } from '../../../packages/evidence/src/source-resolution.js';

export const BROWSER_READ_PROVIDER_REQUEST_VERSION = 'browser-read-provider-request/v1';
const DEFAULT_TIMEOUT_MS = 25_000;
const POLL_MS = 100;

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseBrowserReadProviderRequest(value) {
  if (!value || value.contractVersion !== BROWSER_READ_PROVIDER_REQUEST_VERSION) {
    throw new Error(`browser-read provider request must use ${BROWSER_READ_PROVIDER_REQUEST_VERSION}`);
  }
  const sourceId = requireString(value.sourceId, 'sourceId');
  const requestId = requireString(value.requestId, 'requestId');
  const requestedUrl = requireString(value.requestedUrl, 'requestedUrl');
  parseRedditShareUrl(requestedUrl);
  return Object.freeze({ contractVersion: BROWSER_READ_PROVIDER_REQUEST_VERSION, sourceId, requestId, requestedUrl });
}

function chromiumArgs(profileDir, requestedUrl) {
  return [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--disable-extensions',
    '--metrics-recording-only',
    '--safebrowsing-disable-auto-update',
    '--blink-settings=imagesEnabled=false',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    requestedUrl,
  ];
}

function redditHttpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    return host === 'reddit.com' || host === 'www.reddit.com';
  } catch {
    return false;
  }
}

async function waitForDevToolsPort(profileDir, child, deadline) {
  const portFile = path.join(profileDir, 'DevToolsActivePort');
  while (Date.now() < deadline) {
    if (child.exitCode !== null && child.exitCode !== undefined) {
      throw new Error(`browser exited before DevTools became ready (${child.exitCode})`);
    }
    try {
      const [line] = (await readFile(portFile, 'utf8')).split(/\r?\n/);
      const port = Number(line);
      if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await sleep(POLL_MS);
  }
  throw new Error('browser DevTools endpoint did not become ready before timeout');
}

async function fetchTargets(port, fetchImpl, deadline) {
  const remaining = Math.max(1, deadline - Date.now());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remaining);
  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}/json/list`, { signal: controller.signal });
    if (!response.ok) throw new Error(`browser DevTools target listing failed with HTTP ${response.status}`);
    const targets = await response.json();
    if (!Array.isArray(targets)) throw new Error('browser DevTools target listing was not an array');
    return targets;
  } finally {
    clearTimeout(timer);
  }
}

export async function observeCanonicalRedditUrl({
  browserExecutable,
  requestedUrl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  spawnImpl = spawn,
  fetchImpl = globalThis.fetch,
} = {}) {
  browserExecutable = requireString(browserExecutable, 'browserExecutable');
  parseRedditShareUrl(requestedUrl);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
    throw new TypeError('timeoutMs must be between 1 and 300000');
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');

  const profileDir = await mkdtemp(path.join(tmpdir(), 'agent-work-os-browser-read-'));
  const child = spawnImpl(browserExecutable, chromiumArgs(profileDir, requestedUrl), {
    stdio: ['ignore', 'ignore', 'ignore'],
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      SystemRoot: process.env.SystemRoot,
    },
  });
  const deadline = Date.now() + timeoutMs;
  let closePromise;
  try {
    closePromise = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
    const port = await waitForDevToolsPort(profileDir, child, deadline);
    while (Date.now() < deadline) {
      const targets = await fetchTargets(port, fetchImpl, deadline);
      const pages = targets.filter((target) => target?.type === 'page' && typeof target.url === 'string');
      for (const page of pages) {
        const canonical = parseCanonicalRedditPostUrl(page.url);
        if (canonical) return canonical.canonicalUrl;
        if (/^https?:/i.test(page.url) && !redditHttpUrl(page.url)) {
          throw new Error('browser navigation escaped the approved Reddit host boundary');
        }
      }
      if (child.exitCode !== null && child.exitCode !== undefined) {
        throw new Error(`browser exited before resolving a canonical Reddit post (${child.exitCode})`);
      }
      await sleep(POLL_MS);
    }
    throw new Error(`browser did not resolve a canonical Reddit post within ${timeoutMs}ms`);
  } finally {
    if (child.exitCode === null || child.exitCode === undefined) child.kill('SIGTERM');
    if (closePromise) await Promise.race([closePromise, sleep(1_000)]).catch(() => {});
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function runBrowserReadProvider(request, {
  browserExecutable = process.env.AGENT_WORK_OS_BROWSER_EXECUTABLE,
  timeoutMs = Number(process.env.AGENT_WORK_OS_BROWSER_READ_NAVIGATION_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  spawnImpl = spawn,
  fetchImpl = globalThis.fetch,
  observedAt = () => new Date().toISOString(),
} = {}) {
  const parsed = parseBrowserReadProviderRequest(request);
  const canonicalUrl = await observeCanonicalRedditUrl({
    browserExecutable,
    requestedUrl: parsed.requestedUrl,
    timeoutMs,
    spawnImpl,
    fetchImpl,
  });
  const digest = createHash('sha256')
    .update(parsed.requestId)
    .update('\0')
    .update(canonicalUrl)
    .digest('hex')
    .slice(0, 24);
  return Object.freeze({
    canonicalUrl,
    evidenceRef: `chromium-cdp:${parsed.requestId}:${digest}`,
    observedAt: observedAt(),
  });
}

async function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) raw += chunk;
  const request = JSON.parse(raw);
  const result = await runBrowserReadProvider(request);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
