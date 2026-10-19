// Independent client for Hermo's documented, local, scoped REST API.
// No Hermo implementation, website automation, or browser session data is bundled.
import { randomUUID } from 'node:crypto';

const END_STATES = new Set(['succeeded', 'failed', 'cancelled', 'canceled', 'timed_out']);
const ACTION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export class HermoClientError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'HermoClientError';
    this.code = code;
    this.details = details;
  }
}

export class HermoClient {
  constructor({ baseUrl = 'http://127.0.0.1:4317', apiKey, fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'http:' || !LOCAL_HOSTS.has(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
      throw new HermoClientError('INVALID_BASE_URL', 'Hermo must use a bare HTTP loopback origin.');
    }
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      throw new HermoClientError('MISSING_API_KEY', 'Supply a workflow-scoped HERMO_API_KEY.');
    }
    this.origin = parsed.origin;
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
  }

  safePath(location) {
    if (typeof location !== 'string' || !location) {
      throw new HermoClientError('INVALID_STATUS_URL', 'The run did not supply a status URL.');
    }
    let url;
    try { url = new URL(location, this.origin); }
    catch { throw new HermoClientError('INVALID_STATUS_URL', 'Run status URL could not be parsed.'); }
    if (url.origin !== this.origin || url.username || url.password || !url.pathname.startsWith('/v1/') || url.hash) {
      throw new HermoClientError('INVALID_STATUS_URL', 'Refusing a status URL outside Hermo local API.');
    }
    return url.toString();
  }

  async request(path, { method = 'GET', body, idempotencyKey } = {}) {
    const url = this.safePath(path);
    const headers = { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey !== undefined) headers['Idempotency-Key'] = idempotencyKey;
    let response;
    try {
      response = await this.fetchImpl(url, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual', signal: AbortSignal.timeout(15000)
      });
    } catch {
      throw new HermoClientError('TRANSPORT_ERROR', 'Hermo local runtime is unreachable; the submission outcome may be unknown. Do not generate a new idempotency key to retry.');
    }
    if (response.status >= 300 && response.status < 400) {
      throw new HermoClientError('REDIRECT_REJECTED', 'Hermo API redirects are not accepted.');
    }
    if (!response.ok) {
      throw new HermoClientError('HTTP_ERROR', `Hermo returned HTTP ${response.status}.`, { status: response.status });
    }
    try { return { status: response.status, data: await response.json() }; }
    catch { throw new HermoClientError('INVALID_RESPONSE', 'Hermo returned invalid JSON.'); }
  }

  async contract() {
    const { data } = await this.request('/v1/action-contract');
    return data;
  }

  async submit(actionId, input, { idempotencyKey = randomUUID() } = {}) {
    if (typeof actionId !== 'string' || !ACTION_ID.test(actionId)) {
      throw new HermoClientError('INVALID_ACTION', 'Action ID must use letters, numbers, dots, hyphens or underscores.');
    }
    if (input === null || Array.isArray(input) || typeof input !== 'object') {
      throw new HermoClientError('INVALID_INPUT', 'Input must be a JSON object.');
    }
    if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      throw new HermoClientError('INVALID_IDEMPOTENCY_KEY', 'Idempotency key must be 8–128 safe characters.');
    }
    const { status, data } = await this.request(`/v1/actions/${encodeURIComponent(actionId)}/versions/1/runs`, {
      method: 'POST', body: { input }, idempotencyKey
    });
    if (status !== 202 || !data || typeof data.run_id !== 'string') {
      throw new HermoClientError('INVALID_ADMISSION', 'Hermo did not return an accepted run receipt.');
    }
    const statusUrl = this.safePath(data.status_url);
    return { runId: data.run_id, statusUrl, idempotencyKey, reused: data.reused === true };
  }

  async status(statusUrl) {
    const { data } = await this.request(statusUrl);
    if (!data || typeof data.status !== 'string') {
      throw new HermoClientError('INVALID_RESPONSE', 'Hermo run status is missing.');
    }
    return data;
  }

  async waitForRun(receipt, { timeoutMs = 120000, pollMs = 1000, onStatus = () => {} } = {}) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || !Number.isInteger(pollMs) || pollMs < 1) {
      throw new HermoClientError('INVALID_TIMEOUT', 'Timeout and polling interval must be positive integers.');
    }
    const deadline = Date.now() + timeoutMs;
    let previousStatus;
    while (Date.now() < deadline) {
      const data = await this.status(receipt.statusUrl);
      if (data.status !== previousStatus) onStatus(data.status);
      previousStatus = data.status;
      if (END_STATES.has(data.status)) {
        if (data.status === 'succeeded') {
          if (!Object.hasOwn(data, 'result')) throw new HermoClientError('MISSING_RESULT', 'Hermo marked the run successful without a result.');
          return data.result;
        }
        throw new HermoClientError('RUN_NOT_SUCCEEDED', `Hermo finished with status ${data.status}; inspect the run in Hermo.`, { runId: receipt.runId, status: data.status });
      }
      if (!['queued', 'running', 'verifying'].includes(data.status)) {
        throw new HermoClientError('UNKNOWN_STATUS', 'Hermo returned an unrecognized status.');
      }
      await this.sleep(Math.min(pollMs, Math.max(1, deadline - Date.now())));
    }
    throw new HermoClientError('POLL_TIMEOUT', 'Polling timed out; the action may still be running. Inspect it before retrying.', { runId: receipt.runId });
  }
}
