import { createHash } from 'node:crypto';
import { assertPlanAuthorized, createActionPlan } from './execution-safety.js';

export const INTEGRATION_RUNTIME_VERSION = 'integration-runtime/v1';

const KINDS = new Set(['lsp', 'browser', 'mcp', 'remote', 'github']);
const SECRET_KEY = /(token|secret|password|api[_-]?key|authorization|cookie)/i;

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${field} must be a non-empty string`);
  return value.trim();
}

function sortedUnique(values = [], field = 'values') {
  if (!Array.isArray(values)) throw new TypeError(`${field} must be an array`);
  return [...new Set(values.map((value) => nonEmptyString(value, field)))].sort();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sanitize(value, depth = 0) {
  if (depth > 4) return '[depth-limited]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > 240 ? `${value.slice(0, 239)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort().slice(0, 40)) {
      out[key] = SECRET_KEY.test(key) ? '[redacted]' : sanitize(value[key], depth + 1);
    }
    return out;
  }
  return String(value);
}

function originFromUrl(value) {
  try {
    return new URL(nonEmptyString(value, 'url')).origin;
  } catch {
    throw new Error('browser URL must be an absolute HTTP(S) URL');
  }
}

export function createIntegrationDescriptor({
  id,
  kind,
  capabilities,
  mutatingCapabilities = [],
  requiresNetwork = false,
  allowedOrigins = [],
}) {
  const normalizedKind = nonEmptyString(kind, 'kind');
  if (!KINDS.has(normalizedKind)) throw new Error(`unsupported integration kind: ${normalizedKind}`);
  const declared = sortedUnique(capabilities, 'capabilities');
  const mutating = sortedUnique(mutatingCapabilities, 'mutatingCapabilities');
  for (const capability of mutating) {
    if (!declared.includes(capability)) throw new Error(`mutating capability is not declared: ${capability}`);
  }
  const origins = sortedUnique(allowedOrigins, 'allowedOrigins').map((origin) => {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('allowedOrigins must use HTTP(S)');
    return parsed.origin;
  });
  return Object.freeze({
    version: INTEGRATION_RUNTIME_VERSION,
    id: nonEmptyString(id, 'id'),
    kind: normalizedKind,
    capabilities: declared,
    mutatingCapabilities: mutating,
    requiresNetwork: requiresNetwork === true,
    allowedOrigins: [...new Set(origins)].sort(),
  });
}

export function createIntegrationActionPlan({
  workspaceId,
  descriptor,
  capability,
  payload = {},
}) {
  if (!descriptor?.id || descriptor.version !== INTEGRATION_RUNTIME_VERSION) {
    throw new TypeError('valid integration descriptor is required');
  }
  const requestedCapability = nonEmptyString(capability, 'capability');
  if (!descriptor.capabilities.includes(requestedCapability)) {
    throw new Error('integration capability is not declared');
  }
  const payloadSha256 = sha256(stableJson(payload));
  const plan = createActionPlan({
    workspaceId,
    actions: [{
      id: `integration:${descriptor.id}:${requestedCapability}:${payloadSha256}`,
      capability: requestedCapability,
      kind: 'integration_call',
      target: `sha256:${payloadSha256}`,
      summary: `invoke ${descriptor.kind} integration ${descriptor.id}`,
    }],
  });
  return Object.freeze({ ...plan, integrationId: descriptor.id, payloadSha256 });
}

export class IntegrationRuntime {
  constructor({
    networkPolicy = 'disabled',
    allowedNetworkIntegrations = [],
  } = {}) {
    if (!['disabled', 'explicit'].includes(networkPolicy)) {
      throw new Error('networkPolicy must be disabled or explicit');
    }
    this.networkPolicy = networkPolicy;
    this.allowedNetworkIntegrations = new Set(sortedUnique(allowedNetworkIntegrations, 'allowedNetworkIntegrations'));
    this.adapters = new Map();
    this.states = new Map();
  }

  register(adapter) {
    if (!adapter || typeof adapter.descriptor !== 'function' || typeof adapter.invoke !== 'function') {
      throw new TypeError('adapter must expose descriptor() and invoke()');
    }
    const descriptor = adapter.descriptor();
    if (!descriptor?.id || descriptor.version !== INTEGRATION_RUNTIME_VERSION) {
      throw new Error('adapter returned an invalid descriptor');
    }
    if (this.adapters.has(descriptor.id)) throw new Error('integration is already registered');
    this.adapters.set(descriptor.id, { adapter, descriptor });
    this.states.set(descriptor.id, 'stopped');
    return descriptor;
  }

