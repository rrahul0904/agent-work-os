import test from 'node:test';
import assert from 'node:assert/strict';

import { certifySource } from '../src/source-intake.js';

const policy = {
  minAgeDays: 30,
  minimumEvidenceItems: 1,
  requiredSignals: ['publicBuildEvidence', 'usedByOthers'],
};

function candidate(overrides = {}) {
  return {
    name: 'Example donor',
    url: 'https://example.com/product',
    observedAt: '2026-10-07T20:00:00Z',
    observedLive: true,
    ageDays: 45,
    signals: {
      publicBuildEvidence: true,
      usedByOthers: true,
    },
    evidence: [
      {
        class: 'first-party-public',
        uri: 'https://example.com/about',
        observedAt: '2026-10-07T20:00:00Z',
      },
      {
        class: 'official-source',
        uri: 'https://github.com/example/project',
        observedAt: '2026-10-07T20:00:00Z',
      },
    ],
    ...overrides,
  };
}

test('accepts a candidate only when all required facts are affirmative', () => {
  const receipt = certifySource(candidate(), policy);
  assert.equal(receipt.decision, 'accept');
  assert.equal(receipt.authority, 'read-only-certification');
  assert.deepEqual(receipt.hardFailures, []);
  assert.deepEqual(receipt.reviewReasons, []);
  assert.match(receipt.receiptId, /^[a-f0-9]{64}$/);
});

test('receipt is deterministic even when evidence arrives in a different order', () => {
  const first = candidate();
  const second = candidate({ evidence: [...first.evidence].reverse() });
  assert.equal(certifySource(first, policy).receiptId, certifySource(second, policy).receiptId);
});

test('observed dead source is a hard reject', () => {
  const receipt = certifySource(candidate({ observedLive: false }), policy);
  assert.equal(receipt.decision, 'reject');
  assert.ok(receipt.hardFailures.includes('source-observed-dead'));
});

test('uncertain required evidence becomes review rather than accidental acceptance', () => {
  const receipt = certifySource(
    candidate({
      signals: { publicBuildEvidence: true },
      evidence: [],
    }),
    policy,
  );
  assert.equal(receipt.decision, 'review');
  assert.ok(receipt.reviewReasons.includes('insufficient-evidence'));
  assert.ok(receipt.reviewReasons.includes('signal-unverified:usedByOthers'));
});

test('candidate below configured minimum age is rejected', () => {
  const receipt = certifySource(candidate({ ageDays: 12 }), policy);
  assert.equal(receipt.decision, 'reject');
  assert.ok(receipt.hardFailures.includes('source-younger-than-30-days'));
});

test('explicitly failed required signal is rejected', () => {
  const receipt = certifySource(
    candidate({ signals: { publicBuildEvidence: false, usedByOthers: true } }),
    policy,
  );
  assert.equal(receipt.decision, 'reject');
  assert.ok(receipt.hardFailures.includes('signal-failed:publicBuildEvidence'));
});

test('URL credentials are refused so secrets cannot enter receipts', () => {
  assert.throws(
    () => certifySource(candidate({ url: 'https://token@example.com/product' }), policy),
    /must not contain URL credentials/,
  );
  assert.throws(
    () =>
      certifySource(
        candidate({
          evidence: [
            {
              class: 'official-source',
              uri: 'https://secret@example.com/repo',
            },
          ],
        }),
        policy,
      ),
    /must not contain URL credentials/,
  );
});

test('unsupported evidence classes are rejected as invalid input', () => {
  assert.throws(
    () =>
      certifySource(
        candidate({
          evidence: [{ class: 'trust-me', uri: 'https://example.com/evidence' }],
        }),
        policy,
      ),
    /unsupported evidence class/,
  );
});
