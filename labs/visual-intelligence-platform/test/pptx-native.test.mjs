import test from 'node:test';
import assert from 'node:assert/strict';
import { compileDeckPlan } from '../deck-plan.mjs';
import { generateNativePptx, nativePptxReceipt } from '../pptx-native.mjs';

const sample = {
  title: 'Enterprise AI Platform',
  audience: 'executive and architecture leadership',
  slides: [
    { title: 'Enterprise AI Platform', subtitle: 'Governed visual intelligence', layout: 'title' },
    { title: 'Why now', bullets: ['Faster architecture communication', 'Editable technical artifacts', 'Governed agent workflows'] },
    { title: 'Target architecture', body: 'Prompt Studio feeds specialist agents and semantic artifact compilers.' }
  ]
};

test('compiles deterministic DeckPlan', () => {
  const first = compileDeckPlan(sample);
  const second = compileDeckPlan(sample);
  assert.deepEqual(first, second);
  assert.equal(first.slides.length, 3);
});

test('generates ZIP based native PPTX with editable slide XML', () => {
  const pptx = generateNativePptx(sample);
  assert.equal(pptx.subarray(0, 2).toString('ascii'), 'PK');
  const raw = pptx.toString('utf8');
  assert.match(raw, /ppt\/presentation\.xml/);
  assert.match(raw, /ppt\/slides\/slide1\.xml/);
  assert.match(raw, /Enterprise AI Platform/);
  assert.match(raw, /Governed agent workflows/);
  assert.match(raw, /<p:sp>/);
  assert.match(raw, /<a:t>/);
});

test('emits an explicit editable artifact receipt', () => {
  const receipt = nativePptxReceipt(sample);
  assert.equal(receipt.format, 'pptx');
  assert.equal(receipt.editable, true);
  assert.equal(receipt.slides, 3);
  assert.equal(receipt.magic, 'PK');
  assert.ok(receipt.bytes > 1000);
});