  async start(integrationId) {
    const entry = this.#entry(integrationId);
    if (entry.descriptor.requiresNetwork) {
      if (this.networkPolicy !== 'explicit' || !this.allowedNetworkIntegrations.has(entry.descriptor.id)) {
        throw new Error('networked integration is not explicitly allowed');
      }
    }
    if (this.states.get(entry.descriptor.id) === 'started') return this.status(entry.descriptor.id);
    if (typeof entry.adapter.start === 'function') await entry.adapter.start();
    this.states.set(entry.descriptor.id, 'started');
    return this.status(entry.descriptor.id);
  }

  async stop(integrationId) {
    const entry = this.#entry(integrationId);
    if (this.states.get(entry.descriptor.id) === 'stopped') return this.status(entry.descriptor.id);
    if (typeof entry.adapter.stop === 'function') await entry.adapter.stop();
    this.states.set(entry.descriptor.id, 'stopped');
    return this.status(entry.descriptor.id);
  }

  async health(integrationId) {
    const entry = this.#entry(integrationId);
    const state = this.states.get(entry.descriptor.id);
    const adapterHealth = typeof entry.adapter.health === 'function'
      ? await entry.adapter.health()
      : { ok: state === 'started' };
    return Object.freeze({
      version: INTEGRATION_RUNTIME_VERSION,
      integrationId: entry.descriptor.id,
      state,
      health: sanitize(adapterHealth),
    });
  }

  status(integrationId) {
    const entry = this.#entry(integrationId);
    return Object.freeze({
      version: INTEGRATION_RUNTIME_VERSION,
      integrationId: entry.descriptor.id,
      kind: entry.descriptor.kind,
      state: this.states.get(entry.descriptor.id),
      requiresNetwork: entry.descriptor.requiresNetwork,
    });
  }

  async invoke({
    integrationId,
    capability,
    payload = {},
    plan = null,
    authorization = null,
  }) {
    const entry = this.#entry(integrationId);
    if (this.states.get(entry.descriptor.id) !== 'started') throw new Error('integration is not started');
    const requestedCapability = nonEmptyString(capability, 'capability');
    if (!entry.descriptor.capabilities.includes(requestedCapability)) {
      throw new Error('integration capability is not declared');
    }

    if (entry.descriptor.kind === 'browser' && payload?.url != null) {
      const origin = originFromUrl(payload.url);
      if (!entry.descriptor.allowedOrigins.includes(origin)) {
        throw new Error(`browser origin is not allowed: ${origin}`);
      }
    }

    const payloadSha256 = sha256(stableJson(payload));
    const isMutating = entry.descriptor.mutatingCapabilities.includes(requestedCapability);
    if (isMutating) {
      if (!plan || !authorization) throw new Error('mutating integration call requires an authorized action plan');
      assertPlanAuthorized(plan, authorization);
      if (plan.integrationId !== entry.descriptor.id || plan.payloadSha256 !== payloadSha256) {
        throw new Error('integration authorization does not match exact payload');
      }
      const matching = plan.actions?.filter(
        (action) => action.kind === 'integration_call'
          && action.capability === requestedCapability
          && action.target === `sha256:${payloadSha256}`,
      ) ?? [];
      if (matching.length !== 1) throw new Error('integration action plan does not authorize this exact call');
    }

    const result = await entry.adapter.invoke({ capability: requestedCapability, payload });
    return Object.freeze({
      result,
      receipt: Object.freeze({
        version: INTEGRATION_RUNTIME_VERSION,
        integrationId: entry.descriptor.id,
        kind: entry.descriptor.kind,
        capability: requestedCapability,
        mutating: isMutating,
        payloadSha256,
        planId: isMutating ? plan.planId : null,
        authorizationId: isMutating ? authorization.authorizationId : null,
        inputPreview: sanitize(payload),
        resultPreview: sanitize(result),
      }),
    });
  }

  #entry(integrationId) {
    const id = nonEmptyString(integrationId, 'integrationId');
    const entry = this.adapters.get(id);
    if (!entry) throw new Error(`unknown integration: ${id}`);
    return entry;
  }
}
