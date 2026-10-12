import test from 'node:test';
import assert from 'node:assert/strict';

import {
  planSuggestion,
  stableDigest,
  validateSessionPolicy
} from '../../../packages/interview-coach/src/policy.js';

const question = {
  question_id: 'q1',
  confidence: 0.95,
  ambiguity_state: 'clear',
  source_observation_ids: ['obs1']
};

function baseSession(overrides = {}) {
  return {
    mode: 'mock',
    consent: {
      recording_required: false,
      recording_state: 'not_required',
      assistance_policy: 'practice_only'
    },
    retention: {
      save_transcript: true
    },
    guardrails: {
      stealth_mode: false,
      proctoring_bypass: false,
      capture_exclusion_target: false
    },
    ...overrides
  };
}

test('mock practice allows STAR coaching', () => {
  const result = planSuggestion(baseSession(), question, 'STAR');
  assert.equal(result.decision, 'allow');
  assert.deepEqual(result.evidence_refs, ['obs1']);
});

test('live allowed-assist refuses when policy is not explicitly allowed', () => {
  const result = planSuggestion(
    baseSession({ mode: 'allowed-assist' }),
    question,
    'answer'
  );
  assert.equal(result.decision, 'refuse');
  assert.ok(result.reasons.includes('live_assistance_not_explicitly_allowed'));
});

test('live allowed-assist permits bounded assistance when explicitly allowed', () => {
  const result = planSuggestion(
    baseSession({
      mode: 'allowed-assist',
      consent: {
        recording_required: false,
        recording_state: 'not_required',
        assistance_policy: 'explicitly_allowed'
      }
    }),
    question,
    'hint'
  );
  assert.equal(result.decision, 'allow');
});

test('stealth capability is rejected', () => {
  const policy = validateSessionPolicy(
    baseSession({
      guardrails: {
        stealth_mode: true,
        proctoring_bypass: false,
        capture_exclusion_target: false
      }
    })
  );
  assert.equal(policy.ok, false);
  assert.ok(policy.errors.includes('stealth_mode_forbidden'));
});

test('proctoring bypass capability is rejected', () => {
  const policy = validateSessionPolicy(
    baseSession({
      guardrails: {
        stealth_mode: false,
        proctoring_bypass: true,
        capture_exclusion_target: false
      }
    })
  );
  assert.equal(policy.ok, false);
  assert.ok(policy.errors.includes('proctoring_bypass_forbidden'));
});

test('recording consent is required when configured', () => {
  const policy = validateSessionPolicy(
    baseSession({
      consent: {
        recording_required: true,
        recording_state: 'pending',
        assistance_policy: 'practice_only'
      }
    })
  );
  assert.equal(policy.ok, false);
  assert.ok(policy.errors.includes('recording_consent_required'));
});

test('ambiguous question returns clarify instead of answer', () => {
  const result = planSuggestion(
    baseSession(),
    { ...question, confidence: 0.4, ambiguity_state: 'ambiguous' },
    'answer'
  );
  assert.equal(result.decision, 'clarify');
  assert.ok(result.reasons.includes('question_uncertain'));
});

test('interviewer mode cannot request candidate answer mode', () => {
  const result = planSuggestion(
    baseSession({ mode: 'interviewer' }),
    question,
    'answer'
  );
  assert.equal(result.decision, 'refuse');
  assert.ok(result.reasons.includes('suggestion_mode_not_allowed_for_session'));
});

test('canonical digests are stable across key order', () => {
  const a = stableDigest({ b: 2, a: { y: 2, x: 1 } });
  const b = stableDigest({ a: { x: 1, y: 2 }, b: 2 });
  assert.equal(a, b);
});
