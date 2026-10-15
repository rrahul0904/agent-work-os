import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createVisualIntelligenceServer } from '../http-app.mjs';

async function withServer(fn) {
  const server = createVisualIntelligenceServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await fn(base);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function post(base, path, body) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('HTTP runtime serves health and Prompt Studio', async () => {
  await withServer(async base => {
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.equal(healthBody.ok, true);
    assert.equal(healthBody.capabilities.includes('native-pptx'), true);

    const prompt = await post(base, '/api/prompt', {
      artifactType: 'architecture-diagram',
      objective: 'Show a governed RAG platform',
      plan: 'community'
    });
    assert.equal(prompt.status, 200);
    const promptBody = await prompt.json();
    assert.equal(promptBody.promptSpec.artifactType, 'architecture-diagram');
    assert.equal(promptBody.runPlan.providerPolicy.selection, 'provider-neutral');
  });
});

test('HTTP runtime serves Diagram Studio', async () => {
  await withServer(async base => {
    const response = await post(base, '/api/diagram', {
      kind: 'rag',
      title: 'RAG Runtime',
      nodes: [
        { id: 'user', type: 'actor', label: 'User', evidence: 'requirements' },
        { id: 'idp', type: 'identity', label: 'IdP', evidence: 'security' },
        { id: 'svc', type: 'service', label: 'RAG Service', evidence: 'repo' },
        { id: 'kb', type: 'dataset', label: 'Knowledge', boundary: 'data', evidence: 'model' },
        { id: 'llm', type: 'model', label: 'LLM', evidence: 'provider' }
      ],
      edges: [
        { from: 'user', to: 'idp', label: 'auth', evidence: 'security' },
        { from: 'idp', to: 'svc', label: 'token', evidence: 'security' },
        { from: 'svc', to: 'kb', label: 'retrieve', evidence: 'model' },
        { from: 'svc', to: 'llm', label: 'generate', evidence: 'provider' }
      ]
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.match(body.svg, /<svg/);
    assert.match(body.exports.mermaid, /flowchart LR/);
    assert.match(body.exports.plantuml, /@startuml/);
    assert.match(body.exports.drawio, /<mxfile/);
  });
});

test('HTTP runtime serves native editable PPTX', async () => {
  await withServer(async base => {
    const deck = {
      title: 'Runtime Deck',
      slides: [
        { title: 'Runtime Deck', subtitle: 'Native editable PowerPoint', layout: 'title' },
        { title: 'Proof', bullets: ['Native text boxes', 'Owned OOXML compiler'] }
      ]
    };
    const receiptResponse = await post(base, '/api/presentation?mode=receipt', deck);
    assert.equal(receiptResponse.status, 200);
    const receiptBody = await receiptResponse.json();
    assert.equal(receiptBody.receipt.editable, true);

    const pptxResponse = await post(base, '/api/presentation', deck);
    assert.equal(pptxResponse.status, 200);
    assert.equal(pptxResponse.headers.get('x-visual-intelligence-editable'), 'true');
    const bytes = new Uint8Array(await pptxResponse.arrayBuffer());
    assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK');
  });
});

test('HTTP runtime serves layered creative SVG', async () => {
  await withServer(async base => {
    const response = await post(base, '/api/creative', {
      format: 'landscape',
      headline: 'Architecture that stays editable',
      body: 'Governed agents produce semantic assets.',
      cta: 'Build now'
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.receipt.editable, true);
    assert.match(body.svg, /id="headline"/);
  });
});
