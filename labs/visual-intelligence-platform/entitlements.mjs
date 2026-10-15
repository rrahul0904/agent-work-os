const PLANS = Object.freeze({
  community: Object.freeze({
    privateProjects: false,
    nativeEditablePptx: false,
    brandKits: 0,
    apiMcp: false,
    advancedReview: false,
    orgRbac: false,
    privateKnowledge: false,
    byok: false,
    monthlyCredits: 500,
    concurrency: 1
  }),
  pro: Object.freeze({
    privateProjects: true,
    nativeEditablePptx: true,
    brandKits: 3,
    apiMcp: true,
    advancedReview: true,
    orgRbac: false,
    privateKnowledge: false,
    byok: false,
    monthlyCredits: 6000,
    concurrency: 10
  }),
  enterprise: Object.freeze({
    privateProjects: true,
    nativeEditablePptx: true,
    brandKits: Infinity,
    apiMcp: true,
    advancedReview: true,
    orgRbac: true,
    privateKnowledge: true,
    byok: true,
    monthlyCredits: Infinity,
    concurrency: Infinity
  })
});

export const planNames = Object.freeze(Object.keys(PLANS));

export function getEntitlements(plan) {
  const value = PLANS[String(plan || '').toLowerCase()];
  if (!value) throw new Error('unsupported-plan');
  return value;
}

export function can(plan, capability) {
  const entitlements = getEntitlements(plan);
  if (!(capability in entitlements)) throw new Error('unknown-capability');
  const value = entitlements[capability];
  return typeof value === 'boolean' ? value : value !== 0;
}

export function requireCapability(plan, capability) {
  if (!can(plan, capability)) {
    const error = new Error('plan-capability-denied');
    error.plan = plan;
    error.capability = capability;
    throw error;
  }
  return true;
}
