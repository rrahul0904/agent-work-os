import crypto from 'node:crypto';

import { assertPassingCapabilityVerificationReceipt } from '../../../packages/capability-fabric/src/verification-receipt.js';
import { createCanonicalId } from '../../../packages/domain/src/index.js';
import { validateSourceAccessObservation } from '../../../packages/evidence/src/source-access-context.js';
import { parseSourceIntakeWorkItemReason } from './source-intake-work-item.js';
import {
  assertSourceAccessProviderMachineAdvertisement,
  assertSourceAccessVerificationRun,
} from './source-intake-provider-trust.js';

export const SOURCE_INTAKE_BROWSER_BINDING_VERSION = 'source-intake-browser-binding/v1';
const PROVIDER = 'browser-read';
const OBSERVATION_EVENT = 'source-access-observation';

function requireMethod(value, name, method) {
  if (!value || typeof value[method] !== 'function') throw new TypeError(`${name} must implement ${method}()`);
}

function latestBlocker(events) {
  const latest = events.at(-1);
  const persisted = parseSourceIntakeWorkItemReason(latest?.reason);
  if (!persisted || persisted.phase !== 'blocked' || !persisted.transition || !persisted.accessRequest) {
    throw new Error('latest WorkItem event is not a restart-durable source-access blocker');
  }
  return persisted;
}

function sourceProviderAdvertisement(machine) {
  return Array.isArray(machine?.capabilities)
    ? machine.capabilities.find((capability) => capability?.name === PROVIDER)
    : null;
}

function assertBinding(binding, session) {
  if (!binding || binding.contractVersion !== SOURCE_INTAKE_BROWSER_BINDING_VERSION) return null;
  const required = ['workItemId', 'verificationRunId', 'provider', 'machineId', 'transitionSha256', 'accessRequestSha256', 'resumeCommandId'];
  if (required.some((field) => typeof binding[field] !== 'string' || !binding[field])) throw new Error('source intake browser binding is malformed');
  if (!Number.isInteger(binding.blockedVersion) || binding.blockedVersion < 1) throw new Error('source intake browser binding blockedVersion is invalid');
  if (binding.provider !== PROVIDER) throw new Error('source intake browser binding provider is invalid');
  if (session && binding.machineId !== session.machineId) throw new Error('source intake browser binding machine does not match session');
  return binding;
}

function isObservationEvent(event) {
  return event?.kind === 'tool'
    && event.name === OBSERVATION_EVENT
    && event.phase === 'completed'
    && event.payload;
}

function matchingSession(session, binding) {
  const candidate = assertBinding(session?.sourceIntakeBinding, session);
  if (!candidate) return false;
  return candidate.workItemId === binding.workItemId
    && candidate.blockedVersion === binding.blockedVersion
    && candidate.verificationRunId === binding.verificationRunId
    && candidate.machineId === binding.machineId
    && candidate.accessRequestSha256 === binding.accessRequestSha256
    && candidate.transitionSha256 === binding.transitionSha256;
}

