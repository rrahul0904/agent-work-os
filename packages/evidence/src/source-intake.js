import { sha256, stableJson } from './research-workspace.js';
import {
  validateSourceIdentityResolutionReceipt,
} from './source-resolution.js';
import {
  createSourceAccessRequest,
  validateSourceAccessObservation,
  validateSourceAccessRequest,
} from './source-access-context.js';

export const SOURCE_INTAKE_TRANSITION_VERSION = 'source-intake-transition/v1';
export const SOURCE_INTAKE_GATES = Object.freeze([
  'TARGET_IDENTITY_RESOLVED',
  'ACCESS_CONTEXT_REQUIRED',
  'TARGET_IDENTITY_UNRESOLVED',
]);

function payloadFromTransition(transition) {
  const { transitionSha256: _transitionSha256, ...payload } = transition;
  return payload;
}

function transition(payload) {
  return Object.freeze({ ...payload, transitionSha256: sha256(stableJson(payload)) });
}

export function advanceSourceIntake({
  resolutionReceipt,
  accessRequest = null,
  accessObservation = null,
  transitionedAt = new Date().toISOString(),
}) {
  if (!validateSourceIdentityResolutionReceipt(resolutionReceipt)) {
    throw new TypeError('resolutionReceipt must be an intact source identity resolution receipt');
  }
  const timestamp = new Date(transitionedAt);
  if (Number.isNaN(timestamp.getTime())) throw new TypeError('transitionedAt must be a valid timestamp');

  const base = {
    contractVersion: SOURCE_INTAKE_TRANSITION_VERSION,
    sourceId: resolutionReceipt.sourceId,
    requestedUrl: resolutionReceipt.requestedUrl,
    resolutionReceiptSha256: resolutionReceipt.receiptSha256,
    transitionedAt: timestamp.toISOString(),
  };

  if (resolutionReceipt.state === 'resolved') {
    return transition({
      ...base,
      gate: 'TARGET_IDENTITY_RESOLVED',
      target: resolutionReceipt.target,
      requiredCapability: null,
      accessRequestSha256: null,
      accessObservationSha256: null,
      nextAction: 'REA_EVIDENCE_DISCOVERY',
    });
  }

  if (resolutionReceipt.errorCode === 'ACCESS_CONTEXT_REQUIRED') {
    const request = accessRequest ?? createSourceAccessRequest({
      blockedResolution: resolutionReceipt,
      requestedAt: timestamp.toISOString(),
    });
    if (!validateSourceAccessRequest(request)) throw new TypeError('accessRequest must be intact');
    if (request.blocker.receiptSha256 !== resolutionReceipt.receiptSha256) {
      throw new Error('accessRequest is not bound to this resolution blocker');
    }

    if (accessObservation === null) {
      return transition({
        ...base,
        gate: 'ACCESS_CONTEXT_REQUIRED',
        target: null,
        requiredCapability: request.requiredCapability,
        accessRequestSha256: request.requestSha256,
        accessObservationSha256: null,
        nextAction: 'ACQUIRE_SOURCE_ACCESS_CONTEXT',
      });
    }

    if (!validateSourceAccessObservation(accessObservation, { request })) {
      throw new Error('accessObservation is not an intact observation bound to this access request');
    }

    return transition({
      ...base,
      gate: 'TARGET_IDENTITY_RESOLVED',
      target: accessObservation.target,
      requiredCapability: null,
      accessRequestSha256: request.requestSha256,
      accessObservationSha256: accessObservation.observationSha256,
      nextAction: 'REA_EVIDENCE_DISCOVERY',
    });
  }

  return transition({
    ...base,
    gate: 'TARGET_IDENTITY_UNRESOLVED',
    target: null,
    requiredCapability: null,
    accessRequestSha256: null,
    accessObservationSha256: null,
    nextAction: 'STOP_AND_PRESERVE_EVIDENCE',
  });
}

export function validateSourceIntakeTransition(value) {
  if (!value || value.contractVersion !== SOURCE_INTAKE_TRANSITION_VERSION) return false;
  if (!SOURCE_INTAKE_GATES.includes(value.gate)) return false;
  if (typeof value.transitionSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(value.transitionSha256)) return false;
  if (typeof value.sourceId !== 'string' || !value.sourceId) return false;
  if (typeof value.requestedUrl !== 'string' || !value.requestedUrl) return false;
  if (typeof value.resolutionReceiptSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(value.resolutionReceiptSha256)) return false;
  if (typeof value.nextAction !== 'string' || !value.nextAction) return false;
  return value.transitionSha256 === sha256(stableJson(payloadFromTransition(value)));
}
