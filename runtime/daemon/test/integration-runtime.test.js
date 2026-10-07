import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeActionPlan } from '../src/execution-safety.js';
import {
  createIntegrationActionPlan,
  createIntegrationDescriptor,
  IntegrationRuntime,
} from '../src/integration-runtime.js';

function fakeAdapter(descriptor, impl = null) {
  let started = false;
  return {
    descriptor: () => descriptor,
    start: async () => { started = true; },
    stop: async () => { started = false; },
    health: async () => ({ ok: started, apiToken: 'must-not-leak' }),
    invoke: async ({ capability, payload }) => (
      impl ? impl({ capability, payload }) : { capability, echo: payload, secret: 'result-secret' }
    ),
  };
}

test('descriptor validates kinds and mutating capability membership', () => {
  assert.throws(
    () => createIntegrationDescriptor({
      id: 'x',
      kind: 'unknown',
      capabilities: ['read'],
    }),
    /unsupported integration kind/,
  );
  assert.throws(
    () => createIntegrationDescriptor({
      id: 'x',
      kind: 'mcp',
      capabilities: ['mcp.read'],
      mutatingCapabilities: ['mcp.mutate'],
    }),
    /not declared/,
  );
});

test('networked integrations are disabled unless explicitly allowed', async () => {
  const descriptor = createIntegrationDescriptor({
    id: 'github-main',
    kind: 'github',
    capabilities: ['github.read'],
    requiresNetwork: true,
  });
  const disabled = new IntegrationRuntime();
  disabled.register(fakeAdapter(descriptor));
  await assert.rejects(
    () => disabled.start('github-main'),
    /not explicitly allowed/,
  );

  const enabled = new IntegrationRuntime({
    networkPolicy: 'explicit',
    allowedNetworkIntegrations: ['github-main'],
  });
  enabled.register(fakeAdapter(descriptor));
  const status = await enabled.start('github-main');
  assert.equal(status.state, 'started');
});

test('read-only invocation returns a sanitized receipt without requiring mutation approval', async () => {
  const descriptor = createIntegrationDescriptor({
    id: 'mcp-read',
    kind: 'mcp',
    capabilities: ['mcp.read'],
  });
  const runtime = new IntegrationRuntime();
  runtime.register(fakeAdapter(descriptor));
  await runtime.start('mcp-read');

  const response = await runtime.invoke({
    integrationId: 'mcp-read',
    capability: 'mcp.read',
    payload: {
      query: 'status',
      apiToken: 'input-secret',
      nested: { password: 'hidden' },
    },
  });
  assert.equal(response.result.echo.apiToken, 'input-secret');
  assert.equal(response.receipt.mutating, false);
  assert.equal(response.receipt.inputPreview.apiToken, '[redacted]');
  assert.equal(response.receipt.inputPreview.nested.password, '[redacted]');
  assert.equal(response.receipt.resultPreview.secret, '[redacted]');
  assert.equal(response.receipt.planId, null);
});

test('mutating integration invocation requires exact payload-bound authorization', async () => {
  const descriptor = createIntegrationDescriptor({
    id: 'mcp-write',
    kind: 'mcp',
    capabilities: ['mcp.read', 'mcp.mutate'],
    mutatingCapabilities: ['mcp.mutate'],
  });
  const runtime = new IntegrationRuntime();
  runtime.register(fakeAdapter(descriptor));
  await runtime.start('mcp-write');

  const payload = { operation: 'update', resource: 'x' };
  const plan = createIntegrationActionPlan({
    workspaceId: 'workspace-1',
    descriptor,
    capability: 'mcp.mutate',
    payload,
  });
  const authorization = authorizeActionPlan({
    plan,
    approvedBy: 'operator-1',
    approvedCapabilities: ['mcp.mutate'],
    confirmPlanId: plan.planId,
  });

  await assert.rejects(
    () => runtime.invoke({
      integrationId: 'mcp-write',
      capability: 'mcp.mutate',
      payload: { operation: 'update', resource: 'different' },
      plan,
      authorization,
    }),
    /exact payload/,
  );

  const response = await runtime.invoke({
    integrationId: 'mcp-write',
    capability: 'mcp.mutate',
    payload,
    plan,
    authorization,
  });
  assert.equal(response.receipt.mutating, true);
  assert.equal(response.receipt.planId, plan.planId);
  assert.equal(response.receipt.authorizationId, authorization.authorizationId);
});

test('browser invocations enforce an explicit origin allowlist', async () => {
  const descriptor = createIntegrationDescriptor({
    id: 'browser-1',
    kind: 'browser',
    capabilities: ['browser.read'],
    requiresNetwork: true,
    allowedOrigins: ['https://example.com'],
  });
  const runtime = new IntegrationRuntime({
    networkPolicy: 'explicit',
    allowedNetworkIntegrations: ['browser-1'],
  });
  runtime.register(fakeAdapter(descriptor));
  await runtime.start('browser-1');

  await assert.rejects(
    () => runtime.invoke({
      integrationId: 'browser-1',
      capability: 'browser.read',
      payload: { url: 'https://evil.example/page' },
    }),
    /origin is not allowed/,
  );
  const response = await runtime.invoke({
    integrationId: 'browser-1',
    capability: 'browser.read',
    payload: { url: 'https://example.com/page' },
  });
  assert.equal(response.receipt.kind, 'browser');
});

test('stopped integrations cannot be invoked and health receipts redact secrets', async () => {
  const descriptor = createIntegrationDescriptor({
    id: 'remote-1',
    kind: 'remote',
    capabilities: ['remote.read'],
  });
  const runtime = new IntegrationRuntime();
  runtime.register(fakeAdapter(descriptor));
  await assert.rejects(
    () => runtime.invoke({
      integrationId: 'remote-1',
      capability: 'remote.read',
      payload: {},
    }),
    /not started/,
  );
  await runtime.start('remote-1');
  const health = await runtime.health('remote-1');
  assert.equal(health.health.apiToken, '[redacted]');
  await runtime.stop('remote-1');
  assert.equal(runtime.status('remote-1').state, 'stopped');
});

test('duplicate integration registration is rejected', () => {
  const descriptor = createIntegrationDescriptor({
    id: 'lsp-1',
    kind: 'lsp',
    capabilities: ['lsp.read'],
  });
  const runtime = new IntegrationRuntime();
  runtime.register(fakeAdapter(descriptor));
  assert.throws(
    () => runtime.register(fakeAdapter(descriptor)),
    /already registered/,
  );
});
