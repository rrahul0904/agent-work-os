import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createArtifactBundle, createRoundRobinFixture, simulateRoundRobin,
  verifyArtifactBundle, verifyDiagram
} from '../src/artifact-bundle.js';

test('fixture emits linked, hashed, editable document/diagram artifacts', () => {
  const bundle = createRoundRobinFixture();
  const status = verifyArtifactBundle(bundle);
  assert.equal(status.ok, true);
  assert.equal(status.checked, 2);
  assert.match(status.digest, /^[0-9a-f]{64}$/);
  assert.deepEqual(bundle.artifacts.map(({ id }) => id), [
    'notes/round-robin.md', 'diagrams/round-robin.json'
  ]);
  assert.deepEqual(bundle.artifacts[0].refs, ['diagrams/round-robin.json']);
  assert.deepEqual(
    bundle.artifacts[1].body.edges.filter((edge) => edge.kind === 'route').map((edge) => edge.to),
    ['backend-a', 'backend-c']
  );
  assert.match(bundle.artifacts[0].body, /Backend-b is unhealthy and excluded/i);
});

test('same fixture generates same content digest', () => {
  assert.equal(verifyArtifactBundle(createRoundRobinFixture()).digest,
    verifyArtifactBundle(createRoundRobinFixture()).digest);
});

test('healthy backend selection rotates only across eligible servers', () => {
  const servers = [
    { id: 'a', healthy: true }, { id: 'b', healthy: false },
    { id: 'c', healthy: true },
  ];
  assert.deepEqual(simulateRoundRobin(servers, 5), ['a', 'c', 'a', 'c', 'a']);
  assert.deepEqual(simulateRoundRobin([{ id: 'x', healthy: false }], 2), [null, null]);
  assert.throws(() => simulateRoundRobin([{ id: 'x', healthy: true },
    { id: 'x', healthy: false }], 2), /duplicate/);
});

test('tampering with generated notes fails closed', () => {
  const bundle = createRoundRobinFixture();
  bundle.artifacts[0].body += '\nUnreviewed mutation';
  assert.throws(() => verifyArtifactBundle(bundle), /checksum mismatch/);
});

test('no missing, duplicate, or self artifact references', () => {
  const base = createRoundRobinFixture();
  base.artifacts[0].refs = ['diagrams/does-not-exist.json'];
  assert.throws(() => verifyArtifactBundle(base), /dangling/);
  const duplicate = createRoundRobinFixture();
  duplicate.artifacts.push({ ...duplicate.artifacts[0] });
  assert.throws(() => verifyArtifactBundle(duplicate), /duplicate/);
});

test('rejects path traversal, commands and executable payloads', () => {
  const p = { method: 'clean-room', sourceUrl: 'https://example.com/' };
  assert.throws(() => createArtifactBundle({ provenance: p,
    artifacts: [{ id: '../bad.md', type: 'document', body: 'text', refs: [] }] }), /unsafe/);
  assert.throws(() => createArtifactBundle({ provenance: p,
    artifacts: [{ id: 'scripts/run.sh', type: 'command', body: 'rm -rf /', refs: [] }] }),
    /unsafe|unapproved|separate grant/);
  assert.throws(() => createArtifactBundle({ provenance: p,
    artifacts: [{ id: 'run.json', type: 'terminal', body: {}, refs: [] }] }),
    /executable|unknown/);
  assert.throws(() => createArtifactBundle({ provenance: null, artifacts: [
    { id: 'notes/a.md', type: 'document', body: 'ok', refs: [] }
  ] }), /provenance/);
});

test('diagram rejects missing endpoints and unhealthy-route violations', () => {
  const diagram = createRoundRobinFixture().artifacts[1].body;
  assert.equal(verifyDiagram(diagram), true);
  const missing = structuredClone(diagram);
  missing.edges.push({ from: 'ghost', to: 'client', kind: 'route' });
  assert.throws(() => verifyDiagram(missing), /dangling/);
  const unhealthy = structuredClone(diagram);
  unhealthy.edges.push({ from: 'balancer', to: 'backend-b', kind: 'route' });
  assert.throws(() => verifyDiagram(unhealthy), /unhealthy/);
});
