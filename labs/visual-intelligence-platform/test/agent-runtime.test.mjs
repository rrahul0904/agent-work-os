import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentRuntimeError, DeterministicTestProvider, ProviderRegistry, executeAgentRun } from '../agent-runtime.mjs';
import { AnthropicMessagesProvider, GeminiGenerateContentProvider, OpenAIResponsesProvider, createProviderRegistryFromEnv } from '../model-providers.mjs';

class FailingProvider {
  async generate() { throw Object.assign(new Error('synthetic-provider-failure'), { code: 'synthetic-provider-failure' }); }
}

function fakeFetch(body, status = 200, capture = null) {
  return async (url, init) => {
    capture?.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
}

test('agent runtime executes full specialist chain with receipts', async () => {
  const registry = new ProviderRegistry().register('deterministic', new DeterministicTestProvider());
  const result = await executeAgentRun({
    artifactType: 'architecture-diagram',
    objective: 'Design a secure event-driven platform',
    audience: 'enterprise architects',
    plan: 'community'
  }, { registry });
  assert.equal(result.status, 'complete');
  assert.equal(result.stageOutputs.length, result.runPlan.stages.length);
  assert.equal(result.receipts.length, result.runPlan.stages.length);
  assert.match(result.executionDigest, /^sha256:/);
  assert.equal(result.receipts.every(receipt => receipt.inputDigest.startsWith('sha256:') && receipt.outputDigest.startsWith('sha256:')), true);
});

test('agent runtime falls back when preferred provider fails', async () => {
  const registry = new ProviderRegistry()
    .register('primary', new FailingProvider())
    .register('fallback', new DeterministicTestProvider({ name: 'fallback' }));
  const result = await executeAgentRun({ artifactType: 'technical-diagram', objective: 'Map system events', plan: 'community' }, {
    registry,
    providerPolicy: { providers: ['primary', 'fallback'], allowFallback: true }
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.receipts[0].provider, 'fallback');
  assert.equal(result.receipts[0].fallbackAttempts[0].provider, 'primary');
});

test('enterprise writer stage pauses until approval', async () => {
  const registry = new ProviderRegistry().register('deterministic', new DeterministicTestProvider());
  const blocked = await executeAgentRun({ artifactType: 'creative-ad', objective: 'Create a launch ad', plan: 'enterprise' }, { registry });
  assert.equal(blocked.status, 'approval_required');
  assert.equal(blocked.blockedStage, 'creative-renderer');
  const approved = await executeAgentRun({ artifactType: 'creative-ad', objective: 'Create a launch ad', plan: 'enterprise' }, {
    registry,
    approvedStages: ['creative-renderer']
  });
  assert.equal(approved.status, 'complete');
});

test('agent runtime fails closed when no provider exists', async () => {
  await assert.rejects(
    executeAgentRun({ artifactType: 'technical-diagram', objective: 'Map services', plan: 'community' }, { registry: new ProviderRegistry() }),
    error => error instanceof AgentRuntimeError && error.code === 'provider_unavailable'
  );
});

test('OpenAI Responses adapter uses Responses API JSON mode', async () => {
  const capture = [];
  const provider = new OpenAIResponsesProvider({
    apiKey: 'test', model: 'test-model', fetchImpl: fakeFetch({ id: 'resp_1', model: 'test-model', output_text: '{"summary":"ok"}', usage: { input_tokens: 12, output_tokens: 4 } }, 200, capture)
  });
  const result = await provider.generate({ stage: 'intent-router', promptSpec: { artifactType: 'technical-diagram', objective: 'x' }, prompt: {} });
  assert.equal(capture[0].url, 'https://api.openai.com/v1/responses');
  const sent = JSON.parse(capture[0].init.body);
  assert.equal(sent.text.format.type, 'json_object');
  assert.equal(sent.store, false);
  assert.equal(result.content.summary, 'ok');
  assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 4 });
});

test('Anthropic Messages adapter uses messages endpoint and JSON prompt', async () => {
  const capture = [];
  const provider = new AnthropicMessagesProvider({
    apiKey: 'test', model: 'claude-test', fetchImpl: fakeFetch({ id: 'msg_1', model: 'claude-test', content: [{ type: 'text', text: '{"summary":"ok"}' }], usage: { input_tokens: 10, output_tokens: 5 } }, 200, capture)
  });
  const result = await provider.generate({ stage: 'architecture-critic', promptSpec: { artifactType: 'architecture-diagram', objective: 'x' }, prompt: {} });
  assert.equal(capture[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(capture[0].init.headers['anthropic-version'], '2023-06-01');
  assert.equal(result.content.summary, 'ok');
});

test('Gemini adapter uses generateContent JSON response mode', async () => {
  const capture = [];
  const provider = new GeminiGenerateContentProvider({
    apiKey: 'test', model: 'gemini-test', fetchImpl: fakeFetch({ responseId: 'g1', modelVersion: 'gemini-test-v1', candidates: [{ content: { parts: [{ text: '{"summary":"ok"}' }] } }], usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 3 } }, 200, capture)
  });
  const result = await provider.generate({ stage: 'layout-designer', promptSpec: { artifactType: 'creative-ad', objective: 'x' }, prompt: {} });
  assert.match(capture[0].url, /models\/gemini-test:generateContent$/);
  const sent = JSON.parse(capture[0].init.body);
  assert.equal(sent.generationConfig.responseMimeType, 'application/json');
  assert.equal(result.content.summary, 'ok');
});

test('environment provider registry only activates explicitly configured providers', () => {
  const registry = createProviderRegistryFromEnv(new ProviderRegistry(), {
    OPENAI_API_KEY: 'openai-key', VISUAL_OPENAI_MODEL: 'openai-model',
    GEMINI_API_KEY: 'gemini-key', VISUAL_GEMINI_MODEL: 'gemini-model'
  }, { fetchImpl: async () => { throw new Error('not-called'); } });
  assert.deepEqual(registry.names(), ['openai', 'gemini']);
});
