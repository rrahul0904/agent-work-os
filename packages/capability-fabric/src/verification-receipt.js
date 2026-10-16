import { createHash } from 'node:crypto';

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

function digest(value) {
  const content = typeof value === 'string' ? value : JSON.stringify(sortValue(value));
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function payloadWithoutDigest(receipt) {
  const { receiptDigest: _receiptDigest, ...payload } = receipt;
  return payload;
}

export function validateCapabilityVerificationReceipt(receipt) {
  if (!receipt || receipt.schemaVersion !== '1') return false;
  if (typeof receipt.capabilityId !== 'string' || !receipt.capabilityId) return false;
  if (typeof receipt.capabilityVersion !== 'string' || !receipt.capabilityVersion) return false;
  if (typeof receipt.verificationMode !== 'string' || !receipt.verificationMode) return false;
  if (typeof receipt.harnessId !== 'string' || !receipt.harnessId) return false;
  if (typeof receipt.qualityThreshold !== 'number' || receipt.qualityThreshold < 0 || receipt.qualityThreshold > 1) return false;
  if (typeof receipt.score !== 'number' || receipt.score < 0 || receipt.score > 1) return false;
  if (typeof receipt.passed !== 'boolean') return false;
  if (!Array.isArray(receipt.cases) || !receipt.cases.length) return false;
  if (!receipt.source || typeof receipt.source.url !== 'string' || typeof receipt.source.commit !== 'string' || typeof receipt.source.license !== 'string') return false;
  if (!receipt.rollback || typeof receipt.rollback.ok !== 'boolean') return false;
  if (typeof receipt.verifiedAt !== 'string' || Number.isNaN(Date.parse(receipt.verifiedAt))) return false;
  if (typeof receipt.receiptDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/i.test(receipt.receiptDigest)) return false;
  if (receipt.score < receipt.qualityThreshold && receipt.passed) return false;
  if (receipt.score >= receipt.qualityThreshold && !receipt.passed) return false;
  if (receipt.cases.some((entry) => !entry || typeof entry.passed !== 'boolean')) return false;
  return receipt.receiptDigest === digest(payloadWithoutDigest(receipt));
}

export function assertPassingCapabilityVerificationReceipt(receipt, { capabilityId, capabilityVersion } = {}) {
  if (!validateCapabilityVerificationReceipt(receipt)) {
    throw new Error('capability verification receipt is invalid or has been tampered with');
  }
  if (!receipt.passed) throw new Error('capability verification receipt did not pass');
  if (!receipt.rollback.ok) throw new Error('capability verification rollback state is not healthy');
  if (capabilityId && receipt.capabilityId !== capabilityId) {
    throw new Error('capability verification receipt does not match capabilityId');
  }
  if (capabilityVersion && receipt.capabilityVersion !== capabilityVersion) {
    throw new Error('capability verification receipt does not match capabilityVersion');
  }
  return receipt;
}
