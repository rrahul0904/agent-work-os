import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilePromptSpec, renderPrompt } from './prompt-core.mjs';
import { createRunPlan } from './orchestrator.mjs';
import { executeAgentRun, ProviderRegistry } from './agent-runtime.mjs';
import { compileDiagramSpec } from './diagram-spec.mjs';
import { layoutDiagram, renderDiagramSvg } from './diagram-renderer.mjs';
import { critiqueDiagram } from './diagram-critic.mjs';
import { toDrawioXml, toMermaid, toPlantUml } from './diagram-adapters.mjs';
import { createNativePresentation } from './presentation-service.mjs';
import { compileCreativeSpec } from './creative-spec.mjs';
import { renderCreativeSvg, creativeReceipt } from './creative-renderer.mjs';
import { handleMcpRequest, MCP_PROTOCOL_VERSION } from './mcp-core.mjs';

const defaultRoot = fileURLToPath(new URL('./dist/', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.css': 'text/css; charset=utf-8'
};

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
}

async function bodyJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('request-too-large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function serveStatic(pathname, response, root) {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const safe = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
  const target = join(root, safe);
  if (!target.startsWith(root)) return false;
  try {
    const meta = await stat(target);
    if (!meta.isFile()) return false;
    const data = await readFile(target);
    response.writeHead(200, {
      'content-type': types[extname(target)] || 'application/octet-stream',
      'cache-control': extname(target) === '.html' ? 'no-store' : 'public, max-age=300',
      'x-content-type-options': 'nosniff'
    });
    response.end(data);
    return true;
  } catch {
    return false;
  }
}

export function createVisualIntelligenceServer(options = {}) {
  const root = options.root || defaultRoot;
  const providerRegistry = options.providerRegistry instanceof ProviderRegistry ? options.providerRegistry : new ProviderRegistry();
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

      if (request.method === 'GET' && url.pathname === '/api/health') {
        return sendJson(response, 200, {
          ok: true,
          service: 'visual-intelligence-platform',
          contractVersion: 'visual-intelligence-platform/v1alpha1',
          releaseState: 'BUILDING',
          mcpProtocolVersion: MCP_PROTOCOL_VERSION,
          configuredProviders: providerRegistry.names(),
          capabilities: [
            'prompt-studio', 'agent-run-plan', 'agent-execution', 'diagram-spec', 'diagram-svg',
            'mermaid', 'plantuml', 'drawio', 'deck-plan', 'native-pptx',
            'creative-spec', 'creative-svg', 'visualbench', 'mcp-tools'
          ]
        });
      }

      if (url.pathname === '/mcp') {
        if (request.method !== 'POST') {
          response.setHeader('allow', 'POST');
          return sendJson(response, 405, { error: 'method-not-allowed' });
        }
        try {
          const input = await bodyJson(request);
          const result = await handleMcpRequest(input, request.headers);
          const status = result?.error && [-32022, -32020].includes(result.error.code) ? 400 : 200;
          return sendJson(response, status, result, { 'MCP-Protocol-Version': MCP_PROTOCOL_VERSION });
        } catch {
          return sendJson(response, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { 'MCP-Protocol-Version': MCP_PROTOCOL_VERSION });
        }
      }

      if (url.pathname === '/api/prompt') {
        if (request.method !== 'POST') {
          response.setHeader('allow', 'POST');
          return sendJson(response, 405, { error: 'method-not-allowed' });
        }
        try {
          const input = await bodyJson(request);
          const promptSpec = compilePromptSpec(input);
          return sendJson(response, 200, { promptSpec, prompt: renderPrompt(promptSpec), runPlan: createRunPlan(input) });
        } catch (error) {
          const code = error?.message || 'prompt-compilation-failed';
          return sendJson(response, code === 'plan-capability-denied' ? 403 : 400, { error: code });
        }
      }

      if (url.pathname === '/api/agents/run') {
        if (request.method !== 'POST') {
          response.setHeader('allow', 'POST');
          return sendJson(response, 405, { error: 'method-not-allowed' });
        }
        if (!providerRegistry.names().length) return sendJson(response, 503, { error: 'provider_unavailable' });
        try {
          const body = await bodyJson(request);
          const input = body.input && typeof body.input === 'object' ? body.input : body;
          const result = await executeAgentRun(input, {
            registry: providerRegistry,
            providerPolicy: {
              providers: Array.isArray(body.providers) ? body.providers : undefined,
              allowFallback: body.allowFallback !== false
            },
            approvedStages: Array.isArray(body.approvedStages) ? body.approvedStages : []
          });
          return sendJson(response, result.status === 'approval_required' ? 202 : 200, result);
        } catch (error) {
          const code = error?.code || error?.message || 'agent_execution_failed';
          return sendJson(response, code === 'provider_unavailable' ? 503 : 400, { error: code, details: error?.details ?? null });
        }
      }

      if (url.pathname === '/api/diagram') {
        if (request.method !== 'POST') {
          response.setHeader('allow', 'POST');
          return sendJson(response, 405, { error: 'method-not-allowed' });
        }
        try {
          const input = await bodyJson(request);
          const diagramSpec = compileDiagramSpec(input);
          const layout = layoutDiagram(diagramSpec);
          return sendJson(response, 200, {
            diagramSpec,
            critique: critiqueDiagram(diagramSpec),
            svg: renderDiagramSvg(diagramSpec),
            exports: {
              mermaid: toMermaid(diagramSpec),
              plantuml: toPlantUml(diagramSpec),
              drawio: toDrawioXml(diagramSpec, layout)
            }
          });
        } catch (error) {
          return sendJson(response, 400, { error: error?.message || 'diagram-generation-failed' });
        }
      }

      if (url.pathname === '/api/presentation') {
        if (request.method !== 'POST') {
          response.setHeader('allow', 'POST');
          return sendJson(response, 405, { error: 'method-not-allowed' });
        }
        try {
          const input = await bodyJson(request);
          const receiptOnly = url.searchParams.get('mode') === 'receipt';
          const artifact = createNativePresentation(input, { includeBytes: !receiptOnly });
          if (receiptOnly) return sendJson(response, 200, { plan: artifact.plan, deckPlan: artifact.deckPlan, receipt: artifact.receipt });
          response.writeHead(200, {
            'content-type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'content-disposition': 'attachment; filename="visual-intelligence.pptx"',
            'content-length': String(artifact.pptx.length),
            'x-visual-intelligence-editable': 'true',
            'x-visual-intelligence-plan': artifact.plan,
            'cache-control': 'no-store'
          });
          return response.end(artifact.pptx);
        } catch (error) {
          const code = error?.message || 'presentation-generation-failed';
          return sendJson(response, code === 'plan-capability-denied' ? 403 : 400, { error: code });
        }
      }

      if (url.pathname === '/api/creative') {
        if (request.method !== 'POST') {
          response.setHeader('allow', 'POST');
          return sendJson(response, 405, { error: 'method-not-allowed' });
        }
        try {
          const input = await bodyJson(request);
          const creativeSpec = compileCreativeSpec(input);
          const svg = renderCreativeSvg(creativeSpec);
          return sendJson(response, 200, { creativeSpec, svg, receipt: creativeReceipt(creativeSpec, svg) });
        } catch (error) {
          return sendJson(response, 400, { error: error?.message || 'creative-generation-failed' });
        }
      }

      if (request.method === 'GET' && await serveStatic(url.pathname, response, root)) return;
      return sendJson(response, 404, { error: 'not-found' });
    } catch {
      return sendJson(response, 500, { error: 'internal-error' });
    }
  });
}
