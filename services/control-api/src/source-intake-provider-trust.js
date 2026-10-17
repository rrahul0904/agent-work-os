export const SOURCE_ACCESS_OBSERVATION_CONTRACT = 'source-access-observation/v1';

export function assertSourceAccessVerificationRun(run, { organizationId, provider }) {
  if (!run || run.organizationId !== organizationId) throw new Error('capability verification run not found in organization');
  if (run.status !== 'complete') throw new Error('capability verification run is not complete');
  if (!run.receipt) throw new Error('capability verification run has no receipt');
  if (run.capabilitySlug !== provider) throw new Error('capability verification run provider does not match source observation');
  if (run.receipt.capabilityId !== run.capabilityId) throw new Error('capability verification run receipt capabilityId mismatch');
  if (run.receipt.capabilityVersion !== run.capabilityVersion) throw new Error('capability verification run receipt capabilityVersion mismatch');
  if (run.receipt.passed !== true) throw new Error('capability verification run did not pass');
  return run;
}

export async function assertSourceAccessProviderMachineAdvertisement(repository, run, { organizationId, provider }) {
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
