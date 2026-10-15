import { validateDiagramSpec } from './diagram-spec.mjs';

const SECURITY_TYPES = new Set(['gateway','identity','api']);
const DATA_TYPES = new Set(['database','storage','dataset','cache']);

export function critiqueDiagram(spec) {
  const validation = validateDiagramSpec(spec);
  const findings = [];
  if (!validation.valid) {
    findings.push(...validation.errors.map(error => ({ severity: 'error', code: error, message: error })));
    return Object.freeze({ passed: false, score: 0, findings: Object.freeze(findings) });
  }

  const incoming = new Map(spec.nodes.map(n => [n.id, 0]));
  const outgoing = new Map(spec.nodes.map(n => [n.id, 0]));
  for (const edge of spec.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    outgoing.set(edge.from, (outgoing.get(edge.from) || 0) + 1);
    if (!edge.label && !edge.protocol) findings.push({ severity: 'warning', code: 'unlabeled-relationship', subject: edge.id, message: 'Relationship should explain the interaction or protocol.' });
    if (!edge.evidence) findings.push({ severity: 'info', code: 'relationship-unprovenanced', subject: edge.id, message: 'Relationship has no evidence/source marker.' });
  }

  for (const node of spec.nodes) {
    const degree = (incoming.get(node.id) || 0) + (outgoing.get(node.id) || 0);
    if (degree === 0 && spec.nodes.length > 1) findings.push({ severity: 'warning', code: 'orphan-node', subject: node.id, message: 'Node is disconnected from the rest of the diagram.' });
    if (!node.evidence) findings.push({ severity: 'info', code: 'node-unprovenanced', subject: node.id, message: 'Node is inferred or unprovenanced.' });
    if (DATA_TYPES.has(node.type) && !node.boundary) findings.push({ severity: 'info', code: 'data-boundary-unspecified', subject: node.id, message: 'Data-bearing node has no trust/security boundary.' });
  }

  if (spec.kind === 'architecture' || spec.kind.startsWith('c4-') || spec.kind === 'rag') {
    const hasIdentity = spec.nodes.some(n => n.type === 'identity');
    const hasGateway = spec.nodes.some(n => n.type === 'gateway');
    const hasExternal = spec.nodes.some(n => n.type === 'external' || n.type === 'actor');
    if (hasExternal && !hasIdentity) findings.push({ severity: 'warning', code: 'identity-missing', message: 'External/actor access is shown but identity/authentication is not represented.' });
    if (hasExternal && !hasGateway && spec.nodes.some(n => n.type === 'service' || n.type === 'api')) findings.push({ severity: 'info', code: 'edge-boundary-missing', message: 'External access reaches internal services without an explicit gateway/edge boundary.' });
  }

  if (spec.kind === 'rag') {
    if (!spec.nodes.some(n => n.type === 'model')) findings.push({ severity: 'error', code: 'rag-model-missing', message: 'RAG architecture must include a model node.' });
    if (!spec.nodes.some(n => n.type === 'dataset' || n.type === 'database' || n.type === 'storage')) findings.push({ severity: 'error', code: 'rag-knowledge-source-missing', message: 'RAG architecture must include a knowledge/data source.' });
  }

  const errors = findings.filter(f => f.severity === 'error').length;
  const warnings = findings.filter(f => f.severity === 'warning').length;
  const infos = findings.filter(f => f.severity === 'info').length;
  const score = Math.max(0, 100 - errors * 35 - warnings * 10 - Math.min(20, infos * 2));
  return Object.freeze({
    criticVersion: 'diagram-critic/v1alpha1',
    passed: errors === 0 && score >= 70,
    score,
    findings: Object.freeze(findings.map(Object.freeze))
  });
}
