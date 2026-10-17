import net from 'node:net';
import { sha256, stableJson } from './research-workspace.js';

export const SOURCE_FRESHNESS_VERSION = 'research-source-freshness/v1';
export const SOURCE_FRESHNESS_STATES = Object.freeze(['baseline', 'unchanged', 'changed', 'unreachable']);

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}

function requireSha(value, name, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) throw new TypeError(`${name} must be a SHA-256 digest`);
  return value.toLowerCase();
}

function parseIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  return parts;
}

export function isForbiddenNetworkAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const [a, b] = parseIpv4(address);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && (b === 0 || b === 168)) return true;
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return true;
    if (a === 203 && b === 0) return true;
    if (a >= 224) return true;
    return false;
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    if (normalized === '::' || normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (/^fe[89ab]/.test(normalized)) return true;
    if (normalized.startsWith('ff')) return true;
    if (normalized.startsWith('2001:db8')) return true;
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice('::ffff:'.length);
      return net.isIP(mapped) === 4 ? isForbiddenNetworkAddress(mapped) : true;
    }
    return false;
  }
  return true;
}

export function validateFreshnessUrl(value) {
  const raw = requireString(value, 'url');
  let url;
  try { url = new URL(raw); } catch { throw new TypeError('url must be an absolute URL'); }
  if (url.protocol !== 'https:') throw new Error('freshness checks require HTTPS');
  if (url.username || url.password) throw new Error('freshness URLs must not contain credentials');
  if (url.port && url.port !== '443') throw new Error('freshness URLs must use the default HTTPS port');
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('freshness URL hostname is not public');
  }
  if (net.isIP(hostname) && isForbiddenNetworkAddress(hostname)) throw new Error('freshness URL resolves to a forbidden network address');
  url.hash = '';
  return url;
}

async function assertPublicResolution(url, resolveHost) {
  const hostname = url.hostname;
  if (net.isIP(hostname)) return [hostname];
  const resolved = await resolveHost(hostname);
  const records = Array.isArray(resolved) ? resolved : [resolved];
  const addresses = records.map((record) => typeof record === 'string' ? record : record?.address).filter(Boolean);
  if (!addresses.length) throw new Error('freshness hostname did not resolve');
  if (addresses.some(isForbiddenNetworkAddress)) throw new Error('freshness hostname resolves to a forbidden network address');
  return addresses.sort();
}

function normalizeText(text) {
  return String(text).replace(/\r\n?/g, '\n').normalize('NFC');
}

function receiptPayload(receipt) {
  const { receiptSha256: _receiptSha256, ...payload } = receipt;
  return payload;
}

export function validateSourceFreshnessReceipt(receipt) {
  if (!receipt || receipt.contractVersion !== SOURCE_FRESHNESS_VERSION) return false;
  if (!SOURCE_FRESHNESS_STATES.includes(receipt.state)) return false;
  if (typeof receipt.receiptSha256 !== 'string' || receipt.receiptSha256.length !== 64) return false;
  try {
    requireString(receipt.sourceId, 'receipt.sourceId');
    requireString(receipt.requestedUrl, 'receipt.requestedUrl');
    requireString(receipt.checkedAt, 'receipt.checkedAt');
    if (receipt.finalUrl !== null) requireString(receipt.finalUrl, 'receipt.finalUrl');
    requireSha(receipt.previousContentSha256, 'receipt.previousContentSha256', { nullable: true });
    requireSha(receipt.currentContentSha256, 'receipt.currentContentSha256', { nullable: true });
    if (!Array.isArray(receipt.redirects) || !Array.isArray(receipt.resolvedAddresses)) return false;
  } catch {
    return false;
  }
  return receipt.receiptSha256 === sha256(stableJson(receiptPayload(receipt)));
}

