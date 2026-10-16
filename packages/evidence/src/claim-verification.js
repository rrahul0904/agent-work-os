import { RESEARCH_CONTRACT_VERSION, sha256, stableJson } from './research-workspace.js';

export const CLAIM_VERIFICATION_STATUSES = Object.freeze([
  'entailed',
  'contradicted',
  'insufficient',
  'not_checked',
]);

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function requireScore(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError('score must be null or a finite number between 0 and 1');
  }
  return value;
}

function payloadFromVerification(verification) {
  const { receiptSha256: _receiptSha256, ...payload } = verification;
  return payload;
}

export function validateClaimVerificationReceipt(verification) {
  if (!verification || typeof verification !== 'object') return false;
  if (verification.contractVersion !== RESEARCH_CONTRACT_VERSION) return false;
  if (!CLAIM_VERIFICATION_STATUSES.includes(verification.status)) return false;
  if (typeof verification.receiptSha256 !== 'string' || verification.receiptSha256.length !== 64) return false;
  if (!Array.isArray(verification.evidence) || verification.evidence.length === 0) return false;
  if (!Array.isArray(verification.reasonCodes)) return false;

  try {
    requireString(verification.workspaceId, 'verification.workspaceId');
    requireString(verification.claimId, 'verification.claimId');
    requireString(verification.claimTextSha256, 'verification.claimTextSha256');
    requireString(verification.verifierId, 'verification.verifierId');
    requireString(verification.verifierRevision, 'verification.verifierRevision');
    requireString(verification.method, 'verification.method');
    requireScore(verification.score);
    for (const item of verification.evidence) {
      requireString(item?.spanId, 'verification.evidence.spanId');
      requireString(item?.documentId, 'verification.evidence.documentId');
      requireString(item?.sourceId, 'verification.evidence.sourceId');
      requireString(item?.revision, 'verification.evidence.revision');
      requireString(item?.quoteSha256, 'verification.evidence.quoteSha256');
    }
    for (const code of verification.reasonCodes) requireString(code, 'verification.reasonCode');
  } catch {
    return false;
  }

  return verification.receiptSha256 === sha256(stableJson(payloadFromVerification(verification)));
}

export function createClaimVerification({
  workspaceId,
  claim,
  evidenceSpans,
  verifierId,
  verifierRevision,
  method,
  status,
  score = null,
  reasonCodes = [],
}) {
  requireString(workspaceId, 'workspaceId');
  if (!claim || claim.workspaceId !== workspaceId) {
    throw new Error('claim must belong to the verification workspace');
  }
  requireString(claim.claimId, 'claim.claimId');
  requireString(verifierId, 'verifierId');
  requireString(verifierRevision, 'verifierRevision');
  requireString(method, 'method');
  if (!CLAIM_VERIFICATION_STATUSES.includes(status)) {
    throw new TypeError(`status must be one of: ${CLAIM_VERIFICATION_STATUSES.join(', ')}`);
  }
  if (!Array.isArray(evidenceSpans) || evidenceSpans.length === 0) {
    throw new TypeError('evidenceSpans must contain at least one span');
  }
  if (!Array.isArray(reasonCodes)) {
    throw new TypeError('reasonCodes must be an array');
  }

  const allowedSpanIds = new Set(claim.evidenceSpanIds);
  const evidence = evidenceSpans
    .map((span) => {
      if (!span || span.workspaceId !== workspaceId) {
        throw new Error('evidence span must belong to the verification workspace');
      }
      if (!allowedSpanIds.has(span.spanId)) {
        throw new Error(`evidence span ${span.spanId} is not linked to claim ${claim.claimId}`);
      }
      return {
        spanId: span.spanId,
        documentId: span.documentId,
        sourceId: span.sourceId,
        revision: span.revision,
        quoteSha256: span.quoteSha256,
      };
    })
    .sort((a, b) => a.spanId.localeCompare(b.spanId));

  const payload = {
    contractVersion: RESEARCH_CONTRACT_VERSION,
    workspaceId,
    claimId: claim.claimId,
    claimTextSha256: sha256(claim.text),
    verifierId,
    verifierRevision,
    method,
    status,
    score: requireScore(score),
    reasonCodes: [...new Set(reasonCodes.map((code) => requireString(code, 'reasonCode')))].sort(),
    evidence,
  };

  return Object.freeze({
    ...payload,
    receiptSha256: sha256(stableJson(payload)),
  });
}

export function evaluateSemanticGate({ workspaceId, claims, verifications }) {
  requireString(workspaceId, 'workspaceId');
  if (!Array.isArray(claims) || !Array.isArray(verifications)) {
    throw new TypeError('claims and verifications must be arrays');
  }

  const claimIds = new Set();
  const claimTextHashes = new Map();
  for (const claim of claims) {
    if (!claim || claim.workspaceId !== workspaceId) {
      throw new Error('every claim must belong to the semantic-gate workspace');
    }
    if (claimIds.has(claim.claimId)) throw new Error(`duplicate claim id: ${claim.claimId}`);
    claimIds.add(claim.claimId);
    claimTextHashes.set(claim.claimId, sha256(claim.text));
  }

  const byClaim = new Map();
  for (const verification of verifications) {
    if (!validateClaimVerificationReceipt(verification)) {
      throw new Error(`invalid claim verification receipt: ${verification?.claimId ?? 'unknown'}`);
    }
    if (verification.workspaceId !== workspaceId) {
      throw new Error('every verification must belong to the semantic-gate workspace');
    }
    if (!claimIds.has(verification.claimId)) {
      throw new Error(`verification references unknown claim: ${verification.claimId}`);
    }
    if (verification.claimTextSha256 !== claimTextHashes.get(verification.claimId)) {
      throw new Error(`verification claim text drift detected: ${verification.claimId}`);
    }
    if (byClaim.has(verification.claimId)) {
      throw new Error(`duplicate verification for claim: ${verification.claimId}`);
    }
    byClaim.set(verification.claimId, verification);
  }

  const counts = {
    entailed: 0,
    contradicted: 0,
    insufficient: 0,
    not_checked: 0,
    missing: 0,
  };

  for (const claim of claims) {
    const verification = byClaim.get(claim.claimId);
    if (!verification) {
      counts.missing += 1;
      continue;
    }
    counts[verification.status] += 1;
  }

  const ok = claims.length > 0
    && counts.entailed === claims.length
    && counts.contradicted === 0
    && counts.insufficient === 0
    && counts.not_checked === 0
    && counts.missing === 0;

  return Object.freeze({
    ok,
    gate: ok ? 'SEMANTIC_EVIDENCE_VERIFIED' : 'SEMANTIC_EVIDENCE_UNVERIFIED',
    workspaceId,
    counts: Object.freeze(counts),
  });
}
