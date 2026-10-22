import { products, commonCapabilities } from './catalog.mjs';
// Pure, deterministic planning and fail-closed deployment authorization.
export function validateCatalog(items = products) {
  if (!Array.isArray(items) || !items.length) throw new Error('EMPTY_CATALOG');
  const ids = new Set();
  for (const item of items) {
    if (!/^[a-z][a-z0-9-]+$/.test(item.id || '')) throw new Error('INVALID_PRODUCT_ID');
    if (ids.has(item.id)) throw new Error('DUPLICATE_PRODUCT_ID:' + item.id);
    ids.add(item.id);
    const url = new URL(item.site);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('INVALID_SOURCE:' + item.id);
    if (!item.distinctive?.length || !item.gates?.length) throw new Error('INCOMPLETE_ITEM:' + item.id);
    for (const dep of item.dependencies || []) {
      if (!commonCapabilities.includes(dep)) throw new Error('UNKNOWN_DEPENDENCY:' + dep);
    }
  }
  return true;
}
export function compilePortfolioPlan(items = products) {
  validateCatalog(items);
  const shared = commonCapabilities.map(capability => ({
    id: 'shared/' + capability, kind: 'shared-capability',
    status: 'not-started', evidence: ['contract-test','security-review','versioned-release']
  }));
  const productsPlan = [...items].sort((a,b) => a.priority - b.priority).map(item => ({
    id: 'app/' + item.id, productId: item.id, outcome: item.outcome,
    status: 'discovered', deploymentApproved: false,
    requires: item.dependencies.map(dep => 'shared/' + dep),
    mandatoryGates: [...item.gates,'provenance-review','unit-integration-e2e','human-release-approval'],
    stages: ['observe','specify','clean-room-build','test','review','release-gate']
  }));
  return {
    schemaVersion:1, observedAt:'2026-10-22',
    source:'https://www.reddit.com/r/AppBuilding/comments/1xc9b58/7_apps_and_counting_using_the_8020_rule_how_do/',
    mode:'clean-room', inspectedPrivateSource:false, noImplicitDeployment:true,
    routing:{ kind:'DONOR_REFERENCE', owner:'agent-work-os', component:'app-factory',
      appRepos:'only after individual architecture approval' },
    shared, products:productsPlan,
    requiredSmokeTests:['restore-existing-user-data','perform-primary-action','export-import',
      'restore-purchases-when-supported','offline-sync-conflict','permission-denial','accessibility']
  };
}
export function deploymentGate(plan, productId, evidence = {}) {
  const item = plan.products.find(p => p.productId === productId);
  if (!item) throw new Error('UNKNOWN_PRODUCT');
  const missing = [...item.mandatoryGates,'exact-sha-ci-green'].filter(g => evidence[g] !== true);
  return { allowed:missing.length === 0, missing };
}