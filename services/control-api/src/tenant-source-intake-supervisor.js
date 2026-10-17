import { CapabilityRegistry } from '../../../packages/capability-fabric/src/index.js';
import { createSourceIntakeSupervisor } from './source-intake-supervisor.js';
import {
  assertSourceAccessProviderMachineAdvertisement,
  assertSourceAccessVerificationRun,
} from './source-intake-provider-trust.js';

function requireMethod(value, name, method) {
  if (!value || typeof value[method] !== 'function') throw new TypeError(`${name} must implement ${method}()`);
  return value;
}

async function snapshotRegistry(repository, organizationId) {
  const entries = await repository.listByOrganization(organizationId, { allVersions: true });
  const registry = new CapabilityRegistry();
  for (const entry of entries) registry.add(entry.spec);
  return registry;
}

export function createTenantSourceIntakeSupervisor({
  workItems,
  capabilityRegistryRepository,
  capabilityVerificationRepository,
}) {
  requireMethod(workItems, 'workItems', 'listEvents');
  requireMethod(capabilityRegistryRepository, 'capabilityRegistryRepository', 'listByOrganization');
  requireMethod(capabilityVerificationRepository, 'capabilityVerificationRepository', 'get');

  const withSupervisor = async (organizationId, action) => {
    const capabilityRegistry = await snapshotRegistry(capabilityRegistryRepository, organizationId);
    const supervisor = createSourceIntakeSupervisor({ workItems, capabilityRegistry });
    return action(supervisor);
  };

  return Object.freeze({
    block(args) {
      return withSupervisor(args.organizationId, (supervisor) => supervisor.block(args));
    },

    inspect(args) {
      return withSupervisor(args.organizationId, (supervisor) => supervisor.inspect(args));
    },

    async resume({ verificationRunId, ...args }) {
      if (typeof verificationRunId !== 'string' || !verificationRunId) {
        throw new TypeError('verificationRunId must be a non-empty string');
      }
      const run = await capabilityVerificationRepository.get(verificationRunId, args.organizationId);
      assertSourceAccessVerificationRun(run, {
        organizationId: args.organizationId,
        provider: args.accessObservation?.provider,
      });
      await assertSourceAccessProviderMachineAdvertisement(capabilityVerificationRepository, run, {
        organizationId: args.organizationId,
        provider: args.accessObservation?.provider,
      });
      return withSupervisor(args.organizationId, (supervisor) => supervisor.resume({
        ...args,
        capabilityVerificationReceipt: run.receipt,
      }));
    },
  });
}
