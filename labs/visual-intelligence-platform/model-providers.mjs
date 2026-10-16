const asText = value => typeof value === 'string' ? value : JSON.stringify(value);

function parseJsonMaybe(text) {
  if (typeof text !== 'string') return text;
  const trimmed = text.trim();
  if (!trimmed) return {};
  try { return JSON.parse(trimmed); } catch { return { text: trimmed }; }
}

function stageInput(request) {
  return JSON.stringify({
    stage: request.stage,
    instruction: request.prompt?.instruction,
    artifactType: request.promptSpec?.artifactType,
    objective: request.promptSpec?.objective,
    audience: request.promptSpec?.audience,
    constraints: request.promptSpec?.constraints,
    brand: request.promptSpec?.brand,
    editability: request.promptSpec?.editability,
    exports: request.promptSpec?.exports,
    evidencePolicy: request.prompt?.evidencePolicy,
    priorOutputs: request.prompt?.priorOutputs ?? []
  });
}

async function jsonFetch(fetchImpl, url, init) {
  const response = await fetchImpl(url, init);
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) {
    const error = new Error(`provider_http_${response.status}`);
    error.code = `provider_http_${response.status}`;
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

export class OpenAIResponsesProvider {
  constructor({ apiKey, model, baseUrl = 'https://api.openai.com/v1', fetchImpl = globalThis.fetch, name = 'openai' } = {}) {
    if (!apiKey) throw new Error('openai_api_key_required');
    if (!model) throw new Error('openai_model_required');
    if (typeof fetchImpl !== 'function') throw new Error('fetch_required');
    this.apiKey = apiKey; this.model = model; this.baseUrl = baseUrl.replace(/\/$/, ''); this.fetchImpl = fetchImpl; this.name = name;
  }
  async generate(request) {
    const body = await jsonFetch(this.fetchImpl, `${this.baseUrl}/responses`, {
      method: 'POST',
      headers: { 'authorization': `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        instructions: 'Return valid JSON only. Preserve evidence references, assumptions, findings, semantic IDs, and editability constraints.',
        input: stageInput(request),
        store: false,
        text: { format: { type: 'json_object' } }
      })
    });
    const text = body.output_text ?? body.output?.flatMap(item => item.content ?? []).find(part => part.type === 'output_text')?.text ?? '';
    return {
      provider: this.name,
      model: body.model ?? this.model,
      content: parseJsonMaybe(text),
      usage: body.usage ? { inputTokens: body.usage.input_tokens ?? 0, outputTokens: body.usage.output_tokens ?? 0 } : null,
      requestId: body.id ?? null
    };
  }
}

export class AnthropicMessagesProvider {
  constructor({ apiKey, model, baseUrl = 'https://api.anthropic.com', maxTokens = 4096, fetchImpl = globalThis.fetch, name = 'anthropic' } = {}) {
    if (!apiKey) throw new Error('anthropic_api_key_required');
    if (!model) throw new Error('anthropic_model_required');
    if (typeof fetchImpl !== 'function') throw new Error('fetch_required');
    this.apiKey = apiKey; this.model = model; this.baseUrl = baseUrl.replace(/\/$/, ''); this.maxTokens = maxTokens; this.fetchImpl = fetchImpl; this.name = name;
  }
  async generate(request) {
    const body = await jsonFetch(this.fetchImpl, `${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        system: 'Return JSON only. Preserve evidence references, assumptions, findings, semantic IDs, and editability constraints.',
        messages: [{ role: 'user', content: stageInput(request) }]
      })
    });
    const text = (body.content ?? []).filter(part => part.type === 'text').map(part => part.text).join('\n');
    return {
      provider: this.name,
      model: body.model ?? this.model,
      content: parseJsonMaybe(text),
      usage: body.usage ? { inputTokens: body.usage.input_tokens ?? 0, outputTokens: body.usage.output_tokens ?? 0 } : null,
      requestId: body.id ?? null
    };
  }
}

export class GeminiGenerateContentProvider {
  constructor({ apiKey, model, baseUrl = 'https://generativelanguage.googleapis.com/v1beta', fetchImpl = globalThis.fetch, name = 'gemini' } = {}) {
    if (!apiKey) throw new Error('gemini_api_key_required');
    if (!model) throw new Error('gemini_model_required');
    if (typeof fetchImpl !== 'function') throw new Error('fetch_required');
    this.apiKey = apiKey; this.model = model.replace(/^models\//, ''); this.baseUrl = baseUrl.replace(/\/$/, ''); this.fetchImpl = fetchImpl; this.name = name;
  }
  async generate(request) {
    const body = await jsonFetch(this.fetchImpl, `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': this.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: 'Return valid JSON only. Preserve evidence references, assumptions, findings, semantic IDs, and editability constraints.' }] },
        contents: [{ role: 'user', parts: [{ text: stageInput(request) }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });
    const text = (body.candidates?.[0]?.content?.parts ?? []).map(part => part.text ?? '').join('');
    return {
      provider: this.name,
      model: body.modelVersion ?? this.model,
      content: parseJsonMaybe(text),
      usage: body.usageMetadata ? { inputTokens: body.usageMetadata.promptTokenCount ?? 0, outputTokens: body.usageMetadata.candidatesTokenCount ?? 0 } : null,
      requestId: body.responseId ?? null
    };
  }
}

export function createProviderRegistryFromEnv(registry, env = process.env, options = {}) {
  if (!registry || typeof registry.register !== 'function') throw new Error('provider_registry_required');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (env.OPENAI_API_KEY && env.VISUAL_OPENAI_MODEL) registry.register('openai', new OpenAIResponsesProvider({ apiKey: env.OPENAI_API_KEY, model: env.VISUAL_OPENAI_MODEL, baseUrl: env.OPENAI_BASE_URL ?? undefined, fetchImpl }));
  if (env.ANTHROPIC_API_KEY && env.VISUAL_ANTHROPIC_MODEL) registry.register('anthropic', new AnthropicMessagesProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.VISUAL_ANTHROPIC_MODEL, baseUrl: env.ANTHROPIC_BASE_URL ?? undefined, fetchImpl }));
  if (env.GEMINI_API_KEY && env.VISUAL_GEMINI_MODEL) registry.register('gemini', new GeminiGenerateContentProvider({ apiKey: env.GEMINI_API_KEY, model: env.VISUAL_GEMINI_MODEL, baseUrl: env.GEMINI_BASE_URL ?? undefined, fetchImpl }));
  return registry;
}

export const providerRequestFormat = Object.freeze({
  openai: { endpoint: '/v1/responses', api: 'Responses API' },
  anthropic: { endpoint: '/v1/messages', api: 'Messages API', version: '2023-06-01' },
  gemini: { endpoint: '/v1beta/models/{model}:generateContent', api: 'generateContent' }
});