export function createSourceFreshnessChecker({
  resolveHost,
  fetchImpl = globalThis.fetch,
  maxRedirects = 3,
  maxBytes = 2 * 1024 * 1024,
  timeoutMs = 10_000,
} = {}) {
  if (typeof resolveHost !== 'function') throw new TypeError('resolveHost must be supplied');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 10) throw new TypeError('maxRedirects must be an integer between 0 and 10');
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new TypeError('maxBytes must be a positive integer');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new TypeError('timeoutMs must be a positive integer');

  return async function checkSourceFreshness({ sourceId, url, previousContentSha256 = null, checkedAt = new Date().toISOString() }) {
    sourceId = requireString(sourceId, 'sourceId');
    const requested = validateFreshnessUrl(url);
    const previousHash = requireSha(previousContentSha256, 'previousContentSha256', { nullable: true });
    const checkedTimestamp = new Date(checkedAt);
    if (Number.isNaN(checkedTimestamp.getTime())) throw new TypeError('checkedAt must be a valid timestamp');

    let current = requested;
    const redirects = [];
    let resolvedAddresses = [];
    try {
      for (let hop = 0; hop <= maxRedirects; hop += 1) {
        resolvedAddresses = await assertPublicResolution(current, resolveHost);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
          response = await fetchImpl(current.href, {
            method: 'GET',
            redirect: 'manual',
            signal: controller.signal,
            headers: {
              accept: 'text/html, text/plain, application/json;q=0.9, */*;q=0.1',
              'user-agent': 'Agent-Work-OS-Research-Freshness/1.0',
            },
          });
        } finally {
          clearTimeout(timer);
        }

        if (response.status >= 300 && response.status < 400) {
          if (hop === maxRedirects) throw new Error('freshness redirect limit exceeded');
          const location = response.headers.get('location');
          if (!location) throw new Error('freshness redirect is missing Location');
          const next = validateFreshnessUrl(new URL(location, current).href);
          redirects.push({ from: current.href, to: next.href, status: response.status });
          current = next;
          continue;
        }
        if (!response.ok) throw new Error(`freshness HTTP status ${response.status}`);

        const contentLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error('freshness response exceeds byte limit');
        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (contentType && !contentType.startsWith('text/') && !contentType.includes('application/json')) {
          throw new Error('freshness response media type is not textual');
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > maxBytes) throw new Error('freshness response exceeds byte limit');
        const text = normalizeText(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
        const currentHash = sha256(text);
        const state = previousHash === null ? 'baseline' : previousHash === currentHash ? 'unchanged' : 'changed';
        const payload = {
          contractVersion: SOURCE_FRESHNESS_VERSION,
          sourceId,
          requestedUrl: requested.href,
          finalUrl: current.href,
          checkedAt: checkedTimestamp.toISOString(),
          state,
          previousContentSha256: previousHash,
          currentContentSha256: currentHash,
          httpStatus: response.status,
          contentType: contentType || null,
          byteLength: bytes.byteLength,
          redirects,
          resolvedAddresses,
          errorCode: null,
        };
        return Object.freeze({ ...payload, receiptSha256: sha256(stableJson(payload)) });
      }
      throw new Error('freshness redirect loop did not terminate');
    } catch (error) {
      if (/forbidden network|hostname is not public|require HTTPS|credentials|default HTTPS port/i.test(error?.message || '')) throw error;
      const payload = {
        contractVersion: SOURCE_FRESHNESS_VERSION,
        sourceId,
        requestedUrl: requested.href,
        finalUrl: current?.href ?? null,
        checkedAt: checkedTimestamp.toISOString(),
        state: 'unreachable',
        previousContentSha256: previousHash,
        currentContentSha256: null,
        httpStatus: null,
        contentType: null,
        byteLength: 0,
        redirects,
        resolvedAddresses,
        errorCode: error?.name === 'AbortError' ? 'TIMEOUT' : 'FETCH_FAILED',
      };
      return Object.freeze({ ...payload, receiptSha256: sha256(stableJson(payload)) });
    }
  };
}
