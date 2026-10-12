import { createHash } from 'node:crypto';

const SESSION_MODES = new Set([
  'mock',
  'allowed-assist',
  'interviewer',
  'practice-lab',
  'review'
]);

const CANDIDATE_SUGGESTIONS = new Set([
  'hint',
  'outline',
  'STAR',
  'answer',
  'code-coach',
  'diagram'
]);

const INTERVIEWER_SUGGESTIONS = new Set(['rubric', 'follow-up']);
const REVIEW_SUGGESTIONS = new Set(['feedback', 'review-card']);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

export function stableDigest(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

export function validateSessionPolicy(session) {
  const errors = [];
  if (!session || typeof session !== 'object') errors.push('session_required');
  if (!SESSION_MODES.has(session?.mode)) errors.push('unsupported_session_mode');

  const guardrails = session?.guardrails ?? {};
  if (guardrails.stealth_mode === true) errors.push('stealth_mode_forbidden');
  if (guardrails.proctoring_bypass === true) errors.push('proctoring_bypass_forbidden');
  if (guardrails.capture_exclusion_target === true) errors.push('capture_exclusion_target_forbidden');

  if (
    session?.consent?.recording_required === true &&
    session?.consent?.recording_state !== 'acknowledged'
  ) {
    errors.push('recording_consent_required');
  }

  if (
    session?.mode === 'allowed-assist' &&
    session?.consent?.assistance_policy !== 'explicitly_allowed'
  ) {
    errors.push('live_assistance_not_explicitly_allowed');
  }

  return {
    ok: errors.length === 0,
    errors,
    policy_digest: stableDigest({
      mode: session?.mode ?? null,
      consent: session?.consent ?? null,
      retention: session?.retention ?? null,
      guardrails
    })
  };
}

export function planSuggestion(session, question, requestedMode) {
  const policy = validateSessionPolicy(session);
  if (!policy.ok) {
    return {
      decision: 'refuse',
      reasons: policy.errors,
      policy_digest: policy.policy_digest
    };
  }

  if (!question || typeof question !== 'object' || !question.question_id) {
    return {
      decision: 'refuse',
      reasons: ['question_required'],
      policy_digest: policy.policy_digest
    };
  }

  if (question.ambiguity_state === 'ambiguous' || question.confidence < 0.55) {
    return {
      decision: 'clarify',
      reasons: ['question_uncertain'],
      policy_digest: policy.policy_digest,
      question_id: question.question_id
    };
  }

  const mode = session.mode;
  let allowed = false;

  if (mode === 'mock' || mode === 'practice-lab') {
    allowed = CANDIDATE_SUGGESTIONS.has(requestedMode);
  } else if (mode === 'allowed-assist') {
    allowed = CANDIDATE_SUGGESTIONS.has(requestedMode);
  } else if (mode === 'interviewer') {
    allowed = INTERVIEWER_SUGGESTIONS.has(requestedMode);
  } else if (mode === 'review') {
    allowed = REVIEW_SUGGESTIONS.has(requestedMode);
  }

  if (!allowed) {
    return {
      decision: 'refuse',
      reasons: ['suggestion_mode_not_allowed_for_session'],
      policy_digest: policy.policy_digest,
      question_id: question.question_id
    };
  }

  return {
    decision: 'allow',
    reasons: [],
    policy_digest: policy.policy_digest,
    question_id: question.question_id,
    suggestion_mode: requestedMode,
    evidence_refs: [...(question.source_observation_ids ?? [])]
  };
}
