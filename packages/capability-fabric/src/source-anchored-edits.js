/**
 * Agent Work OS — source-anchored edit contract (original implementation).
 * This module NEVER writes to disk and NEVER authenticates a client by itself.
 * The privileged local daemon must validate approval and perform a separate
 * atomic compare-and-swap write without following symlinks.
 */
import { createHash, randomUUID } from 'node:crypto';

export const EDIT_CONTRACT_VERSION = 'source-anchored-edit/v1';
const MAX_CHARS = 2_000_000;
const HEX_SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i;

export class EditContractError extends Error {
  constructor(code) {
    super(code);
    this.name = 'EditContractError';
    this.code = code;
  }
}

const fail = (code) => { throw new EditContractError(code); };
const isText = (s, max = 512) => typeof s === 'string' && s.length > 0 && s.length <= max && !/[\u0000-\u001f]/.test(s);
const fileHash = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const proposalDigest = p => fileHash(JSON.stringify([p.version, p.proposalId, p.repoId, p.worktreeId, p.sessionId, p.headSha, p.filePath, p.baseFileSha256, p.startOffset, p.endOffset, p.expectedText, p.replacement]));

export function assertRepoRelativePath(filePath) {
  if (!isText(filePath, 1024) || filePath.includes('\\') || filePath.startsWith('/') || filePath.startsWith('~') || /^[a-z]:/i.test(filePath)) fail('unsafe_path');
  if (filePath.split('/').some(segment => !segment || segment === '.' || segment === '..')) fail('unsafe_path');
  return filePath;
}

function isMidSurrogate(text, offset) {
  if (offset <= 0 || offset >= text.length) return false;
  return /[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset]);
}

/** Stage an edit over exact UTF-16 offsets into a pinned full file snapshot. */
export function stageSourceEdit({ repoId, worktreeId, sessionId, headSha, filePath, baseContent, startOffset, endOffset, replacement, proposalId = randomUUID() }) {
  if (![repoId, worktreeId, sessionId].every(s => isText(s))) fail('scope_invalid');
  if (typeof headSha !== 'string' || !HEX_SHA.test(headSha)) fail('head_sha_invalid');
  assertRepoRelativePath(filePath);
  if (typeof baseContent !== 'string' || baseContent.length > MAX_CHARS || typeof replacement !== 'string' || replacement.length > MAX_CHARS) fail('content_invalid');
  if (!Number.isSafeInteger(startOffset) || !Number.isSafeInteger(endOffset) || startOffset < 0 || endOffset < startOffset || endOffset > baseContent.length) fail('range_invalid');
  if (isMidSurrogate(baseContent, startOffset) || isMidSurrogate(baseContent, endOffset)) fail('range_splits_unicode');
  if (!isText(proposalId)) fail('proposal_id_invalid');
  const draft = {
    version: EDIT_CONTRACT_VERSION,
    proposalId, repoId, worktreeId, sessionId, headSha, filePath,
    baseFileSha256: fileHash(baseContent), startOffset, endOffset,
    expectedText: baseContent.slice(startOffset, endOffset), replacement
  };
  return Object.freeze({ ...draft, proposalSha256: proposalDigest(draft) });
}

/** No side effects: stale worktree, dirty buffer and replaced code fail closed. */
export function previewSourceEdit(proposal, { currentContent, currentHeadSha, hasUnsavedBuffer = false }) {
  if (!proposal || proposal.version !== EDIT_CONTRACT_VERSION) fail('contract_invalid');
  assertRepoRelativePath(proposal.filePath);
  if (typeof proposal.expectedText !== 'string' || typeof proposal.replacement !== 'string' || proposal.replacement.length > MAX_CHARS || proposal.proposalSha256 !== proposalDigest(proposal)) fail('proposal_tampered');
  if (hasUnsavedBuffer) fail('unsaved_buffer_conflict');
  if (currentHeadSha !== proposal.headSha) fail('head_changed');
  if (typeof currentContent !== 'string' || currentContent.length > MAX_CHARS) fail('content_invalid');
  if (fileHash(currentContent) !== proposal.baseFileSha256) fail('file_changed');
  const { startOffset, endOffset, expectedText, replacement } = proposal;
  if (!Number.isSafeInteger(startOffset) || !Number.isSafeInteger(endOffset) || startOffset < 0 || endOffset < startOffset || endOffset > currentContent.length || currentContent.slice(startOffset, endOffset) !== expectedText) fail('anchor_invalid');
  const nextContent = currentContent.slice(0, startOffset) + replacement + currentContent.slice(endOffset);
  return Object.freeze({
    proposalId: proposal.proposalId, filePath: proposal.filePath,
    before: expectedText, after: replacement,
    expectedFileSha256: proposal.baseFileSha256,
    nextFileSha256: fileHash(nextContent), nextContent
  });
}

/**
 * Prepare a write INTENT only. `consumeApprovedGrant` must be a privileged
 * daemon callback that atomically authenticates, authorizes and consumes a
 * single-use grant. Never supply a renderer/client callback here.
 */
export function compileApprovedEdit(proposal, snapshot, grant, { consumeApprovedGrant, now = Date.now() }) {
  const preview = previewSourceEdit(proposal, snapshot);
  if (typeof consumeApprovedGrant !== 'function') fail('grant_authority_missing');
  if (!grant || grant.decision !== 'approve' || grant.action !== 'inline-edit.apply' ||
      grant.proposalId !== proposal.proposalId || grant.sessionId !== proposal.sessionId ||
      grant.repoId !== proposal.repoId || grant.worktreeId !== proposal.worktreeId ||
      grant.headSha !== proposal.headSha || grant.filePath !== proposal.filePath ||
      grant.expectedFileSha256 !== proposal.baseFileSha256 || grant.proposalSha256 !== proposal.proposalSha256 ||
      !isText(grant.grantId) || !Number.isFinite(Date.parse(grant.expiresAt)) || Date.parse(grant.expiresAt) <= now) fail('grant_invalid');
  // Required to validate signature/authority and consume nonce in one operation.
  if (consumeApprovedGrant(grant, proposal) !== true) fail('grant_rejected');
  return Object.freeze({
    action: 'atomic-compare-and-swap-file/v1', proposalId: proposal.proposalId, proposalSha256: proposal.proposalSha256,
    grantId: grant.grantId, repoId: proposal.repoId, worktreeId: proposal.worktreeId,
    sessionId: proposal.sessionId, headSha: proposal.headSha, filePath: proposal.filePath,
    expectedFileSha256: preview.expectedFileSha256,
    nextFileSha256: preview.nextFileSha256, nextContent: preview.nextContent
  });
}
