import { createHash } from 'node:crypto';

// Clean-room REA donor capability: deterministic proposals, never a dispatcher.
// The Agent Work OS supervisor remains the only execution/authorization owner.
const ROLES = Object.freeze({
  scout: { tier: 'economy', effect: 'read' },
  architect: { tier: 'reasoning', effect: 'read' },
  implementer: { tier: 'balanced', effect: 'workspace_write' },
  'test-engineer': { tier: 'economy', effect: 'workspace_write' },
  debugger: { tier: 'reasoning', effect: 'workspace_write' },
  reviewer: { tier: 'balanced', effect: 'read' },
  'security-auditor': { tier: 'reasoning', effect: 'read' },
  integrator: { tier: 'balanced', effect: 'workspace_write' },
  documenter: { tier: 'economy', effect: 'workspace_write' },
  'release-auditor': { tier: 'reasoning', effect: 'read' }
});
export const FORGE_SPECIALIST_ROLES = Object.freeze(Object.keys(ROLES));
const TASK_ID = /^[a-z][a-z0-9_-]{0,47}$/;
const PLAN_ID = /^(?:[a-z][a-z0-9_-]{0,47}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const STATES = new Set(['pending', 'dispatching', 'running', 'awaiting_verification', 'verified', 'failed', 'blocked']);

function invalid(code) { const error = new Error(code); error.code = code; throw error; }
function boundedString(value, name, max = 280) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b-\x1f]/.test(value)) invalid(`forge_${name}_invalid`);
  return value.trim();
}
function integer(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) invalid(`forge_${name}_invalid`);
  return value;
}
function contentDigest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

/**
 * Propose deterministic specialist/model routing for an already bounded task list.
 * Returns NO dispatch grant, NO spend permission, and NO provider execution.
 * Catalog is operator-owned: models and their actual prices are not inferred.
 */
export function proposeForgeSpecialists({ briefs, modelCatalog, limits } = {}) {
  if (!Array.isArray(briefs) || briefs.length < 1 || briefs.length > 32) invalid('forge_briefs_count_invalid');
  if (!modelCatalog || typeof modelCatalog !== 'object' || Array.isArray(modelCatalog)) invalid('forge_model_catalog_invalid');
  if (!limits || typeof limits !== 'object' || Array.isArray(limits)) invalid('forge_budget_policy_required');
  const planTokenLimit = integer(limits.planTokenLimit, 'plan_token_limit', 1, 2_000_000);
  const perBriefTokenLimit = integer(limits.perBriefTokenLimit, 'brief_token_limit', 1, 500_000);
  const maxConcurrent = integer(limits.maxConcurrent, 'max_concurrent', 1, 3);
  const models = {};
  for (const tier of ['economy', 'balanced', 'reasoning']) {
    const value = modelCatalog[tier];
    if (!Object.hasOwn(modelCatalog, tier) || typeof value !== 'string' || !MODEL_ID.test(value)) invalid('forge_unconfigured_model_tier');
    models[tier] = value;
  }
  const taskIds = new Set(); let reservedTokens = 0;
  const proposals = briefs.map(brief => {
    if (!brief || !TASK_ID.test(brief.id)) invalid('forge_brief_id_invalid');
    if (taskIds.has(brief.id)) invalid('forge_duplicate_brief_id');
    taskIds.add(brief.id);
    const role = ROLES[brief.role];
    if (!role) invalid('forge_specialist_role_invalid');
    if (brief.externalWrite === true) invalid('forge_external_write_refused');
    if (brief.effect && brief.effect !== role.effect) invalid('forge_effect_escalation_refused');
    const tokenLimit = integer(brief.tokenLimit, 'task_token_limit', 1, perBriefTokenLimit);
    reservedTokens += tokenLimit;
    if (reservedTokens > planTokenLimit) invalid('forge_plan_token_budget_exceeded');
    const risk = brief.risk ?? 'normal';
    if (!['low', 'normal', 'high'].includes(risk)) invalid('forge_risk_invalid');
    const tier = risk === 'high' ? 'reasoning' : role.tier;
    return Object.freeze({
      taskId: brief.id, specialist: brief.role, agent: 'codex', modelTier: tier,
      proposedModel: models[tier], allowedEffect: role.effect,
      tokenReservation: tokenLimit, risk,
      // A proposal is never an agent grant or provider limit enforcement.
      dispatchAuthorized: false, providerBudgetEnforced: false,
      requiresIndependentReview: true,
      requiresHumanApproval: true
    });
  });
  const proposal = {
    schema: 'rea-forge-specialist-proposal/v1', proposals,
    budgets: { reservedTokens, planTokenLimit, perBriefTokenLimit, maxConcurrent,
      scope: 'planning-reservations-not-provider-enforced-usage' },
    state: 'review_required', dispatchAuthorized: false
  };
  return { ...proposal, digest: contentDigest(proposal) };
}

