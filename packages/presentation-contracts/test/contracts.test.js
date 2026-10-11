import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertDeckPlan,
  deterministicId,
  nextShippingStatus,
  validateDeckPlan,
} from '../src/index.js';

function validPlan() {
  return {
    schemaVersion: 1,
    projectId: 'proj_1',
    title: 'Quarterly Review',
    slides: [
      {
        id: 'slide_1',
        title: 'Overview',
        objects: [
          {
            id: 'obj_title',
            type: 'text',
            frame: { x: 0.5, y: 0.5, width: 8, height: 0.8 },
          },
          {
            id: 'obj_chart',
            type: 'chart',
            native: true,
            frame: { x: 0.7, y: 1.6, width: 6.5, height: 3.5 },
            accessibility: { altText: 'Revenue by quarter' },
            data: { series: [{ name: 'Revenue', values: [10, 12, 15, 18] }] },
          },
          {
            id: 'obj_table',
            type: 'table',
            native: true,
            frame: { x: 7.5, y: 1.6, width: 4.5, height: 3.5 },
          },
        ],
      },
    ],
  };
}

test('deterministicId is stable across object key ordering', () => {
  const a = deterministicId('slide', { title: 'A', order: 1, meta: { b: 2, a: 1 } });
  const b = deterministicId('slide', { meta: { a: 1, b: 2 }, order: 1, title: 'A' });
  assert.equal(a, b);
  assert.match(a, /^slide_[a-f0-9]{24}$/);
});

test('valid Phase A deck plan passes validation', () => {
  const plan = validPlan();
  assert.deepEqual(validateDeckPlan(plan), []);
  assert.equal(assertDeckPlan(plan), plan);
});

test('chart requires native editability, data and alt text', () => {
  const plan = validPlan();
  const chart = plan.slides[0].objects[1];
  chart.native = false;
  chart.data.series = [];
  chart.accessibility.altText = '';

  const errors = validateDeckPlan(plan);
  assert.ok(errors.some((error) => error.code === 'native.required'));
  assert.ok(errors.some((error) => error.code === 'chart.series_required'));
  assert.ok(errors.some((error) => error.code === 'accessibility.alt_text_required'));
});

test('duplicate slide and object ids fail closed', () => {
  const plan = validPlan();
  plan.slides.push({
    ...plan.slides[0],
    objects: [{ ...plan.slides[0].objects[0] }],
  });

  const errors = validateDeckPlan(plan);
  assert.ok(errors.some((error) => error.code === 'slide.id_duplicate'));
  assert.ok(errors.some((error) => error.code === 'object.id_duplicate'));
});

test('diagram edges require explicit node ids', () => {
  const plan = validPlan();
  plan.slides[0].objects.push({
    id: 'obj_diagram',
    type: 'diagram',
    frame: { x: 1, y: 1, width: 4, height: 3 },
    accessibility: { altText: 'Service dependency diagram' },
    edges: [{ from: { nodeId: 'api' }, to: {} }],
  });

  const errors = validateDeckPlan(plan);
  assert.ok(errors.some((error) => error.code === 'diagram.endpoint_required'));
});

test('shipping promotion is evidence-gated', () => {
  assert.deepEqual(nextShippingStatus('RESEARCHED', {}), {
    status: 'RESEARCHED',
    blocked: true,
    target: 'SPECIFIED',
    missing: ['dossier', 'shippingContract'],
  });

  assert.deepEqual(nextShippingStatus('RESEARCHED', { dossier: true, shippingContract: true }), {
    status: 'SPECIFIED',
    blocked: false,
    target: null,
    missing: [],
  });

  assert.deepEqual(nextShippingStatus('CI_GREEN', { runtime: true }), {
    status: 'RUNTIME_VERIFIED',
    blocked: false,
    target: null,
    missing: [],
  });
});
