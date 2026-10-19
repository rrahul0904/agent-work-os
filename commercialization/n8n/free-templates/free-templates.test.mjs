import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const root = new URL('./', import.meta.url);
const slugs = [
  'webhook-idempotency-dlq-starter',
  'lead-qualification-human-approval',
  'meeting-notes-task-extraction',
];
const workflow = (slug) => JSON.parse(readFileSync(new URL(`${slug}/workflow.json`, root), 'utf8'));

function executeCode(slug, suppliedInput) {
  const w = workflow(slug);
  const code = w.nodes.filter((node) => node.type === 'n8n-nodes-base.code');
  assert.equal(code.length, 1, `${slug} should have one Code node`);
  const result = runInNewContext(
    `(function () {\n${code[0].parameters.jsCode}\n})()`,
    { $json: structuredClone(suppliedInput) },
    { timeout: 1000 },
  );
  assert.ok(Array.isArray(result) && result.length === 1 && result[0].json);
  return JSON.parse(JSON.stringify(result[0].json));
}

for (const slug of slugs) {
  test(`${slug}: inactive, core nodes, and valid connection references`, () => {
    const w = workflow(slug);
    assert.equal(w.active, false);
    const names = new Set(w.nodes.map((node) => node.name));
    assert.equal(names.size, w.nodes.length);
    const allowed = new Set([
      'n8n-nodes-base.webhook',
      'n8n-nodes-base.code',
      'n8n-nodes-base.if',
      'n8n-nodes-base.respondToWebhook',
    ]);
    for (const node of w.nodes) {
      assert.ok(allowed.has(node.type), `unexpected node type ${node.type}`);
      assert.equal(Object.keys(node.credentials ?? {}).length, 0);
    }
    for (const [source, outputs] of Object.entries(w.connections ?? {})) {
      assert.ok(names.has(source), `connection source missing: ${source}`);
      for (const channel of Object.values(outputs)) {
        for (const branch of channel) {
          for (const target of branch) {
            assert.ok(names.has(target.node), `connection target missing: ${target.node}`);
          }
        }
      }
    }
  });
}

test('webhook: explicit idempotency key and ACCEPT route', () => {
  const actual = executeCode(slugs[0], { body: { idempotencyKey: 'order-123', payload: { orderId: 123 } } });
  assert.equal(actual.valid, true);
  assert.equal(actual.route, 'ACCEPT');
  assert.equal(actual.idempotencyKey, 'order-123');
});

test('webhook: invalid empty payload returns DLQ routing metadata', () => {
  const actual = executeCode(slugs[0], { body: { payload: {} } });
  assert.equal(actual.valid, false);
  assert.equal(actual.route, 'DLQ');
  assert.equal(actual.reason, 'empty-or-invalid-payload');
});

test('webhook: derived demo key is stable for property reordering', () => {
  const a = executeCode(slugs[0], { body: { payload: { x: 1, y: 2 } } });
  const b = executeCode(slugs[0], { body: { payload: { y: 2, x: 1 } } });
  assert.equal(a.idempotencyKey, b.idempotencyKey);
});

test('lead: expected deterministic score and human-review only', () => {
  const actual = executeCode(slugs[1], { body: {
    lead: { id: 'lead-1001', budgetScore: 4, urgencyScore: 3, fitScore: 5 },
    threshold: 18,
  } });
  assert.equal(actual.score, 24);
  assert.equal(actual.qualified, true);
  assert.equal(actual.humanApprovalRequired, true);
  assert.equal(actual.automatedOutreach, false);
});

test('lead: zero signals never qualifies automatically', () => {
  const actual = executeCode(slugs[1], { body: { lead: { id: 'zero' } } });
  assert.equal(actual.score, 0);
  assert.equal(actual.qualified, false);
  assert.equal(actual.automatedOutreach, false);
});

test('lead: component scoring is clamped to 0–5', () => {
  const actual = executeCode(slugs[1], { body: {
    lead: { budgetScore: 99, urgencyScore: -100, fitScore: 2 },
  } });
  assert.deepEqual(actual.components, { budget: 5, urgency: 0, fit: 2 });
});

test('meeting: explicit action lines become reviewable tasks', () => {
  const actual = executeCode(slugs[2], { body: {
    meetingId: 'weekly-ops-42',
    transcript: 'Reviewed launch readiness.\nACTION: Validate deployment.\nTODO: Confirm support coverage.',
  } });
  assert.equal(actual.meetingId, 'weekly-ops-42');
  assert.equal(actual.taskCount, 2);
  assert.deepEqual(actual.tasks.map((task) => task.text), ['Validate deployment.', 'Confirm support coverage.']);
  assert.equal(actual.humanReviewRecommended, true);
  assert.match(actual.summary, /Reviewed launch readiness/);
});

test('meeting: empty and oversized transcripts are rejected', () => {
  assert.throws(() => executeCode(slugs[2], { body: {} }), /transcript is required/);
  assert.throws(() => executeCode(slugs[2], { body: { transcript: 'x'.repeat(200001) } }),
    /transcript exceeds/);
});

test('meeting: task output is bounded at 50', () => {
  const actual = executeCode(slugs[2], { body: {
    transcript: Array.from({ length: 70 }, (_, i) => `TASK: Item ${i}`).join('\n'),
  } });
  assert.equal(actual.taskCount, 70);
  assert.equal(actual.tasks.length, 50);
});
