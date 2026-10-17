import test from 'node:test';
import assert from 'node:assert/strict';

import {
  executeLocalAutomationFlow,
  localAutomationFlowDigest,
  reconcileLocalAutomationRun,
  resolveAutomationTarget,
  validateLocalAutomationFlow,
  verifyAutomationReceiptChain,
} from '../src/local-automation-studio.js';

function mixedFlow(overrides = {}) {
  return {
    version: 'local-automation-flow/v1',
    id: 'invoice-transfer',
    nodes: [
      { id: 'start', kind: 'trigger.manual', config: {} },
      { id: 'open', kind: 'browser.navigate', config: { url: 'https://example.test/invoices' } },
      {
        id: 'download',
        kind: 'browser.click',
        config: {
          selectorCandidates: [
            { kind: 'roleName', value: 'button:Download invoice' },
            { kind: 'image', value: 'download-button.png', minConfidence: 0.95 },
          ],
        },
      },
      {
        id: 'import',
        kind: 'desktop.click',
        config: {
          selectorCandidates: [
            { kind: 'automationId', value: 'Accounting.ImportButton' },
            { kind: 'ocr', value: 'Import', minConfidence: 0.95 },
          ],
        },
      },
    ],
    edges: [
      { from: 'start', to: 'open' },
      { from: 'open', to: 'download' },
      { from: 'download', to: 'import' },
    ],
    ...overrides,
  };
}

test('validates and executes one flow across browser and desktop adapters', async () => {
  const flow = mixedFlow();
  const calls = [];
  const clockValues = [
    '2026-10-07T19:00:00.000Z',
    '2026-10-07T19:00:01.000Z',
    '2026-10-07T19:00:02.000Z',
  ];
  const adapters = {
    browser: {
      async observe(node) {
        return node.id === 'download'
          ? [{ kind: 'roleName', value: 'button:Download invoice', targetId: 'browser-download' }]
          : [];
      },
      async execute(node, target) {
        calls.push(['browser', node.id, target?.targetId ?? null]);
        return { ok: true, node: node.id };
      },
    },
    desktop: {
      async observe() {
        return [{ kind: 'automationId', value: 'Accounting.ImportButton', targetId: 'desktop-import' }];
      },
      async execute(node, target) {
        calls.push(['desktop', node.id, target?.targetId ?? null]);
        return { ok: true, node: node.id };
      },
    },
  };

  assert.equal(validateLocalAutomationFlow(flow).valid, true);
  const run = await executeLocalAutomationFlow(flow, {
    adapters,
    clock: () => clockValues.shift(),
  });

  assert.equal(run.status, 'completed');
  assert.deepEqual(calls, [
    ['browser', 'open', null],
    ['browser', 'download', 'browser-download'],
    ['desktop', 'import', 'desktop-import'],
  ]);
  assert.equal(run.receipts.length, 3);
  assert.equal(verifyAutomationReceiptChain(run.receipts, run.flowDigest), true);
});

test('flow digest is stable across object key ordering', () => {
  const a = mixedFlow();
  const b = {
    edges: a.edges.map((edge) => ({ to: edge.to, from: edge.from })),
    nodes: a.nodes.map((node) => ({ config: node.config, kind: node.kind, id: node.id })),
    id: a.id,
    version: a.version,
  };
  assert.equal(localAutomationFlowDigest(a), localAutomationFlowDigest(b));
});

test('embedded secret-like values are refused but external secret references are allowed', () => {
  const unsafe = mixedFlow();
  unsafe.nodes[1] = {
    ...unsafe.nodes[1],
    config: { ...unsafe.nodes[1].config, apiKey: 'plaintext-key' },
  };
  assert.throws(() => validateLocalAutomationFlow(unsafe), { code: 'inline_secret_forbidden' });

  const safe = mixedFlow();
  safe.nodes[1] = {
    ...safe.nodes[1],
    config: { ...safe.nodes[1].config, apiKey: 'secret://invoice-api-key' },
  };
  assert.equal(validateLocalAutomationFlow(safe).valid, true);
});

