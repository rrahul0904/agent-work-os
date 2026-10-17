import { CapabilityRegistry } from '../../../packages/capability-fabric/src/index.js';
import { createSourceIntakeBrowserObserver } from './source-intake-browser-observer.js';
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

function supportsBrowserObservationStore(store) {
  return store
    && ['createSessionWithCommand', 'listSessionsByOrganization', 'listSessions', 'getMachine', 'getSession']
      .every((method) => typeof store[method] === 'function');
}

function scheduleRestartReconciliation(observer, attempt = 0) {
  const delay = Math.min(5_000, 100 * (2 ** attempt));
  const timer = setTimeout(async () => {
    try {
      await observer.reconcileAll();
    } catch (error) {
      if (attempt < 5) scheduleRestartReconciliation(observer, attempt + 1);
      else console.warn('[source-intake] restart reconciliation failed', error.message);
    }
  }, delay);
  timer.unref?.();
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

  const api = {
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
  };

  const sessionStore = capabilityVerificationRepository.store;
  let browserObserver = null;
  if (supportsBrowserObservationStore(sessionStore)
      && typeof workItems.get === 'function'
      && typeof capabilityRegistryRepository.resolve === 'function') {
    browserObserver = createSourceIntakeBrowserObserver({
      store: sessionStore,
      workItems,
      capabilityRegistryRepository,
      capabilityVerificationRepository,
      tenantSourceIntakeSupervisor: api,
    });
    if (typeof capabilityVerificationRepository.registerSessionEventConsumer === 'function') {
      capabilityVerificationRepository.registerSessionEventConsumer(async ({ sessionId, event }) => {
        const session = await sessionStore.getSession(sessionId);
        if (!session) return null;
        return browserObserver.handleSessionEvent({ session, event });
      });
    }
    scheduleRestartReconciliation(browserObserver);
  }

  api.observe = (args) => {
    if (!browserObserver) throw new Error('source intake browser observer is unavailable');
    return browserObserver.launch(args);
  };
  api.reconcileBrowserObservations = () => browserObserver?.reconcileAll() ?? Promise.resolve([]);

  return Object.freeze(api);
}
