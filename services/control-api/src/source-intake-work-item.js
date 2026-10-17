import { assertCanonicalId } from '../../../packages/domain/src/index.js';
import {
  resumeSourceIntakeFromAccess,
  validateSourceIntakeTransition,
} from '../../../packages/evidence/src/source-intake.js';
import {
  validateSourceAccessObservation,
  validateSourceAccessRequest,
} from '../../../packages/evidence/src/source-access-context.js';

export const SOURCE_INTAKE_WORK_ITEM_REASON_VERSION = 'source-intake-work-item-reason/v2';
const LEGACY_REASON_VERSION = 'source-intake-work-item-reason/v1';

function requireRepository(repository) {
  if (!repository || typeof repository.transition !== 'function' || typeof repository.listEvents !== 'function') {
    throw new TypeError('repository must implement transition() and listEvents()');
  }
  return repository;
}

function validateActorId(actorId) {
  const kind = ['user', 'agent', 'service'].find((candidate) => actorId?.startsWith(`${candidate}_`));
  if (!kind) throw new TypeError('actorId must be a canonical user, agent, or service ID');
  assertCanonicalId(kind, actorId, 'actorId');
  return actorId;
}

function assertRequestMatchesTransition(accessRequest, transition) {
  if (!validateSourceAccessRequest(accessRequest)) {
    throw new TypeError('accessRequest must be an intact source access request');
  }
  if (accessRequest.sourceId !== transition.sourceId) throw new Error('accessRequest sourceId does not match transition');
  if (accessRequest.requestedUrl !== transition.requestedUrl) throw new Error('accessRequest requestedUrl does not match transition');
  if (accessRequest.blocker.receiptSha256 !== transition.resolutionReceiptSha256) throw new Error('accessRequest blocker does not match transition');
  if (accessRequest.requestSha256 !== transition.accessRequestSha256) throw new Error('accessRequest digest does not match transition');
  if (accessRequest.requiredCapability !== transition.requiredCapability) throw new Error('accessRequest capability does not match transition');
  return accessRequest;
}

export function createSourceIntakeWorkItemReason({ phase, transition, accessRequest = null }) {
  if (!['blocked', 'resumed'].includes(phase)) throw new TypeError('phase must be blocked or resumed');
  if (!validateSourceIntakeTransition(transition)) {
    throw new TypeError('transition must be an intact source intake transition');
  }
  if (phase === 'blocked') {
    if (transition.gate !== 'ACCESS_CONTEXT_REQUIRED') throw new Error('blocked reason requires an access-context transition');
    assertRequestMatchesTransition(accessRequest, transition);
  }

  const envelope = {
    contractVersion: SOURCE_INTAKE_WORK_ITEM_REASON_VERSION,
    phase,
    transition,
    accessRequest: phase === 'blocked' ? accessRequest : null,
  };
  const reason = JSON.stringify(envelope);
  if (reason.length > 2_000) throw new Error('source intake WorkItem reason exceeds repository limit');
  return reason;
}

export function parseSourceIntakeWorkItemReason(reason) {
  if (typeof reason !== 'string' || !reason.startsWith('{')) return null;
  let value;
  try { value = JSON.parse(reason); } catch { return null; }

  if (value?.contractVersion === SOURCE_INTAKE_WORK_ITEM_REASON_VERSION) {
    if (!['blocked', 'resumed'].includes(value.phase)) return null;
    if (!validateSourceIntakeTransition(value.transition)) return null;
    if (value.phase === 'blocked') {
      try { assertRequestMatchesTransition(value.accessRequest, value.transition); } catch { return null; }
    } else if (value.accessRequest !== null) {
      return null;
    }
    return value;
  }

  // Read compatibility for draft v1 blocker events. They remain inspectable but cannot
  // drive restart-durable resume because they did not persist the access request payload.
  if (value?.contractVersion === LEGACY_REASON_VERSION) {
    if (!['blocked', 'resumed'].includes(value.phase)) return null;
    if (typeof value.transitionSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(value.transitionSha256)) return null;
    if (typeof value.resolutionReceiptSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(value.resolutionReceiptSha256)) return null;
    return value;
  }
  return null;
}

export async function blockWorkItemForSourceAccess({
  repository,
  workItem,
  transition,
  accessRequest,
  organizationId,
  actorId,
  commandId,
  at = new Date().toISOString(),
}) {
  repository = requireRepository(repository);
  validateActorId(actorId);
  assertCanonicalId('org', organizationId, 'organizationId');
  assertCanonicalId('command', commandId, 'commandId');
  if (!workItem || workItem.organizationId !== organizationId) throw new Error('workItem organization mismatch');
  if (!validateSourceIntakeTransition(transition)) throw new TypeError('transition must be intact');
  if (transition.gate !== 'ACCESS_CONTEXT_REQUIRED' || transition.nextAction !== 'ACQUIRE_SOURCE_ACCESS_CONTEXT') {
    throw new Error('only ACCESS_CONTEXT_REQUIRED transitions can block a WorkItem');
  }
  assertRequestMatchesTransition(accessRequest, transition);
  if (!['ready', 'running'].includes(workItem.status)) {
    throw new Error(`source access blocker cannot transition WorkItem from ${workItem.status}`);
  }

  return repository.transition(workItem.id, {
    organizationId,
    commandId,
    actorId,
    expectedVersion: workItem.version,
    to: 'blocked',
    reason: createSourceIntakeWorkItemReason({ phase: 'blocked', transition, accessRequest }),
    at,
  });
}

