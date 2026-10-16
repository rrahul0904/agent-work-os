import {
  planSourceAccessCapability,
  selectSourceAccessCapability,
} from '../../../packages/capability-fabric/src/source-access.js';
import {
  assertPassingCapabilityVerificationReceipt,
} from '../../../packages/capability-fabric/src/verification-receipt.js';
import { validateSourceAccessObservation } from '../../../packages/evidence/src/source-access-context.js';
import {
  blockWorkItemForSourceAccess,
  parseSourceIntakeWorkItemReason,
  resumePersistedWorkItemAfterSourceAccess,
} from './source-intake-work-item.js';

function requireRegistry(registry) {
  if (!registry || typeof registry.resolve !== 'function') {
    throw new TypeError('capabilityRegistry must provide resolve(slug, version)');
  }
  return registry;
}

function requireRepository(repository) {
  if (!repository || typeof repository.listEvents !== 'function' || typeof repository.transition !== 'function') {
    throw new TypeError('workItems must implement listEvents() and transition()');
  }
  return repository;
}

function latestPersistedBlocker(events) {
  const latest = events.at(-1);
  const persisted = parseSourceIntakeWorkItemReason(latest?.reason);
  if (!persisted || persisted.phase !== 'blocked' || !persisted.transition || !persisted.accessRequest) {
    throw new Error('latest WorkItem event is not a restart-durable source-access blocker');
  }
  return { latest, persisted };
}

export function createSourceIntakeSupervisor({ workItems, capabilityRegistry }) {
  workItems = requireRepository(workItems);
  capabilityRegistry = requireRegistry(capabilityRegistry);

  return Object.freeze({
    async block({ workItem, transition, accessRequest, organizationId, actorId, commandId, at }) {
      const plan = planSourceAccessCapability({ transition, registry: capabilityRegistry });
      const result = await blockWorkItemForSourceAccess({
        repository: workItems,
        workItem,
        transition,
        accessRequest,
        organizationId,
        actorId,
        commandId,
        at,
      });
      return Object.freeze({
        workItem: result.workItem,
        replayed: result.replayed,
        sourceAccessPlan: plan,
      });
    },

    async inspect({ workItem, organizationId }) {
      if (!workItem || workItem.organizationId !== organizationId) throw new Error('workItem organization mismatch');
      if (workItem.status !== 'blocked') {
        return Object.freeze({ state: 'not-blocked', sourceAccessPlan: null });
      }
      const events = await workItems.listEvents(workItem.id, organizationId);
      const { persisted } = latestPersistedBlocker(events);
      const plan = planSourceAccessCapability({ transition: persisted.transition, registry: capabilityRegistry });
      return Object.freeze({
        state: 'blocked',
        sourceAccessPlan: plan,
        transitionSha256: persisted.transition.transitionSha256,
        accessRequestSha256: persisted.accessRequest.requestSha256,
      });
    },

    async resume({
      workItem,
      accessObservation,
      capabilityVerificationReceipt,
      organizationId,
      actorId,
      commandId,
      at,
    }) {
      if (!workItem || workItem.organizationId !== organizationId) throw new Error('workItem organization mismatch');
      if (workItem.status !== 'blocked') throw new Error('source access resume requires a blocked WorkItem');

      const events = await workItems.listEvents(workItem.id, organizationId);
      const { persisted } = latestPersistedBlocker(events);
      if (!validateSourceAccessObservation(accessObservation, { request: persisted.accessRequest })) {
        throw new Error('accessObservation is not bound to the persisted source access request');
      }

      const plan = planSourceAccessCapability({ transition: persisted.transition, registry: capabilityRegistry });
      if (plan.state !== 'available') {
        throw new Error('no verified-capable source access provider is registered for this blocker');
      }

      const providerSpec = capabilityRegistry.resolve(accessObservation.provider);
      if (!providerSpec) throw new Error('observed provider is not registered in Capability Fabric');
      const binding = selectSourceAccessCapability({ plan, capability: providerSpec });

      const verification = assertPassingCapabilityVerificationReceipt(capabilityVerificationReceipt, {
        capabilityId: binding.capabilityId,
        capabilityVersion: binding.capabilityVersion,
      });
      if (verification.source.commit !== providerSpec.provenance.sourceCommit) {
        throw new Error('capability verification receipt source commit does not match registered provider');
      }
      if (verification.source.license !== providerSpec.provenance.sourceLicense) {
        throw new Error('capability verification receipt source license does not match registered provider');
      }
      if (binding.transitionSha256 !== persisted.transition.transitionSha256) {
        throw new Error('source access capability binding does not match persisted blocker transition');
      }
      if (binding.capabilitySlug !== accessObservation.provider) {
        throw new Error('source access observation provider does not match verified capability');
      }

      const resumed = await resumePersistedWorkItemAfterSourceAccess({
        repository: workItems,
        workItem,
        accessObservation,
        organizationId,
        actorId,
        commandId,
        at,
      });

      return Object.freeze({
        ...resumed,
        capabilityBinding: binding,
        verificationReceiptDigest: verification.receiptDigest,
      });
    },
  });
}
