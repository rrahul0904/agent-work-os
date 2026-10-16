import { assertCapabilitySpec } from './index.js';
import { validateSourceIntakeTransition } from '../../evidence/src/source-intake.js';

export const SOURCE_ACCESS_REQUIREMENT_ALIASES = Object.freeze({
  'reddit-authenticated-or-browser-read': Object.freeze([
    'reddit-authenticated-read',
    'browser-read',
  ]),
});

function requireRegistry(registry) {
  if (!registry || typeof registry.resolve !== 'function') {
    throw new TypeError('registry must provide resolve(slug, version)');
  }
  return registry;
}

export function sourceAccessCandidateSlugs(requirement) {
  if (typeof requirement !== 'string' || !requirement.trim()) {
    throw new TypeError('requirement must be a non-empty string');
  }
  return [...(SOURCE_ACCESS_REQUIREMENT_ALIASES[requirement] ?? [requirement])];
}

export function planSourceAccessCapability({ transition, registry }) {
  if (!validateSourceIntakeTransition(transition)) {
    throw new TypeError('transition must be an intact source intake transition');
  }
  registry = requireRegistry(registry);

  if (transition.gate !== 'ACCESS_CONTEXT_REQUIRED') {
    return Object.freeze({
      state: 'not-required',
      requirement: null,
      candidateSlugs: [],
      available: [],
      nextAction: transition.nextAction,
      transitionSha256: transition.transitionSha256,
    });
  }

  const requirement = transition.requiredCapability;
  const candidateSlugs = sourceAccessCandidateSlugs(requirement);
  const available = candidateSlugs
    .map((slug) => registry.resolve(slug))
    .filter(Boolean)
    .map((spec) => {
      assertCapabilitySpec(spec);
      return Object.freeze({
        capabilityId: spec.id,
        version: spec.version,
        slug: spec.metadata.slug,
        kind: spec.kind,
        sourceCommit: spec.provenance.sourceCommit,
        sourceLicense: spec.provenance.sourceLicense,
      });
    });

  return Object.freeze({
    state: available.length ? 'available' : 'missing',
    requirement,
    candidateSlugs,
    available,
    nextAction: available.length ? 'VERIFY_SOURCE_ACCESS_CAPABILITY' : 'INSTALL_OR_CONNECT_SOURCE_ACCESS_CAPABILITY',
    transitionSha256: transition.transitionSha256,
  });
}

export function selectSourceAccessCapability({ plan, capability }) {
  if (!plan || plan.state !== 'available' || !Array.isArray(plan.candidateSlugs)) {
    throw new TypeError('plan must be an available source access capability plan');
  }
  const spec = assertCapabilitySpec(capability);
  if (!plan.candidateSlugs.includes(spec.metadata.slug)) {
    throw new Error('capability does not satisfy the source access requirement');
  }
  const planned = plan.available.find((entry) => entry.capabilityId === spec.id && entry.version === spec.version);
  if (!planned) throw new Error('capability was not present in the planned available set');

  return Object.freeze({
    contractVersion: 'source-access-capability-binding/v1',
    transitionSha256: plan.transitionSha256,
    requirement: plan.requirement,
    capabilityId: spec.id,
    capabilityVersion: spec.version,
    capabilitySlug: spec.metadata.slug,
    nextAction: 'VERIFY_SOURCE_ACCESS_CAPABILITY',
  });
}
