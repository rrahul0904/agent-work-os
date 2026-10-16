import net from 'node:net';

import { sha256, stableJson } from './research-workspace.js';
import { isForbiddenNetworkAddress, validateFreshnessUrl } from './source-freshness.js';

export const SOURCE_IDENTITY_RESOLUTION_VERSION = 'source-identity-resolution/v1';
export const SOURCE_IDENTITY_PROFILES = Object.freeze(['reddit-share']);

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function receiptPayload(receipt) {
  const { receiptSha256: _receiptSha256, ...payload } = receipt;
  return payload;
}

async function assertPublicResolution(url, resolveHost) {
  const hostname = url.hostname;
  if (net.isIP(hostname)) {
    if (isForbiddenNetworkAddress(hostname)) {
      throw new Error('source identity hostname resolves to a forbidden network address');
    }
    return [hostname];
  }

  const resolved = await resolveHost(hostname);
  const records = Array.isArray(resolved) ? resolved : [resolved];
  const addresses = records
    .map((record) => (typeof record === 'string' ? record : record?.address))
    .filter(Boolean);

  if (!addresses.length) throw new Error('source identity hostname did not resolve');
  if (addresses.some(isForbiddenNetworkAddress)) {
    throw new Error('source identity hostname resolves to a forbidden network address');
  }
  return [...new Set(addresses)].sort();
}

function normalizedRedditHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === 'reddit.com' || host === 'www.reddit.com' ? host : null;
}

export function parseRedditShareUrl(value) {
  const url = validateFreshnessUrl(value);
  if (!normalizedRedditHost(url.hostname)) {
    throw new Error('reddit share URL must use reddit.com');
  }

  const match = url.pathname.match(/^\/r\/([^/]+)\/s\/([A-Za-z0-9_-]{6,64})\/?$/);
  if (!match) throw new Error('URL is not a supported Reddit share URL');

  url.search = '';
  url.hash = '';
  return Object.freeze({
    url,
    subreddit: decodeURIComponent(match[1]),
    shareToken: match[2],
  });
}

