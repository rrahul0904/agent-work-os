// Clean-room, dependency-free engineering-artifact bundle contract.
// Observed public product behavior informed the acceptance case, not the implementation.
import { createHash } from 'node:crypto';

export const FORMAT = 'agent-work-os.engineering-artifacts.v0';
const ALLOWED_TYPES = new Set(['document', 'diagram']);
const SAFE_ID = /^[a-z0-9][a-z0-9/_-]*\.(md|json)$/;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function contentHash(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

export function createArtifactBundle({ artifacts, provenance }) {
  requireValue(Array.isArray(artifacts) && artifacts.length > 0 && artifacts.length <= 50,
    'artifacts must contain 1..50 items');
  requireValue(provenance && provenance.method === 'clean-room' &&
    typeof provenance.sourceUrl === 'string' && provenance.sourceUrl.startsWith('https://'),
    'clean-room provenance with sourceUrl is required');
  const prepared = artifacts.map((artifact) => {
    requireValue(artifact && SAFE_ID.test(artifact.id || '') &&
      !artifact.id.includes('..') && !artifact.id.includes('//'), 'unsafe artifact id');
    requireValue(ALLOWED_TYPES.has(artifact.type), 'executable or unknown artifact type requires a separate grant');
    requireValue(artifact.id.endsWith(artifact.type === 'document' ? '.md' : '.json'), 'type/extension mismatch');
    requireValue(Array.isArray(artifact.refs) && artifact.refs.every((ref) => typeof ref === 'string'),
      'explicit artifact references required');
    requireValue(typeof artifact.body === 'string' || (artifact.body && typeof artifact.body === 'object'),
      'artifact body required');
    requireValue(canonical(artifact.body).length <= 100_000, 'artifact exceeds bounded contract');
    return { id: artifact.id, type: artifact.type, body: artifact.body,
      refs: [...artifact.refs], sha256: contentHash(artifact.body) };
  });
  const bundle = { format: FORMAT, provenance: { ...provenance }, artifacts: prepared };
  verifyArtifactBundle(bundle);
  return bundle;
}

export function verifyArtifactBundle(bundle) {
  requireValue(bundle && bundle.format === FORMAT, 'unsupported bundle format');
  requireValue(bundle.provenance?.method === 'clean-room' &&
    typeof bundle.provenance?.sourceUrl === 'string' &&
    bundle.provenance.sourceUrl.startsWith('https://'), 'missing provenance');
  requireValue(Array.isArray(bundle.artifacts) && bundle.artifacts.length > 0 &&
    bundle.artifacts.length <= 50, 'invalid artifact count');
  const ids = new Set();
  for (const artifact of bundle.artifacts) {
    requireValue(artifact && SAFE_ID.test(artifact.id || '') &&
      !artifact.id.includes('..') && !artifact.id.includes('//'), 'unsafe artifact id');
    requireValue(!ids.has(artifact.id), 'duplicate artifact id');
    ids.add(artifact.id);
    requireValue(ALLOWED_TYPES.has(artifact.type), 'unapproved executable artifact type');
    requireValue(artifact.id.endsWith(artifact.type === 'document' ? '.md' : '.json'), 'type/extension mismatch');
    requireValue(Array.isArray(artifact.refs), 'artifact refs missing');
    requireValue(typeof artifact.body === 'string' || (artifact.body && typeof artifact.body === 'object'),
      'invalid body');
    requireValue(canonical(artifact.body).length <= 100_000, 'artifact too large');
    requireValue(contentHash(artifact.body) === artifact.sha256, 'artifact checksum mismatch');
    if (artifact.type === 'diagram') verifyDiagram(artifact.body);
  }
  for (const artifact of bundle.artifacts) {
    for (const ref of artifact.refs) {
      requireValue(ids.has(ref) && ref !== artifact.id, 'dangling or self artifact reference');
    }
  }
  return { ok: true, checked: bundle.artifacts.length,
    digest: contentHash(bundle.artifacts.map(({ id, sha256 }) => ({ id, sha256 }))) };
}

export function verifyDiagram(diagram) {
  requireValue(diagram && Array.isArray(diagram.nodes) && Array.isArray(diagram.edges),
    'diagram requires nodes and edges');
  requireValue(diagram.nodes.length > 0 && diagram.nodes.length <= 100, 'invalid node count');
  requireValue(diagram.edges.length <= 400, 'diagram too large');
  const ids = new Set();
  const nodes = new Map();
  for (const node of diagram.nodes) {
    requireValue(node && typeof node.id === 'string' && /^[a-z0-9-]+$/.test(node.id),
      'invalid diagram node');
    requireValue(!ids.has(node.id), 'duplicate diagram node');
    requireValue(typeof node.label === 'string' && node.label.length > 0 && node.label.length <= 100,
      'invalid diagram label');
    ids.add(node.id);
    nodes.set(node.id, node);
  }
  for (const edge of diagram.edges) {
    requireValue(edge && ids.has(edge.from) && ids.has(edge.to), 'dangling diagram edge');
    requireValue(['request', 'route', 'response', 'excluded'].includes(edge.kind),
      'invalid diagram edge kind');
    if (edge.kind === 'route') {
      requireValue(nodes.get(edge.to).healthy !== false, 'request routed to unhealthy backend');
    }
  }
  return true;
}

export function simulateRoundRobin(backends, requestCount) {
  requireValue(Array.isArray(backends) && backends.length > 0 && backends.length <= 30,
    'invalid backend list');
  requireValue(Number.isInteger(requestCount) && requestCount >= 0 && requestCount <= 1_000,
    'invalid request count');
  const ids = new Set();
  for (const backend of backends) {
    requireValue(backend && /^[a-z0-9-]+$/.test(backend.id || ''), 'invalid backend ID');
    requireValue(!ids.has(backend.id) && typeof backend.healthy === 'boolean',
      'duplicate ID or undefined backend health');
    ids.add(backend.id);
  }
  const healthy = backends.filter((backend) => backend.healthy);
  return Array.from({ length: requestCount }, (_, i) =>
    healthy.length ? healthy[i % healthy.length].id : null);
}

export function createRoundRobinFixture() {
  const backends = [
    { id: 'backend-a', healthy: true },
    { id: 'backend-b', healthy: false },
    { id: 'backend-c', healthy: true },
  ];
  const assignments = simulateRoundRobin(backends, 5);
  const diagram = {
    nodes: [
      { id: 'client', label: 'Client' },
      { id: 'balancer', label: 'Round-robin load balancer' },
      ...backends.map((backend) => ({ id: backend.id, label: backend.id,
        healthy: backend.healthy })),
    ],
    edges: [
      { from: 'client', to: 'balancer', kind: 'request' },
      ...backends.map((backend) => ({ from: 'balancer', to: backend.id,
        kind: backend.healthy ? 'route' : 'excluded' })),
      ...backends.filter((backend) => backend.healthy).map((backend) => ({
        from: backend.id, to: 'client', kind: 'response' })),
    ],
  };
  const notes = [
    '# Round-robin load balancing',
    '',
    'The load balancer sends successive accepted requests to healthy backends in a rotating order.',
    'Health checks determine the eligible backend set. Backend-b is unhealthy and excluded.',
    'A route is chosen only from the healthy set; no healthy backends yields no assignment (503 at the HTTP boundary).',
    '',
    '## Backend health',
    ...backends.map((backend) => '- ' + backend.id + ': ' +
      (backend.healthy ? 'healthy' : 'unhealthy (skipped)')),
    '',
    '## Example request assignments',
    ...assignments.map((id, i) => '- Request ' + (i + 1) + ': ' + (id || 'no healthy backend')),
    '',
    'See editable graph: diagrams/round-robin.json',
    '',
    'This is a deterministic illustrative fixture, not a verification of a deployed load balancer.',
  ].join('\n');
  return createArtifactBundle({
    provenance: { method: 'clean-room',
      sourceUrl: 'https://www.reddit.com/r/coolgithubprojects/comments/1xaqv70/',
      evidenceClass: 'independently-authored-fixture' },
    artifacts: [
      { id: 'notes/round-robin.md', type: 'document', body: notes,
        refs: ['diagrams/round-robin.json'] },
      { id: 'diagrams/round-robin.json', type: 'diagram', body: diagram, refs: [] },
    ],
  });
}
