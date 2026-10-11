import test from 'node:test';
import assert from 'node:assert/strict';
import { compileExpression, normalizeExpression, sampleCartesian, sampleParametric, valueToFrequency } from '../engine.mjs';

test('evaluates whitelisted math with live parameters', () => {
  const fn = compileExpression('a*sin(b*x)+c');
  assert.ok(Math.abs(fn({ x: Math.PI/2, a: 2, b: 1, c: 1 }) - 3) < 1e-10);
});

test('supports friendly pi and exponent syntax', () => {
  const fn = compileExpression('cos(π)+x^2');
  assert.equal(fn({ x: 3 }), 8);
});

test('fails closed on arbitrary identifiers and code characters', () => {
  assert.throws(() => normalizeExpression('window.alert(1)'), /Unsupported name|unsupported characters/i);
  assert.throws(() => normalizeExpression('constructor.constructor(1)'), /Unsupported name/i);
  assert.throws(() => normalizeExpression('sin(x);alert(1)'), /unsupported characters/i);
});

test('cartesian sampling returns deterministic endpoints', () => {
  const pts = sampleCartesian('x', {}, [-2, 2], 5);
  assert.deepEqual(pts.map((p) => p.x), [-2,-1,0,1,2]);
  assert.deepEqual(pts.map((p) => p.y), [-2,-1,0,1,2]);
});

test('parametric circle samples finite points', () => {
  const pts = sampleParametric('2*cos(t)', '2*sin(t)', {}, [0, Math.PI*2], 9);
  assert.equal(pts.length, 9);
  assert.ok(pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.ok(Math.abs(pts[0].x - 2) < 1e-10);
});

test('audio mapping clamps unsafe pitch extremes', () => {
  assert.equal(valueToFrequency(Infinity), 220);
  assert.ok(valueToFrequency(1000) <= 1760);
  assert.ok(valueToFrequency(-1000) >= 55);
});
