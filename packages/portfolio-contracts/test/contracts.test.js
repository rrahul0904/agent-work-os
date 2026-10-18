import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePromises, diffPromises, auditTestMapping, auditChangeApprovals, auditPortfolioContract } from '../src/index.js';

const original = `# Contract
- **OPS-001 — Health.** The service returns 503 when the database cannot be reached.
- **OPS-002 — Security.** Unauthenticated callers cannot access tenant data.`;
const revision = `# Contract
- **OPS-001 — Health.** The service returns 503 when storage cannot be reached.
- **OPS-003 — Privacy.** No customer data is sent to undeclared services.`;
const mapping = [
  { testId: 'health-fault-injection', promiseIds: ['OPS-001'] },
  { testId: 'auth-boundary', promiseIds: ['OPS-002'] }
];

test('reads numbered promises in deterministic order, with provenance', () => {
  const parsed = parsePromises(original);
  assert.deepEqual(parsed.map((p) => p.id), ['OPS-001', 'OPS-002']);
  assert.equal(parsed[0].source, 'CONTRACT.md');
  assert.match(parsed[0].text, /returns 503/);
});
test('rejects malformed, duplicate and empty promise declarations', () => {
  assert.throws(() => parsePromises(original + '\n- **OPS-001 — Other.** Duplicate.'), /duplicate/);
  assert.throws(() => parsePromises('- **OPS-004 — Bad.**'), /empty promise body/);
  assert.throws(() => parsePromises('- **OPS-004 — Broken** text'), /malformed/);
});
test('reports missing and unknown test mappings rather than silently passing', () => {
  assert.equal(auditTestMapping(parsePromises(original), mapping).status, 'MAPPED_UNVERIFIED');
  const insufficient = auditTestMapping(parsePromises(original), [{ testId: 't1', promiseIds: ['OPS-001', 'OPS-999'] }]);
  assert.deepEqual(insufficient.missing, ['OPS-002']);
  assert.deepEqual(insufficient.unknown, [{ testId: 't1', id: 'OPS-999' }]);
  assert.equal(insufficient.executionVerified, false);
});
test('produces explicit changed / removed / added history', () => {
  assert.deepEqual(diffPromises(parsePromises(original), parsePromises(revision)).map(({ id, type }) => [id, type]),
    [['OPS-001', 'changed'], ['OPS-002', 'removed'], ['OPS-003', 'added']]);
});
test('does not allow silent weakening or dropping a promise', () => {
  const changes = diffPromises(parsePromises(original), parsePromises(revision));
  assert.equal(auditChangeApprovals(changes).status, 'BLOCKED');
  const approvals = Object.fromEntries(changes.map((c) => [c.id, { type: c.type, reason: 'Reviewed owner decision', approvedBy: 'human-owner' }]));
  assert.equal(auditChangeApprovals(changes, approvals).status, 'APPROVED');
  assert.equal(auditChangeApprovals(changes, { ...approvals, 'GHOST-999': approvals['OPS-001'] }).status, 'BLOCKED');
});
test('static coverage alone never claims executed tests or a shipping authorization', () => {
  const report = auditPortfolioContract({ currentMarkdown: original, testMappings: mapping });
  assert.equal(report.readyForIndependentVerification, true);
  assert.equal(report.verification, 'NOT_RUN');
  assert.equal(report.shipping, 'NOT_AUTHORIZED');
});
test('fails closed on missing tests, missing approvals and invented approvals', () => {
  const report = auditPortfolioContract({ currentMarkdown: revision, previousMarkdown: original,
    testMappings: [{ testId: 'privacy', promiseIds: ['OPS-003'] }] });
  assert.equal(report.readyForIndependentVerification, false);
  assert.equal(report.changeApprovals.blocked.length, 3);
  assert.deepEqual(report.coverage.missing, ['OPS-001']);
});
test('parses a representative Lamp-style promise without using upstream code', () => {
  const p = parsePromises('- **PAGE-006 — Serving through a failure.** A failed read must not report an all-clear.');
  assert.equal(p[0].id, 'PAGE-006');
});
