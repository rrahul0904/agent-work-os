import { compilePromptSpec, renderPrompt } from './prompt-core.mjs';
import { createRunPlan } from './orchestrator.mjs';
import { compileDiagramSpec } from './diagram-spec.mjs';
import { layoutDiagram, renderDiagramSvg } from './diagram-renderer.mjs';
import { critiqueDiagram } from './diagram-critic.mjs';
import { toDrawioXml, toMermaid, toPlantUml } from './diagram-adapters.mjs';
import { createNativePresentation } from './presentation-service.mjs';
import { compileCreativeSpec } from './creative-spec.mjs';
import { renderCreativeSvg, creativeReceipt } from './creative-renderer.mjs';
import { scoreVisualArtifact } from './visualbench.mjs';

export const MCP_PROTOCOL_VERSION = '2026-07-28';
export const MCP_SERVER_INFO = Object.freeze({ name: 'visual-intelligence-platform', version: '0.1.0' });

const objectSchema = properties => ({ type: 'object', properties, additionalProperties: true });

export const MCP_TOOLS = Object.freeze([
  Object.freeze({
    name: 'visual_prompt_compile',
    title: 'Compile Visual Prompt',
    description: 'Compile rough visual intent into a governed PromptSpec and specialist-agent run plan.',
    inputSchema: objectSchema({
      artifactType: { type: 'string', enum: ['architecture-diagram','technical-diagram','technical-presentation','creative-presentation','creative-ad'] },
      objective: { type: 'string' }, audience: { type: 'string' }, source: { type: 'string' }, constraints: { type: 'string' }, brand: { type: 'string' }, plan: { type: 'string', enum: ['community','pro','enterprise'] }
    })
  }),
  Object.freeze({
    name: 'visual_diagram_generate',
    title: 'Generate Technical Diagram',
    description: 'Compile a semantic DiagramSpec, critique it, render accessible SVG, and emit Mermaid, PlantUML and Draw.io representations.',
    inputSchema: objectSchema({
      kind: { type: 'string' }, title: { type: 'string' }, nodes: { type: 'array' }, edges: { type: 'array' }, audience: { type: 'string' }, source: { type: 'string' }
    })
  }),
  Object.freeze({
    name: 'visual_presentation_generate',
    title: 'Generate Native PowerPoint',
    description: 'Generate native editable OOXML PowerPoint for Pro or Enterprise. Optionally include PPTX bytes as base64.',
    inputSchema: objectSchema({
      title: { type: 'string' }, audience: { type: 'string' }, purpose: { type: 'string' }, slides: { type: 'array' }, plan: { type: 'string', enum: ['pro','enterprise'] }, includeBase64: { type: 'boolean' }
    })
  }),
  Object.freeze({
    name: 'visual_creative_generate',
    title: 'Generate Creative Asset',
    description: 'Compile CreativeSpec and render an editable layered SVG for ads, social assets and presentation covers.',
    inputSchema: objectSchema({
      format: { type: 'string', enum: ['square','story','landscape','linkedin','presentation-cover'] }, headline: { type: 'string' }, body: { type: 'string' }, cta: { type: 'string' }, audience: { type: 'string' }
    })
  }),
  Object.freeze({
    name: 'visualbench_score',
    title: 'Score Visual Artifact',
    description: 'Run the VisualBench quality gate over semantic fidelity, evidence grounding, layout, editability, accessibility, brand consistency and reproducibility.',
    inputSchema: objectSchema({
      semanticFidelity: { type: 'number' }, evidenceGrounding: { type: 'number' }, layoutQuality: { type: 'number' }, editability: { type: 'number' }, accessibility: { type: 'number' }, brandConsistency: { type: 'number' }, reproducibility: { type: 'number' }
    })
  })
]);

const toolMap = new Map(MCP_TOOLS.map(tool => [tool.name, tool]));
const resultMeta = () => ({ 'io.modelcontextprotocol/serverInfo': MCP_SERVER_INFO });
const complete = result => ({ resultType: 'complete', ...result, _meta: resultMeta() });
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result: complete(result) });
const rpcError = (id, code, message, data) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } });

function textAndStructured(structuredContent, summary) {
  return { content: [{ type: 'text', text: summary || JSON.stringify(structuredContent) }], structuredContent, isError: false };
}

