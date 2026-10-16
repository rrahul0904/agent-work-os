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
  for (const claim of claims) {
    if (!claim || claim.workspaceId !== workspaceId) {
      throw new Error('every claim must belong to the semantic-gate workspace');
    }
    if (claimIds.has(claim.claimId)) throw new Error(`duplicate claim id: ${claim.claimId}`);
    claimIds.add(claim.claimId);
  }

  const byClaim = new Map();
  for (const verification of verifications) {
    if (!verification || verification.workspaceId !== workspaceId) {
      throw new Error('every verification must belong to the semantic-gate workspace');
    }
    if (!claimIds.has(verification.claimId)) {
      throw new Error(`verification references unknown claim: ${verification.claimId}`);
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
