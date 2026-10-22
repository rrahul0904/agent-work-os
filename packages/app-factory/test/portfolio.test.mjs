import test from 'node:test';
import assert from 'node:assert/strict';
import {products, commonCapabilities} from '../catalog.mjs';
import {validateCatalog, compilePortfolioPlan, deploymentGate} from '../planner.mjs';

test('source inventory covers seven distinct independent apps', () => {
  assert.equal(products.length,7);
  assert.equal(new Set(products.map(p=>p.site)).size,7);
  assert.equal(validateCatalog(),true);
});
test('plan binds seven workstreams to ten registered capabilities', () => {
  const p=compilePortfolioPlan();
  assert.equal(p.shared.length,commonCapabilities.length);
  assert.equal(p.products.length,7);
  assert.equal(p.products[0].productId,'prompt-petal');
  assert.equal(p.mode,'clean-room');
  assert.equal(p.noImplicitDeployment,true);
  for(const app of p.products) {
    assert.equal(app.deploymentApproved,false);
    assert(app.mandatoryGates.includes('human-release-approval'));
    assert(app.requires.every(r=>p.shared.some(s=>s.id===r)));
  }
});
test('release gate fails closed without explicit exact-SHA approval evidence',()=>{
  const p=compilePortfolioPlan();
  for(const item of p.products) {
    const verdict=deploymentGate(p,item.productId);
    assert.equal(verdict.allowed,false);
    assert(verdict.missing.includes('exact-sha-ci-green'));
    assert(verdict.missing.includes('human-release-approval'));
  }
});
test('domain-specific regulated gates cannot be bypassed',()=>{
  const p=compilePortfolioPlan();
  const verdict=deploymentGate(p,'little-bird-trading',{
    'exact-sha-ci-green':true,'provenance-review':true,
    'unit-integration-e2e':true,'human-release-approval':true
  });
  assert.equal(verdict.allowed,false);
  assert(verdict.missing.includes('market-data-license'));
  assert(verdict.missing.includes('data-replay-validation'));
});
test('approval must be boolean true',()=>{
  const p=compilePortfolioPlan();
  const first=p.products[0];
  const evidence=Object.fromEntries([...first.mandatoryGates,'exact-sha-ci-green'].map(k=>[k,true]));
  assert.equal(deploymentGate(p,first.productId,evidence).allowed,true);
  evidence['human-release-approval']='yes';
  assert.equal(deploymentGate(p,first.productId,evidence).allowed,false);
});
test('unknown capabilities and duplicate IDs are rejected',()=>{
  assert.throws(()=>validateCatalog([products[0],products[0]]),/DUPLICATE_PRODUCT_ID/);
  assert.throws(()=>validateCatalog([{...products[0],dependencies:['unknown']}]),/UNKNOWN_DEPENDENCY/);
});