export function createSourceIntakeBrowserObserver({
  store,
  workItems,
  capabilityRegistryRepository,
  capabilityVerificationRepository,
  tenantSourceIntakeSupervisor,
  now = () => new Date().toISOString(),
  sessionId = () => crypto.randomUUID(),
  messageId = () => crypto.randomUUID(),
  commandId = () => createCanonicalId('command'),
}) {
  requireMethod(store, 'store', 'createSessionWithCommand');
  requireMethod(store, 'store', 'listSessionsByOrganization');
  requireMethod(store, 'store', 'listSessions');
  requireMethod(store, 'store', 'getMachine');
  requireMethod(workItems, 'workItems', 'get');
  requireMethod(workItems, 'workItems', 'listEvents');
  requireMethod(capabilityRegistryRepository, 'capabilityRegistryRepository', 'resolve');
  requireMethod(capabilityVerificationRepository, 'capabilityVerificationRepository', 'get');
  requireMethod(tenantSourceIntakeSupervisor, 'tenantSourceIntakeSupervisor', 'resume');

  async function authorize({ organizationId, workItem, verificationRunId, machineId }) {
    if (!workItem || workItem.organizationId !== organizationId) throw new Error('workItem organization mismatch');
    if (workItem.status !== 'blocked') throw new Error('browser source observation requires a blocked WorkItem');

    const persisted = latestBlocker(await workItems.listEvents(workItem.id, organizationId));
    const run = await capabilityVerificationRepository.get(verificationRunId, organizationId);
    assertSourceAccessVerificationRun(run, { organizationId, provider: PROVIDER });
    if (run.machineId !== machineId) throw new Error('browser observation machine must match verification run machine');
    await assertSourceAccessProviderMachineAdvertisement(capabilityVerificationRepository, run, { organizationId, provider: PROVIDER });

    const providerEntry = await capabilityRegistryRepository.resolve(organizationId, PROVIDER, run.capabilityVersion);
    if (!providerEntry?.spec || providerEntry.capabilityId !== run.capabilityId) {
      throw new Error('verified browser-read capability is not registered in organization');
    }
    const receipt = assertPassingCapabilityVerificationReceipt(run.receipt, {
      capabilityId: providerEntry.capabilityId,
      capabilityVersion: providerEntry.version,
    });
    if (receipt.source.commit !== providerEntry.sourceCommit) throw new Error('browser-read verification source commit does not match registry');
    if (receipt.source.license !== providerEntry.sourceLicense) throw new Error('browser-read verification source license does not match registry');

    const machine = await store.getMachine(machineId);
    if (!machine || machine.organizationId !== organizationId) throw new Error('browser observation machine not found in organization');
    const advertisement = sourceProviderAdvertisement(machine);
    if (!advertisement) throw new Error('browser-read is not advertised by observation machine');
    if (advertisement.access !== 'read-only') throw new Error('browser-read observation machine must advertise read-only access');

    return { persisted, run, providerEntry, machine };
  }

  async function processObservation(session, event) {
    const binding = assertBinding(session?.sourceIntakeBinding, session);
    if (!binding || !isObservationEvent(event)) return null;
    if (session.organizationId !== binding.organizationId && binding.organizationId !== undefined) {
      throw new Error('source intake browser binding organization does not match session');
    }
    const organizationId = session.organizationId;
    const workItem = await workItems.get(binding.workItemId, organizationId);
    if (!workItem) throw new Error('bound WorkItem not found in organization');

    if (workItem.status !== 'blocked') {
      const prior = (await workItems.listEvents(workItem.id, organizationId))
        .find((candidate) => candidate.commandId === binding.resumeCommandId && candidate.toStatus === 'ready');
      if (prior) return Object.freeze({ workItem: prior.result ?? workItem, replayed: true, sessionId: session.id });
      throw new Error('bound WorkItem is no longer blocked by this browser observation');
    }
    if (workItem.version !== binding.blockedVersion) throw new Error('bound WorkItem version changed before browser observation');

    const events = await workItems.listEvents(workItem.id, organizationId);
    const persisted = latestBlocker(events);
    if (persisted.transition.transitionSha256 !== binding.transitionSha256
        || persisted.accessRequest.requestSha256 !== binding.accessRequestSha256) {
      throw new Error('browser observation binding no longer matches persisted source blocker');
    }
    if (!validateSourceAccessObservation(event.payload, { request: persisted.accessRequest })) {
      throw new Error('browser observation event is not bound to persisted source access request');
    }

    const run = await capabilityVerificationRepository.get(binding.verificationRunId, organizationId);
    if (!run || run.machineId !== session.machineId) throw new Error('browser observation session machine does not match verification run machine');

    const result = await tenantSourceIntakeSupervisor.resume({
      workItem,
      accessObservation: event.payload,
      verificationRunId: binding.verificationRunId,
      organizationId,
      actorId: session.createdBy,
      commandId: binding.resumeCommandId,
      at: event.at ?? now(),
    });
    return Object.freeze({ ...result, sessionId: session.id });
  }

  async function reconcileSession(session) {
    const binding = assertBinding(session?.sourceIntakeBinding, session);
    if (!binding) return null;
    const observation = [...(session.events ?? [])].reverse().find(isObservationEvent);
    if (!observation) return null;
    return processObservation(session, observation);
  }

  return Object.freeze({
    async launch({ organizationId, workItemId, expectedVersion, verificationRunId, machineId, actorId, cwd = process.cwd() }) {
      const workItem = await workItems.get(workItemId, organizationId);
      if (!workItem) throw new Error('workItem not found in organization');
      if (workItem.version !== expectedVersion) throw new Error('workItem version changed before browser observation launch');
      const { persisted } = await authorize({ organizationId, workItem, verificationRunId, machineId });

      const desired = {
        workItemId,
        blockedVersion: workItem.version,
        verificationRunId,
        machineId,
        transitionSha256: persisted.transition.transitionSha256,
        accessRequestSha256: persisted.accessRequest.requestSha256,
      };
      const existing = (await store.listSessionsByOrganization(organizationId)).find((candidate) =>
        matchingSession(candidate, { ...desired, provider: PROVIDER }) && !['failed', 'interrupted'].includes(candidate.status)
      );
      if (existing) {
        const reconciled = await reconcileSession(existing);
        return Object.freeze({ session: existing, replayed: true, reconciled });
      }

      const createdAt = now();
      const resumeCommandId = commandId();
      const binding = Object.freeze({
        contractVersion: SOURCE_INTAKE_BROWSER_BINDING_VERSION,
        organizationId,
        provider: PROVIDER,
        ...desired,
        resumeCommandId,
      });
      const prompt = JSON.stringify({ sourceAccessRequest: persisted.accessRequest });
      const session = {
        id: sessionId(),
        organizationId,
        createdBy: actorId,
        machineId,
        cwd,
        agent: PROVIDER,
        model: undefined,
        status: 'queued',
        createdAt,
        updatedAt: createdAt,
        nativeSessionId: undefined,
        sourceIntakeBinding: binding,
        messages: [{ id: messageId(), role: 'user', text: prompt, createdAt }],
        events: [],
      };
      const command = {
        type: 'server.command',
        commandId: commandId(),
        sessionId: session.id,
        action: 'session.start',
        payload: { cwd, agent: PROVIDER, model: undefined, prompt },
      };
      await store.createSessionWithCommand(session, command);
      return Object.freeze({ session, commandId: command.commandId, replayed: false, reconciled: null });
    },

    handleSessionEvent({ session, event }) {
      return processObservation(session, event);
    },

    reconcileSession,

    async reconcileAll() {
      const results = [];
      for (const session of await store.listSessions()) {
        if (!session?.sourceIntakeBinding) continue;
        try {
          const result = await reconcileSession(session);
          if (result) results.push({ sessionId: session.id, ok: true, result });
        } catch (error) {
          results.push({ sessionId: session.id, ok: false, error: error.message });
        }
      }
      return results;
    },
  });
}
