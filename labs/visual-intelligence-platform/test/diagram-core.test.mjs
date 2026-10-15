import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDiagramSpec, validateDiagramSpec } from '../diagram-spec.mjs';
import { layoutDiagram, renderDiagramSvg } from '../diagram-renderer.mjs';
import { critiqueDiagram } from '../diagram-critic.mjs';
import { toDrawioXml, toMermaid, toPlantUml } from '../diagram-adapters.mjs';

const sample = {
  kind: 'rag',
  title: 'Secure Enterprise RAG',
  nodes: [
    { id: 'user', type: 'actor', label: 'Enterprise User', evidence: 'requirements.md' },
    { id: 'idp', type: 'identity', label: 'Identity Provider', evidence: 'security-standard.md' },
    { id: 'gateway', type: 'gateway', label: 'API Gateway', boundary: 'edge', evidence: 'architecture.md' },
    { id: 'svc', type: 'service', label: 'RAG Service', technology: 'Node.js', boundary: 'application', evidence: 'repo' },
    { id: 'kb', type: 'dataset', label: 'Knowledge Index', boundary: 'data', evidence: 'data-model.md' },
    { id: 'model', type: 'model', label: 'LLM', boundary: 'provider', evidence: 'provider-config' }
  ],
  edges: [
    { from: 'user', to: 'idp', label: 'authenticate', protocol: 'OIDC', evidence: 'security-standard.md' },
    { from: 'idp', to: 'gateway', label: 'token', protocol: 'JWT', evidence: 'security-standard.md' },
    { from: 'gateway', to: 'svc', label: 'query', protocol: 'HTTPS', evidence: 'architecture.md' },
    { from: 'svc', to: 'kb', label: 'retrieve', protocol: 'vector search', evidence: 'data-model.md' },
    { from: 'svc', to: 'model', label: 'generate', protocol: 'HTTPS', evidence: 'provider-config' }
  ]
};

test('compiles and validates semantic diagram', () => {
  const spec = compileDiagramSpec(sample);
  assert.equal(validateDiagramSpec(spec).valid, true);
  assert.equal(spec.nodes.length, 6);
});

test('layout is deterministic', () => {
  const spec = compileDiagramSpec(sample);
  const first = layoutDiagram(spec);
  const second = layoutDiagram(spec);
  assert.deepEqual([...first.positions.entries()], [...second.positions.entries()]);
});

test('renders accessible SVG with semantic node ids', () => {
  const svg = renderDiagramSvg(compileDiagramSpec(sample));
  assert.match(svg, /role="img"/);
  assert.match(svg, /data-node-id="svc"/);
  assert.match(svg, /Secure Enterprise RAG/);
});

test('critic passes well-specified RAG architecture', () => {
  const result = critiqueDiagram(compileDiagramSpec(sample));
  assert.equal(result.passed, true);
  assert.equal(result.findings.filter(f => f.severity === 'error').length, 0);
});

test('critic fails RAG without model', () => {
  const bad = structuredClone(sample);
  bad.nodes = bad.nodes.filter(n => n.id !== 'model');
  bad.edges = bad.edges.filter(e => e.to !== 'model');
  const result = critiqueDiagram(compileDiagramSpec(bad));
  assert.equal(result.passed, false);
  assert.equal(result.findings.some(f => f.code === 'rag-model-missing'), true);
});

test('exports Mermaid, PlantUML and draw.io', () => {
  const spec = compileDiagramSpec(sample);
  const layout = layoutDiagram(spec);
  assert.match(toMermaid(spec), /flowchart LR/);
  assert.match(toPlantUml(spec), /@startuml/);
  assert.match(toDrawioXml(spec, layout), /<mxfile/);
});
