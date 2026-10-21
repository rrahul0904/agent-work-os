import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createVisualIntelligenceServer } from '../http-app.mjs';
import { DeterministicTestProvider, ProviderRegistry } from '../agent-runtime.mjs';

async function runServer(providerRegistry, fn) {
  const server = createVisualIntelligenceServer({ providerRegistry });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); }
  finally { server.close(); await once(server, 'close'); }
}

async function post(base, path, body) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('agent HTTP endpoint fails closed with no configured provider', async () => {
  await runServer(new ProviderRegistry(), async base => {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.deepEqual(health.configuredProviders, []);
    const response = await post(base, '/api/agents/run', {
      artifactType: 'technical-diagram', objective: 'Map the event flow', plan: 'community'
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'provider_unavailable');
  });
});

test('agent HTTP endpoint executes full specialist chain with receipts', async () => {
  const registry = new ProviderRegistry().register('deterministic', new DeterministicTestProvider());
  await runServer(registry, async base => {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.deepEqual(health.configuredProviders, ['deterministic']);
    const response = await post(base, '/api/agents/run', {
      input: {
        artifactType: 'architecture-diagram',
        objective: 'Design a secure multi-region RAG system',
        audience: 'enterprise architects',
        source: 'approved requirements',
        plan: 'community'
      },
      providers: ['deterministic']
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.status, 'complete');
    assert.equal(result.stageOutputs.length, result.runPlan.stages.length);
    assert.equal(result.receipts.length, result.runPlan.stages.length);
    assert.equal(result.receipts.every(receipt => receipt.provider === 'deterministic'), true);
    assert.match(result.executionDigest, /^sha256:/);
  });
});

test('enterprise agent HTTP endpoint returns approval_required for writer stage', async () => {
  const registry = new ProviderRegistry().register('deterministic', new DeterministicTestProvider());
  await runServer(registry, async base => {
    const response = await post(base, '/api/agents/run', {
      input: { artifactType: 'creative-ad', objective: 'Create a launch campaign ad', plan: 'enterprise' },
      providers: ['deterministic']
    });
    assert.equal(response.status, 202);
    const result = await response.json();
    assert.equal(result.status, 'approval_required');
    assert.equal(result.blockedStage, 'creative-renderer');
  });
});
