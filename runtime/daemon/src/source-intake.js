import { createHash } from 'node:crypto';

const EVIDENCE_CLASSES = new Set([
  'official-doc',
  'official-source',
  'first-party-public',
  'community',
  'observed-runtime',
  'user-supplied',
]);

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function normalizePublicUrl(raw, label) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new TypeError(`${label} must be a non-empty URL string`);
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new TypeError(`${label} must be a valid URL`);
  }

  if (parsed.protocol !== 'https:') {
    throw new TypeError(`${label} must use https`);
  }
  if (parsed.username || parsed.password) {
    throw new TypeError(`${label} must not contain URL credentials`);
  }

  parsed.hash = '';
  return parsed.toString();
}

function normalizeEvidence(items = []) {
  if (!Array.isArray(items)) {
    throw new TypeError('candidate.evidence must be an array');
  }

  const normalized = items.map((item, index) => {
    assertPlainObject(item, `candidate.evidence[${index}]`);
    if (!EVIDENCE_CLASSES.has(item.class)) {
      throw new TypeError(`unsupported evidence class: ${item.class}`);
    }

    return {
      class: item.class,
      uri: normalizePublicUrl(item.uri, `candidate.evidence[${index}].uri`),
      observedAt: item.observedAt ?? null,
      note: item.note ?? null,
    };
  });

  normalized.sort((a, b) =>
    `${a.class}\u0000${a.uri}\u0000${a.observedAt ?? ''}\u0000${a.note ?? ''}`.localeCompare(
      `${b.class}\u0000${b.uri}\u0000${b.observedAt ?? ''}\u0000${b.note ?? ''}`,
    ),
  );
  return normalized;
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function receiptId(payload) {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

function normalizePolicy(policy = {}) {
  assertPlainObject(policy, 'policy');
  const minAgeDays = policy.minAgeDays ?? 0;
  if (!Number.isInteger(minAgeDays) || minAgeDays < 0) {
    throw new TypeError('policy.minAgeDays must be a non-negative integer');
  }

  const requiredSignals = policy.requiredSignals ?? [];
  if (!Array.isArray(requiredSignals) || requiredSignals.some((item) => typeof item !== 'string' || !item)) {
    throw new TypeError('policy.requiredSignals must be an array of non-empty strings');
  }

  const minimumEvidenceItems = policy.minimumEvidenceItems ?? 1;
  if (!Number.isInteger(minimumEvidenceItems) || minimumEvidenceItems < 0) {
    throw new TypeError('policy.minimumEvidenceItems must be a non-negative integer');
  }

  return {
    minAgeDays,
    minimumEvidenceItems,
    requiredSignals: [...new Set(requiredSignals)].sort(),
  };
}

/**
 * Certify already-collected public source facts.
 *
 * This function deliberately performs no network access and grants no write authority.
 * A discovery adapter may collect facts separately, but replaying the same facts and policy
 * through this function must always produce the same decision and receiptId.
 */
export function certifySource(candidate, rawPolicy = {}) {
  assertPlainObject(candidate, 'candidate');
  const policy = normalizePolicy(rawPolicy);

  if (typeof candidate.name !== 'string' || candidate.name.trim() === '') {
    throw new TypeError('candidate.name must be a non-empty string');
  }

  const normalized = {
    name: candidate.name.trim(),
    url: normalizePublicUrl(candidate.url, 'candidate.url'),
    observedAt: candidate.observedAt ?? null,
    observedLive: candidate.observedLive ?? null,
    ageDays: candidate.ageDays ?? null,
    signals: candidate.signals ?? {},
    evidence: normalizeEvidence(candidate.evidence),
  };
  assertPlainObject(normalized.signals, 'candidate.signals');

  if (normalized.ageDays !== null && (!Number.isInteger(normalized.ageDays) || normalized.ageDays < 0)) {
    throw new TypeError('candidate.ageDays must be null or a non-negative integer');
  }

  const hardFailures = [];
  const reviewReasons = [];

  if (normalized.observedLive === false) {
    hardFailures.push('source-observed-dead');
  } else if (normalized.observedLive !== true) {
    reviewReasons.push('source-liveness-unverified');
  }

  if (policy.minAgeDays > 0) {
    if (normalized.ageDays === null) {
      reviewReasons.push('source-age-unverified');
    } else if (normalized.ageDays < policy.minAgeDays) {
      hardFailures.push(`source-younger-than-${policy.minAgeDays}-days`);
    }
  }

  if (normalized.evidence.length < policy.minimumEvidenceItems) {
    reviewReasons.push('insufficient-evidence');
  }

  for (const signal of policy.requiredSignals) {
    if (!(signal in normalized.signals) || normalized.signals[signal] === null) {
      reviewReasons.push(`signal-unverified:${signal}`);
    } else if (normalized.signals[signal] !== true) {
      hardFailures.push(`signal-failed:${signal}`);
    }
  }

  const decision = hardFailures.length > 0 ? 'reject' : reviewReasons.length > 0 ? 'review' : 'accept';
  const payload = {
    contractVersion: 'source-intake/v1',
    authority: 'read-only-certification',
    candidate: normalized,
    policy,
    decision,
    hardFailures: [...hardFailures].sort(),
    reviewReasons: [...reviewReasons].sort(),
  };

  return Object.freeze({
    ...payload,
    receiptId: receiptId(payload),
  });
}

export const sourceIntakeEvidenceClasses = Object.freeze([...EVIDENCE_CLASSES].sort());
