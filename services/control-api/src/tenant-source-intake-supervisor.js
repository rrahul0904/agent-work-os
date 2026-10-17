import { CapabilityRegistry } from '../../../packages/capability-fabric/src/index.js';
import { createSourceIntakeSupervisor } from './source-intake-supervisor.js';

const SOURCE_ACCESS_OBSERVATION_CONTRACT = 'source-access-observation/v1';

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

function assertVerificationRun(run, { organizationId, provider }) {
  if (!run || run.organizationId !== organizationId) throw new Error('capability verification run not found in organization');
  if (run.status !== 'complete') throw new Error('capability verification run is not complete');
  if (!run.receipt) throw new Error('capability verification run has no receipt');
  if (run.capabilitySlug !== provider) throw new Error('capability verification run provider does not match source observation');
  if (run.receipt.capabilityId !== run.capabilityId) throw new Error('capability verification run receipt capabilityId mismatch');
  if (run.receipt.capabilityVersion !== run.capabilityVersion) throw new Error('capability verification run receipt capabilityVersion mismatch');
  if (run.receipt.passed !== true) throw new Error('capability verification run did not pass');
  return run;
}

async function assertProviderMachineAdvertisement(repository, run, { organizationId, provider }) {
  const machineStore = repository?.store;
  if (!machineStore || typeof machineStore.getMachine !== 'function') {
    throw new Error('capability verification machine advertisement cannot be verified');
  }
  if (typeof run.machineId !== 'string' || !run.machineId) {
    throw new Error('capability verification run has no machine identity');
  }
  const machine = await machineStore.getMachine(run.machineId);
  if (!machine || machine.organizationId !== organizationId) {
    throw new Error('capability verification machine not found in organization');
  }
  const advertisement = Array.isArray(machine.capabilities)
    ? machine.capabilities.find((capability) => capability?.name === provider)
    : null;
  if (!advertisement) throw new Error('source access provider is not advertised by verification machine');
  if (advertisement.access !== 'read-only') throw new Error('source access provider must advertise read-only access');
  if (!Array.isArray(advertisement.observationContracts)
      || !advertisement.observationContracts.includes(SOURCE_ACCESS_OBSERVATION_CONTRACT)) {
    throw new Error('source access provider does not advertise the required observation contract');
  }
  return advertisement;
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
      assertVerificationRun(run, {
        organizationId: args.organizationId,
        provider: args.accessObservation?.provider,
      });
      await assertProviderMachineAdvertisement(capabilityVerificationRepository, run, {
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
