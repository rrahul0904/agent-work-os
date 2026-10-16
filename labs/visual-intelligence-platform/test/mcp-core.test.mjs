import test from 'node:test';
import assert from 'node:assert/strict';
import { MCP_PROTOCOL_VERSION, MCP_TOOLS, handleMcpRequest } from '../mcp-core.mjs';
import { createVisualIntelligenceServer } from '../http-app.mjs';
import { once } from 'node:events';

const meta = {
  'io.modelcontextprotocol/protocolVersion': MCP_PROTOCOL_VERSION,
  'io.modelcontextprotocol/clientInfo': { name: 'visual-intelligence-test', version: '1.0.0' },
  'io.modelcontextprotocol/clientCapabilities': {}
};

function headers(method, name) {
  return {
    'mcp-protocol-version': MCP_PROTOCOL_VERSION,
    'mcp-method': method,
    ...(name ? { 'mcp-name': name } : {})
  };
}

test('MCP server discovery advertises modern protocol and tools', async () => {
  const result = await handleMcpRequest({
    jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: meta }
  }, headers('server/discover'));
  assert.equal(result.result.resultType, 'complete');
  assert.deepEqual(result.result.supportedVersions, [MCP_PROTOCOL_VERSION]);
  assert.equal(result.result.capabilities.tools.listChanged, false);
  assert.equal(result.result._meta['io.modelcontextprotocol/serverInfo'].name, 'visual-intelligence-platform');
});

test('MCP tools/list exposes the visual creation surface', async () => {
  const result = await handleMcpRequest({
    jsonrpc: '2.0', id: 2, method: 'tools/list', params: { _meta: meta }
  }, headers('tools/list'));
  const names = result.result.tools.map(tool => tool.name);
  assert.equal(names.length, MCP_TOOLS.length);
  assert.equal(names.includes('visual_prompt_compile'), true);
  assert.equal(names.includes('visual_diagram_generate'), true);
  assert.equal(names.includes('visual_presentation_generate'), true);
  assert.equal(names.includes('visual_creative_generate'), true);
  assert.equal(names.includes('visualbench_score'), true);
});

test('MCP tools/call generates structured creative output', async () => {
  const name = 'visual_creative_generate';
  const result = await handleMcpRequest({
    jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
      name,
      arguments: { format: 'square', headline: 'Build visual systems with agents', body: 'Editable by design', cta: 'Create' },
      _meta: meta
    }
  }, headers('tools/call', name));
  assert.equal(result.result.isError, false);
  assert.equal(result.result.structuredContent.receipt.editable, true);
  assert.match(result.result.structuredContent.svg, /id="headline"/);
});

test('MCP rejects mismatched standard headers', async () => {
  const result = await handleMcpRequest({
    jsonrpc: '2.0', id: 4, method: 'tools/list', params: { _meta: meta }
  }, { 'mcp-protocol-version': MCP_PROTOCOL_VERSION, 'mcp-method': 'tools/call' });
  assert.equal(result.error.code, -32020);
});

test('HTTP /mcp serves discovery and tool calls', async () => {
  const server = createVisualIntelligenceServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  try {
    const request = {
      jsonrpc: '2.0', id: 'tools', method: 'tools/list', params: { _meta: meta }
    };
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
        'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
        'Mcp-Method': 'tools/list'
      },
      body: JSON.stringify(request)
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('mcp-protocol-version'), MCP_PROTOCOL_VERSION);
    const body = await response.json();
    assert.equal(body.result.tools.length >= 5, true);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