function assertCurrentPersistedBlocker({ persisted, latest, workItem, blockedTransition = null }) {
  if (!persisted || persisted.phase !== 'blocked') {
    throw new Error('latest WorkItem event is not a persisted source-access blocker');
  }
  const persistedTransitionSha = persisted.transition?.transitionSha256 ?? persisted.transitionSha256;
  if (blockedTransition && persistedTransitionSha !== blockedTransition.transitionSha256) {
    throw new Error('persisted WorkItem blocker does not match blockedTransition');
  }
  if (latest?.toStatus !== 'blocked' || latest?.version !== workItem.version) {
    throw new Error('WorkItem blocker event is not current');
  }
}

export async function resumeWorkItemAfterSourceAccess({
  repository,
  workItem,
  blockedTransition,
  resolvedTransition,
  organizationId,
  actorId,
  commandId,
  at = new Date().toISOString(),
}) {
  repository = requireRepository(repository);
  validateActorId(actorId);
  assertCanonicalId('org', organizationId, 'organizationId');
  assertCanonicalId('command', commandId, 'commandId');
  if (!workItem || workItem.organizationId !== organizationId) throw new Error('workItem organization mismatch');
  if (workItem.status !== 'blocked') throw new Error('source access resume requires a blocked WorkItem');
  if (!validateSourceIntakeTransition(blockedTransition) || !validateSourceIntakeTransition(resolvedTransition)) {
    throw new TypeError('blockedTransition and resolvedTransition must be intact');
  }
  if (blockedTransition.gate !== 'ACCESS_CONTEXT_REQUIRED') throw new Error('blockedTransition is not an access-context blocker');
  if (resolvedTransition.gate !== 'TARGET_IDENTITY_RESOLVED' || resolvedTransition.nextAction !== 'REA_EVIDENCE_DISCOVERY') {
    throw new Error('resolvedTransition does not resume REA evidence discovery');
  }

  const bindingFields = ['sourceId', 'requestedUrl', 'resolutionReceiptSha256', 'accessRequestSha256'];
  for (const field of bindingFields) {
    if (blockedTransition[field] !== resolvedTransition[field]) {
      throw new Error(`resolved source access transition does not match blocker field ${field}`);
    }
  }
  if (!resolvedTransition.accessObservationSha256) {
    throw new Error('resolved source access transition requires a trusted observation digest');
  }

  const events = await repository.listEvents(workItem.id, organizationId);
  const latest = events.at(-1);
  const persisted = parseSourceIntakeWorkItemReason(latest?.reason);
  assertCurrentPersistedBlocker({ persisted, latest, workItem, blockedTransition });

  return repository.transition(workItem.id, {
    organizationId,
    commandId,
    actorId,
    expectedVersion: workItem.version,
    to: 'ready',
    reason: createSourceIntakeWorkItemReason({ phase: 'resumed', transition: resolvedTransition }),
    at,
  });
}

export async function resumePersistedWorkItemAfterSourceAccess({
  repository,
  workItem,
  accessObservation,
  organizationId,
  actorId,
  commandId,
  at = new Date().toISOString(),
}) {
  repository = requireRepository(repository);
  validateActorId(actorId);
  assertCanonicalId('org', organizationId, 'organizationId');
  assertCanonicalId('command', commandId, 'commandId');
  if (!workItem || workItem.organizationId !== organizationId) throw new Error('workItem organization mismatch');
  if (workItem.status !== 'blocked') throw new Error('source access resume requires a blocked WorkItem');

  const events = await repository.listEvents(workItem.id, organizationId);
  const latest = events.at(-1);
  const persisted = parseSourceIntakeWorkItemReason(latest?.reason);
  assertCurrentPersistedBlocker({ persisted, latest, workItem });
  if (persisted.contractVersion !== SOURCE_INTAKE_WORK_ITEM_REASON_VERSION || !persisted.transition || !persisted.accessRequest) {
    throw new Error('persisted source-access blocker predates restart-durable resume state');
  }
  if (!validateSourceAccessObservation(accessObservation, { request: persisted.accessRequest })) {
    throw new Error('accessObservation is not bound to the persisted source access request');
  }

  const resolvedTransition = resumeSourceIntakeFromAccess({
    blockedTransition: persisted.transition,
    accessRequest: persisted.accessRequest,
    accessObservation,
    transitionedAt: at,
  });
  const result = await repository.transition(workItem.id, {
    organizationId,
    commandId,
    actorId,
    expectedVersion: workItem.version,
    to: 'ready',
    reason: createSourceIntakeWorkItemReason({ phase: 'resumed', transition: resolvedTransition }),
    at,
  });
  return { ...result, sourceIntakeTransition: resolvedTransition };
}