test('semantic selector outranks image fallback even when image was recorded first', () => {
  const resolution = resolveAutomationTarget(
    [
      { kind: 'image', value: 'submit.png', minConfidence: 0.9 },
      { kind: 'roleName', value: 'button:Submit' },
    ],
    [
      { kind: 'image', value: 'submit.png', targetId: 'image-target', confidence: 0.99 },
      { kind: 'roleName', value: 'button:Submit', targetId: 'semantic-target', confidence: 1 },
    ],
  );
  assert.equal(resolution.targetId, 'semantic-target');
  assert.equal(resolution.selectorKind, 'roleName');
});

test('missing primary selector recovers to one eligible fallback with provenance', () => {
  const resolution = resolveAutomationTarget(
    [
      { kind: 'automationId', value: 'SaveButton' },
      { kind: 'ocr', value: 'Save', minConfidence: 0.95 },
    ],
    [{ kind: 'ocr', value: 'Save', targetId: 'ocr-save', confidence: 0.98 }],
  );
  assert.equal(resolution.targetId, 'ocr-save');
  assert.equal(resolution.fallbackUsed, true);
  assert.deepEqual(
    resolution.attempts.map((attempt) => [attempt.kind, attempt.matches]),
    [
      ['automationId', 0],
      ['ocr', 1],
    ],
  );
});

test('ambiguous high-confidence selector fails closed instead of silently choosing another target', () => {
  assert.throws(
    () =>
      resolveAutomationTarget(
        [
          { kind: 'roleName', value: 'button:Continue' },
          { kind: 'image', value: 'continue.png', minConfidence: 0.9 },
        ],
        [
          { kind: 'roleName', value: 'button:Continue', targetId: 'left' },
          { kind: 'roleName', value: 'button:Continue', targetId: 'right' },
          { kind: 'image', value: 'continue.png', targetId: 'image', confidence: 0.99 },
        ],
      ),
    { code: 'target_ambiguous' },
  );
});

test('no selector match fails explicitly as target_not_found', () => {
  assert.throws(
    () => resolveAutomationTarget([{ kind: 'automationId', value: 'Missing' }], []),
    { code: 'target_not_found' },
  );
});

test('receipt verification detects tampering', async () => {
  const flow = mixedFlow();
  const adapters = {
    browser: {
      async observe() {
        return [{ kind: 'roleName', value: 'button:Download invoice', targetId: 'download' }];
      },
      async execute() {
        return { ok: true };
      },
    },
    desktop: {
      async observe() {
        return [{ kind: 'automationId', value: 'Accounting.ImportButton', targetId: 'import' }];
      },
      async execute() {
        return { ok: true };
      },
    },
  };
  let tick = 0;
  const run = await executeLocalAutomationFlow(flow, {
    adapters,
    clock: () => `2026-10-07T19:00:0${tick++}.000Z`,
  });
  assert.equal(verifyAutomationReceiptChain(run.receipts, run.flowDigest), true);

  const tampered = structuredClone(run.receipts);
  tampered[1].status = 'failed';
  assert.equal(verifyAutomationReceiptChain(tampered, run.flowDigest), false);
});

test('restart reconciliation never fabricates completion for an in-flight run', () => {
  const reconciled = reconcileLocalAutomationRun({
    version: 'local-automation-run/v1',
    flowId: 'invoice-transfer',
    flowDigest: 'abc',
    status: 'running',
    activeNodeId: 'import',
    receipts: [],
  });
  assert.equal(reconciled.status, 'interrupted');
  assert.equal(reconciled.activeNodeId, 'import');
  assert.equal(reconciled.interruptionReason, 'restart_without_live_execution_proof');
});

test('Phase A rejects arbitrary graph cycles instead of pretending loop semantics', () => {
  const flow = mixedFlow();
  flow.edges.push({ from: 'import', to: 'open' });
  assert.throws(() => validateLocalAutomationFlow(flow), { code: 'flow_cycle_forbidden_phase_a' });
});
