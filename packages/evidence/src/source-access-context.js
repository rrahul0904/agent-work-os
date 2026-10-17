import { sha256, stableJson } from './research-workspace.js';
import {
  parseCanonicalRedditPostUrl,
  validateSourceIdentityResolutionReceipt,
} from './source-resolution.js';

export const SOURCE_ACCESS_REQUEST_VERSION = 'source-access-request/v1';
export const SOURCE_ACCESS_OBSERVATION_VERSION = 'source-access-observation/v1';
export const SOURCE_ACCESS_PROVIDERS = Object.freeze([
  'reddit-authenticated-read',
  'browser-read',
]);

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function receiptPayload(receipt, digestField) {
  const { [digestField]: _digest, ...payload } = receipt;
  return payload;
}

function validateDigest(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

export function createSourceAccessRequest({
  blockedResolution,
  requestedAt = new Date().toISOString(),
}) {
  if (!validateSourceIdentityResolutionReceipt(blockedResolution)) {
    throw new TypeError('blockedResolution must be an intact source identity receipt');
  }
  if (blockedResolution.state !== 'unresolved' || blockedResolution.errorCode !== 'ACCESS_CONTEXT_REQUIRED') {
    throw new Error('source access requests require an ACCESS_CONTEXT_REQUIRED blocker');
  }
  const requiredCapability = requireString(blockedResolution.requiredCapability, 'blockedResolution.requiredCapability');
  const requestedTimestamp = new Date(requestedAt);
  if (Number.isNaN(requestedTimestamp.getTime())) throw new TypeError('requestedAt must be a valid timestamp');

  const requestSeed = {
    sourceId: blockedResolution.sourceId,
    requestedUrl: blockedResolution.requestedUrl,
    blockedReceiptSha256: blockedResolution.receiptSha256,
    requiredCapability,
  };
  const payload = {
    contractVersion: SOURCE_ACCESS_REQUEST_VERSION,
    requestId: `source-access-${sha256(stableJson(requestSeed)).slice(0, 24)}`,
    sourceId: blockedResolution.sourceId,
    requestedUrl: blockedResolution.requestedUrl,
    blocker: Object.freeze({
      receiptSha256: blockedResolution.receiptSha256,
      errorCode: blockedResolution.errorCode,
    }),
    requiredCapability,
    requestedAt: requestedTimestamp.toISOString(),
    status: 'pending',
  };
  return Object.freeze({ ...payload, requestSha256: sha256(stableJson(payload)) });
}

export function validateSourceAccessRequest(request) {
  if (!request || request.contractVersion !== SOURCE_ACCESS_REQUEST_VERSION) return false;
  if (!validateDigest(request.requestSha256) || !validateDigest(request.blocker?.receiptSha256)) return false;
  if (request.status !== 'pending') return false;
  try {
    requireString(request.requestId, 'request.requestId');
    requireString(request.sourceId, 'request.sourceId');
    requireString(request.requestedUrl, 'request.requestedUrl');
    requireString(request.requiredCapability, 'request.requiredCapability');
    requireString(request.requestedAt, 'request.requestedAt');
  } catch {
    return false;
  }
  return request.requestSha256 === sha256(stableJson(receiptPayload(request, 'requestSha256')));
}

export function createSourceAccessObservation({
  request,
  provider,
  canonicalUrl,
  observedAt = new Date().toISOString(),
  evidenceRef,
}) {
  if (!validateSourceAccessRequest(request)) throw new TypeError('request must be an intact source access request');
  provider = requireString(provider, 'provider');
  if (!SOURCE_ACCESS_PROVIDERS.includes(provider)) {
    throw new Error(`unsupported source access provider: ${provider}`);
  }
  const observedTimestamp = new Date(observedAt);
  if (Number.isNaN(observedTimestamp.getTime())) throw new TypeError('observedAt must be a valid timestamp');
  evidenceRef = requireString(evidenceRef, 'evidenceRef');

  const target = parseCanonicalRedditPostUrl(canonicalUrl);
  if (!target) throw new Error('access observation must contain a canonical Reddit post URL');

  const payload = {
    contractVersion: SOURCE_ACCESS_OBSERVATION_VERSION,
    requestId: request.requestId,
    requestSha256: request.requestSha256,
    blockerReceiptSha256: request.blocker.receiptSha256,
    sourceId: request.sourceId,
    requestedUrl: request.requestedUrl,
    provider,
    providerCapability: provider,
    observedAt: observedTimestamp.toISOString(),
    evidenceRef,
    target,
    status: 'observed',
  };
  return Object.freeze({ ...payload, observationSha256: sha256(stableJson(payload)) });
}

export function validateSourceAccessObservation(observation, { request = null } = {}) {
  if (!observation || observation.contractVersion !== SOURCE_ACCESS_OBSERVATION_VERSION) return false;
  if (!validateDigest(observation.observationSha256) || !validateDigest(observation.requestSha256) || !validateDigest(observation.blockerReceiptSha256)) return false;
  if (!SOURCE_ACCESS_PROVIDERS.includes(observation.provider) || observation.status !== 'observed') return false;
  try {
    requireString(observation.requestId, 'observation.requestId');
    requireString(observation.sourceId, 'observation.sourceId');
    requireString(observation.requestedUrl, 'observation.requestedUrl');
    requireString(observation.observedAt, 'observation.observedAt');
    requireString(observation.evidenceRef, 'observation.evidenceRef');
    if (!parseCanonicalRedditPostUrl(observation.target?.canonicalUrl)) return false;
  } catch {
    return false;
  }
  if (observation.observationSha256 !== sha256(stableJson(receiptPayload(observation, 'observationSha256')))) return false;
  if (request !== null) {
    if (!validateSourceAccessRequest(request)) return false;
    if (observation.requestId !== request.requestId) return false;
    if (observation.requestSha256 !== request.requestSha256) return false;
    if (observation.blockerReceiptSha256 !== request.blocker.receiptSha256) return false;
    if (observation.sourceId !== request.sourceId || observation.requestedUrl !== request.requestedUrl) return false;
  }
  return true;
}
