import test from 'node:test';
import assert from 'node:assert/strict';
import { can, getEntitlements, requireCapability } from '../entitlements.mjs';
import { createRunPlan } from '../orchestrator.mjs';
import { scoreVisualArtifact } from '../visualbench.mjs';

test('community cannot use native editable PPTX while pro can', () => {
  assert.equal(can('community', 'nativeEditablePptx'), false);
  assert.equal(can('pro', 'nativeEditablePptx'), true);
  assert.throws(() => requireCapability('community', 'nativeEditablePptx'), /plan-capability-denied/);
});

test('enterprise enables governance capabilities', () => {
  const entitlements = getEntitlements('enterprise');
  assert.equal(entitlements.orgRbac, true);
  assert.equal(entitlements.privateKnowledge, true);
  assert.equal(entitlements.byok, true);
});

test('orchestrator rejects native editable technical PPT on community', () => {
  assert.throws(() => createRunPlan({
    artifactType: 'technical-presentation',
    objective: 'Explain a governed lakehouse',
    plan: 'community'
  }), /plan-capability-denied/);
});

test('orchestrator creates approval-gated enterprise writer stages', () => {
  const run = createRunPlan({
    artifactType: 'creative-ad',
    objective: 'Create a launch ad for a developer platform',
    plan: 'enterprise'
  });
  assert.equal(run.providerPolicy.selection, 'provider-neutral');
  assert.equal(run.stages.some(stage => stage.mode === 'artifact-write' && stage.approvalRequired), true);
});

test('VisualBench passes a strong artifact', () => {
  const result = scoreVisualArtifact({
    semanticFidelity: 94,
    evidenceGrounding: 92,
    layoutQuality: 88,
    editability: 91,
    accessibility: 86,
    brandConsistency: 87,
    reproducibility: 93
  });
  assert.equal(result.passed, true);
  assert.equal(result.hardFailures.length, 0);
});

test('VisualBench fails groundedness even when weighted average is high', () => {
  const result = scoreVisualArtifact({
    semanticFidelity: 99,
    evidenceGrounding: 50,
    layoutQuality: 99,
    editability: 99,
    accessibility: 99,
    brandConsistency: 99,
    reproducibility: 99
  });
  assert.equal(result.passed, false);
  assert.equal(result.hardFailures.includes('evidence-grounding'), true);
});
