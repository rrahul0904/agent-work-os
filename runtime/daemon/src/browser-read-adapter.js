import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createSourceAccessObservation, validateSourceAccessRequest } from '../../../packages/evidence/src/source-access-context.js';
import { findCommand } from './adapters.js';

const OBSERVATION_CONTRACT = 'source-access-observation/v1';
const PROVIDER_REQUEST_CONTRACT = 'browser-read-provider-request/v1';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_STDOUT_BYTES = 64 * 1024;
const MAX_STDERR_BYTES = 8 * 1024;
const FIRST_PARTY_PROVIDER = fileURLToPath(new URL('./browser-read-chromium-provider.js', import.meta.url));

function parseArgs(value) {
  if (!value) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
    throw new Error('AGENT_WORK_OS_BROWSER_READ_ARGS must be a JSON string array');
  }
  return parsed;
}

function boundedAppend(current, chunk, limit, label) {
  const next = current + String(chunk);
  if (Buffer.byteLength(next, 'utf8') > limit) throw new Error(`${label} exceeded ${limit} bytes`);
  return next;
}

function providerEnvironment(allowlist = process.env.AGENT_WORK_OS_BROWSER_READ_ENV_ALLOWLIST ?? '', extra = {}) {
  const names = new Set(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot']);
  for (const name of String(allowlist).split(',').map((value) => value.trim()).filter(Boolean)) names.add(name);
  const env = {};
  for (const name of names) if (process.env[name] !== undefined) env[name] = process.env[name];
  return { ...env, ...extra };
}

function parseProviderResult(stdout) {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error('browser-read provider returned no output');
  let result;
  try { result = JSON.parse(lines.at(-1)); }
  catch { throw new Error('browser-read provider must return JSON on its final stdout line'); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('browser-read provider result must be an object');
  if (typeof result.canonicalUrl !== 'string' || !result.canonicalUrl) throw new Error('browser-read provider result missing canonicalUrl');
  if (typeof result.evidenceRef !== 'string' || !result.evidenceRef) throw new Error('browser-read provider result missing evidenceRef');
  return result;
}

function resolveFirstPartyBrowser({ browserCommand, browserFound }) {
  if (browserFound !== undefined) return browserFound;
  if (browserCommand) return findCommand(browserCommand);
  const candidates = process.platform === 'win32'
    ? ['chrome', 'msedge']
    : process.platform === 'darwin'
      ? ['google-chrome', 'chromium']
      : ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser'];
  for (const candidate of candidates) {
    const found = findCommand(candidate);
    if (found) return found;
  }
  return null;
}

export class BrowserReadAdapter {
  name = 'browser-read';
  children = new Map();

  constructor({
    command = process.env.AGENT_WORK_OS_BROWSER_READ_COMMAND ?? '',
    args = parseArgs(process.env.AGENT_WORK_OS_BROWSER_READ_ARGS),
    found = undefined,
    timeoutMs = Number(process.env.AGENT_WORK_OS_BROWSER_READ_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    envAllowlist = process.env.AGENT_WORK_OS_BROWSER_READ_ENV_ALLOWLIST ?? '',
    firstPartyEnabled = process.env.AGENT_WORK_OS_ENABLE_FIRST_PARTY_BROWSER_READ === 'true',
    browserCommand = process.env.AGENT_WORK_OS_BROWSER_EXECUTABLE ?? '',
    browserFound = undefined,
  } = {}) {
    this.firstParty = false;
    this.browserFound = null;
    if (!command && firstPartyEnabled) {
      this.browserFound = resolveFirstPartyBrowser({ browserCommand, browserFound });
      if (this.browserFound) {
        command = process.execPath;
        args = [FIRST_PARTY_PROVIDER];
        found = { executable: process.execPath, version: process.version };
        this.firstParty = true;
      }
    }
    this.command = command;
    this.args = [...args];
    this.found = found !== undefined ? found : (command ? findCommand(command) : null);
    this.timeoutMs = timeoutMs;
    this.envAllowlist = envAllowlist;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 300_000) {
      throw new Error('AGENT_WORK_OS_BROWSER_READ_TIMEOUT_MS must be between 1 and 300000');
    }
  }

  capability() {
    if (!this.found) return null;
    return {
      name: this.name,
      executable: this.found.executable,
      version: this.found.version,
      access: 'read-only',
      observationContracts: [OBSERVATION_CONTRACT],
      observerKind: this.firstParty ? 'agent-work-os-chromium' : 'external-command',
      ...(this.browserFound ? {
        browserExecutable: this.browserFound.executable,
        browserVersion: this.browserFound.version,
      } : {}),
    };
  }

  async run(request, emit) {
    if (!this.found) throw new Error('browser-read provider is not configured');
    if (this.children.has(request.sessionId)) throw new Error('browser-read provider is already running for this session');
    let parsed;
    try { parsed = JSON.parse(request.prompt); }
    catch { throw new Error('browser-read prompt must be JSON'); }
    const accessRequest = parsed?.sourceAccessRequest;
    if (!validateSourceAccessRequest(accessRequest)) throw new Error('browser-read requires an intact source access request');

    emit({ kind: 'status', status: 'running', message: 'Browser read provider started', at: new Date().toISOString() });
    const child = spawn(this.found.executable, this.args, {
      cwd: request.cwd,
      env: providerEnvironment(this.envAllowlist, this.browserFound ? {
        AGENT_WORK_OS_BROWSER_EXECUTABLE: this.browserFound.executable,
        ...(process.env.AGENT_WORK_OS_BROWSER_READ_NAVIGATION_TIMEOUT_MS ? {
          AGENT_WORK_OS_BROWSER_READ_NAVIGATION_TIMEOUT_MS: process.env.AGENT_WORK_OS_BROWSER_READ_NAVIGATION_TIMEOUT_MS,
        } : {}),
      } : {}),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.children.set(request.sessionId, child);

    let stdout = '';
    let stderr = '';
    let streamError = null;
    let timer;
    const collect = (stream, label, limit) => (chunk) => {
      if (streamError) return;
      try {
        if (stream === 'stdout') stdout = boundedAppend(stdout, chunk, limit, label);
        else stderr = boundedAppend(stderr, chunk, limit, label);
      } catch (error) {
        streamError = error;
        child.kill('SIGTERM');
      }
    };
    try {
      child.stdout.on('data', collect('stdout', 'browser-read stdout', MAX_STDOUT_BYTES));
      child.stderr.on('data', collect('stderr', 'browser-read stderr', MAX_STDERR_BYTES));
      child.stdin.end(JSON.stringify({
        contractVersion: PROVIDER_REQUEST_CONTRACT,
        sourceId: accessRequest.sourceId,
        requestedUrl: accessRequest.requestedUrl,
        requestId: accessRequest.requestId,
      }) + '\n');
      const exit = await new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error(`browser-read provider timed out after ${this.timeoutMs}ms`));
        }, this.timeoutMs);
        child.once('error', reject);
        child.once('close', (code, signal) => resolve({ code, signal }));
      });
      if (streamError) throw streamError;
      if (exit.code !== 0) throw new Error(`browser-read provider failed (${exit.code ?? exit.signal ?? 'unknown'}): ${stderr.trim().slice(0, 1000)}`);
      const providerResult = parseProviderResult(stdout);
      const observation = createSourceAccessObservation({
        request: accessRequest,
        provider: 'browser-read',
        canonicalUrl: providerResult.canonicalUrl,
        evidenceRef: providerResult.evidenceRef,
        observedAt: providerResult.observedAt ?? new Date().toISOString(),
      });
      emit({ kind: 'tool', name: 'source-access-observation', phase: 'completed', payload: observation, at: new Date().toISOString() });
      emit({ kind: 'status', status: 'completed', at: new Date().toISOString() });
      return { nativeSessionId: `browser-read-${request.sessionId}`, observation };
    } finally {
      if (timer) clearTimeout(timer);
      this.children.delete(request.sessionId);
    }
  }

  async interrupt(sessionId) {
    this.children.get(sessionId)?.kill('SIGTERM');
  }
}
