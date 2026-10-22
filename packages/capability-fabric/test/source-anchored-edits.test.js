import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageSourceEdit, previewSourceEdit, compileApprovedEdit, EditContractError } from '../src/source-anchored-edits.js';

const content = 'function double(x) { return x * 2; }\n';
const headSha = 'a'.repeat(40);
const args = { repoId: 'repo-1', worktreeId: 'tree-1', sessionId: 'session-1', headSha, filePath: 'src/math.js', baseContent: content, startOffset: 32, endOffset: 33, replacement: '3', proposalId: 'proposal-1' };
const staged = () => stageSourceEdit(args);
const snapshot = () => ({ currentContent: content, currentHeadSha: headSha });
const approval = p => ({ grantId: 'grant-1', decision: 'approve', action: 'inline-edit.apply', proposalId: p.proposalId, sessionId: p.sessionId, repoId: p.repoId, worktreeId: p.worktreeId, headSha: p.headSha, filePath: p.filePath, expectedFileSha256: p.baseFileSha256, proposalSha256: p.proposalSha256, expiresAt: '2030-01-01T00:00:00.000Z' });
const rejects = (fn, code) => assert.throws(fn, e => e instanceof EditContractError && e.code === code);

test('preview is side-effect-free and anchored to full content', () => {
  const p = staged();
  const out = previewSourceEdit(p, snapshot());
  assert.equal(out.before, '2');
  assert.equal(out.nextContent, content.replace('2;', '3;'));
  assert.equal(content, args.baseContent);
});
test('rejects path traversal, absolute and Windows escape paths', () => {
  for (const filePath of ['../outside', '/root/secret', 'C:\\temp\\danger.js', 'src/../a.js', 'src//a.js', 'src/./a.js']) rejects(() => stageSourceEdit({ ...args, filePath }), 'unsafe_path');
});
test('rejects stale file, wrong head, and dirty editor', () => {
  const p = staged();
  rejects(() => previewSourceEdit(p, { ...snapshot(), currentContent: content + 'x' }), 'file_changed');
  rejects(() => previewSourceEdit(p, { ...snapshot(), currentHeadSha: 'b'.repeat(40) }), 'head_changed');
  rejects(() => previewSourceEdit(p, { ...snapshot(), hasUnsavedBuffer: true }), 'unsaved_buffer_conflict');
});
test('rejects tampered proposal content after approval', () => {
  const p = staged();
  rejects(() => previewSourceEdit({ ...p, replacement: 'EVIL' }, snapshot()), 'proposal_tampered');
});
test('rejects invalid range and cut through surrogate pair', () => {
  rejects(() => stageSourceEdit({ ...args, endOffset: 200 }), 'range_invalid');
  rejects(() => stageSourceEdit({ ...args, baseContent: 'a😀z', startOffset: 2, endOffset: 2 }), 'range_splits_unicode');
});
test('refuses unauthenticated and mismatched grants', () => {
  const p = staged();
  rejects(() => compileApprovedEdit(p, snapshot(), approval(p), {}), 'grant_authority_missing');
  rejects(() => compileApprovedEdit(p, snapshot(), { ...approval(p), worktreeId: 'other' }, { consumeApprovedGrant: () => true }), 'grant_invalid');
  rejects(() => compileApprovedEdit(p, snapshot(), approval(p), { consumeApprovedGrant: () => false }), 'grant_rejected');
  rejects(() => compileApprovedEdit(p, snapshot(), { ...approval(p), expiresAt: '2020-01-01T00:00:00Z' }, { consumeApprovedGrant: () => true }), 'grant_invalid');
});
test('approved compilation produces an exact-scoped write intent, not a filesystem write', () => {
  const p = staged();
  let consumed = 0;
  const intent = compileApprovedEdit(p, snapshot(), approval(p), { consumeApprovedGrant: () => { consumed++; return true; }, now: Date.parse('2026-10-22T00:00:00Z') });
  assert.equal(consumed, 1);
  assert.equal(intent.action, 'atomic-compare-and-swap-file/v1');
  assert.equal(intent.nextContent, content.replace('2;', '3;'));
  assert.equal(intent.filePath, 'src/math.js');
});
