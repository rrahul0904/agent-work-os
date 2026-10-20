import test from 'node:test';
import assert from 'node:assert/strict';
import { createCase, applyCaseEvent, replayCase, verifyCaseReceipt } from '../src/index.js';

const spec = () => ({ caseId: 'case_example_1', category: 'data_broker', jurisdiction: 'UNDETERMINED', sourceDomain: 'example.test', sourceEvidenceRef: 'fixture:listing_1' });
function action(current, type, payload, id) {
  return applyCaseEvent(current, {commandId:id, expectedVersion:current.version, type, payload});
}
function drafted() {
  let c = createCase(spec());
  c = action(c, 'ATTEST_SUBJECT', {actor:'subject', attestationRef:'fixture:attestation_1'}, 'cmd_attest');
  c = action(c, 'DRAFT_REQUEST', {channelDomain:'example.test', policyEvidenceRef:'fixture:policy_1', requestType:'deletion'}, 'cmd_draft');
  return c;
}
function approved() {
  const c = drafted();
  return action(c, 'APPROVE_DRAFT', {actor:'subject', approvalRef:'fixture:approval_1', draftDigest:c.draft.digest}, 'cmd_approve');
}
function submitted() {
  const c = approved();
  return action(c, 'RECORD_SUBMISSION', {actor:'subject', confirmationRef:'fixture:confirmation_1', approvalDigest:c.approval.digest}, 'cmd_submit');
}

test('synthetic source case contains no direct PII or outbound capabilities', () => {
  const c = createCase(spec());
  assert.equal(c.state, 'NEEDS_SUBJECT_ATTESTATION');
  assert.equal(c.version, 0);
  assert.equal(typeof c.headDigest, 'string');
  assert.equal(verifyCaseReceipt(c), true);
});
test('reject unknown extra fields and raw URLs or contact identifiers', () => {
  assert.throws(() => createCase({...spec(), email:'person@example.test'}), /unexpected fields/);
  assert.throws(() => createCase({...spec(), sourceDomain:'https://example.test/private?id=1'}), /invalid domain/);
  assert.throws(() => createCase({...spec(), sourceEvidenceRef:'person@example.test'}), /invalid ref/);
});
test('do not draft without explicit subject attestation', () => {
  let c = createCase(spec());
  assert.throws(() => action(c,'DRAFT_REQUEST',{channelDomain:'example.test',policyEvidenceRef:'fixture:policy_1',requestType:'deletion'},'cmd_skip'), /transition denied/);
  assert.throws(() => action(c,'ATTEST_SUBJECT',{actor:'operator',attestationRef:'fixture:attestation_1'},'cmd_wrong'), /subject/);
});
test('approval must use current revision digest', () => {
  const c = drafted();
  assert.throws(()=>action(c,'APPROVE_DRAFT',{actor:'subject', approvalRef:'fixture:approval_1', draftDigest:'0'.repeat(64)},'cmd_fake'), /current draft/);
  assert.throws(()=>action(c,'APPROVE_DRAFT',{actor:'operator', approvalRef:'fixture:approval_1', draftDigest:c.draft.digest},'cmd_operator'), /subject approval/);
});
test('old approval invalidated by changing a draft', () => {
  const prior = approved();
  const c = action(prior, 'DRAFT_REQUEST', {channelDomain:'broker.example.test',policyEvidenceRef:'fixture:policy_2',requestType:'sale_sharing_opt_out'},'cmd_redraft');
  assert.equal(c.approval, null);
  assert.equal(c.state, 'DRAFTED');
  assert.notEqual(c.draft.digest, prior.draft.digest);
  assert.throws(()=>action(c,'RECORD_SUBMISSION',{actor:'subject',confirmationRef:'fixture:confirmation_1',approvalDigest:prior.approval.digest},'cmd_bypass'),/approval/);
});
test('no submission evidence without approval bound to the case and draft', () => {
  const c = approved();
  assert.throws(()=>action(c,'RECORD_SUBMISSION',{actor:'subject',confirmationRef:'fixture:confirmation_1',approvalDigest:'0'.repeat(64)},'cmd_wrongapproval'),/matching approval/);
  const done = submitted();
  assert.equal(done.state,'SUBMISSION_RECORDED');
  assert.equal(done.submission.confirmationRef,'fixture:confirmation_1');
});
test('a recorded submission or acknowledgement is not deletion', () => {
  const c = submitted();
  assert.notEqual(c.state,'NOT_VISIBLE_OBSERVED');
  const next = action(c,'RECORD_RESPONSE',{responseRef:'fixture:response_1',outcome:'acknowledged'},'cmd_response');
  assert.equal(next.state,'ACKNOWLEDGED');
  assert.equal(next.visibility, null);
});
test('visibility is explicitly observed, not a claim of verified erasure', () => {
  const c = submitted();
  assert.throws(()=>action(c,'RECHECK_VISIBILITY',{observationRef:'fixture:check_1',method:'ai_prediction',outcome:'not_visible'},'cmd_infer'),/manually evidenced/);
  let next = action(c,'RECHECK_VISIBILITY',{observationRef:'fixture:check_1',method:'manual_public_recheck',outcome:'not_visible'},'cmd_check');
  assert.equal(next.state,'NOT_VISIBLE_OBSERVED');
  next = action(next,'RECHECK_VISIBILITY',{observationRef:'fixture:check_2',method:'manual_public_recheck',outcome:'visible'},'cmd_reappeared');
  assert.equal(next.state,'FOLLOWUP_DUE');
});
test('an unsubmitted draft cannot be marked as removed', () => {
  const c = drafted();
  assert.throws(()=>action(c,'RECHECK_VISIBILITY',{observationRef:'fixture:check_1',method:'manual_public_recheck',outcome:'not_visible'},'cmd_premature'),/transition denied/);
});
test('idempotency and stale version protection', () => {
  const c = drafted();
  const command={commandId:'cmd_approve', expectedVersion:c.version, type:'APPROVE_DRAFT',payload:{actor:'subject',approvalRef:'fixture:approval_1',draftDigest:c.draft.digest}};
  const next=applyCaseEvent(c,command);
  assert.deepEqual(applyCaseEvent(next,command),next);
  assert.throws(()=>applyCaseEvent(next,{...command,payload:{...command.payload,approvalRef:'fixture:approval_2'}}),/collision/);
  assert.throws(()=>applyCaseEvent(next,{...command,commandId:'cmd_different'}),/stale version/);
});
test('tampering invalidates receipt and replay matches original', () => {
  const c = submitted();
  assert.equal(verifyCaseReceipt(c),true);
  const replayed=replayCase(spec(),c.events.map(e=>e.command));
  assert.deepEqual(replayed,c);
  const changed=structuredClone(c);
  changed.events[0].stateAfter='FAKE_VERIFIED_DELETED';
  assert.equal(verifyCaseReceipt(changed),false);
});
test('no cross-case re-use of approval fingerprint', () => {
  const a=approved();
  const different={...spec(),caseId:'case_example_2'};
  let b=createCase(different);
  b=action(b,'ATTEST_SUBJECT',{actor:'subject',attestationRef:'fixture:attestation_1'},'cmd_attest');
  b=action(b,'DRAFT_REQUEST',{channelDomain:'example.test',policyEvidenceRef:'fixture:policy_1',requestType:'deletion'},'cmd_draft');
  assert.notEqual(a.draft.digest,b.draft.digest);
  assert.throws(()=>action(b,'APPROVE_DRAFT',{actor:'subject',approvalRef:'fixture:approval_1',draftDigest:a.draft.digest},'cmd_approve'),/current draft/);
});
