import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCreativeSpec } from '../creative-spec.mjs';
import { renderCreativeSvg, creativeReceipt } from '../creative-renderer.mjs';

test('compiles branded square creative', () => {
  const spec = compileCreativeSpec({
    format: 'square',
    objective: 'Launch an AI architecture workspace',
    headline: 'Architecture that stays editable',
    body: 'Plan, render, review and export with governed agents.',
    cta: 'Build now'
  });
  assert.equal(spec.specVersion, 'creative-spec/v1alpha1');
  assert.equal(spec.artboard.width, 1080);
  assert.equal(spec.layers.length, 6);
});

test('renders layered accessible SVG and receipt', () => {
  const spec = compileCreativeSpec({
    format: 'landscape',
    headline: 'Build diagrams and decks with agents',
    body: 'Semantic artifacts, native PowerPoint and quality gates.',
    cta: 'Create'
  });
  const svg = renderCreativeSvg(spec);
  const receipt = creativeReceipt(spec, svg);
  assert.match(svg, /role="img"/);
  assert.match(svg, /id="headline"/);
  assert.match(svg, /id="cta"/);
  assert.equal(receipt.editable, true);
  assert.equal(receipt.passed, true);
});

test('rejects unsupported artboard formats', () => {
  assert.throws(() => compileCreativeSpec({ format: 'billboard', headline: 'x' }), /unsupported-creative-format/);
});
