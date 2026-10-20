// Standalone, offline reference workflow for Agent Work OS.
// No network calls, no account operations, no requests sent. Synthetic fixtures only.
import { createHash } from 'node:crypto';

const CATEGORIES = new Set(['data_broker', 'old_account', 'exposed_contact', 'breach_notice', 'other']);
const REQUEST_TYPES = new Set(['deletion', 'sale_sharing_opt_out', 'account_closure', 'suppression', 'security_action']);
const JURISDICTIONS = new Set(['CA_US', 'UK', 'OTHER', 'UNDETERMINED']);
const TYPES = new Set(['ATTEST_SUBJECT', 'DRAFT_REQUEST', 'APPROVE_DRAFT', 'RECORD_SUBMISSION', 'RECORD_RESPONSE', 'RECHECK_VISIBILITY', 'MARK_FOLLOWUP']);
const ID = /^[a-z][a-z0-9_-]{2,63}$/;
const REF = /^[a-z][a-z0-9:_-]{2,79}$/;
const DOMAIN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fail(reason) { throw new Error(reason); }
function keys(value, exact) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid object');
  const actual = Object.keys(value).sort();
  const expected = [...exact].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`unexpected fields: expected ${expected.join(',')}`);
}
function token(value, kind = 'ref') {
  const re = kind === 'id' ? ID : REF;
  if (typeof value !== 'string' || !re.test(value)) fail(`invalid ${kind}; never use names, email addresses, phone numbers, URLs or secrets`);
  return value;
}
function domain(value) {
  if (typeof value !== 'string' || !DOMAIN.test(value) || value.includes('..')) fail('invalid domain: hostname only; no URL, path, identifier or IP');
  return value;
}
function clone(value) { return structuredClone(value); }

export function createCase(spec) {
  keys(spec, ['caseId', 'category', 'sourceDomain', 'sourceEvidenceRef', 'jurisdiction']);
  token(spec.caseId, 'id');
  if (!CATEGORIES.has(spec.category)) fail('invalid category');
  if (!JURISDICTIONS.has(spec.jurisdiction)) fail('invalid jurisdiction');
  domain(spec.sourceDomain);
  token(spec.sourceEvidenceRef);
  const source = clone(spec);
  return { source, state: 'NEEDS_SUBJECT_ATTESTATION', version: 0, draftRevision: 0,
    draft: null, approval: null, submission: null, response: null, visibility: null,
    events: [], headDigest: hash(['privacy-cleanup-case-v1', source]) };
}

function payloadFor(type, payload) {
  switch (type) {
    case 'ATTEST_SUBJECT':
      keys(payload, ['actor', 'attestationRef']);
      if (payload.actor !== 'subject') fail('only the subject may attest ownership');
      token(payload.attestationRef);
      break;
    case 'DRAFT_REQUEST':
      keys(payload, ['channelDomain', 'policyEvidenceRef', 'requestType']);
      domain(payload.channelDomain);
      token(payload.policyEvidenceRef);
      if (!REQUEST_TYPES.has(payload.requestType)) fail('invalid request type');
      break;
    case 'APPROVE_DRAFT':
      keys(payload, ['actor', 'approvalRef', 'draftDigest']);
      if (payload.actor !== 'subject') fail('subject approval required');
      token(payload.approvalRef);
      if (!/^[a-f0-9]{64}$/.test(payload.draftDigest)) fail('invalid digest');
      break;
    case 'RECORD_SUBMISSION':
      keys(payload, ['actor', 'confirmationRef', 'approvalDigest']);
      if (payload.actor !== 'subject') fail('subject must manually record submission');
      token(payload.confirmationRef);
      if (!/^[a-f0-9]{64}$/.test(payload.approvalDigest)) fail('invalid digest');
      break;
    case 'RECORD_RESPONSE':
      keys(payload, ['responseRef', 'outcome']);
      token(payload.responseRef);
      if (!['acknowledged', 'declined'].includes(payload.outcome)) fail('invalid outcome');
      break;
    case 'RECHECK_VISIBILITY':
      keys(payload, ['observationRef', 'method', 'outcome']);
      token(payload.observationRef);
      if (payload.method !== 'manual_public_recheck') fail('recheck must be manually evidenced');
      if (!['visible', 'not_visible'].includes(payload.outcome)) fail('invalid outcome');
      break;
    case 'MARK_FOLLOWUP':
      keys(payload, ['reasonRef']);
      token(payload.reasonRef);
      break;
    default: fail('unsupported action');
  }
}

