import test from 'node:test';
import assert from 'node:assert/strict';
import { FORGE_SPECIALIST_ROLES, proposeForgeSpecialists, buildForgeQuestionBatch, buildForgeContextHandoff } from '../src/forge-specialist-routing.js';

const models = { economy: 'provider/cheap', balanced: 'provider/standard', reasoning: 'provider/deep' };
const limits = { planTokenLimit: 10000, perBriefTokenLimit: 5000, maxConcurrent: 2 };
const briefs = [
  { id: 'investigate', role: 'scout', tokenLimit: 1200, risk: 'low' },
  { id: 'design', role: 'architect', tokenLimit: 2200, risk: 'high' },
  { id: 'code', role: 'implementer', tokenLimit: 3900, risk: 'normal' }
];

test('ten bounded specialist roles propose audited routing with no execution grant', () => {
  assert.equal(FORGE_SPECIALIST_ROLES.length, 10);
  const p = proposeForgeSpecialists({ briefs, modelCatalog: models, limits });
  assert.deepEqual(p.proposals.map(x => x.modelTier), ['economy','reasoning','balanced']);
  assert.equal(p.budgets.reservedTokens, 7300);
  assert.equal(p.proposals[2].allowedEffect, 'workspace_write');
  assert.equal(p.proposals[0].dispatchAuthorized, false);
  assert.equal(p.proposals[1].providerBudgetEnforced, false);
  assert.match(p.digest, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(p, proposeForgeSpecialists({ briefs, modelCatalog: models, limits }));
});

test('model routing fails closed on unknown roles, escalation, missing tiers and excess tokens', () => {
  const run = (b, m = models, l = limits) => proposeForgeSpecialists({ briefs: b, modelCatalog: m, limits: l });
  assert.throws(() => run([{ ...briefs[0], role: 'shell' }]), /forge_specialist_role_invalid/);
  assert.throws(() => run([{ ...briefs[0], externalWrite: true }]), /forge_external_write_refused/);
  assert.throws(() => run([{ ...briefs[0], effect: 'workspace_write' }]), /forge_effect_escalation_refused/);
  assert.throws(() => run(briefs, { economy: models.economy }), /forge_unconfigured_model_tier/);
  assert.throws(() => run(briefs, models, { ...limits, planTokenLimit: 5000 }), /forge_plan_token_budget_exceeded/);
  assert.throws(() => run([briefs[0], briefs[0]]), /forge_duplicate_brief_id/);
  assert.throws(() => run([{ ...briefs[0], tokenLimit: 5001 }]), /forge_task_token_limit_invalid/);
  assert.throws(() => run([{ ...briefs[0], risk: 'unknown' }]), /forge_risk_invalid/);
});

test('questions arrive as bounded, deduped, priority-sorted review batch and do not grant authorization', () => {
  const batch = buildForgeQuestionBatch([
    { id: 'q1', taskId: 'scout', kind: 'clarification', question: 'Which project?' },
    { id: 'q2', taskId: 'build', kind: 'blocking', question: 'Can external services be modified?' },
    { id: 'q3', taskId: 'plan', kind: 'decision', question: 'Which model profile?' }
  ], { maxQuestions: 2 });
  assert.deepEqual(batch.questions.map(q => q.id), ['q2','q3']);
  assert.equal(batch.deferredCount, 1);
  assert.equal(batch.answersAutomaticallyGrantDispatch, false);
  assert.equal(batch.state, 'awaiting_operator');
  assert.throws(() => buildForgeQuestionBatch([{ id:'q1', taskId:'x', kind:'blocking', question:'a' }, { id:'q1', taskId:'y', kind:'blocking', question:'b' }]), /duplicate_question/);
  assert.equal(buildForgeQuestionBatch([]).state, 'none');
});

test('restart capsule contains only evidence-bound identifiers, no prompts or copied authorization', () => {
  const sha = `sha256:${'a'.repeat(64)}`;
  const plan = { id: '550e8400-e29b-41d4-a716-446655440000', state: 'running', secrets: 'DO_NOT_COPY', tasks: [
    { id: 'research', state: 'verified', dependsOn: [], prompt: 'PRIVATE_PROMPT', verification: { digest: sha, reviewer: 'Reviewer' }, sessionId: 's1' },
    { id: 'build', state: 'pending', dependsOn: ['research'], prompt: 'PRIVATE_CODE', sessionId: null }
  ] };
  const capsule = buildForgeContextHandoff(plan);
  assert.equal(capsule.tasks[0].evidenceDigest, sha);
  assert.equal(capsule.grantsCarriedForward, false);
  assert.equal(capsule.containsPromptsOrToolOutput, false);
  assert.ok(!JSON.stringify(capsule).includes('PRIVATE'));
  assert.ok(!JSON.stringify(capsule).includes('DO_NOT_COPY'));
  assert.deepEqual(capsule, buildForgeContextHandoff(plan));
  const bad = structuredClone(plan); bad.tasks[0].verification.digest = 'not-a-receipt';
  assert.throws(() => buildForgeContextHandoff(bad), /forge_handoff_receipt_invalid/);
  delete bad.tasks[0].verification;
  assert.throws(() => buildForgeContextHandoff(bad), /forge_handoff_receipt_invalid/);
});
