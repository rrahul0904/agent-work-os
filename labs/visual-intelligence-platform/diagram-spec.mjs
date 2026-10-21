const DIAGRAM_KINDS = new Set([
  'architecture', 'data-flow', 'lineage', 'network', 'deployment', 'c4-context',
  'c4-container', 'c4-component', 'uml-component', 'sequence', 'erd', 'process',
  'agent', 'rag'
]);

const NODE_TYPES = new Set([
  'actor', 'system', 'service', 'database', 'queue', 'cache', 'storage', 'api',
  'gateway', 'identity', 'model', 'agent', 'tool', 'dataset', 'process', 'external'
]);

const clean = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const slug = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function uniq(items) { return [...new Set(items)]; }

export function validateDiagramSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object') return { valid: false, errors: ['spec-required'] };
  if (spec.specVersion !== 'diagram-spec/v1alpha1') errors.push('unsupported-spec-version');
  if (!DIAGRAM_KINDS.has(spec.kind)) errors.push('unsupported-diagram-kind');
  if (!clean(spec.title)) errors.push('title-required');
  if (!Array.isArray(spec.nodes) || spec.nodes.length === 0) errors.push('nodes-required');
  if (!Array.isArray(spec.edges)) errors.push('edges-required');

  const ids = new Set();
  for (const node of spec.nodes || []) {
    if (!node?.id) errors.push('node-id-required');
    else if (ids.has(node.id)) errors.push(`duplicate-node:${node.id}`);
    else ids.add(node.id);
    if (!NODE_TYPES.has(node?.type)) errors.push(`unsupported-node-type:${node?.id || 'unknown'}`);
    if (!clean(node?.label)) errors.push(`node-label-required:${node?.id || 'unknown'}`);
  }

  const edgeIds = new Set();
  for (const edge of spec.edges || []) {
    if (!edge?.id) errors.push('edge-id-required');
    else if (edgeIds.has(edge.id)) errors.push(`duplicate-edge:${edge.id}`);
    else edgeIds.add(edge.id);
    if (!ids.has(edge?.from)) errors.push(`edge-from-missing:${edge?.id || 'unknown'}`);
    if (!ids.has(edge?.to)) errors.push(`edge-to-missing:${edge?.id || 'unknown'}`);
    if (edge?.from === edge?.to) errors.push(`self-edge:${edge?.id || 'unknown'}`);
  }

  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(uniq(errors)) });
}

export function compileDiagramSpec(input = {}) {
  const kind = clean(input.kind || 'architecture');
  if (!DIAGRAM_KINDS.has(kind)) throw new Error('unsupported-diagram-kind');
  const title = clean(input.title || input.objective);
  if (!title) throw new Error('diagram-title-required');

  const rawNodes = Array.isArray(input.nodes) ? input.nodes : [];
  if (!rawNodes.length) throw new Error('diagram-nodes-required');

  const nodes = rawNodes.map((node, index) => {
    const label = clean(node.label || node.name);
    const id = clean(node.id) || `${slug(label) || 'node'}-${index + 1}`;
    const type = clean(node.type || 'service').toLowerCase();
    return Object.freeze({
      id,
      label,
      type,
      description: clean(node.description),
      boundary: clean(node.boundary),
      technology: clean(node.technology),
      evidence: clean(node.evidence),
      tags: Object.freeze(uniq((Array.isArray(node.tags) ? node.tags : []).map(clean).filter(Boolean)))
    });
  });

  const rawEdges = Array.isArray(input.edges) ? input.edges : [];
  const edges = rawEdges.map((edge, index) => Object.freeze({
    id: clean(edge.id) || `edge-${index + 1}`,
    from: clean(edge.from),
    to: clean(edge.to),
    label: clean(edge.label),
    protocol: clean(edge.protocol),
    direction: clean(edge.direction || 'forward'),
    evidence: clean(edge.evidence)
  }));

  const spec = Object.freeze({
    specVersion: 'diagram-spec/v1alpha1',
    kind,
    title,
    description: clean(input.description),
    audience: clean(input.audience || 'technical'),
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    assumptions: Object.freeze((Array.isArray(input.assumptions) ? input.assumptions : []).map(clean).filter(Boolean)),
    constraints: Object.freeze((Array.isArray(input.constraints) ? input.constraints : []).map(clean).filter(Boolean)),
    provenance: Object.freeze({
      source: clean(input.source || 'user-input'),
      generatedBy: clean(input.generatedBy || 'visual-intelligence-platform'),
      observedNodeIds: Object.freeze(nodes.filter(n => n.evidence).map(n => n.id))
    })
  });

  const result = validateDiagramSpec(spec);
  if (!result.valid) {
    const error = new Error('invalid-diagram-spec');
    error.validation = result;
    throw error;
  }
  return spec;
}

export const diagramKinds = Object.freeze([...DIAGRAM_KINDS]);
export const diagramNodeTypes = Object.freeze([...NODE_TYPES]);