// A pure reducer: input snapshots are never mutated. These actions only record evidence.
// Never interpret APPROVE_DRAFT or RECORD_SUBMISSION as permission to send automatically.
export function applyCaseEvent(snapshot, command) {
  keys(command, ['commandId', 'expectedVersion', 'type', 'payload']);
  token(command.commandId);
  if (!TYPES.has(command.type)) fail('unsupported action');
  payloadFor(command.type, command.payload);
  const commandDigest = hash(command);
  const previous = snapshot.events.find(e => e.command.commandId === command.commandId);
  if (previous) {
    if (previous.commandDigest !== commandDigest) fail('command id collision');
    return clone(snapshot); // exact idempotent replay
  }
  if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion !== snapshot.version) fail('stale version');
  const next = clone(snapshot);
  const p = command.payload;
  const s = snapshot.state;
  switch (command.type) {
    case 'ATTEST_SUBJECT':
      if (s !== 'NEEDS_SUBJECT_ATTESTATION') fail('attestation transition denied');
      next.state = 'SUBJECT_ATTESTED';
      break;
    case 'DRAFT_REQUEST':
      if (!['SUBJECT_ATTESTED', 'DRAFTED', 'APPROVED'].includes(s)) fail('draft transition denied');
      next.draftRevision++;
      next.draft = { channelDomain: p.channelDomain, requestType: p.requestType,
        policyEvidenceRef: p.policyEvidenceRef, revision: next.draftRevision };
      next.draft.digest = hash([snapshot.source.caseId, next.draft]);
      next.approval = null; // editing an approved draft invalidates the old approval
      next.state = 'DRAFTED';
      break;
    case 'APPROVE_DRAFT':
      if (s !== 'DRAFTED' || p.draftDigest !== snapshot.draft.digest) fail('approval must bind to current draft');
      next.approval = { approvalRef: p.approvalRef, digest: hash([snapshot.source.caseId, snapshot.draft.digest, p.approvalRef]) };
      next.state = 'APPROVED';
      break;
    case 'RECORD_SUBMISSION':
      if (s !== 'APPROVED' || p.approvalDigest !== snapshot.approval.digest) fail('manual submission requires matching approval');
      next.submission = { confirmationRef: p.confirmationRef, draftDigest: snapshot.draft.digest };
      next.state = 'SUBMISSION_RECORDED';
      break;
    case 'RECORD_RESPONSE':
      if (!['SUBMISSION_RECORDED', 'ACKNOWLEDGED', 'FOLLOWUP_DUE'].includes(s)) fail('response transition denied');
      next.response = { responseRef: p.responseRef, outcome: p.outcome };
      next.state = p.outcome === 'acknowledged' ? 'ACKNOWLEDGED' : 'FOLLOWUP_DUE';
      break;
    case 'RECHECK_VISIBILITY':
      if (!['SUBMISSION_RECORDED', 'ACKNOWLEDGED', 'FOLLOWUP_DUE', 'NOT_VISIBLE_OBSERVED'].includes(s)) fail('recheck transition denied');
      next.visibility = { observationRef: p.observationRef, outcome: p.outcome, method: p.method };
      next.state = p.outcome === 'not_visible' ? 'NOT_VISIBLE_OBSERVED' : 'FOLLOWUP_DUE';
      break;
    case 'MARK_FOLLOWUP':
      if (!['SUBMISSION_RECORDED', 'ACKNOWLEDGED', 'FOLLOWUP_DUE'].includes(s)) fail('follow-up transition denied');
      next.state = 'FOLLOWUP_DUE';
      break;
    default: fail('unsupported action');
  }
  const event = { command: clone(command), commandDigest, previousDigest: snapshot.headDigest,
    stateAfter: next.state, versionAfter: snapshot.version + 1 };
  event.digest = hash(event);
  next.version++;
  next.headDigest = event.digest;
  next.events.push(event);
  return next;
}

export function replayCase(spec, commands) {
  let current = createCase(spec);
  for (const command of commands) current = applyCaseEvent(current, command);
  return current;
}

export function verifyCaseReceipt(snapshot) {
  if (!Array.isArray(snapshot?.events) || !snapshot?.source) return false;
  try {
    const result = replayCase(snapshot.source, snapshot.events.map(e => e.command));
    return JSON.stringify(result) === JSON.stringify(snapshot);
  } catch { return false; }
}
