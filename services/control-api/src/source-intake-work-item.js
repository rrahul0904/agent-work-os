import { assertCanonicalId } from '../../../packages/domain/src/index.js';
import { validateSourceIntakeTransition } from '../../../packages/evidence/src/source-intake.js';

export const SOURCE_INTAKE_WORK_ITEM_REASON_VERSION = 'source-intake-work-item-reason/v1';

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

export function createSourceIntakeWorkItemReason({ phase, transition }) {
  if (!['blocked', 'resumed'].includes(phase)) throw new TypeError('phase must be blocked or resumed');
  if (!validateSourceIntakeTransition(transition)) {
    throw new TypeError('transition must be an intact source intake transition');
  }

  const envelope = {
    contractVersion: SOURCE_INTAKE_WORK_ITEM_REASON_VERSION,
    phase,
    sourceId: transition.sourceId,
    gate: transition.gate,
    nextAction: transition.nextAction,
    transitionSha256: transition.transitionSha256,
    resolutionReceiptSha256: transition.resolutionReceiptSha256,
    accessRequestSha256: transition.accessRequestSha256,
    accessObservationSha256: transition.accessObservationSha256,
    requiredCapability: transition.requiredCapability,
  };
  const reason = JSON.stringify(envelope);
  if (reason.length > 2_000) throw new Error('source intake WorkItem reason exceeds repository limit');
  return reason;
}

export function parseSourceIntakeWorkItemReason(reason) {
  if (typeof reason !== 'string' || !reason.startsWith('{')) return null;
  let value;
  try { value = JSON.parse(reason); } catch { return null; }
  if (!value || value.contractVersion !== SOURCE_INTAKE_WORK_ITEM_REASON_VERSION) return null;
  if (!['blocked', 'resumed'].includes(value.phase)) return null;
  if (typeof value.transitionSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(value.transitionSha256)) return null;
  if (typeof value.resolutionReceiptSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(value.resolutionReceiptSha256)) return null;
  return value;
}

export async function blockWorkItemForSourceAccess({
  repository,
  workItem,
  transition,
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
  if (!['ready', 'running'].includes(workItem.status)) {
    throw new Error(`source access blocker cannot transition WorkItem from ${workItem.status}`);
  }

  return repository.transition(workItem.id, {
    organizationId,
    commandId,
    actorId,
    expectedVersion: workItem.version,
    to: 'blocked',
    reason: createSourceIntakeWorkItemReason({ phase: 'blocked', transition }),
    at,
  });
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
  if (!persisted || persisted.phase !== 'blocked') {
    throw new Error('latest WorkItem event is not a persisted source-access blocker');
  }
  if (persisted.transitionSha256 !== blockedTransition.transitionSha256) {
    throw new Error('persisted WorkItem blocker does not match blockedTransition');
  }
  if (latest?.toStatus !== 'blocked' || latest?.version !== workItem.version) {
    throw new Error('WorkItem blocker event is not current');
  }

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