async function callTool(name, args = {}) {
  if (!toolMap.has(name)) throw Object.assign(new Error('Unknown tool'), { rpcCode: -32602, rpcData: { name } });
  if (name === 'visual_prompt_compile') {
    const promptSpec = compilePromptSpec(args);
    const runPlan = createRunPlan(args);
    const data = { promptSpec, prompt: renderPrompt(promptSpec), runPlan };
    return textAndStructured(data, `Compiled ${promptSpec.artifactType} PromptSpec with ${runPlan.stages.length} governed stages.`);
  }
  if (name === 'visual_diagram_generate') {
    const diagramSpec = compileDiagramSpec(args);
    const layout = layoutDiagram(diagramSpec);
    const data = {
      diagramSpec,
      critique: critiqueDiagram(diagramSpec),
      svg: renderDiagramSvg(diagramSpec),
      exports: { mermaid: toMermaid(diagramSpec), plantuml: toPlantUml(diagramSpec), drawio: toDrawioXml(diagramSpec, layout) }
    };
    return textAndStructured(data, `Generated ${diagramSpec.kind} diagram with ${diagramSpec.nodes.length} nodes; critic score ${data.critique.score}/100.`);
  }
  if (name === 'visual_presentation_generate') {
    const artifact = createNativePresentation(args, { includeBytes: Boolean(args.includeBase64) });
    const data = {
      plan: artifact.plan,
      deckPlan: artifact.deckPlan,
      receipt: artifact.receipt,
      ...(args.includeBase64 ? { pptxBase64: artifact.pptx.toString('base64') } : {})
    };
    return textAndStructured(data, `Generated native editable PowerPoint receipt for ${artifact.receipt.slides} slides (${artifact.receipt.bytes} bytes) on ${artifact.plan}.`);
  }
  if (name === 'visual_creative_generate') {
    const creativeSpec = compileCreativeSpec(args);
    const svg = renderCreativeSvg(creativeSpec);
    const receipt = creativeReceipt(creativeSpec, svg);
    const data = { creativeSpec, svg, receipt };
    return textAndStructured(data, `Generated editable ${creativeSpec.format} creative with ${receipt.layers} semantic layers.`);
  }
  if (name === 'visualbench_score') {
    const score = scoreVisualArtifact(args);
    return textAndStructured(score, `VisualBench score ${score.total}/100; ${score.passed ? 'pass' : 'review required'}.`);
  }
  throw Object.assign(new Error('Unknown tool'), { rpcCode: -32602 });
}

export function validateModernMcpHeaders(headers, request) {
  const protocolHeader = headers?.['mcp-protocol-version'] ?? headers?.get?.('mcp-protocol-version');
  const methodHeader = headers?.['mcp-method'] ?? headers?.get?.('mcp-method');
  const nameHeader = headers?.['mcp-name'] ?? headers?.get?.('mcp-name');
  if (protocolHeader !== MCP_PROTOCOL_VERSION) return { ok: false, code: -32022, message: 'Unsupported protocol version', data: { supported: [MCP_PROTOCOL_VERSION], requested: protocolHeader || null } };
  if (methodHeader !== request?.method) return { ok: false, code: -32020, message: 'MCP method header mismatch' };
  if (request?.method === 'tools/call' && nameHeader !== request?.params?.name) return { ok: false, code: -32020, message: 'MCP name header mismatch' };
  return { ok: true };
}

export async function handleMcpRequest(request, headers = {}) {
  const id = request?.id ?? null;
  if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') return rpcError(id, -32600, 'Invalid Request');
  const envelopeVersion = request.params?._meta?.['io.modelcontextprotocol/protocolVersion'];
  if (envelopeVersion && envelopeVersion !== MCP_PROTOCOL_VERSION) return rpcError(id, -32022, 'Unsupported protocol version', { supported: [MCP_PROTOCOL_VERSION], requested: envelopeVersion });
  const headerCheck = validateModernMcpHeaders(headers, request);
  if (!headerCheck.ok) return rpcError(id, headerCheck.code, headerCheck.message, headerCheck.data);
  try {
    if (request.method === 'server/discover') {
      return rpcResult(id, {
        supportedVersions: [MCP_PROTOCOL_VERSION],
        capabilities: { tools: { listChanged: false } },
        instructions: 'Use Visual Intelligence tools to compile prompts and generate editable technical diagrams, native PowerPoint and layered creative assets. Treat artifact receipts and critique results as release evidence.',
        ttlMs: 60000,
        cacheScope: 'public'
      });
    }
    if (request.method === 'tools/list') return rpcResult(id, { tools: MCP_TOOLS, nextCursor: null, ttlMs: 60000, cacheScope: 'public' });
    if (request.method === 'tools/call') return rpcResult(id, await callTool(request.params?.name, request.params?.arguments ?? {}));
    return rpcError(id, -32601, 'Method not found');
  } catch (error) {
    return rpcError(id, error.rpcCode || -32602, error.message || 'Invalid params', error.rpcData);
  }
}