export function parseCanonicalRedditPostUrl(value) {
  const url = validateFreshnessUrl(value);
  if (!normalizedRedditHost(url.hostname)) return null;

  const scoped = url.pathname.match(/^\/r\/([^/]+)\/comments\/([A-Za-z0-9]+)(?:\/[^?#]*)?\/?$/);
  const global = url.pathname.match(/^\/comments\/([A-Za-z0-9]+)(?:\/[^?#]*)?\/?$/);
  if (!scoped && !global) return null;

  const subreddit = scoped ? decodeURIComponent(scoped[1]) : null;
  const postId = scoped ? scoped[2] : global[1];
  url.search = '';
  url.hash = '';

  return Object.freeze({
    kind: 'reddit-post',
    postId,
    subreddit,
    canonicalUrl: url.href,
  });
}

export function validateSourceIdentityResolutionReceipt(receipt) {
  if (!receipt || receipt.contractVersion !== SOURCE_IDENTITY_RESOLUTION_VERSION) return false;
  if (!SOURCE_IDENTITY_PROFILES.includes(receipt.profile)) return false;
  if (!['resolved', 'unresolved'].includes(receipt.state)) return false;
  if (!Array.isArray(receipt.redirects) || !Array.isArray(receipt.resolvedAddresses)) return false;
  if (typeof receipt.receiptSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(receipt.receiptSha256)) return false;
  try {
    requireString(receipt.sourceId, 'receipt.sourceId');
    requireString(receipt.requestedUrl, 'receipt.requestedUrl');
    requireString(receipt.resolvedAt, 'receipt.resolvedAt');
    if (receipt.finalUrl !== null) requireString(receipt.finalUrl, 'receipt.finalUrl');
    if (receipt.state === 'resolved') {
      requireString(receipt.target?.postId, 'receipt.target.postId');
      requireString(receipt.target?.canonicalUrl, 'receipt.target.canonicalUrl');
    }
  } catch {
    return false;
  }
  return receipt.receiptSha256 === sha256(stableJson(receiptPayload(receipt)));
}

export function createSourceIdentityResolver({
  resolveHost,
  fetchImpl = globalThis.fetch,
  maxRedirects = 5,
  timeoutMs = 10_000,
} = {}) {
  if (typeof resolveHost !== 'function') throw new TypeError('resolveHost must be supplied');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  if (!Number.isInteger(maxRedirects) || maxRedirects < 1 || maxRedirects > 10) {
    throw new TypeError('maxRedirects must be an integer between 1 and 10');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError('timeoutMs must be a positive integer');
  }

  return async function resolveSourceIdentity({
    sourceId,
    url,
    profile = 'reddit-share',
    resolvedAt = new Date().toISOString(),
  }) {
    sourceId = requireString(sourceId, 'sourceId');
    if (!SOURCE_IDENTITY_PROFILES.includes(profile)) throw new Error(`unsupported source identity profile: ${profile}`);
    const resolvedTimestamp = new Date(resolvedAt);
    if (Number.isNaN(resolvedTimestamp.getTime())) throw new TypeError('resolvedAt must be a valid timestamp');

    const parsedShare = parseRedditShareUrl(url);
    const requested = parsedShare.url;
    let current = requested;
    const redirects = [];
    const resolvedAddresses = [];

    const finish = ({ state, target = null, errorCode = null }) => {
      const payload = {
        contractVersion: SOURCE_IDENTITY_RESOLUTION_VERSION,
        profile,
        sourceId,
        requestedUrl: requested.href,
        finalUrl: target?.canonicalUrl || current?.href || null,
        resolvedAt: resolvedTimestamp.toISOString(),
        state,
        target,
        redirects,
        resolvedAddresses: [...new Set(resolvedAddresses)].sort(),
        errorCode,
      };
      return Object.freeze({ ...payload, receiptSha256: sha256(stableJson(payload)) });
    };

    try {
      for (let hop = 0; hop < maxRedirects; hop += 1) {
        const addresses = await assertPublicResolution(current, resolveHost);
        resolvedAddresses.push(...addresses);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
          response = await fetchImpl(current.href, {
            method: 'GET',
            redirect: 'manual',
            signal: controller.signal,
            headers: {
              accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
              'user-agent': 'Agent-Work-OS-Source-Identity/1.0',
            },
          });
        } finally {
          clearTimeout(timer);
        }

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) return finish({ state: 'unresolved', errorCode: 'REDIRECT_WITHOUT_LOCATION' });
          const next = validateFreshnessUrl(new URL(location, current).href);
          if (!normalizedRedditHost(next.hostname)) {
            throw new Error('reddit share redirect escaped the trusted Reddit host boundary');
          }
          redirects.push({ from: current.href, to: next.href, status: response.status });

          const target = parseCanonicalRedditPostUrl(next.href);
          if (target) return finish({ state: 'resolved', target });
          current = next;
          continue;
        }

        const target = parseCanonicalRedditPostUrl(current.href);
        if (response.ok && target) return finish({ state: 'resolved', target });
        if (!response.ok) return finish({ state: 'unresolved', errorCode: `HTTP_${response.status}` });
        return finish({ state: 'unresolved', errorCode: 'NON_CANONICAL_FINAL_URL' });
      }
      return finish({ state: 'unresolved', errorCode: 'REDIRECT_LIMIT_EXCEEDED' });
    } catch (error) {
      if (/forbidden network|hostname is not public|require HTTPS|credentials|default HTTPS port|escaped the trusted Reddit host boundary/i.test(error?.message || '')) {
        throw error;
      }
      return finish({
        state: 'unresolved',
        errorCode: error?.name === 'AbortError' ? 'TIMEOUT' : 'FETCH_FAILED',
      });
    }
  };
}
