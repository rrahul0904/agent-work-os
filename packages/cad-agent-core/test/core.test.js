import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentLaunch, canonicalJson, createBuildReceipt, geometryAssertions, measureModel, sha256, validateModelSpec } from '../src/index.js';

const box = { id: 'box-1', name: 'Board enclosure', primitive: 'box', units: 'mm', dimensions: { width: 100, depth: 60, height: 25 } };

test('canonical JSON and digest are stable across key ordering', () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
  assert.equal(sha256({ b: 2, a: 1 }), sha256({ a: 1, b: 2 }));
});

test('validates and measures a box deterministically', () => {
  assert.equal(validateModelSpec(box).schemaVersion, 'cad.agent.model/v1');
  assert.deepEqual(measureModel(box).bounds, { x: 100, y: 60, z: 25 });
  assert.equal(measureModel(box).volume, 150000);
});

test('rejects invalid or negative geometry', () => {
  assert.throws(() => validateModelSpec({ ...box, dimensions: { ...box.dimensions, width: -1 } }), /positive finite/);
});

test('evaluates exact geometry assertions', () => {
  const checks = geometryAssertions(box, [{ path: 'bounds.x', expected: 100, tolerance: 0.001 }]);
  assert.equal(checks[0].ok, true);
});

test('build receipt digest is reproducible', () => {
  const a = createBuildReceipt({ spec: box, source: 'test', assertions: [{ path: 'bounds.z', expected: 25, tolerance: 0 }] });
  const b = createBuildReceipt({ spec: box, source: 'test', assertions: [{ path: 'bounds.z', expected: 25, tolerance: 0 }] });
  assert.equal(a.digest, b.digest);
  assert.equal(a.valid, true);
});

test('agent launch is argv based and never enables a shell', () => {
  assert.deepEqual(buildAgentLaunch({ agent: 'codex', workspace: '/tmp/model', extraArgs: ['--help'] }), { cwd: '/tmp/model', argv: ['codex', '--help'], shell: false });
});