/** Batch blockers for one human review, no raw prompts, outputs or secrets. */
export function buildForgeQuestionBatch(questions, { maxQuestions = 8 } = {}) {
  integer(maxQuestions, 'question_batch_limit', 1, 16);
  if (!Array.isArray(questions) || questions.length > 64) invalid('forge_question_count_invalid');
  const seen = new Set();
  const ranked = questions.map((q, originalIndex) => {
    if (!q || !TASK_ID.test(q.id) || !TASK_ID.test(q.taskId)) invalid('forge_question_id_invalid');
    if (!['blocking', 'decision', 'clarification'].includes(q.kind)) invalid('forge_question_kind_invalid');
    return { id: q.id, taskId: q.taskId, kind: q.kind,
      question: boundedString(q.question, 'question_text', 320), originalIndex };
  }).filter(q => { if (seen.has(q.id)) invalid('forge_duplicate_question_id'); seen.add(q.id); return true; });
  ranked.sort((a, b) => ['blocking', 'decision', 'clarification'].indexOf(a.kind) - ['blocking', 'decision', 'clarification'].indexOf(b.kind) || a.originalIndex - b.originalIndex);
  const selected = ranked.slice(0, maxQuestions).map(({ originalIndex, ...q }) => q);
  const batch = { schema: 'rea-forge-decision-batch/v1', questions: selected,
    deferredCount: ranked.length - selected.length, state: selected.length ? 'awaiting_operator' : 'none',
    authorizationEffect: 'none', answersAutomaticallyGrantDispatch: false };
  return { ...batch, digest: contentDigest(batch) };
}

/** Read-only session continuity capsule: explicitly excludes prompts, outputs, tokens, secret data. */
export function buildForgeContextHandoff(plan, { maxTasks = 32 } = {}) {
  integer(maxTasks, 'handoff_task_limit', 1, 32);
  if (!plan || !PLAN_ID.test(plan.id) || !Array.isArray(plan.tasks) || plan.tasks.length > maxTasks) invalid('forge_handoff_plan_invalid');
  const tasks = plan.tasks.map(task => {
    if (!TASK_ID.test(task.id) || !STATES.has(task.state)) invalid('forge_handoff_task_invalid');
    const v = task.verification;
    if ((task.state === 'verified' && !v) ||
        (v != null && (!SHA256.test(v.digest ?? '') || task.state !== 'verified'))) invalid('forge_handoff_receipt_invalid');
    if (!Array.isArray(task.dependsOn) || !task.dependsOn.every(d => TASK_ID.test(d))) invalid('forge_handoff_dependencies_invalid');
    return { id: task.id, state: task.state, dependsOn: [...task.dependsOn],
      sessionId: typeof task.sessionId === 'string' ? task.sessionId.slice(0, 100) : null,
      evidenceDigest: v?.digest ?? null };
  });
  if (new Set(tasks.map(t => t.id)).size !== tasks.length) invalid('forge_handoff_duplicate_task');
  const capsule = { schema: 'rea-forge-handoff/v1', planId: plan.id,
    planState: boundedString(plan.state, 'plan_state', 36), tasks,
    nextAction: 'Resume only after reloading canonical store, reconciling sessions and rechecking authorization',
    grantsCarriedForward: false, containsPromptsOrToolOutput: false,
    source: 'operator_reviewable_state_projection_not_execution_proof' };
  return { ...capsule, digest: contentDigest(capsule) };
}
