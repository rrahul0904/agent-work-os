import { spawn } from 'node:child_process';

import { createSourceAccessObservation, validateSourceAccessRequest } from '../../../packages/evidence/src/source-access-context.js';
import { findCommand } from './adapters.js';

const OBSERVATION_CONTRACT = 'source-access-observation/v1';
const PROVIDER_REQUEST_CONTRACT = 'browser-read-provider-request/v1';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_STDOUT_BYTES = 64 * 1024;
const MAX_STDERR_BYTES = 8 * 1024;

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

function providerEnvironment(allowlist = process.env.AGENT_WORK_OS_BROWSER_READ_ENV_ALLOWLIST ?? '') {
  const names = new Set(['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot']);
  for (const name of String(allowlist).split(',').map((value) => value.trim()).filter(Boolean)) names.add(name);
  const env = {};
  for (const name of names) if (process.env[name] !== undefined) env[name] = process.env[name];
  return env;
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

export class BrowserReadAdapter {
  name = 'browser-read';
  children = new Map();

  constructor({
    command = process.env.AGENT_WORK_OS_BROWSER_READ_COMMAND ?? '',
    args = parseArgs(process.env.AGENT_WORK_OS_BROWSER_READ_ARGS),
    found = null,
    timeoutMs = Number(process.env.AGENT_WORK_OS_BROWSER_READ_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    envAllowlist = process.env.AGENT_WORK_OS_BROWSER_READ_ENV_ALLOWLIST ?? '',
  } = {}) {
    this.command = command;
    this.args = [...args];
    this.found = found ?? (command ? findCommand(command) : null);
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
      env: providerEnvironment(this.envAllowlist),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.children.set(request.sessionId, child);

    let stdout = '';
    let stderr = '';
    let timer;
    try {
      child.stdout.on('data', (chunk) => { stdout = boundedAppend(stdout, chunk, MAX_STDOUT_BYTES, 'browser-read stdout'); });
      child.stderr.on('data', (chunk) => { stderr = boundedAppend(stderr, chunk, MAX_STDERR_BYTES, 'browser-read stderr'); });
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
